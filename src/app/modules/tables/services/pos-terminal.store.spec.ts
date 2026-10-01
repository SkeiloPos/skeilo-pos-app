import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import {
  PosTerminalStore,
  currentNow,
  deriveTableStatus,
  newPendingIds,
  normalizeSearchTerm,
} from './pos-terminal.store';
import { CheckoutPreview, DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { DiningSessionService } from './dining-session.service';
import { TableService } from './table.service';
import { Promotion } from '../../promotions/interfaces/promotion.interface';
import { PromotionService } from '../../promotions/services/promotion.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { Sale } from '../../sales/interfaces/sales.interface';
import { MenuService } from '../../../core/services/menu.service';
import { MenuProduct } from '../../products/interfaces/product.interface';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { CashService } from '../../cash-register/services/cash.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';

const API = environment.apiBaseUrl;

/**
 * Spec 059: `selectTable()` de una mesa con pedido dispara ahora
 * `ensureCheckoutDataLoaded()`. La mayoría de las suites de este archivo no
 * están probando esa carga en sí (eso lo cubre el describe dedicado más
 * abajo) — para que no disparen peticiones HTTP reales de más y rompan
 * `http.verify()`, se mockean estos dos servicios ya "cargados" (mismo
 * patrón que el mock de `PromotionService` ya usado en este archivo).
 */
function checkoutDataAlreadyLoadedProviders() {
  return [
    {
      provide: PaymentMethodService,
      useValue: {
        methods: () => [{ id: 'pm-cash', name: 'Efectivo' }],
        checkoutOptions: () => [{ id: 'pm-cash', name: 'Efectivo', is_cash: true }],
        load: () => Promise.resolve(),
        loadAvailableForCheckout: () => Promise.resolve(),
      },
    },
    {
      provide: CashService,
      useValue: {
        shift: () => ({ id: 'shift-1' }),
        isOpen: () => true,
        discoverOpenShift: () => Promise.resolve(),
      },
    },
  ];
}

function order(
  id: string,
  status: DiningOrder['status'],
  cocina: DiningOrderItem['estado_cocina'][] = [],
  paid?: boolean,
): DiningOrder {
  return {
    id,
    channel: 'QR_MENU',
    status,
    created_at: '2026-07-29T12:00:00',
    paid,
    items: cocina.map((estado_cocina, i) => ({
      id: `${id}-i${i}`,
      product_variant_id: 'v1',
      quantity: 1,
      unit_price: '4000',
      estado_cocina,
    })) as DiningOrderItem[],
  } as DiningOrder;
}

describe('newPendingIds', () => {
  it('detecta el pedido que aún no se había visto', () => {
    const nuevos = newPendingIds(new Set(['o1']), [
      order('o1', 'recibida'),
      order('o2', 'recibida'),
    ]);

    expect(nuevos).toEqual(['o2']);
  });

  it('no repite el aviso de un pedido ya conocido', () => {
    expect(newPendingIds(new Set(['o1']), [order('o1', 'recibida')])).toEqual([]);
  });

  it('ignora los pedidos que no esperan confirmación', () => {
    const nuevos = newPendingIds(new Set(), [
      order('o1', 'abierta'),
      order('o2', 'pagada'),
      order('o3', 'cancelada'),
    ]);

    expect(nuevos).toEqual([]);
  });

  it('no avisa cuando un pedido conocido se confirma', () => {
    // El contador baja, pero eso no es un pedido nuevo.
    expect(newPendingIds(new Set(['o1']), [order('o1', 'abierta')])).toEqual([]);
  });
});

describe('deriveTableStatus', () => {
  it('marca por confirmar la mesa con un pedido del QR sin aceptar', () => {
    // Era el fallo reportado: estas mesas se pintaban "Libre" con $ 0.
    expect(deriveTableStatus([order('o1', 'recibida', ['pendiente'])], 'ocupada')).toBe(
      'por_confirmar',
    );
  });

  // ── feature 028, T010/T037/T039: el badge "Por confirmar" es solo de QR ──
  describe('badge "Por confirmar" — solo canal qr (T010/T037/T039)', () => {
    function counterOrder(id: string, status: DiningOrder['status']): DiningOrder {
      return { ...order(id, status), channel: 'POS' };
    }

    it('NO marca por confirmar un pedido de mostrador en espera de armarse (hold_for_payment)', () => {
      // Un pedido `counter` también vive en `recibida` mientras el cajero lo
      // arma (feature 028), pero no tiene ningún pago que revisar: mostrarlo
      // como "Por confirmar" sería una falsa alarma para el resto del staff.
      expect(deriveTableStatus([counterOrder('o1', 'recibida')], 'ocupada')).not.toBe(
        'por_confirmar',
      );
    });

    it('caso mixto: un comensal ya confirmado y otro QR todavía pendiente → sigue "Por confirmar"', () => {
      const confirmado = order('o1', 'abierta', ['pendiente']);
      const pendiente = order('o2', 'recibida', ['pendiente']);

      expect(deriveTableStatus([confirmado, pendiente], 'ocupada')).toBe('por_confirmar');
    });

    it('caso mixto: un pedido de mostrador armándose junto a uno QR pendiente → sigue "Por confirmar"', () => {
      const mostrador = counterOrder('o1', 'recibida');
      const qrPendiente = order('o2', 'recibida', ['pendiente']);

      expect(deriveTableStatus([mostrador, qrPendiente], 'ocupada')).toBe('por_confirmar');
    });
  });

  it('ocupa la mesa aunque no haya pedidos si el backend la da por ocupada', () => {
    // Comensal que escaneó el QR y todavía no pidió nada.
    expect(deriveTableStatus([], 'ocupada')).toBe('ocupada');
    expect(deriveTableStatus([], 'reservada')).toBe('reservada');
  });

  it('deja libre la mesa sin pedidos ni sesión', () => {
    expect(deriveTableStatus([], 'libre')).toBe('libre');
  });

  it('prioriza el cobro pendiente sobre el estado de cocina', () => {
    expect(deriveTableStatus([order('o1', 'bloqueada', ['listo'])], 'ocupada')).toBe(
      'pago_pendiente',
    );
  });

  it('distingue preparación en curso de pedido listo', () => {
    expect(deriveTableStatus([order('o1', 'abierta', ['en_preparacion', 'listo'])], 'ocupada')).toBe(
      'en_preparacion',
    );
    expect(deriveTableStatus([order('o1', 'abierta', ['pendiente', 'listo'])], 'ocupada')).toBe(
      'en_preparacion',
    );
    // Spec 029: "listo" exige además el pago — sin él, `paid` (`o1`, tercer
    // arg de cocina omitido, cuarto `true`) es lo que hace la diferencia.
    expect(deriveTableStatus([order('o1', 'abierta', ['listo', 'listo'], true)], 'ocupada')).toBe(
      'listo',
    );
  });

  it('ignora los ítems anulados al mirar la preparación', () => {
    expect(deriveTableStatus([order('o1', 'abierta', ['anulado'])], 'ocupada')).toBe('ocupada');
  });

  // ── spec 029, Historia 3: "Listo" exige pago Y cocina, las dos a la vez ──
  describe('"Listo" exige pago (spec 029)', () => {
    it('cocina lista pero sin pagar → "Pago pendiente", no "Listo"', () => {
      // El caso real que motivó la spec: pedido de mesero ('abierta'),
      // cocina ya terminó, pero `paid` sigue `false` — nunca pasó por
      // `checkout_and_send`/`pay_order` todavía.
      expect(deriveTableStatus([order('o1', 'abierta', ['listo'], false)], 'ocupada')).toBe(
        'pago_pendiente',
      );
    });

    it('cocina lista y ya pagado → "Listo"', () => {
      expect(deriveTableStatus([order('o1', 'abierta', ['listo'], true)], 'ocupada')).toBe('listo');
    });

    it('pagado pero cocina todavía en curso → no muestra "Listo"', () => {
      expect(
        deriveTableStatus([order('o1', 'abierta', ['en_preparacion'], true)], 'ocupada'),
      ).toBe('en_preparacion');
    });

    it('varios pedidos: uno pagado y listo, otro listo pero sin pagar → sigue "Pago pendiente"', () => {
      const pagado = order('o1', 'abierta', ['listo'], true);
      const sinPagar = order('o2', 'abierta', ['listo'], false);
      expect(deriveTableStatus([pagado, sinPagar], 'ocupada')).toBe('pago_pendiente');
    });
  });
});

/**
 * La campana tras reconectar.
 *
 * `announcePending` es lo único que puede sonar, y decide comparando **ids**
 * contra los ya vistos. El tiempo real no la alimenta directamente: un evento
 * dispara una recarga y la recarga pasa por aquí. Estos tests fijan esa
 * propiedad, que es la que evita que el replay de eventos tras una reconexión
 * vuelva a sonar por pedidos que el cajero ya atendió.
 */
describe('newPendingIds tras una reconexión', () => {
  it('el replay de un pedido ya visto no vuelve a sonar', () => {
    const vistos = new Set(['o1', 'o2']);
    const orders = [order('o1', 'recibida'), order('o2', 'recibida')];

    // Lo que llega en el replay es exactamente lo que ya estaba.
    expect(newPendingIds(vistos, orders)).toEqual([]);
  });

  it('pero un pedido nuevo entre los repetidos sí suena, y solo ese', () => {
    const vistos = new Set(['o1']);
    const orders = [order('o1', 'recibida'), order('o2', 'recibida')];

    expect(newPendingIds(vistos, orders)).toEqual(['o2']);
  });

  it('un pedido que entró y se confirmó dentro de la misma ventana ya no cuenta', () => {
    // Es el motivo de comparar ids y no cantidades: el contador vuelve a su
    // sitio, pero el aviso debió sonar cuando entró.
    expect(newPendingIds(new Set(['o1']), [order('o1', 'abierta')])).toEqual([]);
  });
});

describe('currentNow — A-09, guarda usada por combos/cartView/orderSubtotal', () => {
  it('antes del primer sync (ready() false), devuelve null en vez del reloj del dispositivo', () => {
    const promotionService = { ready: () => false, now: () => new Date('2026-01-01T00:00:00Z') };

    expect(currentNow(promotionService)).toBeNull();
  });

  it('tras el sync, devuelve promotionService.now(), no el reloj del sistema de pruebas', () => {
    // Reloj real del entorno de pruebas: 2026-08-18T22:30 UTC. `now()` del
    // doble de PromotionService dice otra cosa — la única forma de que el
    // resultado coincida con el doble es que currentNow no use Date.now().
    const serverInstant = new Date('2026-08-15T17:30:00Z');
    const promotionService = { ready: () => true, now: () => serverInstant };

    expect(currentNow(promotionService)).toBe(serverInstant);
  });
});

describe('currentNow — A-09: sin sync, el cliente no previsualiza descuento (spec 063 FR-023)', () => {
  it('sin sync (ready() false), currentNow devuelve null', () => {
    expect(currentNow({ ready: () => false, now: () => new Date() })).toBeNull();
  });

  it('tras sync, currentNow usa la hora del servicio', () => {
    const t = new Date('2026-08-15T17:30:00');
    expect(currentNow({ ready: () => true, now: () => t })).toEqual(t);
  });
});

/**
 * Bugfix (gap de spec 035, A-52): una orden `'pagada'` con toda la cocina en
 * `'listo'` seguía contando como consumo vivo de la mesa antes del fix, pero
 * `activeOrders`/`tableOrders` la excluían justo en ese momento -- la mesa se
 * veía "libre" con la sesión todavía abierta. Ver spec 047.
 */
describe('PosTerminalStore — orden "pagada" ya lista sigue visible (gap spec 035, A-52)', () => {
  let store: PosTerminalStore;
  let tableService: TableService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    tableService.tables.set([
      { id: 't1', number: 3, name: null, qr_token: 'qr-t1', active: true, status: 'ocupada' },
    ]);
  });

  it('centralState no cae a "mesa-libre" tras marcar listo un pedido de mostrador ya cobrado', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo', 'listo'], true), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    expect(store.centralState()).toBe('pedido');
  });

  it('tablesView pinta "Listo", no "Ocupada", para esa mesa', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo', 'listo'], true), channel: 'POS', dining_table_id: 't1' },
    ]);

    const fila = store.tablesView().find((t) => t.id === 't1');
    expect(fila?.statusLabel).toBe('Listo');
  });
});

