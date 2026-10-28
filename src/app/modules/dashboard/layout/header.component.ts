import { Component, computed, inject, signal } from '@angular/core';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { LayoutService } from './layout.service';
import { NotificationCenterService } from '../../../core/notifications/notification-center.service';
import { summarize } from '../../../core/notifications/notification.model';
import { PushRegistrationService } from '../../../core/notifications/push-registration.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Administrador',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.MESERO]: 'Mesero',
};

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'bg-purple-100 text-purple-700',
  [UserRole.ADMIN]: 'bg-purple-100 text-purple-700',
  [UserRole.CASHIER]: 'bg-blue-100 text-blue-700',
  [UserRole.MESERO]: 'bg-amber-100 text-amber-700',
};

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, TenantDatePipe, IconMiComponent],
  template: `
    <header
      class="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3 justify-between shrink-0 z-10"
    >
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <button
          (click)="layoutService.toggle()"
          class="p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          aria-label="Abrir menú"
        >
          <app-mi-icon name="menu" [size]="20" />
        </button>

        <h2 class="text-base font-semibold text-gray-700 truncate">Panel de Control</h2>
      </div>

      <div class="relative">
        <button
          (click)="toggleNotifications()"
          class="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Notificaciones"
        >
          <app-mi-icon name="notifications" [size]="20" />
          @if (notificationCenter.pendingCount() > 0) {
            <span
              class="absolute top-0.5 right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {{ notificationCenter.pendingCount() > 9 ? '9+' : notificationCenter.pendingCount() }}
            </span>
          }
        </button>

        @if (notificationsOpen()) {
          <div
            class="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-100 z-50"
          >
            <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-gray-700">Notificaciones</p>
              @if (showEnablePush()) {
                <button
                  (click)="enablePush()"
                  class="text-xs font-medium text-indigo-600 hover:text-indigo-800 shrink-0"
                >
                  Activar avisos push
                </button>
              }
            </div>
            @if (notificationCenter.list().length === 0) {
              <p class="px-4 py-6 text-sm text-gray-400 text-center">Sin notificaciones todavía</p>
            } @else {
              <ul class="divide-y divide-gray-100">
                @for (n of notificationCenter.list(); track n.id) {
                  <li class="px-4 py-3 flex items-start gap-2" [class.bg-indigo-50]="!n.attended_at">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-gray-700">{{ summarize(n) }}</p>
                      <p class="text-xs text-gray-400">{{ n.created_at | tenantDate: 'short' }}</p>
                    </div>
                    @if (!n.attended_at) {
                      <button
                        (click)="attend(n.id)"
                        class="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Marcar atendida
                      </button>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>

      <div class="relative">
        <button
          (click)="toggleDropdown()"
          class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
        >
          <div
            class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0"
          >
            {{ userInitial() }}
          </div>
          <div class="text-left">
            <p class="text-sm font-medium text-gray-900 leading-tight">{{ currentUser()?.name }}</p>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" [class]="roleBadgeClass()">
              {{ roleLabel() }}
            </span>
          </div>
          <app-mi-icon
            name="expand_more"
            [size]="16"
            class="text-gray-400 transition-transform"
            [class.rotate-180]="dropdownOpen()"
          />
        </button>

        @if (dropdownOpen()) {
          <div
            class="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-50"
          >
            <div class="px-4 py-3 border-b border-gray-100">
              <p class="text-xs text-gray-500 truncate">{{ currentUser()?.email }}</p>
            </div>
            <div class="p-2">
              @if (!currentUser()?.isSuperAdmin) {
                <a
                  routerLink="/dashboard/mi-plan"
                  (click)="dropdownOpen.set(false)"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  <app-mi-icon name="layers" [size]="16" />
                  Mi plan
                </a>
              }
              <a
                routerLink="/dashboard/mi-cuenta"
                (click)="dropdownOpen.set(false)"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <app-mi-icon name="settings" [size]="16" />
                Cambiar contraseña
              </a>
              <button
                (click)="logout()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
              >
                <app-mi-icon name="logout" [size]="16" />
                Cerrar sesión
              </button>
            </div>
          </div>
        }
      </div>
    </header>
  `,
})
export class HeaderComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly layoutService = inject(LayoutService);
  readonly notificationCenter = inject(NotificationCenterService);
  private readonly pushRegistration = inject(PushRegistrationService);
  private readonly toast = inject(ToastService);
  readonly summarize = summarize;

  currentUser = this.authService.currentUser;
  dropdownOpen = signal(false);
  notificationsOpen = signal(false);
  /** `true` mientras el navegador soporte push y el usuario no haya decidido
   * todavía (`default`) — una vez concedido o denegado, ya no se ofrece de
   * nuevo desde acá (el navegador gestiona el permiso desde entonces). */
  pushOffered = signal(
    typeof Notification !== 'undefined' && Notification.permission === 'default',
  );

  userInitial = computed(() => this.currentUser()?.name?.[0]?.toUpperCase() ?? '?');
  roleLabel = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  roleBadgeClass = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_BADGE_CLASSES[role] : '';
  });
  showEnablePush = computed(() => this.pushRegistration.supported && this.pushOffered());

  toggleDropdown(): void {
    this.dropdownOpen.update((v) => !v);
  }

  toggleNotifications(): void {
    this.notificationsOpen.update((v) => !v);
  }

  attend(id: string): void {
    void this.notificationCenter.attend(id);
  }

  async enablePush(): Promise<void> {
    const result = await this.pushRegistration.register();
    if (!result.ok) {
      // Corrección post-implementación (spec 077): antes esto se ocultaba en
      // silencio (`catch` + `finally` incondicional) — el "colgado" de la
      // primera visita (Service Worker instalado pero todavía sin controlar
      // esta página) daba la falsa impresión de que ya se había activado.
      if (result.reason === 'needs-reload') {
        this.toast.info('Recarga la página para poder activar los avisos push.');
      } else if (result.reason === 'error') {
        this.toast.error('No se pudo activar el push. Intenta de nuevo.');
      }
    }
    // El navegador ya decidió (concedido o denegado) o hace falta recargar:
    // en ambos casos no se vuelve a ofrecer el botón desde aquí — tras
    // recargar, `pushOffered` se reevalúa desde cero contra `Notification.
    // permission`, que sigue en `default` si nunca se llegó a pedir permiso.
    this.pushOffered.set(false);
  }

  async logout(): Promise<void> {
    this.dropdownOpen.set(false);
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
