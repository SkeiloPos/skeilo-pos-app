import { Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DiningOrder } from '../../tables/interfaces/dining.interface';
import { TableService } from '../../tables/services/table.service';
import { OrdersListService, OrdersStatusFilter, OrdersTypeFilter } from '../services/orders-list.service';
import {
  displayOrderStatus,
  orderDisplayCode,
  orderLocationLabel,
  orderStatusClass,
  orderStatusLabel,
  orderTypeLabel,
} from '../order-status.util';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { OrderDateFilterComponent } from '../components/order-date-filter.component';
import { To12HourTimePipe } from '../pipes/to-12-hour-time.pipe';

/** Opciones del selector de estado (spec 120, FR-002) — mismos 5 valores reales ya existentes. */
const ESTADOS: { value: OrdersStatusFilter; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'recibida', label: 'Por confirmar' },
  { value: 'abierta', label: 'Abierta' },
  { value: 'bloqueada', label: 'Bloqueada' },
  { value: 'pagada', label: 'Pagada' },
  { value: 'cancelada', label: 'Cancelada' },
];

/** Opciones del control segmentado de tipo (spec 120, FR-003). */
const TIPOS: { value: OrdersTypeFilter; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'DINE_IN', label: 'En mesa' },
  { value: 'TAKEAWAY', label: 'Para llevar' },
  { value: 'DELIVERY', label: 'Domicilio' },
];

