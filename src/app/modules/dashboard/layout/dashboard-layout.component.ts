import { Component, OnDestroy, OnInit, computed, effect, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { OverlayContainer } from '@angular/cdk/overlay';
import { SidebarComponent } from './sidebar.component';
import { HeaderComponent } from './header.component';
import { TenantSidebarComponent } from './tenant-sidebar.component';
import { TenantHeaderComponent } from './tenant-header.component';
import { LayoutService } from './layout.service';
import { PanelThemeService } from './panel-theme.service';
import { NavigationTransitionService } from './navigation-transition.service';
import { AuthService } from '../../../core/services/auth.service';
import { BootstrapService } from '../../../core/bootstrap/bootstrap.service';
import { ToastContainerComponent } from '../../../shared/feedback/toast-container.component';
import { ConfirmDialogComponent } from '../../../shared/feedback/confirm-dialog.component';
import { RealtimeService } from '../../../core/realtime/realtime.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    SidebarComponent,
    HeaderComponent,
    TenantSidebarComponent,
    TenantHeaderComponent,
    ToastContainerComponent,
    ConfirmDialogComponent,
  ],
  template: `
    <div
      class="shell-root flex h-screen bg-gray-50 overflow-hidden"
      [class.panel-theme]="!isSuperAdmin()"
      [attr.data-theme]="isSuperAdmin() ? null : panelThemeService.theme()"
    >
      <!--
        Overlay backdrop del sidebar legado (Super Admin) — spec 078, US6.
        Acotado a Super Admin (spec 116, contracts/tenant-layout-contract.md
        §2): app-tenant-sidebar pinta su propio scrim, autosuficiente; sin
        este guard, los dos backdrops (idéntico bg-black/40) se dibujarían
        encima uno del otro para tenant, oscureciendo el doble de lo previsto.
      -->
      @if (isSuperAdmin() && layoutService.sidebarOpen()) {
        <div
          class="fixed inset-0 bg-black/40 z-30 lg:hidden print:hidden"
          (click)="layoutService.close()"
        ></div>
      }

      @if (isSuperAdmin()) {
        <app-sidebar />
      } @else {
        <app-tenant-sidebar />
      }

      <!--
        Los dos sidebars son fixed en todos los breakpoints: en escritorio
        no ocupan espacio de flexbox por sí solos, así que este margen es lo
        que les cede el ancho al contenido. Super Admin conserva exactamente
        su margen fijo de siempre (ml-64, spec 036); el panel de tenant usa un
        margen que sigue su propio ancho variable (72px colapsado / 248px
        expandido, spec 116, data-model.md §2) — nunca los dos a la vez. En
        móvil/tablet ninguno aplica (prefijo lg:), donde ambos sidebars
        siguen siendo un slide-over superpuesto, sin desplazar el contenido.
      -->
      <div
        class="shell-content relative flex flex-col flex-1 min-w-0 overflow-hidden transition-[margin-left] duration-300 ease-in-out"
        [class.lg:ml-64]="isSuperAdmin() && layoutService.sidebarOpen()"
        [class.lg:ml-[248px]]="!isSuperAdmin() && !layoutService.desktopCollapsed()"
        [class.lg:ml-[72px]]="!isSuperAdmin() && layoutService.desktopCollapsed()"
      >
        @if (isSuperAdmin()) {
          <app-header />
        } @else {
          <app-tenant-header />
        }

        <!--
          Barra de carga + skeleton + aparición escalonada (Historia 4,
          FR-019 a FR-022; contracts/navigation-transition-contract.md) —
          acotada a !isSuperAdmin() (research.md R1/R20, mismo criterio que
          el resto de esta spec). La barra vive en shell-content (no en
          shell-root) para no superponerse al sidebar, igual que el navbar.
        -->
        @if (!isSuperAdmin()) {
          <div
            class="nav-transition-bar"
            [class.nav-transition-bar--visible]="navigationTransitionService.barVisible()"
            [style.width.%]="navigationTransitionService.barProgress()"
          ></div>
        }
        <main class="shell-main flex-1 overflow-y-auto p-4 md:p-6">
          @if (isSuperAdmin()) {
            <router-outlet />
          } @else {
            <div class="nav-transition" [attr.data-phase]="navigationTransitionService.phase()">
              <!-- Skeleton genérico (FR-021): bloques fijos, nunca derivados de
                   los datos reales de la sección destino (research.md R20). -->
              <div class="nav-skeleton" aria-hidden="true">
                <div class="nav-skeleton__block" style="height: 88px"></div>
                <div class="nav-skeleton__block" style="height: 220px"></div>
                <div class="nav-skeleton__block" style="height: 160px"></div>
              </div>
              <div class="nav-transition__content">
                <router-outlet />
              </div>
            </div>
          }
        </main>
      </div>

      <app-toast-container />
      <app-confirm-dialog />
    </div>
  `,
  // spec 087 (FR-002, A-87): el shell (sidebar/header) no tenía ningún
  // tratamiento de impresión -- el `@media print` de cash-report.component.ts
  // solo oculta sus propios controles, nunca el shell que lo envuelve. Se
  // oculta aquí, condicionado a `body.printing-cash-report` (fijada por
  // `cash-session.store.ts::imprimirReporte()` justo antes de `window.print()`
  // y retirada en `afterprint`), para no afectar la impresión de otras
  // pantallas que ya usan `window.print()` (p. ej. `table-qr-sheet.component.ts`).
  //
  // spec 089 (Historia 5, FR-022/FR-024): además de ocultar el shell, hay que **liberarlo** y quitar
  // el telón del menú. Causa reproducida con Chrome real (`Page.printToPDF` con medio `print` sobre
  // el reporte de un turno cerrado, también con un turno sin movimientos):
  //  1. **Hoja en blanco**: el navegador pagina a ~816 px de ancho, por debajo del umbral `lg`, así
  //     que el telón del menú móvil (`fixed inset-0 z-30 lg:hidden`, presente porque `sidebarOpen()`
  //     es true en escritorio) deja de estar oculto y se pinta, a página completa, ENCIMA del
  //     reporte en cada hoja. Se oculta con `print:hidden`.
  //  2. **Sin paginar**: el contenedor raíz es `h-screen overflow-hidden`, el de contenido
  //     `overflow-hidden` y `main` `overflow-y-auto` --cajas de altura fija que recortan lo que
  //     excede la primera hoja--, y `lg:ml-64` deja un margen del sidebar. Se pasan a bloque con
  //     altura automática, sin overflow, sin margen y sin fondo.
  // Acotado a `body.printing-cash-report` (salvo el telón, que nunca debe imprimirse) para no tocar
  // recibos, cuenta de mesa ni la hoja de QR.
  //
  // spec 116: `app-tenant-sidebar`/`app-tenant-header` reciben el mismo tratamiento que
  // `app-sidebar`/`app-header` -- quien cierra un turno e imprime el reporte desde este panel es
  // casi siempre ADMIN/CASHIER (el panel de tenant), no Super Admin.
  styles: [
    `
      @media print {
        :host-context(body.printing-cash-report) app-sidebar,
        :host-context(body.printing-cash-report) app-header,
        :host-context(body.printing-cash-report) app-tenant-sidebar,
        :host-context(body.printing-cash-report) app-tenant-header {
          display: none;
        }
        :host-context(body.printing-cash-report) .shell-root,
        :host-context(body.printing-cash-report) .shell-content,
        :host-context(body.printing-cash-report) .shell-main {
          display: block;
          height: auto;
          min-height: 0;
          max-height: none;
          overflow: visible;
          margin-left: 0;
          padding: 0;
          position: static;
          background: none;
          transition: none;
        }
      }
    `,
  ],
})
export class DashboardLayoutComponent implements OnInit, OnDestroy {
  readonly layoutService = inject(LayoutService);
  readonly panelThemeService = inject(PanelThemeService);
  readonly navigationTransitionService = inject(NavigationTransitionService);
  private readonly authService = inject(AuthService);
  private readonly bootstrapService = inject(BootstrapService);
  private readonly realtime = inject(RealtimeService);
  private readonly overlayContainer = inject(OverlayContainer);