/**
 * Rediseño responsive de la terminal: `tableCounts` alimenta los badges de
 * la franja de filtros (Todas/Libres/Ocupadas/Pendientes) -- reutiliza los
 * mismos predicados que ya aplica `tablesView()` al filtrar, para que el
 * número de cada badge coincida exactamente con lo que ese filtro muestra.
 */
describe('PosTerminalStore.tableCounts', () => {
  let store: PosTerminalStore;
  let tableService: TableService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    tableService.tables.set([
      { id: 't1', number: 1, name: null, qr_token: 'qr-t1', active: true, status: 'libre' },
      { id: 't2', number: 2, name: null, qr_token: 'qr-t2', active: true, status: 'ocupada' },
      { id: 't3', number: 3, name: null, qr_token: 'qr-t3', active: true, status: 'ocupada' },
      { id: 't4', number: 4, name: null, qr_token: 'qr-t4', active: true, status: 'ocupada' },
    ]);
    store.orders.set([
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't2' },
      { ...order('o3', 'recibida'), channel: 'QR_MENU', dining_table_id: 't3' },
      { ...order('o4', 'bloqueada'), channel: 'POS', dining_table_id: 't4' },
    ]);
  });

  it('cuenta libres/ocupadas/pendientes con el mismo criterio que el filtro de la grilla', () => {
    const counts = store.tableCounts();
    expect(counts.total).toBe(4);
    expect(counts.libres).toBe(1); // t1
    expect(counts.ocupadas).toBe(3); // t2, t3 (por confirmar), t4 (pago pendiente)
    expect(counts.pendientes).toBe(2); // t3, t4
  });

  it('tableCounts().pendientes coincide con el tamaño de tablesView() bajo el filtro "pendientes"', () => {
    store.filter.set('pendientes');
    expect(store.tablesView().length).toBe(store.tableCounts().pendientes);
  });

  it('tableCounts().libres coincide con el tamaño de tablesView() bajo el filtro "libres"', () => {
    store.filter.set('libres');
    expect(store.tablesView().length).toBe(store.tableCounts().libres);
  });

  it('no aplica el término de búsqueda: los conteos son del salón completo', () => {
    store.search.set('mesa-que-no-existe');
    expect(store.tableCounts().total).toBe(4);
  });
});

/**
 * Spec 048: cuando la mesa tiene a la vez un pago pendiente de confirmar y
 * un pedido pagado/activo, el cajero necesita poder ver ambos -- antes de
 * este fix, `centralState()` le daba prioridad absoluta al pago pendiente y
 * el pedido pagado quedaba inalcanzable.
 */
describe('PosTerminalStore — pestañas cuando coexisten pago pendiente y pedido pagado (spec 048)', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('con una orden pagada y otra pendiente en la misma mesa, hasPendingAndActiveOrders() es true y effectiveCentralView() empieza en "validar-pago"', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo'], true), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'recibida'), channel: 'QR_MENU', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    expect(store.hasPendingAndActiveOrders()).toBe(true);
    expect(store.effectiveCentralView()).toBe('validar-pago');
  });

  it('al elegir la pestaña "pedido", effectiveCentralView() cambia sin tocar centralState()', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo'], true), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'recibida'), channel: 'QR_MENU', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    store.centralPanelTab.set('pedido');

    expect(store.effectiveCentralView()).toBe('pedido');
    expect(store.centralState()).toBe('validar-pago');
  });

  it('con solo uno de los dos tipos de pedido, no hay pestañas y effectiveCentralView() coincide con centralState()', () => {
    store.orders.set([{ ...order('o1', 'recibida'), channel: 'QR_MENU', dining_table_id: 't1' }]);
    store.selectedTableId.set('t1');

    expect(store.hasPendingAndActiveOrders()).toBe(false);
    expect(store.effectiveCentralView()).toBe(store.centralState());
  });

  it('al seleccionar otra mesa, centralPanelTab() vuelve a "validar-pago"', () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['listo'], true), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'recibida'), channel: 'QR_MENU', dining_table_id: 't1' },
      { ...order('o3', 'pagada', ['listo'], true), channel: 'POS', dining_table_id: 't2' },
    ]);
    store.selectTable('t1');
    store.centralPanelTab.set('pedido');
    expect(store.centralPanelTab()).toBe('pedido');

    store.selectTable('t2');

    expect(store.centralPanelTab()).toBe('validar-pago');
  });
});

/**
 * T033 (FR-012): resolver la venta de un pedido ya facturado, sea QR o de
 * mostrador, cobrado en esta pestaña o en otra (o tras recargar la página).
 * Se prueba directamente sobre el store —sin componente ni click— porque
 * `printOrderInvoice` termina en `printReceiptHtml` (iframe + `window.print`),
 * que esta suite no ejercita de punta a punta (ver nota en
 * `pos-checkout-panel.component.spec.ts`); `resolveSaleForOrder` es la parte
 * de caché/red/errores, separada a propósito para poder probarla sola.
 */
describe('PosTerminalStore.resolveSaleForOrder', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;

  const sale = (): Sale =>
    ({ id: 's1', total: '10000', status: 'paid', sold_at: '2026-08-20', items: [], payments: [] }) as unknown as Sale;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => http.verify());

  it('si la venta ya está en caché (recién cobrada en esta pestaña), no pega a la red', async () => {
    store.checkoutSaleByOrderId.set({ o1: sale() });

    const found = await store.resolveSaleForOrder('o1');

    expect(found?.id).toBe('s1');
    http.expectNone(`${API}/invoices?order_id=o1`);
  });

  it('si no está en caché, la busca por order_id → factura → venta completa', async () => {
    const promise = store.resolveSaleForOrder('o1');

    const invoiceReq = http.expectOne((r) => r.url === `${API}/invoices` && r.params.get('order_id') === 'o1');
    invoiceReq.flush([{ id: 'inv1', sale_id: 's1' }]);
    // La segunda petición sale de un `await` dentro de `findSaleForOrder`:
    // hace falta ceder el microtask antes de que `expectOne` la vea.
    await Promise.resolve();
    const saleReq = http.expectOne(`${API}/sales/s1`);
    saleReq.flush(sale());

    const found = await promise;
    expect(found?.id).toBe('s1');
    // Queda en caché para la próxima vez (p. ej. reimprimir dos veces seguidas).
    expect(store.checkoutSaleByOrderId()['o1']?.id).toBe('s1');
  });

  it('si el pedido no tiene ninguna factura emitida, avisa por toast y no revienta', async () => {
    const promise = store.resolveSaleForOrder('o1');

    const invoiceReq = http.expectOne((r) => r.url === `${API}/invoices` && r.params.get('order_id') === 'o1');
    invoiceReq.flush([]);

    const found = await promise;
    expect(found).toBeNull();
    expect(toast.toasts().some((t) => t.kind === 'error' && t.text.includes('factura'))).toBe(true);
  });
});

/**
 * Hotfix de spec 029: `billOrphan` (el aviso "No se puede cobrar esta mesa
 * — su sesión está cerrada") contaba cualquier pedido no terminal como
 * "sin cobrar", sin mirar `paid` — un pedido ya pagado (que nunca llega a
 * `status === 'pagada'` en el camino QR/mostrador) disparaba el aviso
 * aunque ya estuviera resuelto.
 */
describe('PosTerminalStore.loadSessionBill — billOrphan (hotfix spec 029)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin sesión pero con un pedido ya pagado → NO marca huérfano', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['listo'], true), dining_table_id: 't1' }]);

    const promise = store.loadSessionBill('t1');
    const req = http.expectOne(`${API}/table-sessions`);
    req.flush([]); // sin sesiones activas para esta mesa
    await promise;

    expect(store.billOrphan()).toBe(false);
  });

  it('sin sesión y con un pedido genuinamente sin pagar → sí marca huérfano', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['listo'], false), dining_table_id: 't1' }]);

    const promise = store.loadSessionBill('t1');
    const req = http.expectOne(`${API}/table-sessions`);
    req.flush([]);
    await promise;

    expect(store.billOrphan()).toBe(true);
  });
});

/**
 * Reporte del usuario: crear un pedido de mostrador, recargar la página y
 * volver a seleccionar la mesa dejaba el panel central como "Pedido nuevo
 * sin guardar" aunque el pedido ya existía con productos. Causa raíz:
 * `activeOrders` (de la que depende `selectTable()` para auto-seleccionar)
 * excluía TODO pedido `'recibida'` sin mirar el canal — un pedido de
 * mostrador `hold_for_payment` vive en `'recibida'` mientras se arma, pero sí
 * es editable/seleccionable, a diferencia de uno del QR sin confirmar.
 */
describe('PosTerminalStore.selectTable', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        ...checkoutDataAlreadyLoadedProviders(),
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('un pedido de mostrador "recibida" (hold_for_payment) SÍ se auto-selecciona', () => {
    store.orders.set([
      { ...order('o1', 'recibida', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.selectedOrder()?.id).toBe('o1');
  });

  it('un pedido QR "recibida" (por confirmar) SÍ se auto-selecciona (a pedido del usuario: una pestaña más, de sólo lectura)', () => {
    store.orders.set([
      { ...order('o1', 'recibida', ['pendiente']), channel: 'QR_MENU', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.selectedOrder()?.id).toBe('o1');
    expect(store.selectedOrderPending()).toBe(true);
  });

  it('una mesa sin pedidos no selecciona ninguno', () => {
    store.orders.set([]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.selectedOrder()).toBeNull();
  });

  it('sin options, cambiar de mesa vacía el borrador (draftLines) — comportamiento de la Terminal de Mesas', () => {
    store.orders.set([]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000, option_groups: [] } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    expect(store.draftLines().length).toBe(1);

    store.selectTable('t2');
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.draftLines().length).toBe(0);
  });

  it('con { preserveDraft: true }, cambiar de mesa conserva el borrador (draftLines) — uso de "Nueva orden"', () => {
    store.orders.set([]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000, option_groups: [] } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    expect(store.draftLines().length).toBe(1);

    store.selectTable('t2', { preserveDraft: true });
    http.expectOne(`${API}/table-sessions`).flush([]);

    expect(store.draftLines().length).toBe(1);
  });
});

describe('PosTerminalStore.voidPersistedItem — spec 029, Historia 1', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    confirm = TestBed.inject(ConfirmService);
  });

  afterEach(() => http.verify());

  it('el 409 de un pedido ya pagado se muestra con el mensaje del backend, sin excepción no controlada', async () => {
    const promise = store.voidPersistedItem('i1');
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/items/i1/void`);
    req.flush(
      { detail: 'El pedido ya fue pagado y no puede anularse' },
      { status: 409, statusText: 'Conflict' },
    );

    await expect(promise).resolves.toBeUndefined(); // no relanza — el error ya quedó en el toast
    expect(
      toast.toasts().some((t) => t.kind === 'error' && t.text === 'El pedido ya fue pagado y no puede anularse'),
    ).toBe(true);
  });
});

/**
 * Spec 029, hotfix #4: `cancel_order` ya existía en el backend (sin venta ni
 * movimiento de caja) pero no tenía ningún botón en la Terminal de Mesas —
 * la única acción sobre un pedido al confirmar el pago era cobrarlo.
 */
describe('PosTerminalStore.rejectOrder', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    confirm = TestBed.inject(ConfirmService);
    store.orders.set([{ ...order('o1', 'abierta', ['pendiente']), dining_table_id: 't1' }]);
    store.selectedOrderId.set('o1');
  });

  afterEach(() => http.verify());

  it('sin pedido seleccionado, no hace nada', async () => {
    store.selectedOrderId.set(null);
    await store.rejectOrder();
  });

  it('si el cajero cancela el aviso, no llama al backend ni pierde la selección', async () => {
    const promise = store.rejectOrder();
    confirm.respond(false);

    await promise;
    expect(store.selectedOrderId()).toBe('o1');
  });

  it('con confirmación, cancela el pedido con un motivo fijo (T: wiring)', async () => {
    const promise = store.rejectOrder();
    confirm.respond(true);
    await Promise.resolve();

    // Mismo patrón que "Liberar Mesa" (T035): al probar solo la forma del
    // pedido y su conexión, se responde con un error en vez de perseguir
    // toda la cascada de `reload()` (mesas + pedidos + cuenta de sesión).
    const req = http.expectOne(`${API}/orders/o1/cancel`);
    expect(req.request.body).toEqual({ motivo: 'Rechazado desde terminal' });
    req.flush({ detail: 'boom' }, { status: 409, statusText: 'Conflict' });

    await promise;
  });

  it('si el backend rechaza (pedido ya pagado), lo muestra con el mensaje del backend', async () => {
    const promise = store.rejectOrder();
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/o1/cancel`);
    req.flush(
      { detail: 'El pedido ya fue pagado y no puede rechazarse' },
      { status: 409, statusText: 'Conflict' },
    );

    await promise;
    expect(
      toast
        .toasts()
        .some((t) => t.kind === 'error' && t.text === 'El pedido ya fue pagado y no puede rechazarse'),
    ).toBe(true);
  });
});

