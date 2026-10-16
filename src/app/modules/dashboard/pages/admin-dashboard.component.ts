import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DiningSessionService } from '../../tables/services/dining-session.service';
import { DiningOrder } from '../../tables/interfaces/dining.interface';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { CashService } from '../../cash-register/services/cash.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { ShiftReportsService } from '../services/shift-reports.service';
import { PeriodSalesReport } from '../interfaces/shift-reports.interface';
import { ShiftSalesReportCardComponent } from '../components/shift-sales-report-card.component';
import { formatMoney } from '../../../shared/money';
import { ChartCardComponent } from '../../../shared/charts/chart-card.component';
import { RankedBarsChartComponent } from '../../../shared/charts/ranked-bars-chart.component';
import { ShareItem } from '../../../shared/charts/share-bar-chart.component';
import { LineChartComponent } from '../../../shared/charts/line-chart.component';
import { PieChartComponent } from '../../../shared/charts/pie-chart.component';
import { seriesColor } from '../../../shared/charts/chart-theme';
import { AuthService } from '../../../core/services/auth.service';
import { DailySalesPoint, PaymentMethodsReport } from '../interfaces/shift-reports.interface';
import { PaymentMethodsReportParams } from '../services/shift-reports.service';
import { PaymentMethodsChartComponent, PaymentMethodSeries } from '../components/payment-methods-chart.component';

interface QuickAction {
  label: string;
  icon: string;
  route: string;
  description: string;
}

interface DashboardKpi {
  label: string;
  value: string;
  sub: string;
  /** `false` en la primera celda: sin divisor a su izquierda (spec 122, research.md §2). */
  divider: boolean;
}

/** Período del reporte operativo por turno (spec 119, FR-005/FR-006/FR-010/FR-012). */
type ReportPeriodOption = 'current_shift' | 'shift' | 'day' | 'week' | 'month' | 'range';

/** Criterio de "Más vendidos" (spec 122, FR-005). */
type TopMode = 'units' | 'revenue';

/** Indicador del panel "Estadísticas de ventas" (spec 122, FR-004). */
type TrendMode = 'sales' | 'orders' | 'avgTicket';

