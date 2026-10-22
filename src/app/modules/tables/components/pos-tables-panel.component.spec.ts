import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PosTablesPanelComponent } from './pos-tables-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { CashService } from '../../cash-register/services/cash.service';

const API = environment.apiBaseUrl;

function table(partial: Partial<Table>): Table {
  return {
    id: 't1',
    number: 1,
    name: null,
    qr_token: 'tok',
    active: true,
    status: 'libre',
    ...partial,
  };
}

/**
 * Spec 036, Historia 1: filtro de ocupación ya existente sin cambios de
 * comportamiento. Rediseño responsive: las pestañas de tipo de orden
 * (Mesas/Domicilios/Para llevar) se movieron a la sub-barra de
 * `table-sessions.component.ts` (mockup de referencia) -- este componente ya
 * no las renderiza, solo reacciona a `store.orderTypeTab()`, así que las
 * pruebas cambian de tabla la pestaña con `store.setOrderTypeTab()`
 * directamente en vez de hacer clic en un botón que ya no vive aquí. Esa
 * cobertura (que las 3 pestañas existen y cambian el signal al hacer clic)
 * se mudó a `table-sessions.component.spec.ts`.
 */
describe('PosTablesPanelComponent', () => {
  let fixture: ComponentFixture<PosTablesPanelComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let router: Router;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosTablesPanelComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: PromotionService,
          useValue: {
            loadActive: () => {},
            activePromotions: () => [],
            ready: () => false,
            now: () => new Date(),
          },
        },
        // Spec 059: seleccionar una mesa con pedido ahora dispara la carga
        // diferida de datos de cobro (Historia 1) — mockeados como
        // "ya cargados" para no ensuciar este archivo con peticiones ajenas
        // a lo que prueba (mismo patrón que pos-terminal.store.spec.ts).
        {
          provide: PaymentMethodService,
          useValue: { methods: () => [{ id: 'pm-cash' }], checkoutOptions: () => [{ id: 'pm-cash' }], load: () => Promise.resolve(), loadAvailableForCheckout: () => Promise.resolve() },
        },
        {
          provide: CashService,
          useValue: { shift: () => ({ id: 'shift-1' }), isOpen: () => true, discoverOpenShift: () => Promise.resolve() },
        },
      ],
    });

    fixture = TestBed.createComponent(PosTablesPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('"Mesas" está activa por defecto y muestra la grilla de mesas ya existente', () => {
    tableService.tables.set([table({ id: 't1', number: 5 })]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mesa 5');
  });

  it('"Domicilios" muestra un listado vacío con mensaje claro, no la grilla de mesas', () => {
    tableService.tables.set([table({ id: 't1', number: 5 })]);
    fixture.detectChanges();

    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Mesa 5');
    expect(text.toLowerCase()).toContain('domicilio');
    expect(store.orderTypeTab()).toBe('domicilios');
  });

  it('"Para llevar" muestra un listado vacío con mensaje claro, no la grilla de mesas', () => {
    tableService.tables.set([table({ id: 't1', number: 5 })]);
    fixture.detectChanges();

    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Mesa 5');
    expect(text.toLowerCase()).toContain('para llevar');
    expect(store.orderTypeTab()).toBe('para-llevar');
  });

  // Spec 131: el filtro de ocupación (selector <select>, fidelidad al
  // mockup) se movió a table-sessions.component.ts -- este componente ya no
  // lo renderiza, solo reacciona a store.filter() (mismo patrón ya aplicado
  // arriba a las pestañas de tipo de orden). La cobertura del <select> en sí
  // vive ahora en table-sessions.component.spec.ts.
  it('el filtro de ocupación ya existente sigue funcionando sin cambios en "Mesas" (store.filter())', () => {
    tableService.tables.set([table({ id: 't1', number: 1, status: 'libre' })]);
    fixture.detectChanges();

    store.filter.set('ocupadas');
    fixture.detectChanges();

    // Mesa libre no debe aparecer bajo el filtro "Ocupadas" (comportamiento
    // ya existente, sin tocar).
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Mesa 1');
  });

  it('volver a "Mesas" restaura la grilla y conserva el filtro de ocupación activo', () => {
    tableService.tables.set([table({ id: 't1', number: 1, status: 'libre' })]);
    fixture.detectChanges();

    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();
    store.setOrderTypeTab('mesas');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mesa 1');
    expect(store.filter()).toBe('todas');
  });

  it('la grilla de mesas envuelve en varias filas (sin carrusel horizontal ni flechas) -- rediseño responsive', () => {
    tableService.tables.set([table({ id: 't1', number: 1 }), table({ id: 't2', number: 2 })]);
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('[data-testid="mesas-grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.className).toContain('grid');
    // Sin flechas de desplazamiento ni contenedor de scroll horizontal --
    // decisión de rediseño: la grilla envuelve y hace scroll vertical en su
    // lugar (mejor para móvil/tablet), reemplazando el carrusel de spec 036.
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Ver mesas anteriores"]'),
    ).toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label="Ver más mesas"]')).toBeNull();
    expect(grid.querySelector('[class*="overflow-x-auto"]')).toBeNull();
  });

  // Spec 131: el conteo por opción del filtro se renderiza ahora en
  // table-sessions.component.ts (ver su spec) -- aquí queda cubierto que
  // store.tableCounts() (la fuente de esos números) sigue siendo correcta.
  it('store.tableCounts() refleja el conteo de mesas por estado (fuente del filtro de ocupación)', () => {
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't2', number: 2, status: 'ocupada' }),
      table({ id: 't3', number: 3, status: 'ocupada' }),
    ]);
    fixture.detectChanges();

    expect(store.tableCounts()).toEqual({ total: 3, libres: 1, ocupadas: 2, pendientes: 0 });
  });

  const tableCard = (label: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes(label),
    ) as HTMLButtonElement | undefined;

  // La selección de mesa se reactivó a pedido del usuario: tocar una mesa
  // (libre u ocupada) selecciona su detalle en el panel derecho, mismo
  // mecanismo (select) que ya usan las tarjetas de Para Llevar/Domicilio.
  it('tocar una mesa libre la selecciona', () => {
    tableService.tables.set([table({ id: 't1', number: 3, status: 'libre' })]);
    fixture.detectChanges();
    const selectSpy = vi.spyOn(store, 'selectTable');

    tableCard('Mesa 3')!.click();

    expect(selectSpy).toHaveBeenCalledWith('t1');
    expect(store.selectedTableId()).toBe('t1');
    // selectTable() dispara loadSessionBill() en segundo plano.
    http.expectOne(`${API}/table-sessions`).flush([]);
  });

  it('tocar una mesa ocupada también la selecciona', () => {
    tableService.tables.set([table({ id: 't1', number: 3, status: 'ocupada' })]);
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'abierta',
        dining_table_id: 't1',
        created_at: '2026-08-21T10:00:00',
        items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente' }],
      } as unknown as ReturnType<PosTerminalStore['orders']>[number],
    ]);
    fixture.detectChanges();
    const selectSpy = vi.spyOn(store, 'selectTable');

    tableCard('Mesa 3')!.click();

    expect(selectSpy).toHaveBeenCalledWith('t1');
    expect(store.selectedTableId()).toBe('t1');
    // selectTable() dispara loadSessionBill() en segundo plano.
    http.expectOne(`${API}/table-sessions`).flush([]);
  });

  function standaloneOrder(
    id: string,
    orderType: 'TAKEAWAY' | 'DELIVERY',
    customerName: string | null = null,
  ): ReturnType<PosTerminalStore['orders']>[number] {
    return {
      id,
      channel: 'POS',
      order_type: orderType,
      status: 'abierta',
      dining_table_id: null,
      customer_name: customerName,
      created_at: '2026-08-21T10:00:00',
      items: [{ id: `${id}-i1`, product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente' }],
    } as unknown as ReturnType<PosTerminalStore['orders']>[number];
  }

  it('"Para llevar" muestra una tarjeta por pedido pendiente de cobro, con el mismo formato que las mesas (spec 059, Historia 2)', () => {
    store.orders.set([standaloneOrder('o1', 'TAKEAWAY', 'María G.')]);
    fixture.detectChanges();

    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Para llevar');
    expect(text).toContain('María G.');
    // Ya no es el mensaje vacío fijo.
    expect(text).not.toContain('pendiente de cobro');
  });

  it('"Domicilios" no mezcla pedidos de Para llevar, y sigue vacía si no hay ninguno DELIVERY', () => {
    store.orders.set([standaloneOrder('o1', 'TAKEAWAY', 'María G.')]);
    fixture.detectChanges();

    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('María G.');
    expect(text.toLowerCase()).toContain('domicilio');
  });

  it('seleccionar una tarjeta de pedido "Para llevar" llama a store.selectStandaloneOrder() (spec 059, Historia 3)', () => {
    store.orders.set([standaloneOrder('o1', 'TAKEAWAY', 'María G.')]);
    fixture.detectChanges();
    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();
    const selectSpy = vi.spyOn(store, 'selectStandaloneOrder');

    tableCard('María G.')!.click();

    expect(selectSpy).toHaveBeenCalledWith('o1');
  });

  // Reescrito para el rediseño visual (spec 131, FR-002/FR-003): el ícono del
  // estado vacío pasa de `app-mi-icon` (Material) a `app-lucide-icon` (SVG
  // estilo lucide, research.md punto 3) — el SVG en sí ya no está prohibido
  // (antes marcaba la migración a fuente de íconos). El buscador en sí se
  // movió a table-sessions.component.ts (ver su spec), igual que el filtro.

  it('el estado vacío de "Domicilios" ya no usa el emoji 🧾 y usa el ícono "receipt" estilo lucide (spec 131)', () => {
    fixture.detectChanges();
    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('🧾');
    expect(el.querySelector('app-lucide-icon svg')).toBeTruthy();
  });
});