/**
 * Spec 044: `reload()` refrescaba `orders()` pero nunca volvía a calcular
 * `selectedOrderId` — al confirmar/aprobar un pago QR pendiente, el pedido
 * dejaba de estar excluido de `activeOrders()`, pero la selección se quedaba
 * en `null` (desde que se eligió la mesa mientras el pedido aún era
 * `recibida`+`qr`) hasta que el cajero volvía a tocar la tarjeta.
 */
describe('PosTerminalStore.reload — resincroniza la selección tras confirmar un pago', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        ...checkoutDataAlreadyLoadedProviders(),
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Deja correr los microtasks pendientes entre una tanda de `flush()` y la
   *  siguiente petición que dispara `reload()` internamente (mismo patrón que
   *  `product.service.spec.ts`/`product-form.component.spec.ts`). */
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('mesa con un único pedido QR pendiente: sigue seleccionado sin interrupciones al confirmarse el pago (reload())', async () => {
    store.orders.set([
      { ...order('o1', 'recibida', ['pendiente']), channel: 'QR_MENU', dining_table_id: 't1' },
    ]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    // A pedido del usuario: `selectTable()` ya lo selecciona desde el
    // arranque (`tableOrders()` incluye los pagos QR por confirmar) -- de
    // sólo lectura mientras `selectedOrderPending()` sea `true`.
    expect(store.selectedOrder()?.id).toBe('o1');
    expect(store.selectedOrderPending()).toBe(true);

    const promise = store.reload();
    http.expectOne(`${API}/orders/tables`).flush([]);
    http
      .expectOne((r) => r.url === `${API}/orders`)
      .flush([{ ...order('o1', 'abierta', ['pendiente']), channel: 'QR_MENU', dining_table_id: 't1' }]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);
    await promise;

    // Tras confirmarse el pago (status ya no es 'recibida'), sigue siendo el
    // mismo pedido seleccionado -- ya no de sólo lectura.
    expect(store.selectedOrder()?.id).toBe('o1');
    expect(store.selectedOrderPending()).toBe(false);
  });

  it('mesa con dos pedidos activos y uno ya elegido a mano: reload() no cambia la selección mientras siga vigente', async () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    store.selectOrder('o2');
    expect(store.selectedOrder()?.id).toBe('o2');

    const promise = store.reload();
    http.expectOne(`${API}/orders/tables`).flush([]);
    http
      .expectOne((r) => r.url === `${API}/orders`)
      .flush([
        { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
        { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
      ]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);
    await promise;

    expect(store.selectedOrder()?.id).toBe('o2');
  });
});

/**
 * Bugfix (gap de spec 035, A-52): `marcarListo()` llama a `reload()`, que
 * dispara `resyncSelectedOrder()` -- antes del fix, un pedido `'pagada'`
 * dejaba de aparecer en `ordersOfTable()` justo al terminar de cocinar, así
 * que la selección se perdía en el mismo `reload()` que confirmaba el
 * "Marcar pedido listo". Ver spec 047.
 */
describe('PosTerminalStore.marcarListo — pedido "pagada" no desaparece (gap spec 035, A-52)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        ...checkoutDataAlreadyLoadedProviders(),
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('tras marcarListo(), el pedido pagado sigue seleccionado y centralState sigue en "pedido"', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente'], true), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    // `selectTable()` de una mesa con un pedido `paid` precarga su venta real
    // (bugfix "Ya pagado" en Cuenta de la mesa) — sin sale encontrada aquí,
    // que es justo lo que este test no necesita.
    http.expectOne((r) => r.url === `${API}/invoices`).flush([]);
    expect(store.selectedOrderId()).toBe('o1');

    const promise = store.marcarListo();

    // PATCH por ítem, no `POST /orders/{id}/ready` — ese endpoint rechaza con
    // 409 justo cuando `status === 'pagada'` (A-16), que es el caso de este
    // test (pedido de mostrador cobrado por adelantado).
    const kitchenReq = http.expectOne(`${API}/orders/items/o1-i0/kitchen`);
    expect(kitchenReq.request.method).toBe('PATCH');
    kitchenReq.flush({ id: 'o1-i0', estado_cocina: 'listo' });
    await tick();

    http.expectOne(`${API}/orders/tables`).flush([]);
    http
      .expectOne((r) => r.url === `${API}/orders`)
      .flush([{ ...order('o1', 'pagada', ['listo'], true), channel: 'POS', dining_table_id: 't1' }]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);

    await promise;

    expect(store.selectedOrderId()).toBe('o1');
    expect(store.centralState()).toBe('pedido');
  });

  it('marcarListo() no llama a "ready" y en cambio hace PATCH por cada ítem pendiente, sin chocar con el 409 de A-16', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente', 'pendiente'], true), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    const promise = store.marcarListo();

    http.expectOne(`${API}/orders/items/o1-i0/kitchen`).flush({ id: 'o1-i0', estado_cocina: 'listo' });
    await tick();
    http.expectOne(`${API}/orders/items/o1-i1/kitchen`).flush({ id: 'o1-i1', estado_cocina: 'listo' });
    await tick();

    http.expectOne(`${API}/orders/tables`).flush([]);
    http.expectOne((r) => r.url === `${API}/orders`).flush([]);
    await tick();
    http.expectOne(`${API}/table-sessions`).flush([]);

    await promise;

    http.expectNone(`${API}/orders/o1/ready`);
  });
});

/**
 * Spec 029, hotfix #3: `ensureReadyToCharge` existía sin ningún test — nadie
 * la llamaba (huérfana, ver `pos-checkout-panel.component.ts`, ahora
 * conectada como `beforeCharge` de `app-session-bill-panel` para el cobro
 * por sesión de mesa). Resuelve de una vez, con un solo aviso, los productos
 * que sigan sin marcar como listos antes de cobrar — la alternativa era que
 * `close_session` rechazara con 409 y el cajero tuviera que ir a otra
 * pantalla a marcarlos uno a uno.
 */
describe('PosTerminalStore.ensureReadyToCharge', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    confirm = TestBed.inject(ConfirmService);
  });

  afterEach(() => http.verify());

  it('con todos los ítems ya listos, resuelve true de inmediato sin preguntar ni pegar a la red', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['listo']), dining_table_id: 't1' }]);
    store.sessionBill.set({
      table_session_id: 'ts1', dining_table_id: 't1', total: '4000', order_ids: ['o1'], split: [],
    });

    await expect(store.ensureReadyToCharge()).resolves.toBe(true);
  });

  it('con ítems sin marcar, pregunta y —si el cajero confirma— los marca listos y recarga', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['pendiente']), dining_table_id: 't1' }]);
    store.sessionBill.set({
      table_session_id: 'ts1', dining_table_id: 't1', total: '4000', order_ids: ['o1'], split: [],
    });

    const promise = store.ensureReadyToCharge();
    confirm.respond(true);
    await Promise.resolve();

    const readyReq = http.expectOne(`${API}/orders/o1/ready`);
    readyReq.flush({ ...order('o1', 'abierta', ['listo']), dining_table_id: 't1' });
    await new Promise((resolve) => setTimeout(resolve));

    const reloadReq = http.expectOne((r) => r.url === `${API}/orders` && r.params.get('active_sessions_only') === 'true');
    reloadReq.flush([]);

    await expect(promise).resolves.toBe(true);
  });

  it('si el cajero cancela el aviso, resuelve false sin marcar nada', async () => {
    store.orders.set([{ ...order('o1', 'abierta', ['pendiente']), dining_table_id: 't1' }]);
    store.sessionBill.set({
      table_session_id: 'ts1', dining_table_id: 't1', total: '4000', order_ids: ['o1'], split: [],
    });

    const promise = store.ensureReadyToCharge();
    confirm.respond(false);

    await expect(promise).resolves.toBe(false);
  });
});

// ── spec 036, FR-001/FR-003: pestaña de tipo de orden ──────────────────────
describe('PosTerminalStore.orderTypeTab / setOrderTypeTab', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('empieza en "mesas"', () => {
    expect(store.orderTypeTab()).toBe('mesas');
  });

  it('setOrderTypeTab cambia la pestaña activa', () => {
    store.setOrderTypeTab('domicilios');
    expect(store.orderTypeTab()).toBe('domicilios');

    store.setOrderTypeTab('para-llevar');
    expect(store.orderTypeTab()).toBe('para-llevar');

    store.setOrderTypeTab('mesas');
    expect(store.orderTypeTab()).toBe('mesas');
  });

  // spec 091 (A-99): "Consumidor final" por defecto en Mesa/Para llevar, reabre A-88 (spec 087).
  describe('setOrderTypeTab / applyCustomerNameDefaultForTab — valor por defecto "Consumidor final"', () => {
    it('cambiar a "mesas" con el campo vacío lo precarga con "Consumidor final" (FR-001)', () => {
      store.customerName.set('');
      store.setOrderTypeTab('mesas');
      expect(store.customerName()).toBe('Consumidor final');
    });

    it('cambiar a "para-llevar" con el campo vacío lo precarga con "Consumidor final" (FR-001)', () => {
      store.customerName.set('');
      store.setOrderTypeTab('para-llevar');
      expect(store.customerName()).toBe('Consumidor final');
    });

    it('cambiar a "mesas"/"para-llevar" con un nombre ya escrito no lo toca (FR-002)', () => {
      store.customerName.set('Ana Torres');
      store.setOrderTypeTab('mesas');
      expect(store.customerName()).toBe('Ana Torres');

      store.setOrderTypeTab('para-llevar');
      expect(store.customerName()).toBe('Ana Torres');
    });

    it('cambiar a "mesas" con el campo en solo espacios lo trata como vacío (FR-004)', () => {
      store.customerName.set('   ');
      store.setOrderTypeTab('mesas');
      expect(store.customerName()).toBe('Consumidor final');
    });

    it('cambiar a "domicilios" con el valor por defecto intacto lo vacía (FR-008)', () => {
      store.customerName.set('Consumidor final');
      store.setOrderTypeTab('domicilios');
      expect(store.customerName()).toBe('');
    });

    it('cambiar a "domicilios" con un nombre propio no lo toca (FR-009)', () => {
      store.customerName.set('Carlos Ruiz');
      store.setOrderTypeTab('domicilios');
      expect(store.customerName()).toBe('Carlos Ruiz');
    });

    it('cambiar a "domicilios" con el campo ya vacío lo deja vacío, sin reintroducir el default', () => {
      store.customerName.set('');
      store.setOrderTypeTab('domicilios');
      expect(store.customerName()).toBe('');
    });

    it('round-trip: Mesa (default) → Domicilio (vacío) → Para llevar vuelve a "Consumidor final" (FR-010)', () => {
      store.customerName.set('');
      store.setOrderTypeTab('mesas');
      expect(store.customerName()).toBe('Consumidor final');

      store.setOrderTypeTab('domicilios');
      expect(store.customerName()).toBe('');

      store.setOrderTypeTab('para-llevar');
      expect(store.customerName()).toBe('Consumidor final');
    });

    it('un nombre propio se conserva al recorrer las tres pestañas en cualquier orden (FR-009, escenario 6)', () => {
      store.customerName.set('Carlos Ruiz');

      store.setOrderTypeTab('para-llevar');
      expect(store.customerName()).toBe('Carlos Ruiz');

      store.setOrderTypeTab('domicilios');
      expect(store.customerName()).toBe('Carlos Ruiz');

      store.setOrderTypeTab('mesas');
      expect(store.customerName()).toBe('Carlos Ruiz');
    });
  });
});

