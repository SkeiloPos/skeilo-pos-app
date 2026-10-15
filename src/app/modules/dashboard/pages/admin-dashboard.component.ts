import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../products/services/product.service';
import { UsersService } from '../../users/services/users.service';
import { DiningSessionService } from '../../tables/services/dining-session.service';
import { TableService } from '../../tables/services/table.service';
import { DiningOrder } from '../../tables/interfaces/dining.interface';
import { orderStatusClass, orderStatusLabel } from '../../orders/order-status.util';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { CashService } from '../../cash-register/services/cash.service';
import { ShiftReportsService } from '../services/shift-reports.service';
import { PeriodSalesReport } from '../interfaces/shift-reports.interface';
import { ShiftSalesReportCardComponent } from '../components/shift-sales-report-card.component';
import { formatMoney } from '../../../shared/money';
import { ChartCardComponent } from '../../../shared/charts/chart-card.component';
import { RankedBarsChartComponent } from '../../../shared/charts/ranked-bars-chart.component';
import { ShareBarChartComponent, ShareItem } from '../../../shared/charts/share-bar-chart.component';
import { StatTileComponent } from '../../../shared/charts/stat-tile.component';

interface QuickAction {
  label: string;
  icon: string;
  route: string;
  description: string;
}

/** Período del reporte operativo por turno (spec 119, FR-005/FR-006/FR-010/FR-012). */
type ReportPeriodOption = 'current_shift' | 'shift' | 'day' | 'week' | 'month' | 'range';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    TenantDatePipe,
    IconMiComponent,
    ShiftSalesReportCardComponent,
    ChartCardComponent,
    StatTileComponent,
    RankedBarsChartComponent,
    ShareBarChartComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Bienvenido👋</h1>
        <p class="text-gray-500 text-sm mt-1">Resumen del día — vista de administrador</p>
      </div>

      <!-- Stat cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Usuarios</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">
                {{ usersService.error() ? '–' : usersService.totalCount() }}
              </p>
              <p class="text-xs text-green-600 mt-1">en el sistema</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <app-mi-icon name="group" [size]="20" class="text-indigo-600" />
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">Productos</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ activeProductsCount() }}</p>
              <p class="text-xs text-green-600 mt-1">activos</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center">
              <app-mi-icon name="shopping_bag" [size]="20" class="text-indigo-600" />
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Órdenes activas
              </p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ activeOrdersCount() }}</p>
              <p class="text-xs text-green-600 mt-1">en cocina</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <app-mi-icon name="receipt_long" [size]="20" class="text-indigo-600" />
            </div>
          </div>
        </div>
      </div>

      <!-- Reporte operativo por turno (spec 119) -->
      <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div class="flex items-start justify-between gap-4 flex-wrap">
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
          <div class="flex items-center gap-2 flex-wrap">
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
          <app-shift-sales-report-card />
        } @else {
          @if (periodError()) {
            <p class="text-sm text-red-600">{{ periodError() }}</p>
          } @else {
            @if (period() === 'current_shift' && periodReport()?.is_live) {
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Turno en curso
                @if (periodActiveOrdersCount() !== null) {
                  · {{ periodActiveOrdersCount() }} pedido(s) activo(s)
                }
              </span>
            }

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <app-stat-tile label="Ventas totales" [value]="money(totalSales())" [loading]="loadingPeriod()" />
              <app-stat-tile label="Órdenes" [value]="orderCount().toString()" [loading]="loadingPeriod()" />
              <app-stat-tile label="Ticket promedio" [value]="money(avgTicket())" [loading]="loadingPeriod()" />
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <app-chart-card
                title="Productos más vendidos"
                [loading]="loadingPeriod()"
                [empty]="topProducts().length === 0"
                emptyText="Sin ventas en este período"
                [height]="200"
              >
                <app-ranked-bars-chart [labels]="productLabels()" [values]="productValues()" kind="money" />
              </app-chart-card>
              <app-chart-card
                title="Ventas por categoría"
                [loading]="loadingPeriod()"
                [empty]="categoryShares().length === 0"
                emptyText="Sin ventas por categoría en este período"
                [height]="140"
              >
                <app-share-bar-chart [items]="categoryShares()" kind="money" />
              </app-chart-card>
            </div>
          }
        }
      </div>

      <!-- Quick actions -->
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

      <!-- Recent orders -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-gray-800">Órdenes recientes</h2>
          <a
            routerLink="/dashboard/orders"
            class="text-xs text-indigo-600 font-medium hover:underline"
            >Ver todas →</a
          >
        </div>
        @if (ordersError()) {
          <div class="px-5 py-4 text-sm text-red-600">No se pudieron cargar las órdenes</div>
        } @else if (loadingOrders()) {
          <div class="px-5 py-4 text-sm text-gray-400 animate-pulse">Cargando órdenes...</div>
        } @else if (recentOrders().length === 0) {
          <div class="px-5 py-4 text-sm text-gray-400">No hay órdenes aún</div>
        } @else {
          <div class="divide-y divide-gray-50">
            @for (order of recentOrders(); track order.id) {
              <a
                [routerLink]="['/dashboard/orders', order.id]"
                class="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <app-mi-icon name="restaurant" [size]="16" class="text-indigo-600" />
                  </div>
                  <div>
                    <p class="text-sm font-medium text-gray-800">{{ tableLabel(order) }}</p>
                    <p class="text-xs text-gray-400">
                      {{ order.created_at | tenantDate: 'HH:mm' }} · {{ itemCount(order) }} ítem(s)
                    </p>
                  </div>
                </div>
                <span
                  class="text-xs px-2 py-1 rounded-full font-medium"
                  [class]="statusClass(order.status)"
                >
                  {{ statusLabel(order.status) }}
                </span>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class AdminDashboardComponent implements OnInit {
  readonly usersService = inject(UsersService);
  readonly cashService = inject(CashService);
  private readonly productService = inject(ProductService);
  private readonly api = inject(DiningSessionService);
  private readonly tableService = inject(TableService);
  private readonly shiftReportsService = inject(ShiftReportsService);

  readonly orders = signal<DiningOrder[]>([]);
  readonly loadingOrders = signal(false);
  readonly ordersError = signal(false);

  readonly activeProductsCount = computed(
    () => this.productService.products().filter((p) => p.active).length,
  );

  readonly activeOrdersCount = computed(
    () => this.orders().filter((o) => o.status === 'abierta' || o.status === 'bloqueada').length,
  );

  readonly recentOrders = computed(() =>
    [...this.orders()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
  );

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
  readonly productLabels = computed(() => this.topProducts().map((p) => p.name));
  readonly productValues = computed(() => this.topProducts().map((p) => Number(p.revenue)));
  readonly categoryShares = computed<ShareItem[]>(() =>
    (this.periodReport()?.categories ?? [])
      .filter((c) => Number(c.revenue) > 0)
      .map((c) => ({ label: c.category_name, value: Number(c.revenue) })),
  );

  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

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
    this.usersService.loadUsers();
    this.tableService.loadTables();
    if (this.productService.products().length === 0) {
      this.productService.loadProducts();
    }
    this.loadOrders();
    this.cashService.loadRegisters();
    this.loadPeriodReport();
  }

  private async loadOrders(): Promise<void> {
    this.loadingOrders.set(true);
    this.ordersError.set(false);
    try {
      this.orders.set(await this.api.listOrders());
    } catch {
      this.ordersError.set(true);
    } finally {
      this.loadingOrders.set(false);
    }
  }

  onPeriodChange(event: Event): void {
    this.period.set((event.target as HTMLSelectElement).value as ReportPeriodOption);
    this.loadPeriodReport();
  }

  onRegisterChange(event: Event): void {
    this.cashRegisterId.set((event.target as HTMLSelectElement).value);
    this.loadPeriodReport();
  }

  onDateFromChange(event: Event): void {
    this.dateFrom.set((event.target as HTMLInputElement).value);
    this.loadPeriodReport();
  }

  onDateToChange(event: Event): void {
    this.dateTo.set((event.target as HTMLInputElement).value);
    this.loadPeriodReport();
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

  money(n: number): string {
    return formatMoney(n);
  }

  tableLabel(order: DiningOrder): string {
    return (order.dining_table_id && this.tableLabels().get(order.dining_table_id)) || 'Mostrador';
  }

  itemCount(order: DiningOrder): number {
    return (order.items ?? []).reduce((n, i) => n + i.quantity, 0);
  }

  statusLabel = orderStatusLabel;
  statusClass = orderStatusClass;
}