const TREND_WINDOW_DAYS = 10;

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    IconMiComponent,
    ShiftSalesReportCardComponent,
    ChartCardComponent,
    RankedBarsChartComponent,
    LineChartComponent,
    PieChartComponent,
    PaymentMethodsChartComponent,
  ],
  providers: [TenantDatePipe],
  template: `
    <div class="space-y-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ greeting() }}, {{ userName() }}.</h1>
        <p class="text-gray-500 text-sm mt-1">Esto es lo que pasa hoy en tu negocio.</p>
      </div>

      <!-- Accesos rápidos (spec 122, FR-002: justo debajo del saludo) -->
      <div>
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Accesos rápidos
        </h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          @for (action of quickActions; track action.route) {
            <a
              [routerLink]="action.route"
              class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group flex items-center gap-4"
            >
              <div
                class="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors shrink-0"
              >
                <app-mi-icon [name]="action.icon" [size]="20" class="text-indigo-600" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-800">{{ action.label }}</p>
                <p class="text-xs text-gray-400 truncate">{{ action.description }}</p>
              </div>
            </a>
          }
        </div>
      </div>

      <!-- Reporte operativo por turno (spec 119) -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="flex items-start justify-between gap-4 flex-wrap p-5 pb-4">
          <div>
            <h2 class="text-sm font-semibold text-gray-800">Reporte operativo</h2>
            <p class="text-xs text-gray-400 mt-0.5">Ventas por turno de caja</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <select
              [value]="period()"
              (change)="onPeriodChange($event)"
              class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="current_shift">Turno actual</option>
              <option value="shift">Turno específico</option>
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="range">Rango personalizado</option>
            </select>
            @if (period() !== 'shift') {
              <select
                [value]="cashRegisterId()"
                (change)="onRegisterChange($event)"
                class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Todas las cajas</option>
                @for (r of cashService.registers(); track r.id) {
                  <option [value]="r.id">{{ r.name }}</option>
                }
              </select>
            }
          </div>
        </div>

        @if (period() === 'range') {
          <div class="flex items-center gap-2 flex-wrap px-5 pb-4">
            <input
              type="date"
              [value]="dateFrom()"
              (change)="onDateFromChange($event)"
              class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <span class="text-xs text-gray-400">a</span>
            <input
              type="date"
              [value]="dateTo()"
              (change)="onDateToChange($event)"
              class="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        }

        @if (period() === 'shift') {
          <div class="px-5 pb-5">
            <app-shift-sales-report-card (shiftIdChange)="onShiftIdChange($event)" />
          </div>
        } @else {
          @if (periodError()) {
            <p class="text-sm text-red-600 px-5 pb-5">{{ periodError() }}</p>
          } @else {
            @if (period() === 'current_shift' && periodReport()?.is_live) {
              <div class="px-5 pb-4">
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Turno en curso
                  @if (periodActiveOrdersCount() !== null) {
                    · {{ periodActiveOrdersCount() }} pedido(s) activo(s)
                  }
                </span>
              </div>
            }

            <!-- Indicadores del turno: fila de 4, divisor fino entre celdas (spec 122, FR-003) -->
            <div class="grid grid-cols-2 sm:grid-cols-4 border-t border-b border-gray-100">
              @for (kpi of kpis(); track kpi.label) {
                <div class="p-5 flex flex-col gap-1.5" [class.border-l]="kpi.divider" [class.border-gray-100]="kpi.divider">
                  <span class="text-xs font-semibold text-gray-500">{{ kpi.label }}</span>
                  @if (loadingPeriod()) {
                    <div class="h-8 mt-0.5 bg-gray-100 rounded-lg animate-pulse w-20"></div>
                  } @else {
                    <span class="text-2xl font-bold text-gray-900">{{ kpi.value }}</span>
                  }
                  <span class="text-xs text-gray-400">{{ kpi.sub }}</span>
                </div>
              }
            </div>

            <div class="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <app-chart-card
                title="Productos más vendidos"
                [loading]="loadingPeriod()"
                [empty]="topProducts().length === 0"
                emptyText="Sin ventas en este período"
                [height]="200"
              >
                <div card-actions role="group" aria-label="Ver por" class="flex p-0.5 border border-gray-200 rounded-lg bg-gray-50">
                  @for (m of topModeOptions; track m.value) {
                    <button
                      type="button"
                      [attr.aria-pressed]="topMode() === m.value"
                      (click)="topMode.set(m.value)"
                      class="h-8 px-3 rounded-md text-xs font-semibold transition-colors"
                      [class.bg-indigo-600]="topMode() === m.value"
                      [class.text-white]="topMode() === m.value"
                      [class.text-gray-600]="topMode() !== m.value"
                    >{{ m.label }}</button>
                  }
                </div>
                <app-ranked-bars-chart [labels]="topProductLabels()" [values]="topProductValues()" [kind]="topMode() === 'revenue' ? 'money' : 'units'" />
              </app-chart-card>
              <app-chart-card
                title="Ventas por categoría"
                [loading]="loadingPeriod()"
                [empty]="categoryShares().length === 0"
                emptyText="Sin ventas por categoría en este período"
                [height]="240"
              >
                <app-pie-chart [items]="categoryShares()" kind="money" />
              </app-chart-card>
            </div>
          }
        }
      </div>

      <!-- Estadísticas de ventas: tendencia reciente, independiente del período de arriba (spec 122, FR-004) -->
      <app-chart-card
        title="Estadísticas de ventas"
        [loading]="loadingTrend()"
        [empty]="trendDays().length === 0"
        emptyText="Sin ventas en los días más recientes"
        [height]="280"
      >
        <div card-actions role="group" aria-label="Indicador de la tendencia" class="flex border border-gray-200 rounded-lg bg-gray-50 p-0.5 gap-0.5">
          @for (t of trendModeOptions; track t.value) {
            <button
              type="button"
              [attr.aria-pressed]="trendMode() === t.value"
              (click)="trendMode.set(t.value)"
              class="h-9 px-3.5 rounded-md text-sm font-semibold transition-colors"
              [class.bg-indigo-600]="trendMode() === t.value"
              [class.text-white]="trendMode() === t.value"
              [class.text-gray-600]="trendMode() !== t.value"
            >{{ t.label }}</button>
          }
        </div>
        <p class="text-3xl font-bold text-gray-900 tabular-nums">{{ trendBigNumber() }}</p>
        <p class="text-xs text-gray-400 mb-4">{{ trendBigLabel() }}</p>
        <app-line-chart [labels]="trendLabels()" [values]="trendValues()" [kind]="trendMode() === 'orders' ? 'units' : 'money'" [height]="200" />
      </app-chart-card>

      <!-- Ingresos por método de pago: sigue el período de arriba, granularidad adaptativa (spec 122, FR-007) -->
      <app-chart-card
        title="Ingresos por método de pago"
        [subtitle]="pmSubtitle()"
        [loading]="loadingPaymentMethods()"
        [error]="paymentMethodsError()"
        [empty]="pmMethods().length === 0"
        emptyText="Sin ingresos en este período"
        [height]="280"
      >
        <div card-actions role="group" aria-label="Filtrar métodos de pago" class="flex gap-2 flex-wrap">
          @for (m of pmMethods(); track m.id) {
            <button
              type="button"
              [attr.aria-pressed]="!pmDisabledMethods().has(m.id)"
              (click)="togglePmMethod(m.id)"
              class="h-9 px-3 rounded-full text-sm font-semibold border transition-colors flex items-center gap-2"
              [class.border-indigo-300]="!pmDisabledMethods().has(m.id)"
              [class.bg-indigo-50]="!pmDisabledMethods().has(m.id)"
              [class.text-indigo-700]="!pmDisabledMethods().has(m.id)"
              [class.border-gray-200]="pmDisabledMethods().has(m.id)"
              [class.text-gray-400]="pmDisabledMethods().has(m.id)"
            >
              <span class="w-2.5 h-2.5 rounded-full" [style.background]="m.color"></span>
              {{ m.name }}
            </button>
          }
        </div>

        @if (pmVisibleTotals().length > 0) {
          <div class="grid gap-4 mt-4 mb-6" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
            @for (t of pmVisibleTotals(); track t.name) {
              <div class="border border-gray-100 rounded-xl p-5 flex flex-col gap-2 bg-gray-50">
                <span class="text-xs font-semibold text-gray-600 flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full" [style.background]="t.color"></span>
                  {{ t.name }}
                </span>
                <span class="text-xl font-bold text-gray-900 tabular-nums">{{ money(t.total) }}</span>
                <span class="text-xs text-gray-400">{{ t.share }}% del total</span>
              </div>
            }
          </div>
        }

        <app-payment-methods-chart [labels]="pmBucketLabels()" [series]="pmVisibleSeries()" [height]="220" />
      </app-chart-card>

      <!-- Stock bajo (spec 122, FR-008): reutiliza InventoryService.loadLowStock(), ya existente. -->
      @if (inventoryService.lowStockItems().length > 0) {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-gray-800">Stock bajo</h2>
            <a routerLink="/dashboard/inventario" class="text-xs text-indigo-600 font-medium hover:underline">Ver inventario</a>
          </div>
          <div class="space-y-2">
            @for (item of inventoryService.lowStockItems(); track item.id) {
              <div class="flex items-center gap-3 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                <app-mi-icon name="warning" [size]="16" class="text-amber-600 shrink-0" />
                <span class="flex-1 text-sm text-gray-700">{{ item.name }}</span>
                <span class="text-sm font-semibold text-amber-700">{{ item.current_stock }} restante(s)</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  readonly cashService = inject(CashService);
  private readonly authService = inject(AuthService);
  private readonly api = inject(DiningSessionService);
  private readonly shiftReportsService = inject(ShiftReportsService);
  private readonly tenantDate = inject(TenantDatePipe);
  readonly inventoryService = inject(InventoryService);

  /** Solo alimenta `activeOrdersCount` (el 4º KPI) -- la lista de "Órdenes
   *  recientes" que antes la consumía se retiró del Dashboard a pedido del
   *  negocio. */
  readonly orders = signal<DiningOrder[]>([]);

  readonly activeOrdersCount = computed(
    () => this.orders().filter((o) => o.status === 'abierta' || o.status === 'bloqueada').length,
  );

  // ── Saludo (spec 122, FR-001/FR-010) ────────────────────────────────────

  /** "Buenos días"/"Buenas tardes"/"Buenas noches" según la hora local. */
  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 19) return 'Buenas tardes';
    return 'Buenas noches';
  });

  /** Nombre real si el backend lo envió; si no, el que ya deriva `AuthService` del correo (FR-010). */
  readonly userName = computed(() => this.authService.currentUser()?.name ?? '');

  // ── Reporte operativo por turno (spec 119) ──────────────────────────────

  readonly period = signal<ReportPeriodOption>('day');
  readonly cashRegisterId = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');

  readonly periodReport = signal<PeriodSalesReport | null>(null);
  readonly loadingPeriod = signal(false);
  readonly periodError = signal<string | null>(null);
  /** Solo se puebla para `period() === 'current_shift'` con `is_live` (T031). */
  readonly periodActiveOrdersCount = signal<number | null>(null);

  readonly totalSales = computed(() => Number(this.periodReport()?.total_sales ?? 0));
  readonly orderCount = computed(() => this.periodReport()?.order_count ?? 0);
  readonly avgTicket = computed(() => Number(this.periodReport()?.avg_ticket ?? 0));
  readonly topProducts = computed(() => this.periodReport()?.top_products ?? []);
  readonly categoryShares = computed<ShareItem[]>(() =>
    (this.periodReport()?.categories ?? [])
      .filter((c) => Number(c.revenue) > 0)
      .map((c) => ({ label: c.category_name, value: Number(c.revenue) })),
  );

  /** Fila de 4 indicadores del reporte operativo (spec 122, FR-003, data-model.md §5). */
  readonly kpis = computed<DashboardKpi[]>(() => [
    { label: 'Ventas', value: this.money(this.totalSales()), sub: 'Total del período', divider: false },
    { label: 'Órdenes', value: this.orderCount().toString(), sub: 'Total del período', divider: true },
    { label: 'Ticket promedio', value: this.money(this.avgTicket()), sub: 'Por orden', divider: true },
    { label: 'Órdenes activas', value: this.activeOrdersCount().toString(), sub: 'En cocina', divider: true },
  ]);

  // ── "Más vendidos": alternar cantidad/ingresos (spec 122, FR-005) ──────

  readonly topMode = signal<TopMode>('units');
  readonly topModeOptions: { value: TopMode; label: string }[] = [
    { value: 'units', label: 'Cantidad' },
    { value: 'revenue', label: 'Ingresos' },
  ];

  private readonly rankedTopProducts = computed(() => {
    const mode = this.topMode();
    return [...this.topProducts()].sort((a, b) =>
      mode === 'revenue' ? Number(b.revenue) - Number(a.revenue) : b.units - a.units,
    );
  });

  readonly topProductLabels = computed(() => this.rankedTopProducts().map((p) => p.name));
  readonly topProductValues = computed(() =>
    this.rankedTopProducts().map((p) => (this.topMode() === 'revenue' ? Number(p.revenue) : p.units)),
  );

  // ── "Estadísticas de ventas": tendencia reciente (spec 122, FR-004) ────
  // Independiente del período del reporte operativo (research.md §3): ventana
  // propia de los últimos `TREND_WINDOW_DAYS` días naturales.

  readonly trendDays = signal<DailySalesPoint[]>([]);
  readonly loadingTrend = signal(false);
  readonly trendMode = signal<TrendMode>('sales');
  readonly trendModeOptions: { value: TrendMode; label: string }[] = [
    { value: 'sales', label: 'Ventas' },
    { value: 'orders', label: 'Órdenes' },
    { value: 'avgTicket', label: 'Ticket promedio' },
  ];

  readonly trendLabels = computed(() =>
    this.trendDays().map((d) => {
      const [, m, dd] = d.day.split('-');
      return `${dd}/${m}`;
    }),
  );

  readonly trendValues = computed(() => {
    const mode = this.trendMode();
    return this.trendDays().map((d) => {
      const total = Number(d.total);
      if (mode === 'sales') return total;
      if (mode === 'orders') return d.count;
      return d.count ? total / d.count : 0;
    });
  });

  readonly trendBigNumber = computed(() => {
    const mode = this.trendMode();
    const days = this.trendDays();
    const totalSum = days.reduce((n, d) => n + Number(d.total), 0);
    const countSum = days.reduce((n, d) => n + d.count, 0);
    if (mode === 'sales') return this.money(totalSum);
    if (mode === 'orders') return countSum.toString();
    return this.money(countSum ? totalSum / countSum : 0);
  });

  readonly trendBigLabel = computed(() => {
    switch (this.trendMode()) {
      case 'sales': return `Ventas por día (últimos ${TREND_WINDOW_DAYS} días)`;
      case 'orders': return `Número de órdenes (últimos ${TREND_WINDOW_DAYS} días)`;
      default: return `Ticket promedio (últimos ${TREND_WINDOW_DAYS} días)`;
    }
  });

  // ── "Ingresos por método de pago": sigue el período de arriba (spec 122, FR-007) ──

  /** Turno elegido dentro de `<app-shift-sales-report-card>`, cuando el
   *  período es "Turno específico" (avisado por su `(shiftIdChange)`). */
  readonly selectedShiftId = signal('');

  readonly paymentMethodsReport = signal<PaymentMethodsReport | null>(null);
  readonly loadingPaymentMethods = signal(false);
  readonly paymentMethodsError = signal<string | null>(null);
  /** Métodos que el usuario desactivó en los chips -- vacío de entrada: todos visibles (FR-007). */
  readonly pmDisabledMethods = signal<Set<string>>(new Set());

  /** Métodos distintos del reporte vigente, en orden de aparición, con un color fijo por índice. */
  readonly pmMethods = computed(() => {
    const seen = new Map<string, string>();
    for (const row of this.paymentMethodsReport()?.rows ?? []) {
      if (!seen.has(row.payment_method_id)) seen.set(row.payment_method_id, row.payment_method_name);
    }
    return [...seen.entries()].map(([id, name], i) => ({ id, name, color: seriesColor(i) }));
  });

  private readonly pmBucketKeys = computed(() => {
    const keys = new Set((this.paymentMethodsReport()?.rows ?? []).map((r) => r.bucket_start));
    return [...keys].sort();
  });

  readonly pmBucketLabels = computed(() => {
    const unit = this.paymentMethodsReport()?.bucket_unit ?? 'day';
    return this.pmBucketKeys().map((iso) => this.formatBucketLabel(iso, unit));
  });

  readonly pmSubtitle = computed(() => {
    switch (this.paymentMethodsReport()?.bucket_unit) {
      case 'hour': return 'Comparación por hora';
      case 'week': return 'Comparación semanal';
      default: return 'Comparación diaria';
    }
  });

  private readonly pmAmountsByMethod = computed(() => {
    const byMethod = new Map<string, Map<string, number>>();
    for (const row of this.paymentMethodsReport()?.rows ?? []) {
      if (!byMethod.has(row.payment_method_id)) byMethod.set(row.payment_method_id, new Map());
      byMethod.get(row.payment_method_id)!.set(row.bucket_start, Number(row.amount));
    }
    return byMethod;
  });

  /** Participación (%) SIEMPRE contra el total de TODOS los métodos, sin
   *  importar cuáles estén visibles -- desactivar uno no debe mover el % de
   *  los demás (igual criterio que el prototipo). */
  private readonly pmGrandTotal = computed(() =>
    [...this.pmAmountsByMethod().values()].reduce(
      (sum, byBucket) => sum + [...byBucket.values()].reduce((a, b) => a + b, 0), 0,
    ),
  );

  private readonly pmVisibleMethods = computed(() =>
    this.pmMethods().filter((m) => !this.pmDisabledMethods().has(m.id)),
  );

  readonly pmVisibleSeries = computed<PaymentMethodSeries[]>(() => {
    const buckets = this.pmBucketKeys();
    const amounts = this.pmAmountsByMethod();
    return this.pmVisibleMethods().map((m) => ({
      name: m.name,
      color: m.color,
      values: buckets.map((b) => amounts.get(m.id)?.get(b) ?? 0),
    }));
  });

  readonly pmVisibleTotals = computed(() => {
    const amounts = this.pmAmountsByMethod();
    const grandTotal = this.pmGrandTotal();
    return this.pmVisibleMethods().map((m) => {
      const total = [...(amounts.get(m.id)?.values() ?? [])].reduce((a, b) => a + b, 0);
      return {
        name: m.name, color: m.color, total,
        share: grandTotal ? Math.round((total / grandTotal) * 100) : 0,
      };
    });
  });

  togglePmMethod(id: string): void {
    const next = new Set(this.pmDisabledMethods());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.pmDisabledMethods.set(next);
  }

  private formatBucketLabel(iso: string, unit: 'hour' | 'day' | 'week'): string {
    const d = new Date(iso);
    if (unit === 'hour') {
      return d.toLocaleTimeString('es-CO', { hour: 'numeric', hour12: true }).replace(/\s/g, ' ');
    }
    if (unit === 'week') {
      return `Sem ${d.getDate()}/${d.getMonth() + 1}`;
    }
    return d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  }

  readonly quickActions: QuickAction[] = [
    {
      label: 'Terminal de mesas',
      icon: 'point_of_sale',
      route: '/dashboard/mesas-sesiones',
      description: 'Cobrar y cerrar',
    },
    {
      label: 'Ventas',
      icon: 'receipt',
      route: '/dashboard/ventas',
      description: 'Historial de cobros',
    },
    {
      label: 'Gestión de Caja',
      icon: 'payments',
      route: '/dashboard/caja',
      description: 'Turnos y arqueo',
    },
    {
      label: 'Carta del menú',
      icon: 'shopping_bag',
      route: '/dashboard/products',
      description: 'Catálogo y precios',
    },
    {
      label: 'Mesas',
      icon: 'table_restaurant',
      route: '/dashboard/mesas',
      description: 'Estado y QR',
    },
  ];

  ngOnInit(): void {
    this.loadOrders();
    this.cashService.loadRegisters();
    this.loadPeriodReport();
    this.loadTrend();
    this.loadPaymentMethods();
    this.inventoryService.loadLowStock();
  }

  /** Única razón de esta llamada: `activeOrdersCount` (el 4º KPI). */
  private async loadOrders(): Promise<void> {
    try {
      this.orders.set(await this.api.listOrders());
    } catch {
      // El KPI simplemente se queda en 0 -- no hay dónde mostrar un error
      // propio para este dato (research.md: no es una sección con su propio estado).
    }
  }

  /** Ventana fija de los últimos `TREND_WINDOW_DAYS` días naturales, en la
   *  zona horaria del tenant -- independiente del período del reporte
   *  operativo (FR-004, research.md §3). */
  private async loadTrend(): Promise<void> {
    this.loadingTrend.set(true);
    try {
      const today = this.tenantDate.transform(new Date(), 'yyyy-MM-dd') ?? '';
      const [y, m, d] = today.split('-').map(Number);
      const from = new Date(y, m - 1, d - (TREND_WINDOW_DAYS - 1));
      const dateFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      this.trendDays.set(await this.shiftReportsService.getDailySalesTrend(dateFrom, today));
    } catch {
      this.trendDays.set([]);
    } finally {
      this.loadingTrend.set(false);
    }
  }

  onPeriodChange(event: Event): void {
    this.period.set((event.target as HTMLSelectElement).value as ReportPeriodOption);
    this.loadPeriodReport();
    this.loadPaymentMethods();
  }

  onRegisterChange(event: Event): void {
    this.cashRegisterId.set((event.target as HTMLSelectElement).value);
    this.loadPeriodReport();
    this.loadPaymentMethods();
  }

  onDateFromChange(event: Event): void {
    this.dateFrom.set((event.target as HTMLInputElement).value);
    this.loadPeriodReport();
    this.loadPaymentMethods();
  }

  onDateToChange(event: Event): void {
    this.dateTo.set((event.target as HTMLInputElement).value);
    this.loadPeriodReport();
    this.loadPaymentMethods();
  }

  /** `<app-shift-sales-report-card>` avisa el turno elegido (FR-007). */
  onShiftIdChange(shiftId: string): void {
    this.selectedShiftId.set(shiftId);
    this.loadPaymentMethods();
  }

  private async loadPeriodReport(): Promise<void> {
    const period = this.period();
    if (period === 'shift') return; // delegado a <app-shift-sales-report-card>
    if (period === 'range' && (!this.dateFrom() || !this.dateTo())) return;

    this.loadingPeriod.set(true);
    this.periodError.set(null);
    this.periodActiveOrdersCount.set(null);
    try {
      const cashRegisterId = this.cashRegisterId() || undefined;
      let report: PeriodSalesReport;
      if (period === 'current_shift') {
        report = await this.shiftReportsService.getCurrentShiftReport(cashRegisterId);
      } else if (period === 'range') {
        report = await this.shiftReportsService.getPeriodReport({
          period: 'range', dateFrom: this.dateFrom(), dateTo: this.dateTo(), cashRegisterId,
        });
      } else {
        report = await this.shiftReportsService.getPeriodReport({ period, cashRegisterId });
      }
      this.periodReport.set(report);
      if (period === 'current_shift' && report.is_live) {
        this.periodActiveOrdersCount.set((await this.shiftReportsService.listActiveOrders()).length);
      }
    } catch {
      this.periodError.set('No se pudo cargar el reporte operativo.');
    } finally {
      this.loadingPeriod.set(false);
    }
  }

  /** Sigue el mismo período del reporte operativo de arriba (FR-007) --
   *  incluido "Turno específico", vía `selectedShiftId()` (avisado por
   *  `(shiftIdChange)` de `<app-shift-sales-report-card>`). */
  private async loadPaymentMethods(): Promise<void> {
    const period = this.period();
    let params: PaymentMethodsReportParams;
    if (period === 'shift') {
      const shiftId = this.selectedShiftId();
      if (!shiftId) return; // aún no hay turno elegido dentro del sub-componente
      params = { period: 'shift', shiftId };
    } else if (period === 'current_shift') {
      params = { period: 'current_shift', cashRegisterId: this.cashRegisterId() || undefined };
    } else if (period === 'range') {
      if (!this.dateFrom() || !this.dateTo()) return;
      params = { period: 'range', dateFrom: this.dateFrom(), dateTo: this.dateTo(), cashRegisterId: this.cashRegisterId() || undefined };
    } else {
      params = { period, cashRegisterId: this.cashRegisterId() || undefined };
    }

    this.loadingPaymentMethods.set(true);
    this.paymentMethodsError.set(null);
    try {
      this.paymentMethodsReport.set(await this.shiftReportsService.getPaymentMethodsReport(params));
    } catch {
      this.paymentMethodsError.set('No se pudieron cargar los ingresos por método de pago.');
    } finally {
      this.loadingPaymentMethods.set(false);
    }
  }

  money(n: number): string {
    return formatMoney(n);
  }
}