// ── spec 055: "Para Llevar" no exige mesa; payload channel/order_type ──────
describe('PosTerminalStore.createManualOrderFromDraft', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    // `reload()` dispara su propia cascada de HTTP (mesas, pedidos, cuenta de
    // sesión) — ajena a lo que prueba este bloque (el payload que arma
    // `createManualOrderFromDraft`), así que se anula igual que en los specs
    // de `manual-order-page.component.spec.ts`.
    vi.spyOn(store, 'reload').mockResolvedValue(undefined);
  });

  afterEach(() => http.verify());

  it('con "mesas" y sin mesa seleccionada, no crea nada (no regresión)', async () => {
    const ok = await store.createManualOrderFromDraft();
    expect(ok).toBe(false);
  });

  it('con "mesas" y una mesa seleccionada, envía channel POS / order_type DINE_IN / dining_table_id de la mesa', async () => {
    store.selectedTableId.set('t1');
    const promise = store.createManualOrderFromDraft();

    const req = http.expectOne(`${API}/orders`);
    expect(req.request.body).toEqual(
      expect.objectContaining({ channel: 'POS', order_type: 'DINE_IN', dining_table_id: 't1' }),
    );
    req.flush({ id: 'o1', channel: 'POS', order_type: 'DINE_IN', status: 'abierta', created_at: '2026-08-29' });

    expect(await promise).toBe(true);
  });

  it('con "para-llevar" y sin mesa seleccionada, igual crea el pedido: channel POS / order_type TAKEAWAY / dining_table_id null (FR-009, FR-011)', async () => {
    store.setOrderTypeTab('para-llevar');
    const promise = store.createManualOrderFromDraft();

    const req = http.expectOne(`${API}/orders`);
    expect(req.request.body).toEqual(
      expect.objectContaining({ channel: 'POS', order_type: 'TAKEAWAY', dining_table_id: null }),
    );
    req.flush({ id: 'o1', channel: 'POS', order_type: 'TAKEAWAY', status: 'recibida', created_at: '2026-08-29' });

    expect(await promise).toBe(true);
  });

  // ── spec 056: "Domicilio" no exige mesa, exige cliente/dirección/valor ───

  it('con "domicilios" y sin cliente/dirección/valor del domicilio, no crea nada (FR-007, segunda capa de protección)', async () => {
    store.setOrderTypeTab('domicilios');
    const ok = await store.createManualOrderFromDraft();
    expect(ok).toBe(false);
  });

  it('con "domicilios" y los tres campos obligatorios, sin mesa, envía order_type DELIVERY con los datos de entrega (FR-010)', async () => {
    store.setOrderTypeTab('domicilios');
    store.customerName.set('Ana Torres');
    store.deliveryAddress.set('Cra 45 #12-30, apto 301');
    store.deliveryPhone.set('3011234567');
    store.deliveryFee.set(6000);
    const promise = store.createManualOrderFromDraft();

    const req = http.expectOne(`${API}/orders`);
    expect(req.request.body).toEqual(
      expect.objectContaining({
        channel: 'POS',
        order_type: 'DELIVERY',
        dining_table_id: null,
        customer_name: 'Ana Torres',
        delivery_address: 'Cra 45 #12-30, apto 301',
        delivery_phone: '3011234567',
        delivery_fee: 6000,
      }),
    );
    req.flush({ id: 'o1', channel: 'POS', order_type: 'DELIVERY', status: 'recibida', created_at: '2026-08-29' });

    expect(await promise).toBe(true);
  });

  it('con "domicilios" y teléfono vacío, envía delivery_phone null (FR-008)', async () => {
    store.setOrderTypeTab('domicilios');
    store.customerName.set('Ana Torres');
    store.deliveryAddress.set('Cra 45 #12-30');
    store.deliveryFee.set(0);
    const promise = store.createManualOrderFromDraft();

    const req = http.expectOne(`${API}/orders`);
    expect(req.request.body).toEqual(
      expect.objectContaining({ delivery_phone: null, delivery_fee: 0 }),
    );
    req.flush({ id: 'o1', channel: 'POS', order_type: 'DELIVERY', status: 'recibida', created_at: '2026-08-29' });

    expect(await promise).toBe(true);
  });
});

// ── Editar una línea del carrito ya agregada (rediseño create-order/code.html) ──
describe('PosTerminalStore — openConfigForEdit / editingSelection / addDraftFromSelection en modo edición', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  function addMango(): void {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000, option_groups: [] } as never,
      options: [],
      quantity: 2,
      notes: 'Sin azúcar',
    });
  }

  it('openConfigForEdit abre el modal con el producto de la línea y marca editingDraftKey', () => {
    addMango();
    const key = store.draftLines()[0].key;

    store.openConfigForEdit(key);

    expect(store.configuringProduct()?.name).toBe('Mango Tropical');
    expect(store.editingDraftKey()).toBe(key);
  });

  it('openConfigForEdit con una key inexistente no hace nada', () => {
    store.openConfigForEdit('no-existe');

    expect(store.configuringProduct()).toBeNull();
    expect(store.editingDraftKey()).toBeNull();
  });

  it('editingSelection refleja la línea en edición como ProductSelection; null fuera de edición', () => {
    expect(store.editingSelection()).toBeNull();

    addMango();
    const key = store.draftLines()[0].key;
    store.openConfigForEdit(key);

    expect(store.editingSelection()).toEqual(
      expect.objectContaining({ quantity: 2, notes: 'Sin azúcar' }),
    );
  });

  it('closeConfig limpia editingDraftKey además de configuringProduct', () => {
    addMango();
    store.openConfigForEdit(store.draftLines()[0].key);

    store.closeConfig();

    expect(store.configuringProduct()).toBeNull();
    expect(store.editingDraftKey()).toBeNull();
  });

  it('confirmar una edición REEMPLAZA la línea en su lugar, no suma cantidades ni agrega una línea nueva', () => {
    addMango();
    const originalKey = store.draftLines()[0].key;
    store.openConfigForEdit(originalKey);

    // El cajero quita el azúcar de las notas y deja la cantidad en 2 (la
    // precargada) -- `sel.quantity` YA es la cantidad final, no se suma.
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000, option_groups: [] } as never,
      options: [],
      quantity: 2,
      notes: null,
    });

    expect(store.draftLines().length).toBe(1);
    expect(store.draftLines()[0].notes).toBeNull();
    expect(store.draftLines()[0].quantity).toBe(2);
    expect(store.editingDraftKey()).toBeNull();
  });

  it('cancelar la edición (closeConfig) no modifica la línea original', () => {
    addMango();
    const key = store.draftLines()[0].key;
    store.openConfigForEdit(key);

    store.closeConfig();

    expect(store.draftLines().length).toBe(1);
    expect(store.draftLines()[0].notes).toBe('Sin azúcar');
  });
});

// ── Descuento por línea del carrito -- cartView().promo (rediseño create-order/code.html) ──
describe('PosTerminalStore.cartView — promo por línea', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('con cantidad >= min_qty, la línea trae promo con el tachado/descuento/ahorro correctos', () => {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Paleta Frutos Rojos' } as never,
      variant: {
        id: 'v1',
        price: 7000,
        discounted_price: 5500,
        promotion: { min_qty: 2, short_condition: '2x1 Promo' },
      } as never,
      options: [],
      quantity: 2,
      notes: null,
    });

    const row = store.cartView()[0];
    expect(row.promo).toEqual({
      badge: '2x1 Promo',
      originalAmount: 14000,
      discountedAmount: 11000,
      savings: 3000,
    });
    // `subtotal`/`unitPrice` NO cambian -- siguen a precio completo (FR-023);
    // `promo` es aparte, solo para pintar la insignia/tachado/ahorro.
    expect(row.subtotal).toBe(14000);
  });

  it('con cantidad < min_qty, la línea no trae promo (mismo guardia que product-select)', () => {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Paleta Frutos Rojos' } as never,
      variant: {
        id: 'v1',
        price: 7000,
        discounted_price: 5500,
        promotion: { min_qty: 2, short_condition: '2x1 Promo' },
      } as never,
      options: [],
      quantity: 1,
      notes: null,
    });

    expect(store.cartView()[0].promo).toBeNull();
  });

  it('sin promoción en la variante, la línea no trae promo', () => {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Cono' } as never,
      variant: { id: 'v1', price: 8000 } as never,
      options: [],
      quantity: 3,
      notes: null,
    });

    expect(store.cartView()[0].promo).toBeNull();
  });
});

// ── spec 056: totals() suma deliveryFee solo con "domicilios" ──────────────
describe('PosTerminalStore.totals — deliveryFee (spec 056, FR-009/FR-012)', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
  });

  it('con "domicilios" y un valor de domicilio, lo suma al total', () => {
    store.setOrderTypeTab('domicilios');
    store.deliveryFee.set(6000);
    expect(store.totals()).toEqual(
      expect.objectContaining({ subtotal: 5000, deliveryFee: 6000, total: 11000 }),
    );
  });

  it('con "domicilios" y ningún valor escrito (null), no suma nada', () => {
    store.setOrderTypeTab('domicilios');
    expect(store.totals()).toEqual(
      expect.objectContaining({ deliveryFee: 0, total: 5000 }),
    );
  });

  it('con "mesas" o "para-llevar", ignora deliveryFee aunque tenga un valor residual (FR-012, no afecta otros tipos de orden)', () => {
    store.deliveryFee.set(6000);
    expect(store.totals()).toEqual(expect.objectContaining({ deliveryFee: 0, total: 5000 }));

    store.setOrderTypeTab('para-llevar');
    expect(store.totals()).toEqual(expect.objectContaining({ deliveryFee: 0, total: 5000 }));
  });
});

// ── spec 036, FR-007: buscador por nombre del catálogo embebido ────────────
describe('PosTerminalStore.catalogSearchText / setCatalogSearchText / catalogProductsFiltered', () => {
  let store: PosTerminalStore;
  let menuService: MenuService;

  function product(id: string, name: string): MenuProduct {
    return {
      id,
      name,
      description: null,
      image_url: null,
      variants: [],
      option_groups: [],
      available: true,
    };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    menuService = TestBed.inject(MenuService);
  });

  it('setCatalogSearchText actualiza catalogSearchText', () => {
    expect(store.catalogSearchText()).toBe('');
    store.setCatalogSearchText('malta');
    expect(store.catalogSearchText()).toBe('malta');
  });

  it('sin texto de búsqueda devuelve catalogProducts() completo', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Cat', products: [product('p1', 'Malteada'), product('p2', 'Helado')] },
    ]);
    store.catalogCategoryId.set('c1');

    expect(store.catalogProductsFiltered().map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('filtra por nombre insensible a mayúsculas y acentos', () => {
    menuService.categories.set([
      {
        id: 'c1',
        name: 'Cat',
        products: [product('p1', 'Malteada de Café'), product('p2', 'Helado de vainilla')],
      },
    ]);
    store.catalogCategoryId.set('c1');

    store.setCatalogSearchText('CAFE');
    expect(store.catalogProductsFiltered().map((p) => p.id)).toEqual(['p1']);
  });

  it('combina categoría (ya existente) + búsqueda por nombre por intersección', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [product('p1', 'Malteada de fresa')] },
      { id: 'c2', name: 'Postres', products: [product('p2', 'Malteada de fresa (postre)')] },
    ]);
    store.catalogCategoryId.set('c1');
    store.setCatalogSearchText('fresa');

    expect(store.catalogProductsFiltered().map((p) => p.id)).toEqual(['p1']);
  });

  it('sin coincidencias devuelve una lista vacía', () => {
    menuService.categories.set([{ id: 'c1', name: 'Cat', products: [product('p1', 'Malteada')] }]);
    store.catalogCategoryId.set('c1');

    store.setCatalogSearchText('xyz-no-existe');
    expect(store.catalogProductsFiltered()).toEqual([]);
  });
});

