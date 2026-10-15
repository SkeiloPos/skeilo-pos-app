import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import { DiningOrder } from '../../tables/interfaces/dining.interface';

/** Los 6 valores del filtro de estado de "Órdenes" (spec 079, FR-008). `''` = Todos. */
export type OrdersStatusFilter = '' | 'recibida' | 'abierta' | 'bloqueada' | 'pagada' | 'cancelada';
/** Los 4 valores del filtro de tipo de orden (spec 079, FR-009). `''` = Todos. */
export type OrdersTypeFilter = '' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

/**
 * Transporte paginado de la pantalla "Órdenes" (`GET /api/v1/orders?page=&size=`,
 * spec 079). Calcado de `SalesService`: signals de entrada + `injectPagedQuery`
 * con `queryKey` reactivo (volver a una página/filtro ya visto sirve de caché) +
 * `computed` derivados.
 *
 * **No** toca `DiningSessionService.listOrders()` — esa ruta (sin `page`/`size`)
 * la consumen la Terminal de Mesas y el Dashboard con la respuesta completa
 * (FR-024), y sigue exactamente igual.
 */
@Injectable({ providedIn: 'root' })
export class OrdersListService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/orders`;

  readonly page = signal(1);
  readonly size = signal(20);
  readonly status = signal<OrdersStatusFilter>('');
  readonly orderType = signal<OrdersTypeFilter>('');
  /** Búsqueda por nombre de cliente o código de orden (spec 120, FR-004). */
  readonly search = signal('');
  /** Filtro de fecha (spec 120, FR-005), inclusive en ambos extremos — mismo patrón que `SalesService`. */
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  private readonly wantsPage = signal(false);

  private readonly ordersQuery = injectPagedQuery<DiningOrder>({
    queryKey: () => [
      'orders',
      'page',
      {
        page: this.page(),
        size: this.size(),
        status: this.status(),
        orderType: this.orderType(),
        search: this.search().trim(),
        dateFrom: this.dateFrom(),
        dateTo: this.dateTo(),
      },
    ],
    queryFn: () =>
      this.fetchOrdersPage(
        this.page(), this.size(), this.status(), this.orderType(),
        this.search().trim(), this.dateFrom(), this.dateTo(),
      ),
    enabled: () => this.wantsPage(),
  });

  readonly orders = computed(() => this.ordersQuery.data()?.items ?? []);
  readonly total = computed(() => this.ordersQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.ordersQuery.data()?.pages ?? 0);
  readonly loading = computed(() => this.ordersQuery.isFetching());
  readonly error = computed(() =>
    this.ordersQuery.isError()
      ? this.extractError(this.ordersQuery.error(), 'No se pudieron cargar las órdenes.')
      : null,
  );

  private fetchOrdersPage(
    page: number,
    size: number,
    status: OrdersStatusFilter,
    orderType: OrdersTypeFilter,
    search: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Page<DiningOrder>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) params = params.set('status', status);
    if (orderType) params = params.set('order_type', orderType);
    if (search) params = params.set('q', search);
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);
    return firstValueFrom(this.http.get<Page<DiningOrder>>(this.baseUrl, { params }));
  }

  /** Setter síncrono: dispara (o re-dispara) la query paginada. */
  list(page: number = this.page(), size: number = this.size()): void {
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  /** Cambiar un filtro siempre vuelve a la página 1 (FR-004), igual que `SalesService.setStatus`. */
  setStatus(value: OrdersStatusFilter): void {
    this.status.set(value);
    this.list(1);
  }

  setOrderType(value: OrdersTypeFilter): void {
    this.orderType.set(value);
    this.list(1);
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.list(1);
  }

  setDateFrom(value: string): void {
    this.dateFrom.set(value);
    this.list(1);
  }

  setDateTo(value: string): void {
    this.dateTo.set(value);
    this.list(1);
  }

  /** Filtro de un solo día (spec 120, FR-005): fija `dateFrom`/`dateTo` al mismo
   *  valor en una sola petición, en vez de dos `list()` seguidos. */
  setDate(value: string): void {
    this.dateFrom.set(value);
    this.dateTo.set(value);
    this.list(1);
  }

  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
