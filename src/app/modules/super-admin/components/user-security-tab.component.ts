import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { UserSecurity } from '../interfaces/admin-user.interface';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { TokenStorageService } from '../../../core/auth/token-storage.service';
import { decodeClaims } from '../../../core/auth/jwt.util';

/** Pestaña "Seguridad" de la ficha de usuario (spec 159, FR-013/FR-028
 * a FR-030, User Story 6): sesiones activas con revocación individual o
 * masiva. Si la sesión del propio Super Admin que opera el panel está
 * entre las que se van a revocar, la confirmación lo advierte (Edge case:
 * revocar la propia sesión también la cierra). */
@Component({
  selector: 'app-user-security-tab',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-700">Sesiones activas</h3>
        <button
          type="button"
          data-testid="revoke-all-sessions"
          [disabled]="security().active_sessions.length === 0"
          (click)="onRevokeAll()"
          [title]="security().active_sessions.length === 0 ? 'No hay sesiones activas' : ''"
          class="px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg text-red-700 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          Revocar todas las sesiones
        </button>
      </div>

      @if (security().active_sessions.length === 0) {
        <div data-testid="no-active-sessions" class="text-center py-8 text-sm text-gray-400 italic">
          Este usuario no tiene sesiones activas.
        </div>
      } @else {
        <ul class="divide-y divide-gray-50 border border-gray-100 rounded-xl">
          @for (s of security().active_sessions; track s.id) {
            <li class="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <p class="font-medium text-gray-900">
                  {{ s.device_label ?? 'Dispositivo desconocido' }}
                  @if (s.id === currentSessionId()) {
                    <span class="ml-1 text-xs text-indigo-600">(esta sesión)</span>
                  }
                </p>
                <p class="text-xs text-gray-500">{{ s.browser ?? '—' }} · {{ s.ip_address ?? '—' }}</p>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-400">{{ s.last_seen_at | date: 'short' }}</span>
                <button
                  type="button"
                  data-testid="revoke-session"
                  (click)="onRevokeOne(s.id)"
                  class="px-2 py-1 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Revocar
                </button>
              </div>
            </li>
          }
        </ul>
      }

      <div class="bg-gray-50 rounded-xl px-4 py-3 text-sm">
        <p class="text-gray-600">
          Intentos fallidos de inicio de sesión:
          <span data-testid="failed-login-attempts" class="font-semibold text-gray-900">
            {{ security().failed_login_attempts }}
          </span>
        </p>
        @if (security().security_blocked_at) {
          <p data-testid="blocked-security-notice" class="text-red-600 font-medium mt-1">
            Bloqueado por seguridad el {{ security().security_blocked_at | date: 'short' }}.
          </p>
        }
      </div>
    </div>
  `,
})
export class UserSecurityTabComponent {
  private readonly confirm = inject(ConfirmService);
  private readonly tokenStorage = inject(TokenStorageService);

  readonly security = input.required<UserSecurity>();

  readonly revokeAll = output<void>();
  readonly revokeOne = output<string>();

  /** `sid` de la propia sesión del Super Admin que mira esta pantalla, si el
   *  access token vigente lo lleva (compatibilidad retroactiva: puede ser
   *  `null` para un token acuñado antes de esta spec). */
  readonly currentSessionId = computed<string | null>(() => {
    const token = this.tokenStorage.getAccessToken();
    if (!token) return null;
    return decodeClaims(token)?.sid ?? null;
  });

  async onRevokeAll(): Promise<void> {
    const includesOwnSession = this.security().active_sessions.some(
      s => s.id === this.currentSessionId(),
    );
    const ok = await this.confirm.ask({
      title: 'Revocar todas las sesiones',
      message: includesOwnSession
        ? 'Esto cerrará todas las sesiones activas de este usuario, incluida la sesión con la que tú mismo iniciaste sesión como este usuario en este equipo. Tendrás que volver a iniciar sesión.'
        : '¿Confirmas que quieres cerrar todas las sesiones activas de este usuario?',
      confirmText: 'Revocar todas',
      tone: 'danger',
    });
    if (ok) this.revokeAll.emit();
  }

  async onRevokeOne(sessionId: string): Promise<void> {
    const isOwnSession = sessionId === this.currentSessionId();
    const ok = await this.confirm.ask({
      title: 'Revocar sesión',
      message: isOwnSession
        ? 'Esta es la sesión con la que tú mismo iniciaste sesión como este usuario en este equipo: revocarla la cerrará ahora mismo.'
        : '¿Confirmas que quieres revocar esta sesión?',
      confirmText: 'Revocar',
      tone: 'danger',
    });
    if (ok) this.revokeOne.emit(sessionId);
  }
}