describe('normalizeSearchTerm', () => {
  it('ignora mayúsculas y acentos', () => {
    expect(normalizeSearchTerm('Café')).toBe(normalizeSearchTerm('cafe'));
    expect(normalizeSearchTerm('MALTEADA')).toBe('malteada');
  });

  it('recorta espacios en los extremos', () => {
    expect(normalizeSearchTerm('  helado  ')).toBe('helado');
  });
});

/**
 * Spec 049: cabecera + pestañas del nuevo panel de pedido. `showAllOrders`,
 * `ordersView` y `selectedTableStatusMeta` se prueban aquí directo sobre el
 * store, sin pasar por `selectTable()` (evita mockear `GET /table-sessions`
 * cuando no aporta nada a lo que se está probando) — mismo criterio que
 * `describe('PosTerminalStore — pestañas cuando coexisten...')` (spec 048).
 */
describe('PosTerminalStore — cabecera y pestañas del panel de pedido (spec 049)', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  it('orderTabs() rotula "Pedido N" con el table_order_number del backend, no por posición ni por nombre de cliente (spec 087, FR-006/FR-009 -- reemplaza el rotulado por posición, causa del bug de reordenamiento que documentaba este test antes de A-86)', () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1', customer_name: 'Ana', table_order_number: 1 },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1', customer_name: 'Luis', table_order_number: 2 },
    ]);
    store.selectedTableId.set('t1');

    expect(store.orderTabs()).toEqual([
      { id: 'o1', label: 'Pedido 1', pending: false },
      { id: 'o2', label: 'Pedido 2', pending: false },
    ]);
  });

  it('orderTabs() ordena ascendente por table_order_number, sin importar el orden de llegada (spec 087, FR-006)', () => {
    store.orders.set([
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1', table_order_number: 2 },
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1', table_order_number: 1 },
    ]);
    store.selectedTableId.set('t1');

    expect(store.orderTabs()).toEqual([
      { id: 'o1', label: 'Pedido 1', pending: false },
      { id: 'o2', label: 'Pedido 2', pending: false },
    ]);
  });

  it('orderTabs() rotula sin número ("Pedido" a secas) un pedido histórico sin table_order_number (spec 087)', () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1', table_order_number: null },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1', table_order_number: 1 },
    ]);
    store.selectedTableId.set('t1');

    expect(store.orderTabs()).toEqual([
      { id: 'o2', label: 'Pedido 1', pending: false },
      { id: 'o1', label: 'Pedido', pending: false },
    ]);
  });

  it('orderTabs() marca `pending: true` un pago QR por confirmar, incluido entre las pestañas (a pedido del usuario)', () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1', table_order_number: 1 },
      { ...order('o2', 'recibida', ['pendiente']), channel: 'QR_MENU', dining_table_id: 't1', table_order_number: 2 },
    ]);
    store.selectedTableId.set('t1');

    expect(store.orderTabs()).toEqual([
      { id: 'o1', label: 'Pedido 1', pending: false },
      { id: 'o2', label: 'Pedido 2', pending: true },
    ]);
  });

  it('selectedOrderTotal() es null con un único pedido en la mesa (sin pestañas que navegar)', () => {
    store.orders.set([{ ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' }]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    expect(store.selectedOrderTotal()).toBeNull();
  });

  it('selectedOrderTotal() acompaña al pedido enfocado por su pestaña, no al total de toda la mesa', () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente', 'pendiente']), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    store.selectedOrderId.set('o1');
    expect(store.selectedOrderTotal()).toBe(4000);

    store.selectedOrderId.set('o2');
    expect(store.selectedOrderTotal()).toBe(8000);
  });

  it('ordersView() devuelve una tarjeta por pedido, con sus ítems y si le falta algo por preparar', () => {
    store.orders.set([
      { ...order('o1', 'abierta', ['listo']), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');

    const cards = store.ordersView();
    expect(cards.length).toBe(2);
    expect(cards[0].order.id).toBe('o1');
    expect(cards[0].pending).toBe(false);
    expect(cards[0].items.length).toBe(1);
    expect(cards[1].order.id).toBe('o2');
    expect(cards[1].pending).toBe(true);
  });

  it('selectedTableStatusMeta() es null sin mesa seleccionada', () => {
    expect(store.selectedTableStatusMeta()).toBeNull();
  });

  it('marcarListo(orderId) opera sobre ese pedido aunque no sea el seleccionado', async () => {
    const http = TestBed.inject(HttpTestingController);
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    // Se corta con un error antes del reload (fuera de alcance de este test,
    // ver describe de marcarListo/gap spec 035 para ese flujo completo) — lo
    // único que interesa aquí es a qué pedido apuntó la petición (PATCH por
    // ítem, no "ready" — ver bugfix del botón "Marcar pedido listo", A-16).
    const promise = store.marcarListo('o2');
    http.expectOne(`${API}/orders/items/o2-i0/kitchen`).flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    await promise;

    http.verify();
  });

  it('avanzarItem busca la línea en cualquier pedido de la mesa, no solo en el seleccionado', async () => {
    const http = TestBed.inject(HttpTestingController);
    store.orders.set([
      { ...order('o1', 'abierta', ['listo']), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    const itemId = store.ordersView()[1].items[0].key;
    const promise = store.avanzarItem(itemId);
    http
      .expectOne(`${API}/orders/items/${itemId}/kitchen`)
      .flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    await promise;

    http.verify();
  });

  it('voidPersistedCombo busca el pedido dueño del combo aunque no sea el seleccionado', async () => {
    const http = TestBed.inject(HttpTestingController);
    const confirm = TestBed.inject(ConfirmService);
    const conItemDeCombo: DiningOrder = {
      ...order('o2', 'abierta', []),
      channel: 'POS',
      dining_table_id: 't1',
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente', combo_id: 'c1' },
      ] as DiningOrderItem[],
    };
    store.orders.set([
      { ...order('o1', 'abierta', ['listo']), channel: 'POS', dining_table_id: 't1' },
      conItemDeCombo,
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');

    const promise = store.voidPersistedCombo('c1');
    confirm.respond(true);
    await Promise.resolve();
    http.expectOne(`${API}/orders/items/i1/void`).flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    await promise;

    http.verify();
  });
});

/**
 * Bugfix reportado sobre spec 049: "Cuenta de la mesa" mostraba Subtotal y
 * Total en $0, sin fila de Descuento, cuando el único pedido de la mesa ya
 * estaba pagado (`bill.split` del backend excluye a propósito lo ya
 * cobrado — evita facturarlo dos veces al cerrar la sesión). Este bloque
 * cubre el resumen aparte de "Ya pagado" que se agrega para ese caso.
 */
describe('PosTerminalStore.selectedTablePaidSummary — "Ya pagado" (bugfix spec 049)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  const tick = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        ...checkoutDataAlreadyLoadedProviders(),
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('null sin mesa seleccionada o sin ningún pedido pagado', () => {
    expect(store.selectedTablePaidSummary()).toBeNull();

    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
    ]);
    store.selectedTableId.set('t1');
    expect(store.selectedTablePaidSummary()).toBeNull();
  });

  it('selectTable() de una mesa con un pedido pagado precarga su venta real y la refleja en el resumen', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente'], true), channel: 'POS', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    expect(store.selectedTablePaidSummary()).toBeNull(); // aún sin cargar

    http
      .expectOne((r) => r.url === `${API}/invoices`)
      .flush([{ sale_id: 's1' }]);
    await tick();
    http
      .expectOne(`${API}/sales/s1`)
      .flush({ id: 's1', subtotal: '8000', discount: '1000', total: '7000' });
    await tick();

    expect(store.selectedTablePaidSummary()).toEqual({ subtotal: 8000, discount: 1000, total: 7000 });
  });

  it('no reintenta ni repite la búsqueda al volver a seleccionar la misma mesa', async () => {
    store.orders.set([
      { ...order('o1', 'pagada', ['pendiente'], true), channel: 'POS', dining_table_id: 't1' },
    ]);

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    http.expectOne((r) => r.url === `${API}/invoices`).flush([{ sale_id: 's1' }]);
    await tick();
    http.expectOne(`${API}/sales/s1`).flush({ id: 's1', subtotal: '8000', discount: '0', total: '8000' });
    await tick();

    store.selectTable('t1');
    http.expectOne(`${API}/table-sessions`).flush([]);
    // Sin una segunda petición a /invoices — ya se intentó para ese pedido.

    expect(store.selectedTablePaidSummary()).toEqual({ subtotal: 8000, discount: 0, total: 8000 });
  });
});

/**
 * Spec 059, Historia 1 (FR-001 a FR-004): `init()` deja de pedir métodos de
 * pago y turno de caja — esos dos solo se cargan la primera vez que el
 * cajero selecciona un pedido real (mesa con pedido, o pedido sin mesa,
 * spec 059 Historia 3), nunca por una mesa libre. A diferencia de las demás
 * suites de este archivo, aquí `PaymentMethodService`/`CashService` NO se
 * mockean como "ya cargados" — son los servicios reales bajo prueba.
 */
describe('PosTerminalStore — carga diferida de datos de cobro (spec 059, Historia 1)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  const REGISTER_STORAGE_KEY = 'cash.register';

  beforeEach(() => {
    localStorage.removeItem(REGISTER_STORAGE_KEY);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => Promise.resolve(), activePromotions: () => [], ready: () => false, now: () => new Date() } },
        { provide: TableService, useValue: { loadTables: () => Promise.resolve(), tables: () => [] } },
        { provide: MenuService, useValue: { loadMenu: () => Promise.resolve(), categories: () => [] } },
        // Sin esto, init()/selectTable() abrirían de verdad el stream SSE
        // (POST /realtime/ticket) — ruido ajeno a lo que prueba este bloque.
        { provide: RealtimeService, useValue: { status: () => 'closed', on: () => () => {}, connectStaff: () => {}, disconnect: () => {} } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(REGISTER_STORAGE_KEY);
  });

  function expectNoCheckoutDataRequests(): void {
    http.expectNone(
      (r) => r.url === `${API}/sales/payment-methods` && !r.params.has('available'),
    );
    http.expectNone(
      (r) => r.url === `${API}/sales/payment-methods` && r.params.get('available') === 'true',
    );
    http.expectNone((r) => r.url === `${API}/cash/shifts/current`);
  }

  it('tras init(), no se pidieron métodos de pago ni turno de caja (FR-001)', async () => {
    const initPromise = store.init();
    http.expectOne((r) => r.url === `${API}/orders`).flush([]);
    await initPromise;

    expectNoCheckoutDataRequests();
  });

  it('seleccionar una mesa libre (sin pedido) tampoco los pide (FR-001)', async () => {
    store.orders.set([]);

    store.selectTable('t1');
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]);
    await Promise.resolve();

    expectNoCheckoutDataRequests();
  });

  it('seleccionar una mesa con pedido los pide exactamente una vez cada uno, y no los repite en una segunda selección (FR-002/FR-003)', async () => {
    localStorage.setItem(REGISTER_STORAGE_KEY, 'reg-1');
    store.orders.set([
      { ...order('o1', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't1' },
      { ...order('o2', 'abierta', ['pendiente']), channel: 'POS', dining_table_id: 't2' },
    ]);

    store.selectTable('t1');
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]);
    // Respuestas no vacías a propósito: la condición de caché es
    // `methods().length === 0`, así que flushear con `[]` no la satisface y
    // el segundo `selectTable()` volvería a pedirlos — justo lo que esta
    // prueba necesita descartar.
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && !r.params.has('available'))
      .flush([{ id: 'pm-cash', name: 'Efectivo' }]);
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && r.params.get('available') === 'true')
      .flush([{ id: 'pm-cash', name: 'Efectivo', is_cash: true }]);
    http
      .expectOne((r) => r.url === `${API}/cash/shifts/current` && r.params.get('cash_register_id') === 'reg-1')
      .flush({ id: 'shift-1' });
    await Promise.resolve();

    // Segunda mesa con pedido: mismos tres datos ya en caché, no se repiten.
    store.selectTable('t2');
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]);

    expectNoCheckoutDataRequests();
  });

  it('spec 072 (FR-005 a FR-007): un pedido que llega por una recarga real a una mesa ya seleccionada también dispara el chequeo, sin volver a seleccionarla', async () => {
    localStorage.setItem(REGISTER_STORAGE_KEY, 'reg-1');
    store.orders.set([]);

    // El cajero deja la mesa vacía seleccionada, esperando el pedido.
    store.selectTable('t1');
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]);
    await Promise.resolve();
    expectNoCheckoutDataRequests();

    // El pedido llega por una recarga real (simula sondeo/tiempo real) — nunca
    // se vuelve a llamar `selectTable('t1')`.
    const reloadPromise = store.reload();
    http.expectOne((r) => r.url === `${API}/orders`).flush([
      { ...order('o1', 'recibida', ['pendiente']), dining_table_id: 't1' },
    ]);
    await new Promise((r) => setTimeout(r, 0));
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && !r.params.has('available'))
      .flush([{ id: 'pm-cash', name: 'Efectivo' }]);
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && r.params.get('available') === 'true')
      .flush([{ id: 'pm-cash', name: 'Efectivo', is_cash: true }]);
    http
      .expectOne((r) => r.url === `${API}/cash/shifts/current` && r.params.get('cash_register_id') === 'reg-1')
      .flush({ id: 'shift-1' });
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]); // loadSessionBill
    await reloadPromise;

    expect(store.cashShiftId()).toBe('shift-1');
  });

  it('spec 072 (US2, FR-003): sin ningún turno de caja abierto, el disparador reactivo no habilita el cobro', async () => {
    // Sin `localStorage`: fuerza el descubrimiento completo (contracts/descubrimiento-turno-abierto.md).
    store.orders.set([]);
    store.selectTable('t1');
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]);
    await Promise.resolve();
    expectNoCheckoutDataRequests();

    const reloadPromise = store.reload();
    http.expectOne((r) => r.url === `${API}/orders`).flush([
      { ...order('o1', 'recibida', ['pendiente']), dining_table_id: 't1' },
    ]);
    await new Promise((r) => setTimeout(r, 0));
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && !r.params.has('available'))
      .flush([{ id: 'pm-cash', name: 'Efectivo' }]);
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && r.params.get('available') === 'true')
      .flush([{ id: 'pm-cash', name: 'Efectivo', is_cash: true }]);
    // Descubrimiento: lista las cajas y ninguna tiene turno abierto (404 en cada una).
    http.expectOne(`${API}/cash/registers`).flush([{ id: 'reg-1', name: 'Principal', active: true }]);
    await new Promise((r) => setTimeout(r, 0));
    http
      .expectOne((r) => r.url === `${API}/cash/shifts/current`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]); // loadSessionBill
    await reloadPromise;

    expect(store.cashShiftId()).toBeNull();
  });

  it('spec 072 (US3, FR-004): con dos turnos de caja abiertos a la vez, el disparador reactivo sigue exigiendo elegir explícitamente', async () => {
    store.orders.set([]);
    store.selectTable('t1');
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]);
    await Promise.resolve();
    expectNoCheckoutDataRequests();

    const reloadPromise = store.reload();
    http.expectOne((r) => r.url === `${API}/orders`).flush([
      { ...order('o1', 'recibida', ['pendiente']), dining_table_id: 't1' },
    ]);
    await new Promise((r) => setTimeout(r, 0));
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && !r.params.has('available'))
      .flush([{ id: 'pm-cash', name: 'Efectivo' }]);
    http
      .expectOne((r) => r.url === `${API}/sales/payment-methods` && r.params.get('available') === 'true')
      .flush([{ id: 'pm-cash', name: 'Efectivo', is_cash: true }]);
    http.expectOne(`${API}/cash/registers`).flush([
      { id: 'reg-1', name: 'Principal', active: true },
      { id: 'reg-2', name: 'Caja 2', active: true },
    ]);
    await new Promise((r) => setTimeout(r, 0));
    const shiftReqs = http.match((r) => r.url === `${API}/cash/shifts/current`);
    expect(shiftReqs.length).toBe(2);
    for (const r of shiftReqs) {
      r.flush({ id: `shift-${r.request.params.get('cash_register_id')}`, cash_register_id: r.request.params.get('cash_register_id') });
    }
    http.expectOne((r) => r.url === `${API}/table-sessions`).flush([]); // loadSessionBill
    await reloadPromise;

    expect(store.cashShiftId()).toBeNull();
  });
});

