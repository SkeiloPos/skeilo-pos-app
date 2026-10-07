import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, ReplaySubject } from 'rxjs';
import { AuthApiService } from '../auth/auth-api.service';
import { TokenStorageService } from '../auth/token-storage.service';
import { decodeClaims, isExpired } from '../auth/jwt.util';
import { BackendUser } from '../auth/auth.models';
import { displayNameFromEmail, mapBackendRole, User, UserRole } from '../interfaces/user.interface';
import { PushRegistrationService } from '../notifications/push-registration.service';

/**
 * Outcome of an unauthenticated auth call. `status` carries the HTTP code so the
 * screen can tell apart cases that need different wording — a `429` rate limit
 * from a dropped connection, say — without re-parsing the backend's `detail`,
 * which is configurable and must not be echoed verbatim (spec 095, FR-023, D5).
 */
export interface AuthCallResult {
  error: string | null;
  /** HTTP status of the failure; `0` for a network error, `null` on success. */
  status: number | null;
}

function statusOf(err: unknown): number | null {
  return err instanceof HttpErrorResponse ? err.status : null;
}

/**
 * Session state machine backed by the own backend (`{apiBaseUrl}/auth/*`).
 * Supabase Auth is no longer used. Preserves the `currentUser` / `isLoading` /
 * `authReady$` contract consumed by guards and `App`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApiService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly router = inject(Router);
  private readonly pushRegistration = inject(PushRegistrationService);
  private readonly _authReady = new ReplaySubject<void>(1);

  readonly currentUser = signal<User | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly authReady$ = this._authReady.asObservable();

  /** Single shared refresh so concurrent 401s trigger only one network call. */
  private refreshInFlight: Promise<boolean> | null = null;

  constructor() {
    this.restoreSession();
  }

  async login(email: string, password: string): Promise<{ error: string | null }> {
    try {
      const res = await firstValueFrom(this.authApi.login({ email, password }));
      this.tokenStorage.setTokens(res.access_token, res.refresh_token);

      const user = this.buildUserFromBackend(res.user);
      if (!user) {
        this.clearSession();
        return { error: 'Tu rol de usuario no es válido para este sistema.' };
      }
      this.currentUser.set(user);
      return { error: null };
    } catch (err) {
      return { error: this.loginError(err) };
    }
  }

  /**
   * Error mapping for the login path **only** (spec 095, FR-012 / SC-003).
   *
   * The backend tells the three failures apart: an unknown email and a wrong
   * password both come back `401 "Invalid credentials"`, while a **disabled**
   * account comes back `403 "User account is inactive"` — in English, and
   * confirming that the account exists in this tenant. Probing emails one by one
   * would then reveal which are registered, so both codes collapse into one
   * literal here.
   *
   * Deliberately NOT inside `extractError()`: that one is shared with the
   * password change, the reset-link request and the reset itself, where
   * "Credenciales inválidas" would be nonsense. The server is untouched (FR-044)
   * — it keeps returning `403` and its detail for logs and support.
   */
  private loginError(err: unknown): string {
    if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
      return 'Credenciales inválidas';
    }
    return this.extractError(err, 'No pudimos procesar la solicitud. Intenta de nuevo.');
  }

  /**
   * Change the current user's password via `POST /auth/change-password` (the
   * Bearer is added by the interceptor).
   *
   * The endpoint returns no tokens, and refreshing only re-issues the access
   * token from the *refresh* token's (stale) claims — so `must_change_password`
   * would stay `true` and, after a reload, bounce the user back here. To make
   * the cleared state authoritative and survive reloads, we re-authenticate
   * with the just-set password: `login` reads the backend (DB) state and stores
   * fresh access + refresh tokens with the flag cleared.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ error: string | null }> {
    const email = this.currentUser()?.email;
    try {
      await firstValueFrom(
        this.authApi.changePassword({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      );
    } catch (err) {
      return { error: this.extractError(err, 'No se pudo cambiar la contraseña. Intenta de nuevo.') };
    }

    // Re-login with the new password to obtain authoritative tokens.
    if (email) {
      const res = await this.login(email, newPassword);
      if (!res.error) return { error: null };
    }
    // Fallback: unblock at least the in-memory session (reload may still bounce
    // if re-login failed, but a successful change should not stay blocked now).
    this.currentUser.update(u => (u ? { ...u, mustChangePassword: false } : u));
    return { error: null };
  }

  /**
   * Request a password-reset link (Flow A, unauthenticated). Always resolves
   * with the backend's generic message (or a fallback) — the endpoint never
   * reveals whether the email belongs to an account (FR-003).
   */
  async forgotPassword(email: string): Promise<AuthCallResult> {
    try {
      await firstValueFrom(this.authApi.forgotPassword({ email }));
      return { error: null, status: null };
    } catch (err) {
      return {
        error: this.extractError(err, 'No se pudo procesar la solicitud. Intenta de nuevo.'),
        status: statusOf(err),
      };
    }
  }

  /**
   * Consume a reset link and set a new password (Flow A, unauthenticated).
   * Any existing session was already cleared by the reset-password screen
   * before this call (FR-006) — this never touches stored tokens.
   */
  async resetPassword(token: string, newPassword: string): Promise<AuthCallResult> {
    try {
      await firstValueFrom(this.authApi.resetPassword({ token, new_password: newPassword }));
      return { error: null, status: null };
    } catch (err) {
      return {
        error: this.extractError(err, 'No se pudo restablecer la contraseña. Intenta de nuevo.'),
        status: statusOf(err),
      };
    }
  }

  async logout(): Promise<void> {
    const access = this.tokenStorage.getAccessToken();
    if (access) {
      try {
        await firstValueFrom(this.authApi.logout(access));
      } catch {
        // Best-effort: clear the local session regardless of network outcome.
      }
      try {
        // Spec 077 (T032): antes de limpiar la sesión — el `DELETE` necesita
        // el Bearer todavía vigente (lo agrega `authTokenInterceptor`).
        await this.pushRegistration.unregister();
      } catch {
        // Best-effort: un push huérfano en el navegador no bloquea el logout.
      }
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /** Clear session and bounce to login (used by the interceptor on refresh failure). */
  forceLogout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Renew the access token with the stored refresh token. Returns `true` on
   * success. Concurrent callers share the same in-flight request.
   */
  tryRefresh(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refresh = this.tokenStorage.getRefreshToken();
    if (!refresh) return Promise.resolve(false);

    this.refreshInFlight = (async () => {
      try {
        const res = await firstValueFrom(this.authApi.refreshToken(refresh));
        this.tokenStorage.setTokens(res.access_token, res.refresh_token);
        const claims = decodeClaims(res.access_token);
        this.currentUser.set(claims ? this.buildUserFromBackend(claims.user) : null);
        return true;
      } catch {
        this.clearSession();
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  /** Rebuild the session from the stored JWT at startup, without a /me round-trip. */
  private restoreSession(): void {
    const access = this.tokenStorage.getAccessToken();
    const claims = access ? decodeClaims(access) : null;

    if (claims && !isExpired(claims)) {
      this.currentUser.set(this.buildUserFromBackend(claims.user));
      this.markReady();
      return;
    }

    const refresh = this.tokenStorage.getRefreshToken();
    const refreshClaims = refresh ? decodeClaims(refresh) : null;
    if (refresh && refreshClaims && !isExpired(refreshClaims)) {
      // Defer so this service finishes constructing before the HTTP call runs
      // through the interceptor (which injects AuthService).
      queueMicrotask(async () => {
        await this.tryRefresh();
        this.markReady();
      });
      return;
    }

    this.clearSession();
    this.markReady();
  }

  private buildUserFromBackend(backend: BackendUser): User | null {
    const role = mapBackendRole(backend.role);
    // Un super admin se identifica por el flag `is_super_admin`, no por un rol de
    // tenant: su `role` (p. ej. `SUPER_ADMIN`) puede no pertenecer al enum. Solo
    // es sesión inválida si el rol es desconocido y además no es super admin.
    if (!role && !backend.is_super_admin) return null;
    return {
      id: backend.uid,
      name: displayNameFromEmail(backend.email),
      email: backend.email,
      role: role ?? UserRole.ADMIN,
      tenantId: backend.tenant_id,
      isSuperAdmin: backend.is_super_admin,
      mustChangePassword: backend.must_change_password ?? false,
    };
  }

  /**
   * Clear the local session (tokens + in-memory user) without calling the
   * backend or navigating. Used by `ResetPasswordComponent` to drop any
   * existing session before showing the "set a new password" form (FR-006).
   */
  clearSession(): void {
    this.tokenStorage.clear();
    this.currentUser.set(null);
  }

  private markReady(): void {
    this.isLoading.set(false);
    this._authReady.next();
  }

  private extractError(
    err: unknown,
    fallback = 'No se pudo iniciar sesión. Intenta de nuevo.',
  ): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Credenciales incorrectas. Verifica tu email y contraseña.';
      }
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      // FastAPI 422: `detail` is an array of `{ msg, loc, ... }`.
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
