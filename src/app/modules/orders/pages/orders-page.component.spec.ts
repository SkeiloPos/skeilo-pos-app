import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { OrdersPageComponent } from './orders-page.component';
import { OrdersListService } from '../services/orders-list.service';
import { DiningOrder } from '../../tables/interfaces/dining.interface';

function order(id: string, over: Partial<DiningOrder> = {}): DiningOrder {
  return {
    id,
    channel: 'POS',
    order_type: 'DINE_IN',
    status: 'abierta',
    paid: false,
    created_at: '2026-09-01T12:00:00',
    dining_table_id: null,
    customer_name: null,
    items: [],
    ...over,
  } as DiningOrder;
}

/**
 * `OrdersListService` real depende de TanStack Query + HTTP — se reemplaza por
 * un fake liviano (mismo patrón que `categories-page.component.spec.ts`) para
 * verificar la vista sin sincronizar sus queries. El contrato de red (los
 * parámetros `page`/`size`/`status`/`order_type`/`q`/`date_from`/`date_to` que
 * emite el primer `list()` y los setters) lo cubre `orders-list.service.spec.ts`.
 */
class FakeOrdersListService {
  orders = signal<DiningOrder[]>([]);
  total = signal(0);
  totalPages = signal(0);
  page = signal(1);
  size = signal(20);
  loading = signal(false);
  error = signal<string | null>(null);
  status = signal<'' | 'recibida' | 'abierta' | 'bloqueada' | 'pagada' | 'cancelada'>('');
  orderType = signal<'' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('');
  search = signal('');
  dateFrom = signal('');
  dateTo = signal('');

  list = vi.fn();
  setStatus = vi.fn((v: string) => this.status.set(v as never));
  setOrderType = vi.fn((v: string) => this.orderType.set(v as never));
  setSearch = vi.fn((v: string) => this.search.set(v));
  setDate = vi.fn((v: string) => {
    this.dateFrom.set(v);
    this.dateTo.set(v);
  });
}