  /** Misma fuente que ya usa SidebarComponent (research.md R1) -- la única
   *  bifurcación entre el panel legado (Super Admin) y el rediseñado
   *  (Administrador/Cajero/Mesero, spec 116). */
  readonly isSuperAdmin = computed(() => !!this.authService.currentUser()?.isSuperAdmin);

  /** El `cdk-overlay-container` es compartido por toda la app (un único nodo,
   *  hijo directo de `<body>`, fuera del subárbol de `.panel-theme`) -- sin
   *  esto, el único `cdkConnectedOverlay` del panel de tenant (el menú de
   *  acciones de Promociones) quedaría congelado en paleta clara aunque el
   *  resto del panel esté en oscuro (research.md R18;
   *  contracts/panel-theme-contract.md §9). Cubre automáticamente cualquier
   *  overlay de CDK futuro, no solo el de Promociones -- un único punto. */

  /** Carga branding, plan y notificaciones recientes en una sola petición
   * agregada (spec 100) para todo el dashboard (los lee el sidebar para
   * pintar el logo/nombre y para ocultar ítems que el plan no incluye, spec
   * 033 Historias 4/5). Para super admin los 3 bloques llegan en `null`
   * (FR-007) y el sidebar de super admin no usa `moduleKey` de todos modos. */
  ngOnInit(): void {
    void this.bootstrapService.load();
    // Spec 077 (research.md §2): la conexión SSE del staff vive aquí, en el
    // shell autenticado, en vez de en una página hija (`pos-terminal.store.ts`
    // antes). Así sobrevive a la navegación entre secciones del POS — el
    // cajero sigue recibiendo avisos aunque no esté en Terminal de Mesas.
    this.realtime.connectStaff();
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
  }

  constructor() {
    effect(() => {
      const el = this.overlayContainer.getContainerElement();
      el.classList.toggle('panel-theme', !this.isSuperAdmin());
      if (this.isSuperAdmin()) {
        el.removeAttribute('data-theme');
      } else {
        el.setAttribute('data-theme', this.panelThemeService.theme());
      }
    });

    inject(Router).events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        // Spec 036 (FR-012): `sidebarOpen()` ahora también controla el panel
        // de escritorio, no solo el slide-over móvil — cerrar sin condición
        // en cada navegación (como antes) colapsaba el sidebar de escritorio
        // en cuanto el usuario cambiaba de página, perdiendo su elección.
        // Solo tiene sentido auto-cerrar cuando el menú se superpone al
        // contenido (móvil y, desde spec 078 US6, también tablet: umbral
        // 768 → 1024); en escritorio (≥ 1024px) la navegación no debe tocar
        // el estado del sidebar.
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          this.layoutService.close();
        }
      });
  }
}