const TYPE_ICON: Record<string, string> = {
  DINE_IN: 'restaurant',
  TAKEAWAY: 'shopping_bag',
  DELIVERY: 'delivery_dining',
};

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [RouterLink, TenantDatePipe, PaginationBarComponent, IconMiComponent, OrderDateFilterComponent, To12HourTimePipe],
  providers: [TenantDatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Órdenes</h1>
          <p class="text-gray-500 text-sm mt-1">Comandas de la operación. Filtra por estado, tipo o cliente.</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            (click)="reload()"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700 shadow-sm transition-all"
          >
            <app-mi-icon name="autorenew" [size]="16" /> Actualizar
          </button>
          <a
            routerLink="/dashboard/mesas-sesiones/orden-manual"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-all"
          >
            <app-mi-icon name="add" [size]="16" /> Nueva orden
          </a>
        </div>
      </div>

      <!-- Filtros: estado, tipo, búsqueda y fecha — todos server-side y combinables (spec 120) -->
      <div class="grid gap-3" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <label class="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          ESTADO
          <select
            [value]="svc.status()"
            (change)="svc.setStatus($any($event.target).value)"
            class="h-11 px-3 border border-gray-200 rounded-xl bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            @for (o of estados; track o.value) {
              <option [value]="o.value">{{ o.label }}</option>
            }
          </select>
        </label>

        <div class="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          TIPO
          <div class="flex p-1 gap-1 border border-gray-200 rounded-xl bg-gray-50">
            @for (t of tipos; track t.value) {
              <button
                type="button"
                [attr.aria-pressed]="svc.orderType() === t.value"
                (click)="svc.setOrderType(t.value)"
                class="flex-1 h-9 rounded-lg text-xs font-semibold transition-colors"
                [class.bg-indigo-600]="svc.orderType() === t.value"
                [class.text-white]="svc.orderType() === t.value"
                [class.text-gray-600]="svc.orderType() !== t.value"
                [class.hover:bg-gray-100]="svc.orderType() !== t.value"
              >{{ t.label }}</button>
            }
          </div>
        </div>

        <label class="flex flex-col gap-1 text-xs font-semibold text-gray-500 relative">
          BUSCAR
          <span class="absolute left-3 bottom-[11px] text-gray-400">
            <app-mi-icon name="search" [size]="16" />
          </span>
          <input
            type="search"
            aria-label="Buscar cliente u orden"
            placeholder="Buscar cliente u orden"
            [value]="svc.search()"
            (input)="svc.setSearch($any($event.target).value)"
            class="h-11 pl-9 pr-3 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
        </label>

        <div class="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          FECHA
          <app-order-date-filter [value]="svc.dateFrom()" (valueChange)="svc.setDate($event)" />
        </div>
      </div>

      <div aria-live="polite" class="text-sm text-gray-500">{{ ordCount() }}</div>

      @if (svc.loading() && svc.orders().length === 0) {
        <div class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse h-36">
              <div class="flex items-center justify-between">
                <div class="space-y-2 flex-1">
                  <div class="h-3 bg-gray-200 rounded w-24"></div>
                  <div class="h-3 bg-gray-200 rounded w-16"></div>
                </div>
                <div class="h-6 bg-gray-200 rounded-full w-16"></div>
              </div>
            </div>
          }
        </div>
      } @else if (svc.error()) {
        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{{ svc.error() }}</div>
      } @else if (svc.orders().length === 0) {
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400">
          <app-mi-icon name="receipt_long" [size]="40" class="mb-3" />
          <p class="font-medium">{{ hasFilters() ? 'No hay órdenes con estos filtros' : 'No hay órdenes' }}</p>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
            @for (order of svc.orders(); track order.id) {
              <a
                [routerLink]="['/dashboard/orders', order.id]"
                [queryParams]="listQueryParams()"
                class="block bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3 hover:shadow-md hover:border-indigo-200 transition-all"
              >
                <div class="flex justify-between items-baseline gap-2">
                  <b class="text-sm font-semibold text-gray-800 truncate">
                    {{ order.customer_name?.trim() || 'Cliente sin nombre' }}
                  </b>
                  <span class="text-xs text-gray-400 shrink-0 font-variant-numeric-tabular">{{ code(order) }}</span>
                </div>

                <div class="flex flex-col gap-1.5 text-xs text-gray-500">
                  <div class="flex items-center gap-1.5">
                    <app-mi-icon name="schedule" [size]="14" />
                    {{ order.created_at | tenantDate: 'HH:mm' | to12HourTime }} · {{ itemCount(order) }} ítem(s)
                  </div>
                  <div class="flex items-center gap-1.5">
                    <app-mi-icon [name]="typeIcon(order)" [size]="14" />
                    <span class="truncate">{{ cardLocation(order) }}</span>
                    <span
                      class="ml-auto shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      [class]="order.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
                    >{{ order.paid ? 'Pagado' : 'Pendiente' }}</span>
                  </div>
                </div>

                <div class="mt-auto pt-2 border-t border-gray-50">
                  <span class="text-xs px-2.5 py-1 rounded-full font-semibold" [class]="statusClass(displayStatus(order))">
                    {{ statusLabel(displayStatus(order)) }}
                  </span>
                </div>
              </a>
            }
          </div>

          <app-pagination-bar
            [page]="svc.page()"
            [size]="svc.size()"
            [total]="svc.total()"
            [totalPages]="svc.totalPages()"
            [loading]="svc.loading()"
            (pageChange)="svc.list($event, svc.size())"
            (sizeChange)="svc.list(1, $event)"
          />
        </div>
      }
    </div>
  `,
})
export class OrdersPageComponent implements OnInit {
  readonly svc = inject(OrdersListService);
  private readonly tableService = inject(TableService);
  private readonly tenantDate = inject(TenantDatePipe);
  private readonly route = inject(ActivatedRoute);

  readonly estados = ESTADOS;
  readonly tipos = TIPOS;

  /** ¿Hay algún filtro activo además de la fecha por defecto (hoy)? (cambia el texto del estado vacío). */
  readonly hasFilters = computed(
    () =>
      !!this.svc.status() ||
      !!this.svc.orderType() ||
      !!this.svc.search().trim() ||
      (this.svc.dateFrom() !== '' && this.svc.dateFrom() !== this.today()),
  );

  readonly ordCount = computed(() => {
    const n = this.svc.total();
    return n + (n === 1 ? ' orden' : ' órdenes');
  });

  private readonly tableLabels = computed(() => {
    const map = new Map<string, string>();
    for (const t of this.tableService.tables()) {
      map.set(t.id, t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`);
    }
    return map;
  });

  ngOnInit(): void {
    // La etiqueta de mesa se resuelve contra el listado completo de mesas (FR-025),
    // que no se pagina desde aquí.
    this.tableService.loadTables();

    // spec 120 (FR-011): si se vuelve desde el detalle con filtros en la URL,
    // se restauran; si no, filtro de fecha por defecto: hoy (Assumptions).
    const qp = this.route.snapshot.queryParams;
    const hoy = this.today();
    this.svc.status.set((qp['status'] as OrdersStatusFilter) ?? '');
    this.svc.orderType.set((qp['orderType'] as OrdersTypeFilter) ?? '');
    this.svc.search.set(qp['search'] ?? '');
    this.svc.dateFrom.set(qp['dateFrom'] ?? hoy);
    this.svc.dateTo.set(qp['dateFrom'] ?? hoy);
    this.svc.list(Number(qp['page']) || 1);
  }

  /** spec 120 (FR-011): los mismos filtros vigentes, para que cada tarjeta los
   *  lleve en la URL y "Volver a órdenes" los restaure sin recordarlos aparte. */
  readonly listQueryParams = computed(() => ({
    status: this.svc.status() || null,
    orderType: this.svc.orderType() || null,
    search: this.svc.search().trim() || null,
    dateFrom: this.svc.dateFrom() || null,
    page: this.svc.page() !== 1 ? this.svc.page() : null,
  }));

  reload(): void {
    this.svc.list(this.svc.page(), this.svc.size());
  }

  private today(): string {
    return this.tenantDate.transform(new Date(), 'yyyy-MM-dd') ?? '';
  }

  itemCount(order: DiningOrder): number {
    return (order.items ?? []).reduce((n, i) => n + i.quantity, 0);
  }

  code(order: DiningOrder): string {
    return orderDisplayCode(order);
  }

  typeIcon(order: DiningOrder): string {
    return TYPE_ICON[order.order_type ?? ''] ?? 'receipt_long';
  }

  /** Mesa/"Mostrador" cuando aplica; para domicilio, el tipo (spec 120, data-model.md). */
  cardLocation(order: DiningOrder): string {
    const tableLabel = order.dining_table_id ? (this.tableLabels().get(order.dining_table_id) ?? null) : null;
    return orderLocationLabel(order, tableLabel) || orderTypeLabel(order.order_type);
  }

  statusLabel = orderStatusLabel;
  statusClass = orderStatusClass;
  displayStatus = displayOrderStatus;
}
