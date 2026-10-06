// `AuthService` inyecta `Router`, que arrastra `PlatformLocation` — una
// inyectable parcialmente compilada que necesita el compilador JIT disponible.
// Sin este import el archivo entero no carga y sus tests no llegan a correr.
import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { AuthApiService } from '../auth/auth-api.service';
import { TokenStorageService } from '../auth/token-storage.service';
import { PushRegistrationService } from '../notifications/push-registration.service';
import { BackendUser, LoginResponse } from '../auth/auth.models';
import { UserRole } from '../interfaces/user.interface';

function loginResponse(user: BackendUser): LoginResponse {
  return {
    message: 'Login successful',
    access_token: 'access',
    refresh_token: 'refresh',
    user,
  };
}

describe('AuthService.login', () => {
  let service: AuthService;
  let authApi: {
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
    changePassword: ReturnType<typeof vi.fn>;
    forgotPassword: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
  };
  let tokenStorage: {
    getAccessToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    setTokens: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authApi = {
      login: vi.fn(),
      logout: vi.fn(),
      refreshToken: vi.fn(),
      changePassword: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
    };
    tokenStorage = {
      // No stored session: constructor's restoreSession() short-circuits to clear.
      getAccessToken: vi.fn().mockReturnValue(null),
      getRefreshToken: vi.fn().mockReturnValue(null),
      setTokens: vi.fn(),
      clear: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiService, useValue: authApi },
        { provide: TokenStorageService, useValue: tokenStorage },
        { provide: Router, useValue: { navigate: vi.fn() } },
        // `logout()` lo usa; su versión real pide HttpClient y SwPush, que este
        // banco de pruebas no monta.
        { provide: PushRegistrationService, useValue: { unregister: vi.fn() } },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('accepts a super admin whose role is not a tenant role', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'admin@admin.com',
          uid: '8a4fde0a-222b-40c6-bd80-7384cfb26e07',
          tenant_id: null,
          is_super_admin: true,
          role: 'SUPER_ADMIN',
        }),
      ),
    );

    const { error } = await service.login('admin@admin.com', 'secret');

    expect(error).toBeNull();
    const user = service.currentUser();
    expect(user).not.toBeNull();
    expect(user!.isSuperAdmin).toBe(true);
    expect(user!.tenantId).toBeNull();
    // Falls back to ADMIN since SUPER_ADMIN is not a tenant role.
    expect(user!.role).toBe(UserRole.ADMIN);
  });

  it('maps a normal tenant role correctly', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'cajero@tienda.com',
          uid: 'u1',
          tenant_id: 1,
          is_super_admin: false,
          role: 'CASHIER',
        }),
      ),
    );

    const { error } = await service.login('cajero@tienda.com', 'secret');

    expect(error).toBeNull();
    expect(service.currentUser()!.role).toBe(UserRole.CASHIER);
  });

  it('rejects a non-super-admin with an unknown role as an invalid session', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'x@y.com',
          uid: 'u2',
          tenant_id: 1,
          is_super_admin: false,
          role: 'SUPERVISOR',
        }),
      ),
    );

    const { error } = await service.login('x@y.com', 'secret');

    expect(error).toBe('Tu rol de usuario no es válido para este sistema.');
    expect(service.currentUser()).toBeNull();
    expect(tokenStorage.clear).toHaveBeenCalled();
  });

  // ── spec 095 · FR-012 / SC-003 (A-108) ───────────────────────────────────
  //
  // Un fallo de autenticación, un solo mensaje: correo inexistente (401),
  // contraseña incorrecta (401) y cuenta desactivada (403) tienen que ser
  // indistinguibles. El servidor sigue devolviendo sus códigos y su `detail` en
  // inglés — es la pantalla la que deja de delatar cuál de los tres ocurrió.

  it('returns a credentials error on 401', async () => {
    authApi.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

    const { error } = await service.login('x@y.com', 'bad');

    expect(error).toBe('Credenciales inválidas');
    expect(service.currentUser()).toBeNull();
  });

  it('maps 403 (disabled account) to the SAME literal as 401, hiding the backend detail', async () => {
    authApi.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 403, error: { detail: 'User account is inactive' } }),
      ),
    );

    const { error } = await service.login('desactivada@tienda.com', 'buena');

    expect(error).toBe('Credenciales inválidas');
    expect(error).not.toContain('inactive');
    expect(service.currentUser()).toBeNull();
  });

  it('401 and 403 are indistinguishable character by character (SC-003)', async () => {
    authApi.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    const noExiste = (await service.login('fantasma@tienda.com', 'x')).error;

    authApi.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 403, error: { detail: 'User account is inactive' } }),
      ),
    );
    const desactivada = (await service.login('desactivada@tienda.com', 'buena')).error;

    expect(noExiste).toBe(desactivada);
  });

  it('a network failure is NOT reported as bad credentials', async () => {
    authApi.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    const { error } = await service.login('x@y.com', 'buena');

    expect(error).toBe('No pudimos procesar la solicitud. Intenta de nuevo.');
  });

  it('changePassword does NOT inherit the login mapping on 401', async () => {
    authApi.changePassword.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 401, error: { detail: 'Current password is wrong' } }),
      ),
    );

    const { error } = await service.changePassword('mala', 'claveNueva1');

    expect(error).not.toBe('Credenciales inválidas');
  });

  it('surfaces must_change_password from the login user', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'admin@tienda.com',
          uid: 'u3',
          tenant_id: 1,
          is_super_admin: false,
          role: 'ADMIN',
          must_change_password: true,
        }),
      ),
    );

    await service.login('admin@tienda.com', 'temp');

    expect(service.currentUser()!.mustChangePassword).toBe(true);
  });

  it('clears mustChangePassword after a successful password change', async () => {
    authApi.login.mockReturnValue(
      of(
        loginResponse({
          email: 'admin@tienda.com',
          uid: 'u3',
          tenant_id: 1,
          is_super_admin: false,
          role: 'ADMIN',
          must_change_password: true,
        }),
      ),
    );
    await service.login('admin@tienda.com', 'temp');
    authApi.changePassword.mockReturnValue(of(null));

    const { error } = await service.changePassword('temp', 'newsecret');

    expect(error).toBeNull();
    expect(authApi.changePassword).toHaveBeenCalledWith({
      current_password: 'temp',
      new_password: 'newsecret',
    });
    expect(service.currentUser()!.mustChangePassword).toBe(false);
  });
});