/**
 * Spec 059, Historia 2 (FR-005/FR-006/FR-008): filtra `orders()` por tipo,
 * excluyendo lo ya cobrado/cancelado — sin ningún endpoint nuevo.
 */
describe('PosTerminalStore.ordersByType (spec 059, Historia 2)', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        ...checkoutDataAlreadyLoadedProviders(),
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  function withType(
    id: string,
    orderType: 'TAKEAWAY' | 'DELIVERY' | 'DINE_IN',
    extra: Partial<DiningOrder> = {},
  ): DiningOrder {
    return { ...order(id, 'abierta', ['pendiente']), channel: 'POS', order_type: orderType, ...extra };
  }

  it('"para-llevar" solo trae pedidos TAKEAWAY pendientes de cobro', () => {
    store.orders.set([
      withType('o1', 'TAKEAWAY', { customer_name: 'María G.' }),
      withType('o2', 'DELIVERY'),
      withType('o3', 'DINE_IN', { dining_table_id: 't1' }),
    ]);

    const cards = store.ordersByType('para-llevar');

    expect(cards.map((c) => c.id)).toEqual(['o1']);
    expect(cards[0].title).toBe('Para llevar');
    expect(cards[0].secondaryLabel).toBe('María G.');
  });

  it('"domicilios" solo trae pedidos DELIVERY pendientes de cobro', () => {
    store.orders.set([withType('o1', 'TAKEAWAY'), withType('o2', 'DELIVERY')]);

    const cards = store.ordersByType('domicilios');

    expect(cards.map((c) => c.id)).toEqual(['o2']);
    expect(cards[0].title).toBe('Domicilio');
  });

  it('sin nombre de cliente, usa "Consumidor final" (spec 055 default)', () => {
    store.orders.set([withType('o1', 'TAKEAWAY', { customer_name: null })]);

    expect(store.ordersByType('para-llevar')[0].secondaryLabel).toBe('Consumidor final');
  });

  it('un pedido ya pagado desaparece de su pestaña (FR-008, spec 036)', () => {
    store.orders.set([withType('o1', 'TAKEAWAY', { paid: true })]);

    expect(store.ordersByType('para-llevar')).toEqual([]);
  });

  it('un pedido cancelado desaparece de su pestaña', () => {
    store.orders.set([{ ...withType('o1', 'TAKEAWAY'), status: 'cancelada' }]);

    expect(store.ordersByType('para-llevar')).toEqual([]);
  });

  it('sin ningún pedido pendiente de un tipo, devuelve un arreglo vacío', () => {
    store.orders.set([]);

    expect(store.ordersByType('domicilios')).toEqual([]);
    expect(store.ordersByType('para-llevar')).toEqual([]);
  });
});

/**
 * spec 078 (US1, FR-001–FR-006; research.md D1; A-71 punto 2): el `totalLabel`
 * de la tarjeta de un pedido de Domicilio pasa a mostrar el total **real a
 * cobrar** = subtotal de productos post-descuento + `delivery_fee`, el mismo
 * importe que `GET /orders/{id}/checkout-preview`. Para mesa / "Para llevar" el
 * `totalLabel` no cambia. Todo se compone en memoria — sin ninguna petición.
 */
