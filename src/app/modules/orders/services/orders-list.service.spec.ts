import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { OrdersListService } from './orders-list.service';
import { DiningOrder } from '../../tables/interfaces/dining.interface';

/** Drain pending microtasks so the reactive query effect fires the HTTP request. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const base = `${environment.apiBaseUrl}/orders`;

function order(partial: Partial<DiningOrder> = {}): DiningOrder {
  return {
    id: 'o1',
    channel: 'POS',
    order_type: 'DINE_IN',
    status: 'abierta',
    created_at: '2026-09-01T12:00:00',
    dining_table_id: null,
    customer_name: null,
    items: [],
    ...partial,
  } as DiningOrder;
}

function page(items: DiningOrder[], over: Partial<{ total: number; page: number; size: number; pages: number }> = {}) {
  return { items, total: items.length, page: 1, size: 20, pages: 1, ...over };
}

describe('OrdersListService', () => {
  let service: OrdersListService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OrdersListService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(OrdersListService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('el primer list() dispara GET /orders?page=1&size=20 y mapea el Page a orders/total/totalPages', async () => {
    service.list();
    await tick();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('order_type')).toBe(false);
    req.flush(page([order({ id: 'a' }), order({ id: 'b' })], { total: 42, pages: 3 }));
    await tick();
    expect(service.orders().map((o) => o.id)).toEqual(['a', 'b']);
    expect(service.total()).toBe(42);
    expect(service.totalPages()).toBe(3);
  });

  it('list(2) pide page=2; list(1, 50) pide size=50', async () => {
    service.list();
    await tick();
    http.expectOne((r) => r.url === base).flush(page([]));
    await tick();

    service.list(2);
    await tick();
    let req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([], { page: 2 }));
    await tick();

    service.list(1, 50);
    await tick();
    req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('50');
    req.flush(page([], { size: 50 }));
    await tick();
  });

  it('setStatus y setOrderType mandan el filtro y vuelven a la página 1 (FR-004)', async () => {
    service.list(3);
    await tick();
    http.expectOne((r) => r.url === base).flush(page([], { page: 3 }));
    await tick();

    service.setStatus('bloqueada');
    await tick();
    let req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('status')).toBe('bloqueada');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([]));
    await tick();

    service.setOrderType('TAKEAWAY');
    await tick();
    req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('order_type')).toBe('TAKEAWAY');
    expect(req.request.params.get('status')).toBe('bloqueada');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([]));
    await tick();
  });

  it('setSearch manda q y vuelve a la página 1; vacío no manda el parámetro (spec 120, FR-004)', async () => {
    service.list(3);
    await tick();
    http.expectOne((r) => r.url === base).flush(page([], { page: 3 }));
    await tick();

    service.setSearch('Deimer');
    await tick();
    let req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('q')).toBe('Deimer');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([]));
    await tick();

    service.setSearch('');
    await tick();
    req = http.expectOne((r) => r.url === base);
    expect(req.request.params.has('q')).toBe(false);
    req.flush(page([]));
    await tick();
  });

  it('setDateFrom/setDateTo mandan date_from/date_to y vuelven a la página 1, combinados con status/orderType/search (spec 120, FR-005)', async () => {
    service.list();
    await tick();
    http.expectOne((r) => r.url === base).flush(page([]));
    await tick();

    service.setDateFrom('2026-10-14');
    await tick();
    let req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('date_from')).toBe('2026-10-14');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([]));
    await tick();

    service.setDateTo('2026-10-15');
    await tick();
    req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('date_from')).toBe('2026-10-14');
    expect(req.request.params.get('date_to')).toBe('2026-10-15');
    req.flush(page([]));
    await tick();

    service.setStatus('pagada');
    await tick();
    req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('date_from')).toBe('2026-10-14');
    expect(req.request.params.get('date_to')).toBe('2026-10-15');
    expect(req.request.params.get('status')).toBe('pagada');
    req.flush(page([]));
    await tick();
  });

  it('setDate fija dateFrom y dateTo al mismo valor en una sola petición (spec 120, FR-005)', async () => {
    service.list();
    await tick();
    http.expectOne((r) => r.url === base).flush(page([]));
    await tick();

    service.setDate('2026-10-14');
    await tick();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('date_from')).toBe('2026-10-14');
    expect(req.request.params.get('date_to')).toBe('2026-10-14');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page([]));
    await tick();
  });

  it('un fallo de red se refleja en error()', async () => {
    service.list();
    await tick();
    http
      .expectOne((r) => r.url === base)
      .flush({ detail: 'Boom' }, { status: 500, statusText: 'Err' });
    await tick();
    expect(service.error()).toBe('Boom');
  });
});