describe('OrdersPageComponent', () => {
  let fixture: ComponentFixture<OrdersPageComponent>;
  let svc: FakeOrdersListService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OrdersPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: OrdersListService, useClass: FakeOrdersListService },
      ],
    });
    fixture = TestBed.createComponent(OrdersPageComponent);
    svc = TestBed.inject(OrdersListService) as unknown as FakeOrdersListService;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(() => true); // el TableService real dispara GET /orders/tables
    http.verify();
  });

  it('al montar carga la primera página (svc.list()) fijando dateFrom/dateTo de hoy, y las mesas para la etiqueta', () => {
    fixture.detectChanges();
    expect(svc.list).toHaveBeenCalled();
    expect(svc.dateFrom()).toBeTruthy();
    expect(svc.dateTo()).toBe(svc.dateFrom());
    http.expectOne((r) => r.url.endsWith('/orders/tables'));
  });

  it('pinta una tarjeta por orden de la página', () => {
    svc.orders.set([order('o1'), order('o2'), order('o3')]);
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('a[href^="/dashboard/orders/"]');
    expect(cards.length).toBe(3);
  });

  it('la tarjeta muestra cliente (o "Cliente sin nombre"), código de orden, hora, ítems, ubicación y los dos badges', () => {
    svc.orders.set([
      order('11111111-2222-3333-4444-555555abcdef', { customer_name: 'María Restrepo', paid: true, items: [{ quantity: 2 } as never] }),
      order('22222222-2222-3333-4444-555555abcdef', { customer_name: null, paid: false }),
    ]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('María Restrepo');
    expect(text).toContain('Cliente sin nombre');
    expect(text).toContain('#ABCDEF');
    expect(text).toContain('2 ítem(s)');
    expect(text).toContain('Pagado');
    expect(text).toContain('Pendiente');
  });

  it('el badge de estado usa displayOrderStatus: "Pagada" para paid, "Abierta" para el resto', () => {
    svc.orders.set([order('o1', { paid: true }), order('o2', { paid: false })]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Pagada');
    expect(text).toContain('Abierta');
  });

  it('hay <select> de estado, botones segmentados de tipo (ya no <select> de tipo), buscador y filtro de fecha', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('select').length).toBe(1); // solo Estado
    const text = el.textContent as string;
    for (const tipo of ['Todos', 'En mesa', 'Para llevar', 'Domicilio']) {
      expect(text).toContain(tipo);
    }
    expect(el.querySelector('input[type="search"]')).toBeTruthy();
    expect(el.querySelector('app-order-date-filter')).toBeTruthy();
  });

  it('app-pagination-bar muestra "Página X de Y" y el total del Page recibido', () => {
    svc.orders.set([order('o1'), order('o2')]);
    svc.total.set(130);
    svc.totalPages.set(7);
    svc.page.set(1);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Página 1 de 7');
  });

  it('(pageChange) y (sizeChange) de app-pagination-bar llaman a svc.list con los argumentos correctos', () => {
    svc.orders.set([order('o1')]);
    svc.total.set(60);
    svc.totalPages.set(3);
    fixture.detectChanges();

    const bar = fixture.debugElement.query(By.css('app-pagination-bar'));
    expect(bar).toBeTruthy();

    bar.componentInstance.pageChange.emit(2);
    expect(svc.list).toHaveBeenLastCalledWith(2, 20);

    bar.componentInstance.sizeChange.emit(50);
    expect(svc.list).toHaveBeenLastCalledWith(1, 50);
  });

  // ── Filtros: estado, tipo, búsqueda, fecha (spec 120) ──────────────────────

  it('cambiar el <select> de estado llama svc.setStatus (que vuelve a la página 1)', () => {
    fixture.detectChanges();
    const estado = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    estado.value = 'bloqueada';
    estado.dispatchEvent(new Event('change'));
    expect(svc.setStatus).toHaveBeenCalledWith('bloqueada');
  });

  it('presionar un botón del segmentado de tipo llama svc.setOrderType', () => {
    fixture.detectChanges();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const domicilio = buttons.find((b) => b.textContent?.trim() === 'Domicilio')!;
    domicilio.click();
    expect(svc.setOrderType).toHaveBeenCalledWith('DELIVERY');
  });

  it('escribir en el buscador llama svc.setSearch con el texto ingresado (FR-004)', () => {
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Deimer';
    input.dispatchEvent(new Event('input'));
    expect(svc.setSearch).toHaveBeenCalledWith('Deimer');
  });

  it('(valueChange) de app-order-date-filter llama svc.setDate (FR-005)', () => {
    fixture.detectChanges();
    const dateFilter = fixture.debugElement.query(By.css('app-order-date-filter'));
    dateFilter.componentInstance.valueChange.emit('2026-10-14');
    expect(svc.setDate).toHaveBeenCalledWith('2026-10-14');
  });

  it('cada tarjeta sin mesa muestra "Mostrador" como ubicación, también para order_type null (FR-017/FR-018, data-model.md)', () => {
    svc.orders.set([order('o1', { order_type: 'TAKEAWAY' }), order('o2', { order_type: null })]);
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('a[href^="/dashboard/orders/"]');
    expect(cards.length).toBe(2);
    for (const card of Array.from(cards)) {
      expect((card as HTMLElement).textContent).toContain('Mostrador');
    }
  });

  it('una orden a domicilio muestra "Domicilio" (el tipo) donde iría la ubicación, no "Mostrador"', () => {
    svc.orders.set([order('o1', { order_type: 'DELIVERY' })]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Domicilio');
    expect(text).not.toContain('Mostrador');
  });

  it('sin filtros y 0 órdenes (con la fecha por defecto de hoy): "No hay órdenes"', () => {
    fixture.detectChanges(); // ngOnInit fija dateFrom/dateTo = hoy
    svc.orders.set([]);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('No hay órdenes');
    expect((fixture.nativeElement.textContent as string)).not.toContain('con estos filtros');
  });

  it('con un filtro activo y 0 resultados: "No hay órdenes con estos filtros"', () => {
    fixture.detectChanges();
    svc.status.set('cancelada');
    svc.orders.set([]);
    svc.total.set(0);
    svc.totalPages.set(0);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No hay órdenes con estos filtros');
  });

  it('con una fecha distinta a hoy y 0 resultados: también "con estos filtros"', () => {
    fixture.detectChanges();
    svc.dateFrom.set('2020-01-01');
    svc.orders.set([]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No hay órdenes con estos filtros');
  });

  it('"Nueva orden" enlaza al flujo existente de creación de pedido manual (FR-010)', () => {
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('a[href="/dashboard/mesas-sesiones/orden-manual"]');
    expect(link).toBeTruthy();
    expect((link as HTMLElement).textContent).toContain('Nueva orden');
  });

  it('cada tarjeta lleva los filtros vigentes como query params (FR-011)', () => {
    fixture.detectChanges();
    svc.orders.set([order('o1')]);
    svc.status.set('pagada');
    svc.search.set('Deimer');
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('a[href^="/dashboard/orders/"]') as HTMLAnchorElement;
    expect(card.getAttribute('href')).toContain('status=pagada');
    expect(card.getAttribute('href')).toContain('search=Deimer');
  });

  it('al montar con filtros en la URL, los restaura en vez de usar los valores por defecto (FR-011)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OrdersPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: OrdersListService, useClass: FakeOrdersListService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: { status: 'cancelada', search: 'Ana', page: '3' } } },
        },
      ],
    });
    const fx2 = TestBed.createComponent(OrdersPageComponent);
    const svc2 = TestBed.inject(OrdersListService) as unknown as FakeOrdersListService;
    const http2 = TestBed.inject(HttpTestingController);
    fx2.detectChanges();

    expect(svc2.status()).toBe('cancelada');
    expect(svc2.search()).toBe('Ana');
    expect(svc2.list).toHaveBeenCalledWith(3);
    http2.match(() => true);
    http2.verify();
  });

  it('ningún ícono se renderiza ya como emoji ni con glifos sueltos (spec 082)', () => {
    svc.orders.set([order('o1', { customer_name: 'Ana' })]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    for (const glifo of ['📋', '🍽️', '👤', '↺']) {
      expect(el.textContent).not.toContain(glifo);
    }
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['autorenew', 'add', 'schedule', 'restaurant']));
  });
});