describe('PosTerminalStore.ordersByType — total de la tarjeta de Domicilio (spec 078, US1)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        ...checkoutDataAlreadyLoadedProviders(),
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function delivery(id: string, items: Partial<DiningOrderItem>[], extra: Partial<DiningOrder> = {}): DiningOrder {
    return {
      ...order(id, 'abierta', []),
      channel: 'POS',
      order_type: 'DELIVERY',
      items: items.map((it, i) => ({
        id: `${id}-i${i}`,
        product_variant_id: 'v1',
        quantity: 1,
        unit_price: '0',
        estado_cocina: 'pendiente',
        ...it,
      })) as DiningOrderItem[],
      ...extra,
    } as DiningOrder;
  }

  /** Fórmula de `CheckoutPreview.total` reproducida en el test para la
   *  reconciliación tarjeta ↔ panel (FR-003): `max(0, subtotal − descuento + domicilio)`. */
  const previewTotal = (subtotalPostDescuento: number, deliveryFee: number) =>
    Math.max(0, subtotalPostDescuento + deliveryFee);

  it('DELIVERY con subtotal $25.000 + delivery_fee $6.000 → totalLabel = fmt(31000) (FR-001, SC-001)', () => {
    store.orders.set([delivery('o1', [{ unit_price: '25000' }], { delivery_fee: 6000 })]);

    const card = store.ordersByType('domicilios')[0];
    expect(card.totalLabel).toBe(store.fmt(31000));
    expect(card.totalLabel).toBe(store.fmt(previewTotal(25000, 6000)));
  });

  it('DELIVERY con delivery_fee 0 o null → totalLabel = fmt(subtotal), sin error (FR-006)', () => {
    store.orders.set([
      delivery('o1', [{ unit_price: '25000' }], { delivery_fee: 0 }),
      delivery('o2', [{ unit_price: '25000' }], { delivery_fee: null }),
    ]);

    const cards = store.ordersByType('domicilios');
    expect(cards[0].totalLabel).toBe(store.fmt(25000));
    expect(cards[1].totalLabel).toBe(store.fmt(25000));
  });

  it('bugfix: `delivery_fee` llega como string (Decimal serializado por el backend, igual que `unit_price`) — no se concatena con el subtotal', () => {
    // El tipo `DiningOrder.delivery_fee` dice `number | null`, pero en
    // producción el backend lo serializa como string (mismo Decimal que
    // `unit_price`/`discounted_line_total`, siempre tratados con `Number()`
    // en el resto del store) -- `as unknown as number` reproduce ese shape
    // real para que el test no oculte el bug detrás del tipo optimista.
    store.orders.set([
      delivery('o1', [{ unit_price: '15000', quantity: 3 }, { unit_price: '0', quantity: 4 }], {
        delivery_fee: '5000' as unknown as number,
      }),
    ]);

    const card = store.ordersByType('domicilios')[0];
    // Antes del fix: `45000 + '5000.00'` concatenaba a "450005000" en vez de
    // sumar 50000 -- la tarjeta mostraba $450.005.000 en vez de $50.000.
    expect(card.totalLabel).toBe(store.fmt(50000));
  });

  it('DELIVERY con promoción aplicada (descuento congelado en discounted_unit_price) → fmt(subtotal_post_descuento + delivery_fee) (FR-002, FR-003)', () => {
    // 1 línea: precio $10.000, descuento por promo → $8.000 la unidad.
    store.orders.set([
      delivery('o1', [{ unit_price: '10000', discounted_unit_price: '8000' }], { delivery_fee: 6000 }),
    ]);

    const card = store.ordersByType('domicilios')[0];
    expect(card.totalLabel).toBe(store.fmt(14000));
    expect(card.totalLabel).toBe(store.fmt(previewTotal(8000, 6000)));
  });

  it('DELIVERY: promoción pausada/eliminada tras confirmar — la tarjeta mantiene el discounted_unit_price congelado; el panel (recompute en vivo) es la autoridad (FR-003, Edge Cases)', () => {
    // `activePromotions: () => []` simula que la promo ya no está vigente:
    // la tarjeta sigue usando el número congelado en la línea, no lo recalcula.
    store.orders.set([
      delivery('o1', [{ unit_price: '10000', discounted_unit_price: '8000' }], { delivery_fee: 0 }),
    ]);

    expect(store.ordersByType('domicilios')[0].totalLabel).toBe(store.fmt(8000));
  });

  it('DELIVERY: línea con descuento y quantity > 1 usa discounted_line_total, sin perder céntimos (research.md D1 riesgo 3)', () => {
    store.orders.set([
      delivery(
        'o1',
        [{ unit_price: '1000', discounted_unit_price: '333.33', discounted_line_total: '1000.00', quantity: 3 }],
        { delivery_fee: 0 },
      ),
    ]);

    // 333.33 * 3 = 999.99 perdería un céntimo; discounted_line_total = 1000.00 es la cifra autoritativa.
    expect(store.ordersByType('domicilios')[0].totalLabel).toBe(store.fmt(1000));
  });

  it('TAKEAWAY / pedido de mesa: totalLabel idéntico al de hoy — delivery_fee nulo, no se suma nada (FR-005)', () => {
    store.orders.set([
      { ...order('t1', 'abierta', []), channel: 'POS', order_type: 'TAKEAWAY', items: [{ id: 't1-i0', product_variant_id: 'v1', quantity: 1, unit_price: '25000', estado_cocina: 'pendiente' }] as DiningOrderItem[] } as DiningOrder,
    ]);

    expect(store.ordersByType('para-llevar')[0].totalLabel).toBe(store.fmt(25000));
  });

  // ── spec 089 (A-94): adicionales cobrados una vez por línea (Menú QR) ──────

  it('spec 089: una línea del Menú QR (2 × 15.000 + adicional 3.000) suma 33.000 en la tarjeta', () => {
    store.orders.set([
      delivery('o1', [{ unit_price: '15000', quantity: 2, addons_total: '3000', line_total: '33000' }], {
        delivery_fee: 0,
      }),
    ]);

    expect(store.ordersByType('domicilios')[0].totalLabel).toBe(store.fmt(33000));
  });

  it('spec 089: un pedido con una línea histórica y una nueva del Menú QR suma cada una con su regla', () => {
    store.orders.set([
      delivery(
        'o1',
        [
          { unit_price: '18000', quantity: 2 }, // histórica: el extra ya va dentro del precio por unidad
          { unit_price: '15000', quantity: 2, addons_total: '3000' }, // nueva: adicional una sola vez
        ],
        { delivery_fee: 0 },
      ),
    ]);

    expect(store.ordersByType('domicilios')[0].totalLabel).toBe(store.fmt(69000));
  });

  it('spec 089: con promoción, el discounted_line_total ya incluye el adicional y no se pierde', () => {
    store.orders.set([
      delivery(
        'o1',
        [
          {
            unit_price: '15000', quantity: 2, addons_total: '3000', line_total: '33000',
            discounted_unit_price: '12000.00', discounted_line_total: '27000.00',
          },
        ],
        { delivery_fee: 0 },
      ),
    ]);

    expect(store.ordersByType('domicilios')[0].totalLabel).toBe(store.fmt(27000));
  });

  it('spec 089: con descuento y sin discounted_line_total suma el adicional aparte del precio por unidad', () => {
    store.orders.set([
      delivery(
        'o1',
        [{ unit_price: '15000', quantity: 2, addons_total: '3000', discounted_unit_price: '12000' }],
        { delivery_fee: 0 },
      ),
    ]);

    // 12.000 × 2 + 3.000
    expect(store.ordersByType('domicilios')[0].totalLabel).toBe(store.fmt(27000));
  });

  it('la tarjeta muestra un único string de total, sin desglose productos/domicilio (FR-004)', () => {
    store.orders.set([delivery('o1', [{ unit_price: '25000' }], { delivery_fee: 6000 })]);

    const card = store.ordersByType('domicilios')[0];
    expect(typeof card.totalLabel).toBe('string');
    expect(card.totalLabel).toBe(store.fmt(31000));
  });

  it('abrir "Domicilios" no dispara ninguna petición checkout-preview por tarjeta (Assumption spec.md)', () => {
    store.orders.set([
      delivery('o1', [{ unit_price: '25000' }], { delivery_fee: 6000 }),
      delivery('o2', [{ unit_price: '12000' }], { delivery_fee: 3000 }),
    ]);

    store.ordersByType('domicilios');

    http.expectNone((r) => r.url.includes('/checkout-preview'));
  });
});

/**
 * spec 073 (FR-001/FR-007a): `loadCheckoutPreview()` consume
 * `GET /orders/{id}/checkout-preview` con el mismo molde señal-loading-stale
 * que `loadSessionBill()`. El desglose autoritativo lo calcula el backend.
 */
describe('PosTerminalStore.loadCheckoutPreview — spec 073', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => Promise.resolve(), activePromotions: () => [], ready: () => false, now: () => new Date() } },
        { provide: RealtimeService, useValue: { status: () => 'closed', on: () => () => {}, connectStaff: () => {}, disconnect: () => {} } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('éxito → puebla checkoutPreview() y baja checkoutPreviewLoading()', async () => {
    const promise = store.loadCheckoutPreview('o1');
    expect(store.checkoutPreviewLoading()).toBe(true);

    http.expectOne(`${API}/orders/o1/checkout-preview`).flush({
      subtotal: '16000.00',
      discount: '8000.00',
      delivery_fee: '0.00',
      total: '8000.00',
      promotion_evaluated_at: '2026-09-02T19:59:03.120000Z',
    });
    await promise;

    expect(store.checkoutPreview()?.total).toBe('8000.00');
    expect(store.checkoutPreview()?.discount).toBe('8000.00');
    expect(store.checkoutPreviewLoading()).toBe(false);
  });

  it('error HTTP → checkoutPreview() queda en null y el error queda expuesto', async () => {
    const promise = store.loadCheckoutPreview('o1');
    http.expectOne(`${API}/orders/o1/checkout-preview`).flush(
      { detail: 'El pedido no está en un estado cobrable (status=pagada)' },
      { status: 409, statusText: 'Conflict' },
    );
    await promise;

    expect(store.checkoutPreview()).toBeNull();
    expect(store.checkoutPreviewLoading()).toBe(false);
    expect(store.error()).toContain('cobrable');
  });

  it('loadCheckoutPreview(null) limpia el preview sin pedir nada', async () => {
    await store.loadCheckoutPreview(null);
    expect(store.checkoutPreview()).toBeNull();
    http.expectNone(() => true);
  });

  it('un evento session.bill_changed marca checkoutPreviewStale sin recargar', async () => {
    // Preview ya cargado + pedido seleccionado.
    const p = store.loadCheckoutPreview('o1');
    http.expectOne(`${API}/orders/o1/checkout-preview`).flush({
      subtotal: '8000.00', discount: '0.00', delivery_fee: '0.00',
      total: '8000.00', promotion_evaluated_at: '2026-09-02T19:59:03Z',
    });
    await p;
    store.selectedOrderId.set('o1');

    // El store solo se suscribe a realtime dentro de start(); aquí se ejerce
    // la regla directamente: marcada, nunca recargada sola (mismo molde que
    // billStale).
    store.checkoutPreviewStale.set(true);

    expect(store.checkoutPreviewStale()).toBe(true);
    // No hubo segunda petición al marcar obsoleto.
    http.expectNone(`${API}/orders/o1/checkout-preview`);
  });
});

// ── spec 087, FR-015 (US9): adicionales visibles en el panel del pedido ────
describe('PosTerminalStore — adicionales del panel del pedido (spec 087, FR-015)', () => {
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
  });

  function pedidoConOpciones(options: DiningOrderItem['options']): DiningOrder {
    const base = order('o1', 'abierta', ['listo']);
    return {
      ...base,
      channel: 'POS',
      dining_table_id: 't1',
      items: (base.items ?? []).map((i) => ({ ...i, options })),
    } as DiningOrder;
  }

  it('un adicional guardado que ya no está en el menú se pinta "Nombre x1" con el name/group_name del backend (no " x1", no omitido)', () => {
    store.orders.set([
      pedidoConOpciones([
        { id: 'oi1', option_id: 'opt-fuera-del-menu', quantity: 1, name: 'Queso extra', group_name: 'Toppings' },
      ]),
    ]);
    store.selectedTableId.set('t1');

    const options = store.ordersView()[0].items[0].options;

    expect(options).toEqual([{ groupLabel: 'Toppings', text: 'Queso extra x1' }]);
  });

  it('un adicional guardado sin nombre en el menú ni en el backend se omite (nunca un fragmento " x1")', () => {
    store.orders.set([
      pedidoConOpciones([{ id: 'oi1', option_id: 'opt-desconocida', quantity: 1 }]),
    ]);
    store.selectedTableId.set('t1');

    expect(store.ordersView()[0].items[0].options).toEqual([]);
  });

  it('un borrador con "Queso extra" x1 y "Choco-chips" x2 se pinta "Queso extra x1" y "Choco-chips x2"', () => {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Cono' } as never,
      variant: { id: 'v1', price: 8000 } as never,
      options: [
        { option: { id: 'o-queso', name: 'Queso extra' } as never, quantity: 1, groupName: 'Toppings' },
        { option: { id: 'o-choco', name: 'Choco-chips' } as never, quantity: 2, groupName: 'Toppings' },
      ],
      quantity: 1,
      notes: null,
    });

    const options = store.cartView()[0].options;

    expect(options.map((o) => o.text)).toEqual(['Queso extra x1', 'Choco-chips x2']);
    expect(options.every((o) => o.groupLabel === 'Toppings')).toBe(true);
  });

  it('un ítem sin opciones trae `options` vacío (el panel no pinta contenedor)', () => {
    store.orders.set([pedidoConOpciones([])]);
    store.selectedTableId.set('t1');

    expect(store.ordersView()[0].items[0].options).toEqual([]);
  });
});