describe('AuthService.forgotPassword/resetPassword', () => {
  let service: AuthService;
  let authApi: { forgotPassword: ReturnType<typeof vi.fn>; resetPassword: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authApi = { forgotPassword: vi.fn(), resetPassword: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiService, useValue: authApi },
        {
          provide: TokenStorageService,
          useValue: {
            getAccessToken: vi.fn().mockReturnValue(null),
            getRefreshToken: vi.fn().mockReturnValue(null),
            setTokens: vi.fn(),
            clear: vi.fn(),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: PushRegistrationService, useValue: { unregister: vi.fn() } },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('forgotPassword forwards the email and resolves without error on success', async () => {
    authApi.forgotPassword.mockReturnValue(of({ message: 'ok' }));

    const { error } = await service.forgotPassword('user@tienda.com');

    expect(error).toBeNull();
    expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: 'user@tienda.com' });
  });

  it('forgotPassword surfaces a fallback message on failure', async () => {
    authApi.forgotPassword.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));

    const { error } = await service.forgotPassword('user@tienda.com');

    expect(error).toBe('No se pudo procesar la solicitud. Intenta de nuevo.');
  });

  it('resetPassword forwards the token and new password on success', async () => {
    authApi.resetPassword.mockReturnValue(of({ message: 'ok' }));

    const { error } = await service.resetPassword('tok123', 'claveNueva1');

    expect(error).toBeNull();
    expect(authApi.resetPassword).toHaveBeenCalledWith({
      token: 'tok123',
      new_password: 'claveNueva1',
    });
  });

  it('resetPassword surfaces the backend detail on failure', async () => {
    authApi.resetPassword.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { detail: { valid: false, reason: 'used' } },
          }),
      ),
    );

    const { error } = await service.resetPassword('tok123', 'claveNueva1');

    expect(error).toBe('No se pudo restablecer la contraseña. Intenta de nuevo.');
  });

  // ── spec 095 · el mapeo de FR-012 es SOLO del login (R7) ─────────────────
  //
  // `extractError()` lo comparten el cambio de contraseña, la solicitud de
  // enlace y el restablecimiento, donde "Credenciales inválidas" no tendría
  // ningún sentido. Estos tests fijan que el mapeo nuevo no se filtró ahí.

  it('forgotPassword does NOT inherit the login mapping on 403', async () => {
    authApi.forgotPassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { detail: 'Forbidden' } })),
    );

    const { error } = await service.forgotPassword('user@tienda.com');

    expect(error).not.toBe('Credenciales inválidas');
    expect(error).toBe('Forbidden');
  });

  it('resetPassword keeps surfacing the server message, not a login literal (FR-033)', async () => {
    authApi.resetPassword.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { detail: 'La nueva contraseña debe ser distinta de la actual' },
          }),
      ),
    );

    const { error } = await service.resetPassword('tok123', 'claveNueva1');

    expect(error).toBe('La nueva contraseña debe ser distinta de la actual');
  });

  it('forgotPassword/resetPassword report the HTTP status so the screen can tell 429 from a network drop', async () => {
    authApi.forgotPassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 429 })),
    );
    expect((await service.forgotPassword('user@tienda.com')).status).toBe(429);

    authApi.forgotPassword.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    expect((await service.forgotPassword('user@tienda.com')).status).toBe(0);

    authApi.resetPassword.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    expect((await service.resetPassword('t', 'clave1234')).status).toBe(0);
  });
});
