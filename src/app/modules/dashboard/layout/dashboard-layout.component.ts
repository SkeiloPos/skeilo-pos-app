import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from './sidebar.component';
import { HeaderComponent } from './header.component';
import { LayoutService } from './layout.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { ToastContainerComponent } from '../../../shared/feedback/toast-container.component';
import { ConfirmDialogComponent } from '../../../shared/feedback/confirm-dialog.component';
import { RealtimeService } from '../../../core/realtime/realtime.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, ToastContainerComponent, ConfirmDialogComponent],
  template: `
    <div class="flex h-screen bg-gray-50 overflow-hidden">
      <!-- Overlay backdrop — visible en móvil y tablet cuando el sidebar está
           abierto (spec 078, US6: umbral md → lg). -->
      @if (layoutService.sidebarOpen()) {
        <div
          class="fixed inset-0 bg-black/40 z-30 lg:hidden"
          (click)="layoutService.close()"
        ></div>
      }

      <app-sidebar />

      <!--
        El sidebar es "fixed" en todos los breakpoints (spec 036, FR-012): en
        escritorio no ocupa espacio de flexbox por sí solo, así que este
        margen es lo que le cede el ancho al contenido cuando está colapsado
        (y se lo devuelve cuando vuelve a abrirse). En móvil y tablet no aplica
        (prefijo "lg:" en el nombre de la clase, spec 078 US6) — ahí sigue
        siendo un slide-over con backdrop, sin desplazar el contenido.
      -->
      <div
        class="flex flex-col flex-1 min-w-0 overflow-hidden transition-[margin-left] duration-300 ease-in-out"
        [class.lg:ml-64]="layoutService.sidebarOpen()"
      >
        <app-header />
        <main class="flex-1 overflow-y-auto p-4 md:p-6">
          <router-outlet />
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
  styles: [
    `
      @media print {
        :host-context(body.printing-cash-report) app-sidebar,
        :host-context(body.printing-cash-report) app-header {
          display: none;
        }
      }
    `,
  ],
})
export class DashboardLayoutComponent implements OnInit, OnDestroy {
  readonly layoutService = inject(LayoutService);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly planSummaryService = inject(PlanSummaryService);
  private readonly realtime = inject(RealtimeService);

  /** Carga branding y plan una vez para todo el dashboard (los lee el sidebar
   * para pintar el logo/nombre y para ocultar ítems que el plan no incluye,
   * spec 033 Historias 4/5). Para super admin `GET /plan` no aplica (sin
   * tenant); falla en silencio igual que ya hace `tenantInfo` en ese caso, y
   * el sidebar de super admin no usa `moduleKey` de todos modos. */
  ngOnInit(): void {
    void this.tenantInfo.load();
    void this.planSummaryService.load();
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
