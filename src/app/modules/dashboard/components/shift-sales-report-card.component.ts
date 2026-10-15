import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CashService } from '../../cash-register/services/cash.service';
import { ShiftSummary } from '../../cash-register/interfaces/cash.interface';
import { ShiftReportsService } from '../services/shift-reports.service';
import { ShiftSalesReport } from '../interfaces/shift-reports.interface';
import { formatMoney } from '../../../shared/money';
import { ChartCardComponent } from '../../../shared/charts/chart-card.component';
import { RankedBarsChartComponent } from '../../../shared/charts/ranked-bars-chart.component';
import { ShareBarChartComponent, ShareItem } from '../../../shared/charts/share-bar-chart.component';
import { StatTileComponent } from '../../../shared/charts/stat-tile.component';

/**
 * Reporte operativo de UN turno elegido (spec 119, US1): selector de turnos
 * recientes (histórico de cierres vía `CashService.listShifts`) + su
 * reporte, reutilizando los mismos componentes de gráfica que ya usa
 * `reports-page.component.ts`. Se monta dentro de `admin-dashboard.component.ts`
 * cuando el selector de período está en "Turno específico".
 */
@Component({
  selector: 'app-shift-sales-report-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartCardComponent, StatTileComponent, RankedBarsChartComponent, ShareBarChartComponent],
  template: `
    <div class="space-y-4">
      <select
        [value]="selectedShiftId()"
        (change)="onSelectShift($event)"
        [disabled]="shifts().length === 0"
        class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 max-w-full"
      >
        @if (shifts().length === 0) {
          <option value="">Sin turnos cerrados todavía</option>
        }
        @for (s of shifts(); track s.id) {
          <option [value]="s.id">{{ shiftLabel(s) }}</option>
        }
      </select>

      @if (loadError()) {
        <p class="text-sm text-red-600">{{ loadError() }}</p>
      } @else {
        @if (report()?.is_live) {
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Turno en curso
          </span>
        }

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <app-stat-tile label="Ventas totales" [value]="money(totalSales())" [loading]="loading()" />
          <app-stat-tile label="Órdenes" [value]="orderCount().toString()" [loading]="loading()" />
          <app-stat-tile label="Ticket promedio" [value]="money(avgTicket())" [loading]="loading()" />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <app-chart-card
            title="Productos más vendidos"
            [loading]="loading()"
            [empty]="topProducts().length === 0"
            emptyText="Este turno no registró ventas"
            [height]="200"
          >
            <app-ranked-bars-chart [labels]="productLabels()" [values]="productValues()" kind="money" />
          </app-chart-card>
          <app-chart-card
            title="Ventas por categoría"
            [loading]="loading()"
            [empty]="categoryShares().length === 0"
            emptyText="Sin ventas por categoría en este turno"
            [height]="140"
          >
            <app-share-bar-chart [items]="categoryShares()" kind="money" />
          </app-chart-card>
        </div>
      }
    </div>
  `,
})
export class ShiftSalesReportCardComponent implements OnInit {
  private readonly cashService = inject(CashService);
  private readonly shiftReportsService = inject(ShiftReportsService);

  readonly shifts = signal<ShiftSummary[]>([]);
  readonly selectedShiftId = signal('');
  readonly report = signal<ShiftSalesReport | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly totalSales = computed(() => Number(this.report()?.total_sales ?? 0));
  readonly orderCount = computed(() => this.report()?.order_count ?? 0);
  readonly avgTicket = computed(() => Number(this.report()?.avg_ticket ?? 0));
  readonly productLabels = computed(() => this.topProducts().map((p) => p.name));
  readonly productValues = computed(() => this.topProducts().map((p) => Number(p.revenue)));
  readonly topProducts = computed(() => this.report()?.top_products ?? []);
  readonly categoryShares = computed<ShareItem[]>(() =>
    (this.report()?.categories ?? [])
      .filter((c) => Number(c.revenue) > 0)
      .map((c) => ({ label: c.category_name, value: Number(c.revenue) })),
  );

  async ngOnInit(): Promise<void> {
    try {
      const page = await this.cashService.listShifts({ status: 'closed', size: 20 });
      this.shifts.set(page.items);
      if (page.items.length > 0) {
        this.selectedShiftId.set(page.items[0].id);
        await this.load(page.items[0].id);
      }
    } catch {
      this.loadError.set('No se pudo cargar el histórico de turnos.');
    }
  }

  async onSelectShift(event: Event): Promise<void> {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedShiftId.set(id);
    if (id) await this.load(id);
  }

  private async load(shiftId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.report.set(await this.shiftReportsService.getShiftSalesReport(shiftId));
    } catch {
      this.loadError.set('No se pudo cargar el reporte de este turno.');
    } finally {
      this.loading.set(false);
    }
  }

  shiftLabel(s: ShiftSummary): string {
    const fecha = new Date(s.opened_at).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return `${s.register_name} · ${fecha}`;
  }

  money(n: number): string {
    return formatMoney(n);
  }
}
