import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { NAV_ITEMS } from '../../../core/config/navigation.config';
import { LayoutService } from './layout.service';
import { PanelThemeService } from './panel-theme.service';
import { CashService } from '../../cash-register/services/cash.service';
import { NotificationCenterService } from '../../../core/notifications/notification-center.service';
import { summarize } from '../../../core/notifications/notification.model';
import { PushRegistrationService } from '../../../core/notifications/push-registration.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { IconComponent } from '../../../shared/icon/icon.component';

const DESKTOP_BREAKPOINT_QUERY = '(min-width: 1024px)';

/** SkeiloPOS App.dc.html: el botón de usuario muestra el rol bajo el nombre
 *  -- mismo texto que ya usa el ROLE_LABELS de header.component.ts (legado),
 *  sin su badge de color (aquí es texto plano bajo el nombre). */
const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Administrador',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.MESERO]: 'Mesero',
};

/**
 * Navbar rediseñado del panel de tenant (Administrador/Cajero/Mesero) — spec
 * 116. Reemplaza a `HeaderComponent` SOLO para estas identidades
 * (research.md R1); `HeaderComponent` sigue siendo la implementación real,
 * sin ningún cambio, para Super Admin.
 */
@Component({
  selector: 'app-tenant-header',
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent],
  template: `
    <header
      class="flex items-center gap-3 justify-between shrink-0 z-10 px-4 md:px-6 py-3
             bg-[var(--panel-color-surface)] border-b border-[var(--panel-color-border)]"
    >
      <div class="flex items-center gap-2.5 flex-1 min-w-0">
        <!-- SkeiloPOS App.dc.html: el botón de menú del navbar solo existe en
             modo drawer (<1024px) -- en escritorio, el colapso vive dentro
             del propio sidebar (tenant-sidebar.component.ts). -->
        @if (viewMode() === 'drawer') {
          <button
            (click)="layoutService.toggle()"
            class="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center transition-colors
                   border border-[var(--panel-color-border)] bg-[var(--panel-color-surface)]
                   text-[var(--panel-color-text-secondary)] hover:bg-[var(--panel-color-surface-elevated)]"
            aria-label="Abrir menú"
          >
            <span class="w-5 h-5 block"><app-icon name="menu" /></span>
          </button>
        }

        <div class="min-w-0">
          @if (sectionTitle()) {
            <p class="text-xs text-[var(--panel-color-text-muted)]">
              {{ sectionTitle() }}
            </p>
          }
          <h2
            class="text-xl font-semibold truncate text-[var(--panel-color-text-primary)]"
            style="font-family: var(--panel-font-display); letter-spacing: -0.02em"
          >
            {{ pageTitle() || 'Panel de Control' }}
          </h2>
        </div>
      </div>

      @if (showCashIndicator()) {
        <!-- text-secondary para "sin turno", no text-muted: mide 4.28:1
             (claro) / 5.94:1 sobre overlay-hover -- el claro queda por
             debajo del 4.5:1 de WCAG AA, verificado con Lighthouse real
             (SC-006 exige 100 en ambos temas; panel-theme-contract.md §2:
             "debe confirmarse, no asumirse"). -->
        <div
          class="hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold shrink-0"
          [class]="
            cashService.isOpen()
              ? 'bg-[var(--panel-color-success-soft)] text-[var(--panel-color-success)]'
              : 'bg-[var(--panel-color-overlay-hover)] text-[var(--panel-color-text-secondary)]'
          "
        >
          <span
            class="w-2 h-2 rounded-full shrink-0"
            [style.background-color]="
              cashService.isOpen() ? 'var(--panel-color-success)' : 'var(--panel-color-text-muted)'
            "
          ></span>
          {{ cashService.isOpen() ? 'Caja abierta' : 'Sin turno' }}
        </div>
      }

      <button
        (click)="panelThemeService.toggleTheme()"
        class="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center transition-colors
               border border-[var(--panel-color-border)] bg-[var(--panel-color-surface)]
               text-[var(--panel-color-text-secondary)] hover:bg-[var(--panel-color-surface-elevated)]"
        [attr.aria-label]="
          panelThemeService.theme() === 'light' ? 'Activar tema oscuro' : 'Activar tema claro'
        "
      >
        <span class="w-[18px] h-[18px] block">
          <app-icon [name]="panelThemeService.theme() === 'light' ? 'moon' : 'sun'" />
        </span>
      </button>

      <div class="relative">
        <button
          (click)="toggleNotifications()"
          class="relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                 border border-[var(--panel-color-border)] bg-[var(--panel-color-surface)]
                 text-[var(--panel-color-text-secondary)] hover:bg-[var(--panel-color-surface-elevated)]"
          aria-label="Notificaciones"
        >
          <span class="w-[18px] h-[18px] block"><app-icon name="bell" /></span>
          @if (notificationCenter.pendingCount() > 0) {
            <span
              class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--panel-color-primary)] text-white text-[11px] font-bold flex items-center justify-center"
              style="border: 2px solid var(--panel-color-surface)"
            >
              {{ notificationCenter.pendingCount() > 9 ? '9+' : notificationCenter.pendingCount() }}
            </span>
          }
        </button>

        @if (notificationsOpen()) {
          <div
            class="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-xl border z-50
                   bg-[var(--panel-color-surface-card)] border-[var(--panel-color-border)]"
          >
            <div
              class="px-4 py-3 border-b flex items-center justify-between gap-2 border-[var(--panel-color-border)]"
            >
              <p class="text-sm font-semibold text-[var(--panel-color-text-primary)]">Notificaciones</p>
              @if (showEnablePush()) {
                <button
                  (click)="enablePush()"
                  class="text-xs font-medium shrink-0 text-[var(--panel-color-primary-text)] hover:underline"
                >
                  Activar avisos push
                </button>
              }
            </div>
            @if (notificationCenter.list().length === 0) {
              <p class="px-4 py-6 text-sm text-center text-[var(--panel-color-text-muted)]">
                Sin notificaciones todavía
              </p>
            } @else {
              <ul class="divide-y divide-[var(--panel-color-border)]">
                @for (n of notificationCenter.list(); track n.id) {
                  <li
                    class="px-4 py-3 flex items-start gap-2"
                    [style.background-color]="!n.attended_at ? 'var(--panel-color-primary-soft)' : null"
                  >
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-[var(--panel-color-text-secondary)]">{{ summarize(n) }}</p>
                      <p class="text-xs text-[var(--panel-color-text-subtle)]">
                        {{ n.created_at | date: 'short' }}
                      </p>
                    </div>
                    @if (!n.attended_at) {
                      <button
                        (click)="attend(n.id)"
                        class="shrink-0 text-xs font-medium text-[var(--panel-color-primary-text)] hover:underline"
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
          class="flex items-center gap-2.5 h-11 pl-1.5 pr-2.5 rounded-full transition-colors
                 border border-[var(--panel-color-border)] bg-[var(--panel-color-surface-card)]
                 hover:bg-[var(--panel-color-surface-elevated)]"
        >
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0
                   bg-[var(--panel-color-primary-soft)] text-[var(--panel-color-primary-text)]"
          >
            {{ userInitial() }}
          </div>
          <div class="text-left hidden md:block leading-tight">
            <p class="text-[13px] font-semibold text-[var(--panel-color-text-primary)]">
              {{ currentUser()?.name }}
            </p>
            <p class="text-[11px] text-[var(--panel-color-text-muted)]">{{ roleLabel() }}</p>
          </div>
          <span class="w-3.5 h-3.5 shrink-0 text-[var(--panel-color-text-muted)]">
            <app-icon name="chevron-down" />
          </span>
        </button>

        @if (dropdownOpen()) {
          <div
            class="absolute right-0 mt-2 w-60 rounded-xl shadow-xl border z-50
                   bg-[var(--panel-color-surface-card)] border-[var(--panel-color-border)]"
          >
            <div class="px-3 py-2.5 border-b border-[var(--panel-color-border)] mb-1.5">
              <p class="text-sm font-semibold text-[var(--panel-color-text-primary)]">
                {{ currentUser()?.name }}
              </p>
              <p class="text-xs truncate text-[var(--panel-color-text-muted)]">
                {{ currentUser()?.email }}
              </p>
            </div>
            <div class="p-2 pt-0">
              <a
                routerLink="/dashboard/mi-cuenta"
                (click)="dropdownOpen.set(false)"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium
                       text-[var(--panel-color-text-primary)] hover:bg-[var(--panel-color-overlay-hover)]"
              >
                <span class="w-[18px] h-[18px]"><app-icon name="key-round" /></span>
                Cambiar contraseña
              </a>
              @if (!currentUser()?.isSuperAdmin) {
                <a
                  routerLink="/dashboard/mi-plan"
                  (click)="dropdownOpen.set(false)"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium
                         text-[var(--panel-color-text-primary)] hover:bg-[var(--panel-color-overlay-hover)]"
                >
                  <span class="w-[18px] h-[18px]"><app-icon name="badge-check" /></span>
                  Mi plan
                </a>
              }
              <div class="h-px my-1 bg-[var(--panel-color-border)]"></div>
              <button
                (click)="logout()"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium text-[var(--panel-color-error)] hover:bg-[var(--panel-color-overlay-hover)]"
              >
                <span class="w-[18px] h-[18px]"><app-icon name="log-out" /></span>
                Cerrar sesión
              </button>
            </div>
          </div>
        }
      </div>
    </header>
  `,
})
export class TenantHeaderComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly layoutService = inject(LayoutService);
  readonly panelThemeService = inject(PanelThemeService);
  readonly cashService = inject(CashService);
  readonly notificationCenter = inject(NotificationCenterService);
  private readonly pushRegistration = inject(PushRegistrationService);
  private readonly toast = inject(ToastService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  readonly summarize = summarize;

  currentUser = this.authService.currentUser;
  dropdownOpen = signal(false);
  notificationsOpen = signal(false);
  pushOffered = signal(
    typeof Notification !== 'undefined' && Notification.permission === 'default',
  );

  /** Mismo punto de quiebre reactivo que `TenantSidebarComponent` (research.md
   *  R6/R8, contracts/tenant-layout-contract.md §3) — observado de forma
   *  independiente en vez de compartido vía `LayoutService` (research.md R6:
   *  "no se añade ningún listener global ni se toca el constructor de
   *  LayoutService"). */
  private readonly isDesktop = toSignal(
    this.breakpointObserver.observe(DESKTOP_BREAKPOINT_QUERY).pipe(map((state) => state.matches)),
    { initialValue: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true },
  );
  readonly viewMode = computed<'desktop' | 'drawer'>(() =>
    this.isDesktop() ? 'desktop' : 'drawer',
  );

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Título dinámico derivado de la ruta activa (contracts/tenant-layout-contract.md §3):
   *  sección = `frame.group`, título = `frame.label` -- mismo criterio con el
   *  que `HeaderComponent` legado resolvía un título fijo. */
  private readonly activeItem = computed(() =>
    NAV_ITEMS.find((item) => item.route === this.currentUrl()),
  );
  readonly sectionTitle = computed(() => this.activeItem()?.frame?.group ?? '');
  readonly pageTitle = computed(() => this.activeItem()?.frame?.label ?? '');

  /** Solo ADMIN/CASHIER tienen acceso a Caja (mismo criterio de rol que
   *  `navigation.config.ts`); MESERO nunca lo ve (research.md R8). */
  readonly showCashIndicator = computed(() => {
    const role = this.currentUser()?.role;
    return role === UserRole.ADMIN || role === UserRole.CASHIER;
  });

  userInitial = computed(() => this.currentUser()?.name?.[0]?.toUpperCase() ?? '?');
  roleLabel = computed(() => {
    const role = this.currentUser()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  showEnablePush = computed(() => this.pushRegistration.supported && this.pushOffered());

  constructor() {
    // research.md R8: el navbar global es nuevo, así que el dato "caja
    // abierta" puede no conocerse todavía si el usuario no visitó antes Caja
    // ni Terminal de Mesas en esta sesión -- mismo guard que ya usa
    // `PosTerminalStore.ensureCheckoutDataLoaded()` (pos-terminal.store.ts).
    if (this.showCashIndicator() && !this.cashService.shift()) {
      void this.cashService.discoverOpenShift();
    }
  }

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
      if (result.reason === 'needs-reload') {
        this.toast.info('Recarga la página para poder activar los avisos push.');
      } else if (result.reason === 'error') {
        this.toast.error('No se pudo activar el push. Intenta de nuevo.');
      }
    }
    this.pushOffered.set(false);
  }

  async logout(): Promise<void> {
    this.dropdownOpen.set(false);
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
