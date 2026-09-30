import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { CashArqueoModalComponent } from '../components/cash-arqueo-modal.component';
import { CashDashboardComponent } from '../components/cash-dashboard.component';
import { CashMovementModalComponent } from '../components/cash-movement-modal.component';
import { CashOpenComponent } from '../components/cash-open.component';
import { CashHistoryComponent } from '../components/cash-history.component';
import { CashOverviewComponent } from '../components/cash-overview.component';
import { CashReportComponent } from '../components/cash-report.component';
import { CashSessionStore } from '../services/cash-session.store';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Contenedor del Módulo de Caja (rediseño SkeiloPOS, backend real).
 *
 * Provee el `CashSessionStore` a nivel de página para que cada visita arranque
 * limpia y los subcomponentes compartan estado. En `ngOnInit` carga las cajas y
 * restaura el turno abierto; renderiza la barra superior y conmuta entre las
 * pantallas apertura / dashboard / report, más los modales.
 */
@Component({
  selector: 'app-cash-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CashSessionStore, TenantDatePipe],
  imports: [
    CashOverviewComponent,
    CashHistoryComponent,
    CashOpenComponent,
    CashDashboardComponent,
    CashReportComponent,
    CashMovementModalComponent,
    CashArqueoModalComponent,
    IconMiComponent,
  ],
  template: `
    <div class="min-h-full flex flex-col -m-4 sm:-m-6">
      <!-- Barra superior (spec 089: no se imprime; el reporte ya trae su propio encabezado) -->
      <div class="flex items-center justify-between gap-4 px-4 py-3 border-b-2 border-gray-100 bg-white print:hidden">
        <div class="flex items-center gap-4">
          @if (store.isAdmin() && store.screen() !== 'overview') {
            <button (click)="store.backToOverview()" class="text-[13px] text-gray-500 hover:text-gray-800 font-medium">← Cajas</button>
            <div class="w-px h-[22px] bg-gray-200"></div>
          }
          <div class="text-lg font-extrabold text-gray-900">SkeiloPOS</div>
          <div class="w-px h-[22px] bg-gray-200"></div>
          <div class="text-sm text-gray-700">Módulo de Caja</div>
        </div>
        <div class="flex items-center gap-4">
          @if (store.screen() !== 'overview' && store.screen() !== 'history') {
            <div class="text-[13px] text-gray-400">{{ store.cajaLabel() }}</div>
            <span class="inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-md" [class]="statusClass()">{{ statusLabel() }}</span>
          }
          @if (store.screen() === 'dashboard') {
            <div class="flex items-center gap-1.5 text-[13px] text-gray-500">
              <app-mi-icon name="schedule" [size]="14" />
              {{ store.turnoDuracion() }}
            </div>
          }
          <div class="text-[13px] font-semibold text-gray-900">{{ store.cajero() }}</div>
        </div>
      </div>

      <!-- Pantalla activa -->
      @if (store.loading()) {
        <div class="flex-1 flex items-center justify-center p-10 text-sm text-gray-400">Cargando caja…</div>
      } @else {
        @switch (store.screen()) {
          @case ('overview') { <app-cash-overview /> }
          @case ('history') { <app-cash-history /> }
          @case ('apertura') { <app-cash-open /> }
          @case ('dashboard') { <app-cash-dashboard /> }
          @case ('report') { <app-cash-report /> }
        }
      }

      <!-- Modales -->
      @switch (store.modal()) {
        @case ('arqueo') { <app-cash-arqueo-modal /> }
        @case (null) {}
        @default { <app-cash-movement-modal /> }
      }
    </div>
  `,
})
export class CashPageComponent implements OnInit, OnDestroy {
  readonly store = inject(CashSessionStore);

  readonly statusLabel = computed(() => {
    switch (this.store.screen()) {
      case 'report':
        return 'Cerrada';
      case 'dashboard':
        return 'Abierta';
      default:
        return 'Sin abrir';
    }
  });

  readonly statusClass = computed(() => {
    switch (this.store.screen()) {
      case 'report':
        return 'border border-indigo-600 text-indigo-600';
      case 'dashboard':
        return 'bg-indigo-50 text-indigo-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  });

  ngOnInit(): void {
    void this.store.init();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }
}