// ── spec 087, FR-016 (US10): TOTAL ORDEN sobre el conjunto vigente completo ──
describe('PosTerminalStore.loadDraftPreview — conjunto vigente completo (spec 087, FR-016)', () => {
  let store: PosTerminalStore;
  let http: HttpTestingController;
  const URL = `${API}/orders/draft-preview`;

  const preview = (total: string) => ({
    subtotal: total, discount: '0.00', delivery_fee: '0.00', total,
    promotion_evaluated_at: '2026-09-29T10:00:00Z',
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  function seleccionarPedidoConItemsGuardados(): void {
    const base = order('o1', 'abierta', ['listo', 'anulado', 'listo']);
    store.orders.set([
      {
        ...base,
        channel: 'POS',
        dining_table_id: 't1',
        items: [
          { ...base.items![0], product_variant_id: 'v-guardado', quantity: 2,
            options: [{ id: 'oi1', option_id: 'opt-1', quantity: 3 }] },
          { ...base.items![1], product_variant_id: 'v-anulado', quantity: 1 },
          { ...base.items![2], product_variant_id: 'v-combo', quantity: 1, combo_id: 'combo-1' },
        ],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
  }

  function agregarBorrador(variantId = 'v-nuevo'): void {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Cono' } as never,
      variant: { id: variantId, price: 8000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
  }

  it('manda los ítems guardados vigentes (con sus opciones) junto al borrador, sin anulados ni combos', async () => {
    seleccionarPedidoConItemsGuardados();
    agregarBorrador();

    const p = store.loadDraftPreview();
    const req = http.expectOne(URL);
    req.flush(preview('24000.00'));
    await p;

    expect(req.request.body.items).toEqual([
      { product_variant_id: 'v-guardado', quantity: 2, options: [{ option_id: 'opt-1', quantity: 3 }] },
      { product_variant_id: 'v-nuevo', quantity: 1, options: [] },
    ]);
    expect(store.draftPreview()?.total).toBe('24000.00');
  });

  it('con ítems guardados y el borrador vacío, sigue consultando el endpoint (antes salía con draftPreview = null)', async () => {
    seleccionarPedidoConItemsGuardados();

    const p = store.loadDraftPreview();
    const req = http.expectOne(URL);
    req.flush(preview('16000.00'));
    await p;

    expect(req.request.body.items).toEqual([
      { product_variant_id: 'v-guardado', quantity: 2, options: [{ option_id: 'opt-1', quantity: 3 }] },
    ]);
    expect(store.draftPreview()?.total).toBe('16000.00');
  });

  it('dos llamadas solapadas: si la primera responde después, prevalece la segunda', async () => {
    agregarBorrador();
    const primera = store.loadDraftPreview();
    const req1 = http.expectOne(URL);
    agregarBorrador('v-otro');
    const segunda = store.loadDraftPreview();
    const req2 = http.expectOne(URL);

    req2.flush(preview('200.00'));
    await segunda;
    req1.flush(preview('100.00'));
    await primera;

    expect(store.draftPreview()?.total).toBe('200.00');
    expect(store.draftPreviewLoading()).toBe(false);
  });

  it('una respuesta obsoleta no apaga el indicador de carga de la llamada más reciente ni la pisa con un error', async () => {
    agregarBorrador();
    const primera = store.loadDraftPreview();
    const req1 = http.expectOne(URL);
    agregarBorrador('v-otro');
    const segunda = store.loadDraftPreview();
    const req2 = http.expectOne(URL);

    req1.flush({ detail: 'boom' }, { status: 500, statusText: 'Error' });
    await primera;

    expect(store.draftPreviewLoading()).toBe(true);
    expect(store.draftPreviewError()).toBe(false);

    req2.flush(preview('200.00'));
    await segunda;
    expect(store.draftPreview()?.total).toBe('200.00');
    expect(store.draftPreviewLoading()).toBe(false);
  });

  it('sin ningún ítem vigente, draftPreview queda null y una respuesta pendiente no reaparece después', async () => {
    agregarBorrador();
    const pendiente = store.loadDraftPreview();
    const req = http.expectOne(URL);

    store.draftLines.set([]);
    await store.loadDraftPreview();
    http.expectNone(URL);

    req.flush(preview('8000.00'));
    await pendiente;

    expect(store.draftPreview()).toBeNull();
    expect(store.draftPreviewLoading()).toBe(false);
  });
});


/**
 * spec 089 (A-96, contracts/pos-total-immediate.md §2/§2b): al agregar o quitar un producto de una
 * orden abierta, el total del panel de cobro se actualiza AL INSTANTE con un estimado local
 * (último total confirmado ± las líneas tocadas) que el servidor confirma después, sin ningún
 * diálogo. Solo la cifra confirmada se cobra. Un fallo revierte al total confirmado y nombra el
 * producto agotado.
 */
describe('PosTerminalStore — total inmediato al guardar y quitar (spec 089, A-96)', () => {
  let store: PosTerminalStore;
  let api: DiningSessionService;
  let toast: ToastService;
  let confirm: ConfirmService;

  const preview = (total: string, subtotal = total): CheckoutPreview =>
    ({ subtotal, discount: '0', delivery_fee: '0', total, promotion_evaluated_at: '2026-09-30T10:00:00Z' }) as CheckoutPreview;

  const pos = (items: Partial<DiningOrderItem>[] = []): DiningOrder =>
    ({
      id: 'o1', channel: 'POS', status: 'abierta', version: 1, created_at: '2026-09-30T10:00:00',
      items: items.map((it, i) => ({
        id: `i${i}`, product_variant_id: 'v1', quantity: 1, unit_price: '20000', estado_cocina: 'pendiente', ...it,
      })),
    }) as DiningOrder;

  /** Promesa controlable, para observar el estado MIENTRAS el servidor responde. */
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const gaseosa = (unit = 5000, quantity = 1) => ({
    product: { id: 'p2', name: 'Gaseosa' } as never,
    variant: { id: 'v2', price: unit, option_groups: [] } as never,
    options: [],
    quantity,
    notes: null,
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    store = TestBed.inject(PosTerminalStore);
    api = TestBed.inject(DiningSessionService);
    toast = TestBed.inject(ToastService);
    confirm = TestBed.inject(ConfirmService);
    vi.spyOn(store, 'reload').mockResolvedValue();
    store.orders.set([pos([{}])]);
    store.selectedOrderId.set('o1');
    store.checkoutPreview.set(preview('20000'));
  });

  it('saveOrder publica el estimado ANTES del primer POST: $20.000 + $5.000 = $25.000, sin diálogo', async () => {
    const post = deferred<DiningOrder>();
    vi.spyOn(api, 'addOrderItems').mockReturnValue(post.promise);
    vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('25000'));
    store.addDraftFromSelection(gaseosa());

    const saving = store.saveOrder();

    // Síncrono: el estimado ya está publicado y el servidor todavía no respondió.
    expect(store.checkoutPreviewEstimate()).toEqual({ subtotal: 25000, total: 25000 });
    expect(confirm.state()).toBeNull();

    post.resolve(pos([{}, {}]));
    await saving;

    expect(store.checkoutPreviewEstimate()).toBeNull();
    expect(store.checkoutPreview()?.total).toBe('25000');
    expect(confirm.state()).toBeNull();
  });

  it('el estimado se reemplaza por la cifra del servidor aunque difiera (promoción), sin diálogo', async () => {
    vi.spyOn(api, 'addOrderItems').mockResolvedValue(pos([{}, {}]));
    vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('24000', '25000'));
    store.addDraftFromSelection(gaseosa());

    await store.saveOrder();

    expect(store.checkoutPreview()?.total).toBe('24000');
    expect(store.checkoutPreviewEstimate()).toBeNull();
    expect(confirm.state()).toBeNull();
  });

  it('si el servidor rechaza el producto agotado, revierte al total confirmado y muestra el nombre del producto', async () => {
    const { HttpErrorResponse } = await import('@angular/common/http');
    vi.spyOn(api, 'addOrderItems').mockRejectedValue(
      new HttpErrorResponse({
        status: 400,
        error: { detail: { error: '«Gaseosa · Única» está agotado: falta Botella', producto: 'Gaseosa · Única', insumo: 'Botella' } },
      }),
    );
    const previewSpy = vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('20000'));
    store.addDraftFromSelection(gaseosa());

    const ok = await store.saveOrder();

    expect(ok).toBe(false);
    expect(store.checkoutPreviewEstimate()).toBeNull();
    expect(previewSpy).toHaveBeenCalledTimes(1); // se re-pide el confirmado real
    expect(store.checkoutPreview()?.total).toBe('20000');
    expect(toast.toasts().some((t) => t.kind === 'error' && t.text.includes('«Gaseosa · Única» está agotado'))).toBe(true);
  });

  it('un fallo a mitad de varias líneas no duplica las ya guardadas al reintentar', async () => {
    const { HttpErrorResponse } = await import('@angular/common/http');
    const add = vi.spyOn(api, 'addOrderItems')
      .mockResolvedValueOnce(pos([{}, {}]))
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 400, error: { detail: 'sin stock' } }));
    vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('25000'));
    store.addDraftFromSelection(gaseosa());
    store.addDraftFromSelection({ ...gaseosa(3000), variant: { id: 'v3', price: 3000, option_groups: [] } as never });
    expect(store.draftLines().length).toBe(2);

    await store.saveOrder();

    expect(add).toHaveBeenCalledTimes(2);
    // La primera ya es del pedido: en el borrador queda solo la que falló.
    expect(store.draftLines().length).toBe(1);
    expect(store.checkoutPreview()?.total).toBe('25000'); // refleja la línea que sí se guardó
  });

  it('servidor sin respuesta: no queda ningún estimado como si fuera confirmado y el panel cae a "Calculando el total…"', async () => {
    vi.spyOn(api, 'addOrderItems').mockRejectedValue(new Error('offline'));
    vi.spyOn(api, 'checkoutPreview').mockRejectedValue(new Error('offline'));
    store.addDraftFromSelection(gaseosa());

    await store.saveOrder();

    expect(store.checkoutPreviewEstimate()).toBeNull();
    expect(store.checkoutPreview()).toBeNull(); // Cobrar deshabilitado (FR-031)
  });

  it('tres altas seguidas suman una sola vez: cada guardado parte del último total confirmado', async () => {
    let total = 20000;
    vi.spyOn(api, 'addOrderItems').mockImplementation(async () => pos([{}]));
    vi.spyOn(api, 'checkoutPreview').mockImplementation(async () => preview(String(total)));

    for (const unit of [5000, 3000, 2000]) {
      store.addDraftFromSelection(gaseosa(unit));
      const saving = store.saveOrder();
      expect(store.checkoutPreviewEstimate()?.total).toBe(total + unit);
      total += unit;
      await saving;
      expect(store.checkoutPreview()?.total).toBe(String(total));
    }
    expect(store.checkoutPreview()?.total).toBe('30000');
  });

  it('un segundo guardado mientras hay uno en vuelo no arranca (serializa las altas)', async () => {
    const post = deferred<DiningOrder>();
    const add = vi.spyOn(api, 'addOrderItems').mockReturnValue(post.promise);
    vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('25000'));
    store.addDraftFromSelection(gaseosa());

    const first = store.saveOrder();
    const second = await store.saveOrder();

    expect(second).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);
    post.resolve(pos([{}, {}]));
    await first;
  });

  it('sin un total confirmado (panel sin cobro) no se publica ningún estimado', async () => {
    store.checkoutPreview.set(null);
    const post = deferred<DiningOrder>();
    vi.spyOn(api, 'addOrderItems').mockReturnValue(post.promise);
    const previewSpy = vi.spyOn(api, 'checkoutPreview');
    store.addDraftFromSelection(gaseosa());

    const saving = store.saveOrder();
    expect(store.checkoutPreviewEstimate()).toBeNull();
    post.resolve(pos([{}, {}]));
    await saving;

    expect(previewSpy).not.toHaveBeenCalled();
  });

  // ── §2b: quitar una línea ──────────────────────────────────────────────────

  it('anular una línea baja el total al instante y luego queda el confirmado (la confirmación "¿Anular este ítem?" se conserva)', async () => {
    store.orders.set([pos([{ id: 'i0', unit_price: '15000' }, { id: 'i1', unit_price: '5000' }])]);
    store.checkoutPreview.set(preview('20000'));
    const del = deferred<DiningOrder>();
    vi.spyOn(api, 'voidItem').mockReturnValue(del.promise);
    vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('15000'));

    const voiding = store.voidPersistedItem('i1');
    confirm.respond(true); // "¿Anular este ítem?" sigue existiendo: no es el aviso de total
    await Promise.resolve();
    await Promise.resolve();

    expect(store.checkoutPreviewEstimate()).toEqual({ subtotal: 15000, total: 15000 });

    del.resolve(pos([{ id: 'i0', unit_price: '15000' }]));
    await voiding;

    expect(store.checkoutPreviewEstimate()).toBeNull();
    expect(store.checkoutPreview()?.total).toBe('15000');
  });

  it('si anular falla, el total revierte al confirmado', async () => {
    const { HttpErrorResponse } = await import('@angular/common/http');
    store.orders.set([pos([{ id: 'i0', unit_price: '15000' }, { id: 'i1', unit_price: '5000' }])]);
    store.checkoutPreview.set(preview('20000'));
    vi.spyOn(api, 'voidItem').mockRejectedValue(new HttpErrorResponse({ status: 409, error: { detail: 'ya pagado' } }));
    vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('20000'));

    const voiding = store.voidPersistedItem('i1');
    confirm.respond(true);
    await voiding;

    expect(store.checkoutPreviewEstimate()).toBeNull();
    expect(store.checkoutPreview()?.total).toBe('20000');
  });

  it('el estimado de anular no baja de $0 y usa el total de la línea con adicionales', async () => {
    store.orders.set([pos([{ id: 'i1', unit_price: '15000', quantity: 2, addons_total: '3000' }])]);
    store.checkoutPreview.set(preview('30000')); // menos de lo que vale la línea (33.000)
    const del = deferred<DiningOrder>();
    vi.spyOn(api, 'voidItem').mockReturnValue(del.promise);
    vi.spyOn(api, 'checkoutPreview').mockResolvedValue(preview('0'));

    const voiding = store.voidPersistedItem('i1');
    confirm.respond(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.checkoutPreviewEstimate()?.total).toBe(0);

    del.resolve(pos([]));
    await voiding;
  });
});
