import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { TableSessionsComponent } from './table-sessions.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { DiningOrder } from '../interfaces/dining.interface';

/** spec 077 introdujo `AuthService → PushRegistrationService → SwPush` en el
 *  árbol de inyección de esta página; los TestBeds de este archivo no proveían
 *  `SwPush` y quedaron en `NG0201`. Ningún test de aquí ejercita push — basta
 *  con que el token resuelva (spec 078, decisión de implementación: stub local). */
const swPushStub = { provide: SwPush, useValue: { isEnabled: false } };

/** Spec 029, Historia 2: el atajo F4 (descuento manual) se retiró por
 *  completo — presionarlo ya no dispara ninguna acción. No se llama
 *  `fixture.detectChanges()` a propósito: evita `ngOnInit()`/`store.init()`
 *  (que dispara varias peticiones HTTP no relacionadas con este atajo) — se
 *  ejercita `onKey()` directamente sobre la instancia del componente. */
describe('TableSessionsComponent — atajo F4 retirado (spec 029)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
  });

  it('F4 no produce ningún efecto observable', () => {
    const event = new KeyboardEvent('keydown', { key: 'F4', cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    expect(() => fixture.componentInstance.onKey(event)).not.toThrow();
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});

/** Spec 029, Historia 4 (FR-001): el diálogo de éxito ya no imprime el caso
 *  de un solo comprobante — duplicaba "Imprimir Factura" de la barra
 *  lateral. El caso de cuenta dividida (varios comprobantes) sí se
 *  conserva. `store.init()` se anula (`vi.spyOn`) para poder llamar
 *  `fixture.detectChanges()` y renderizar el diálogo sin disparar las
 *  peticiones HTTP de `ngOnInit`, ajenas a lo que prueba este bloque.
 *
 *  `TableSessionsComponent` declara `providers: [PosTerminalStore]` en su
 *  propio `@Component` (instancia aislada por componente, no la del
 *  `TestBed`) — hay que tomar el store desde `fixture.componentInstance`,
 *  no desde `TestBed.inject`, o el mock de `init()` queda sobre una
 *  instancia distinta a la que usa el componente. */
describe('TableSessionsComponent — diálogo de éxito sin botón duplicado (spec 029)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const printButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).filter((b) =>
      (b as HTMLButtonElement).textContent?.includes('Imprimir'),
    ) as HTMLButtonElement[];

  it('un solo comprobante: no ofrece ningún botón de impresión en el diálogo', () => {
    store.successOpen.set(true);
    store.lastSale.set({ total: 10000, customer: 'Consumidor Final' });
    store.lastReceipts.set([{ saleId: 's1', customerName: null, total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number]]);
    fixture.detectChanges();

    expect(printButtons()).toHaveLength(0);
  });

  it('cuenta dividida: conserva "Imprimir todos" y el botón por comensal', () => {
    store.successOpen.set(true);
    store.lastSale.set({ total: 20000, customer: 'Mostrador' });
    store.lastReceipts.set([
      { saleId: 's1', customerName: 'Ana', total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number],
      { saleId: 's2', customerName: 'Beto', total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number],
    ]);
    fixture.detectChanges();

    const textos = printButtons().map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(textos.some((t) => t?.endsWith('Imprimir todos'))).toBe(true);
    expect(textos.filter((t) => t?.endsWith('Imprimir') && !t.endsWith('Imprimir todos'))).toHaveLength(2);
  });

  it('los botones de imprimir ya no usan el emoji 🧾 (spec 082)', () => {
    store.successOpen.set(true);
    store.lastSale.set({ total: 20000, customer: 'Mostrador' });
    store.lastReceipts.set([
      { saleId: 's1', customerName: 'Ana', total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number],
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).not.toContain('🧾');
    expect(el.textContent).not.toContain('✅');
    const dialogo = el.querySelector('.fixed.inset-0')!;
    const icon = dialogo.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('check_circle');
  });
});

/**
 * Ajuste posterior a spec 036: F3 ("+ Crear Orden Manual") ya no llama a
 * `store.startManualOrder()` (que abría el catálogo embebido) — navega a la
 * vista dedicada `manual-order-page.component.ts`. No se llama
 * `fixture.detectChanges()` a propósito (mismo motivo que el bloque F4 de
 * arriba): evita `ngOnInit()`/`store.init()`.
 */
describe('TableSessionsComponent — atajo F3 navega a la vista de armado de pedido (ajuste posterior)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    router = TestBed.inject(Router);
  });

  it('con una mesa seleccionada, F3 navega a la vista dedicada', () => {
    fixture.componentInstance.store.selectedTableId.set('t1');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const event = new KeyboardEvent('keydown', { key: 'F3', cancelable: true });
    fixture.componentInstance.onKey(event);

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });

  it('sin mesa seleccionada, F3 no navega', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const event = new KeyboardEvent('keydown', { key: 'F3', cancelable: true });
    fixture.componentInstance.onKey(event);

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

/**
 * Spec 048: cuando la mesa tiene a la vez un pago pendiente de confirmar y
 * un pedido pagado/activo, el encabezado del panel central ofrece dos
 * pestañas para alternar entre ambos, en vez de mostrar solo el pago
 * pendiente (que dejaba el pedido pagado inalcanzable).
 */
/**
 * Hotfix posterior (a pedido del usuario): ya no hay pestañas para alternar
 * entre "Pagos por confirmar" y "Pedido de la mesa" -- ambos bloques
 * (app-pos-order-panel + app-pos-checkout-panel) se ven siempre juntos, sin
 * reemplazarse entre sí. Con un pago QR pendiente Y un pedido activo a la
 * vez (spec 048), el pedido activo se ve como siempre (app-pos-order-panel
 * cae a `selectedOrder()`, que sigue siendo ese) y el pago pendiente se ve
 * ADEMÁS, apilado arriba del cobro normal dentro de app-pos-checkout-panel
 * (`app-payment-attempt-review-panel`) -- ver el describe de más abajo para
 * el caso de sólo un pago pendiente, sin ningún pedido activo.
 */
describe('TableSessionsComponent — pago pendiente y pedido pagado a la vez, sin pestañas (spec 048; hotfix posterior)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const pagadaOrder: DiningOrder = {
    id: 'o1',
    channel: 'POS',
    status: 'pagada',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-28T10:00:00',
    paid: true,
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'listo' }],
  } as DiningOrder;

  const pendienteOrder: DiningOrder = {
    id: 'o2',
    channel: 'QR_MENU',
    status: 'recibida',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-28T10:05:00',
    items: [],
  } as DiningOrder;

  it('con ambos tipos de pedido en la mesa, al seleccionar la pestaña del pago pendiente se ven los dos bloques juntos (sin pestañas de vista)', () => {
    // A pedido del usuario: la tarjeta de confirmación ya no se ve siempre
    // que la mesa tenga algún pago pendiente -- solo cuando ESE pedido es el
    // seleccionado (su pestaña "Pedido N"), aquí simulada seteando
    // `selectedOrderId` directo en vez de hacer clic en la pestaña de verdad.
    store.orders.set([pagadaOrder, pendienteOrder]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o2');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-pos-order-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-payment-attempt-review-panel')).toBeTruthy();
    // Ningún botón de pestaña "Pagos por confirmar"/"Pedido de la mesa".
    const botones = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(botones.some((b) => b.textContent?.includes('Pagos por confirmar'))).toBe(false);
  });

  it('con ambos tipos de pedido en la mesa, mientras el pedido pagado sigue seleccionado no se ve la tarjeta de confirmación del pago pendiente', () => {
    store.orders.set([pagadaOrder, pendienteOrder]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-pos-order-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-payment-attempt-review-panel')).toBeFalsy();
  });

  it('con solo un pedido pagado (sin nada pendiente), no aparece el panel de confirmación', () => {
    store.orders.set([pagadaOrder]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-pos-order-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-payment-attempt-review-panel')).toBeFalsy();
  });
});

/**
 * Rediseño responsive: en escritorio (breakpoint lg y superior) la grilla de
 * mesas y el panel de detalle conviven siempre lado a lado, igual que antes.
 * Por debajo de lg, jsdom no evalúa media queries -- se afirma sobre las
 * clases `hidden`/`flex` que decide `store.hasActiveSelection()`, que es lo
 * que realmente controla cuál de las dos columnas se ve en cada tamaño.
 */
describe('TableSessionsComponent — colapso móvil de la grilla de mesas y el panel de detalle', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const mesasColumn = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="mesas-column"]');
  const detailColumn = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="detail-column"]');
  // La utilidad `hidden` se busca como clase propia, no como subcadena --
  // ambas tarjetas también llevan `overflow-hidden` (mockup: esquinas
  // redondeadas recortan el contenido), que contiene la subcadena "hidden"
  // pero no es la clase de visibilidad que decide store.hasActiveSelection().
  const hasHiddenClass = (el: HTMLElement): boolean => el.classList.contains('hidden');

  it('sin selección: la columna de mesas queda visible y la de detalle oculta', () => {
    fixture.detectChanges();

    expect(hasHiddenClass(mesasColumn())).toBe(false);
    expect(hasHiddenClass(detailColumn())).toBe(true);
  });

  it('con una mesa seleccionada (con pedido en curso): la columna de mesas se oculta EN CUALQUIER ANCHO (no solo por debajo de lg -- a pedido del usuario, la de detalle pasa a ocupar todo el espacio también en tablet/desktop) y la de detalle queda visible', () => {
    // t1 sin pedidos caería en el estado "mesa-libre", que ya no muestra la
    // tarjeta de detalle en absoluto (ver el describe de más abajo) -- para
    // probar el colapso genérico hace falta una mesa con contenido real.
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'recibida',
        version: 1,
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(hasHiddenClass(mesasColumn())).toBe(true);
    expect(hasHiddenClass(detailColumn())).toBe(false);
    // Ninguna clase con prefijo lg: -- la ocultación/el ancho completo ya no
    // dependen del breakpoint (antes `hidden lg:flex` / `flex-1 lg:flex-1`
    // dejaba las dos tarjetas a medias desde lg).
    expect(mesasColumn().className).not.toMatch(/\blg:/);
    expect(detailColumn().className).not.toMatch(/\blg:/);
  });

  it('el botón de volver de página se ve en cualquier ancho, no solo por debajo de lg (la tarjeta de mesas se oculta a la vez en todos los anchos)', () => {
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'recibida',
        version: 1,
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const backButton = fixture.nativeElement.querySelector('[data-testid="page-back-button"]');
    expect(backButton).not.toBeNull();
    const wrapper = backButton!.parentElement as HTMLElement;
    expect(wrapper.className).not.toMatch(/\blg:hidden\b/);
  });

  it('bugfix: el CTA "+ Crear pedido nuevo" de la sub-barra sigue visible con una mesa/pedido seleccionado', () => {
    // Antes el botón vivía dentro de un `@if (!showingDetail())`, así que
    // desaparecía justo al seleccionar una mesa con pedido en curso -- se
    // reporta como bug porque el cajero pierde el acceso al CTA fijo
    // mientras trabaja sobre una mesa ya abierta.
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'recibida',
        version: 1,
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(hasHiddenClass(detailColumn())).toBe(false);
    const cta = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    );
    expect(cta).toBeTruthy();
  });

  it('el botón de volver de página llama a store.cancelSelection(), único para los 3 estados del panel central', () => {
    // t1 sin pedidos caería en "mesa-libre", que ya no tiene panel de
    // detalle (ni botón de volver) propio -- se le da un pedido para probar
    // el botón en un estado que sí renderiza la tarjeta de detalle.
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'recibida',
        version: 1,
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    const cancelSpy = vi.spyOn(store, 'cancelSelection');

    const backButton = fixture.nativeElement.querySelector(
      '[data-testid="page-back-button"]',
    ) as HTMLButtonElement;
    expect(backButton).not.toBeNull();
    backButton.click();

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('sin selección, el botón de volver de página no se muestra', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="page-back-button"]')).toBeNull();
  });
});

/**
 * spec 078 (US3, FR-016–FR-021, FR-021a; research.md D4): la columna de detalle
 * pasa a una sola columna flex vertical acotada — se elimina el doble contenedor
 * de scroll anidado, no queda `overflow-y-auto` de página, y las secciones fijas
 * van `shrink-0` con una única región `flex-auto` (con un piso `min-h-[…]`,
 * hotfix posterior — ver comentario en el componente) que scrollea internamente.
 */
describe('TableSessionsComponent — columna de detalle: una sola columna flex acotada (spec 078, US3)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  const conPedido = (): DiningOrder =>
    ({
      id: 'o1',
      channel: 'POS',
      status: 'recibida',
      version: 1,
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-28T10:00:00',
      items: [],
    }) as DiningOrder;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const detailColumn = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="detail-column"]');

  it('el contenedor de la zona de contenido ya no lleva overflow-y-auto (scroll solo interno) (FR-018)', () => {
    fixture.detectChanges();

    const content = detailColumn().parentElement as HTMLElement; // el flex-row/col contenedor
    expect(content.className).toContain('overflow-hidden');
    expect(content.className).not.toContain('overflow-y-auto');
  });

  it('la tarjeta de detalle es una única columna flex min-h-0 min-w-0 overflow-hidden, con un único scroll envolvente para pedido + cuenta (hotfix posterior a FR-016, FR-019)', () => {
    store.orders.set([conPedido()]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const col = detailColumn();
    expect(col.className).toContain('min-h-0');
    expect(col.className).toContain('min-w-0');
    expect(col.className).toContain('overflow-hidden');
    // A pedido del usuario: app-pos-order-panel y app-pos-checkout-panel ya
    // no tienen cada uno su propia caja con scroll -- ahora comparten un
    // único <div overflow-y-auto> que scrollea el bloque completo de una
    // sola vez si no alcanza, en vez de recortar cada sección por separado.
    const scrollWrappers = Array.from(col.children).filter((c) =>
      (c as HTMLElement).className.includes('overflow-y-auto'),
    );
    expect(scrollWrappers).toHaveLength(1);
  });

  it('el botón de volver y la barra de pestañas/campana siguen shrink-0', () => {
    store.orders.set([conPedido()]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const back = fixture.nativeElement.querySelector('[data-testid="page-back-button"]')
      ?.parentElement as HTMLElement;
    expect(back.className).toContain('shrink-0');
  });

  it('el @switch del panel central y app-pos-checkout-panel viven juntos en una única región flex-1 min-h-0 overflow-y-auto (hotfix posterior)', () => {
    store.orders.set([conPedido()]);
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const col = detailColumn();
    // Antes eran dos hermanos negociando el alto disponible entre sí (uno
    // flex-auto con un piso mínimo, el otro flex-initial con techo y piso) --
    // cada uno con su propio scroll interno, recortando su contenido por
    // separado. Ahora ambos viven DENTRO de la misma región overflow-y-auto,
    // a su alto natural, con un único scroll para los dos juntos.
    const scrollRegion = Array.from(col.querySelectorAll('div')).find(
      (d) =>
        d.className.includes('flex-1') &&
        d.className.includes('min-h-0') &&
        d.className.includes('overflow-y-auto') &&
        d.querySelector('app-pos-order-panel'),
    );
    expect(scrollRegion).toBeTruthy();
    expect(scrollRegion?.querySelector('app-pos-checkout-panel')).not.toBeNull();
  });

  it('una mesa con solo un pago QR pendiente muestra el pedido (de sólo lectura) y su confirmación juntos, en el mismo scroll único de la columna (FR-017, FR-021a; hotfix posterior)', () => {
    // Mesa con un pago QR pendiente y nada más -- a pedido del usuario, ya
    // es un pedido "seleccionado" como cualquier otro (`selectTable()` lo
    // auto-selecciona desde `tableOrders()`, que sí lo incluye, a diferencia
    // de `ordersOfTable()`). Este test setea `selectedOrderId` directo (en
    // vez de llamar `selectTable()` de verdad) para no mockear
    // `GET /table-sessions` -- mismo motivo que el resto del archivo.
    store.orders.set([
      {
        ...conPedido(),
        id: 'oq',
        channel: 'QR_MENU',
        status: 'recibida',
        payment_status: 'pendiente_validacion',
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('oq');
    fixture.detectChanges();

    expect(store.selectedOrder()?.id).toBe('oq');
    expect(store.selectedOrderPending()).toBe(true);

    // A pedido del usuario: ya no hay una vista aparte "Pagos por
    // confirmar" que reemplace todo por app-payment-validation-block -- se
    // ve integrado en la vista normal, app-pos-order-panel (con los ítems
    // de sólo lectura) + app-pos-checkout-panel (con la confirmación),
    // ambos dentro del mismo ancestro con scroll único.
    const orderPanel = fixture.nativeElement.querySelector('app-pos-order-panel') as HTMLElement;
    const reviewPanel = fixture.nativeElement.querySelector(
      'app-payment-attempt-review-panel',
    ) as HTMLElement;
    expect(orderPanel).toBeTruthy();
    expect(reviewPanel).toBeTruthy();

    const scrollAncestor = reviewPanel.closest('.overflow-y-auto') as HTMLElement | null;
    expect(scrollAncestor).toBeTruthy();
    expect(scrollAncestor?.contains(orderPanel)).toBe(true);
  });
});

/**
 * Bugfix reportado sobre el rediseño: al seleccionar una mesa libre (sin
 * ningún pedido), el panel central informativo ("Mesa N está libre...") y el
 * "Pedido de mostrador" + botón del panel de cobro aparecían lado a lado
 * repitiendo el mismo mensaje ("crea un pedido nuevo") dos veces. A pedido
 * del usuario, ese estado dejó de tener panel propio por completo -- la
 * tarjeta de detalle no renderiza nada (ver el describe de más abajo) y el
 * único CTA vive en la sub-barra junto al resumen de mesas.
 */
describe('TableSessionsComponent — mesa libre seleccionada: un único panel, no dos mensajes repetidos', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  it('no renderiza el panel de cobro (app-pos-checkout-panel) para una mesa libre', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    expect(store.centralState()).toBe('mesa-libre');
    expect(fixture.nativeElement.querySelector('app-pos-checkout-panel')).toBeNull();
  });

  it('muestra un solo botón "+ Crear pedido nuevo", no el heading duplicado "Pedido de mostrador"', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Pedido de mostrador');
    const ctaButtons = Array.from(fixture.nativeElement.querySelectorAll('button')).filter((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    );
    expect(ctaButtons).toHaveLength(1);
  });

  it('el CTA único navega a la vista de armado de pedido para esa mesa', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const cta = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    ) as HTMLButtonElement;
    cta.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });
});

// ── A pedido del usuario: sin panel vacío, CTA en la sub-barra ─────────────
describe('TableSessionsComponent — sin selección: sin panel de detalle vacío, CTA en la sub-barra', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  it('sin selección, la tarjeta de detalle no renderiza ningún contenido (ni el estado vacío de antes)', () => {
    fixture.detectChanges();

    const detailColumn = fixture.nativeElement.querySelector('[data-testid="detail-column"]') as HTMLElement;
    expect(detailColumn.classList.contains('hidden')).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Sin selección');
    expect(fixture.nativeElement.textContent).not.toContain('Atajos de teclado');
  });

  it('sin selección, "Crear pedido nuevo" aparece en la sub-barra', () => {
    fixture.detectChanges();

    const cta = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    ) as HTMLButtonElement | undefined;
    expect(cta).toBeTruthy();
  });

  it('el CTA se queda en la sub-barra al seleccionar una mesa libre, ya que su panel de detalle tampoco se muestra', () => {
    fixture.detectChanges();
    const detailColumn = (): HTMLElement =>
      fixture.nativeElement.querySelector('[data-testid="detail-column"]');
    const findCta = (): HTMLButtonElement =>
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
      ) as HTMLButtonElement;

    // Sin selección: el único CTA vive en la sub-barra, fuera del detalle.
    expect(detailColumn().contains(findCta())).toBe(false);

    // Con t1 (libre, sin pedidos) seleccionada: cae en el estado "mesa-libre",
    // que ya no tiene panel de detalle propio -- el CTA sigue siendo el mismo
    // botón de la sub-barra (store.newOrderTableId() prioriza la mesa libre
    // seleccionada), y la tarjeta de detalle sigue sin mostrar nada.
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    expect(detailColumn().contains(findCta())).toBe(false);
    expect(detailColumn().classList.contains('hidden')).toBe(true);
  });
});

/**
 * spec 078 (US2, FR-007–FR-015): el CTA "Crear pedido nuevo" está fuera del
 * guard de pestaña — visible y habilitado en las tres pestañas y en los tres
 * anchos, con etiqueta de texto siempre. Desde "Domicilios" / "Para llevar"
 * navega a la ruta sin `:tableId` con `?tipo=`.
 */
describe('TableSessionsComponent — CTA "Crear pedido nuevo" en las 3 pestañas (spec 078, US2)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    router = TestBed.inject(Router);
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const cta = (): HTMLButtonElement =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    ) as HTMLButtonElement;

  for (const tab of ['mesas', 'domicilios', 'para-llevar'] as const) {
    it(`el CTA se renderiza con la pestaña en '${tab}' (sin tarjeta seleccionada) (FR-007)`, () => {
      store.setOrderTypeTab(tab);
      fixture.detectChanges();

      expect(cta()).toBeTruthy();
    });
  }

  it('la etiqueta "Crear pedido nuevo" es visible en los tres anchos — el <span> ya no lleva hidden sm:inline (FR-013, FR-015)', () => {
    fixture.detectChanges();

    const label = Array.from(cta().querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === 'Crear pedido nuevo',
    ) as HTMLSpanElement;
    expect(label).toBeTruthy();
    expect(label.className).not.toContain('hidden');
    expect(label.className).not.toContain('sm:inline');
  });

  it("pulsarlo con la pestaña en 'domicilios' navega a la ruta sin :tableId con tipo=domicilio", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();

    cta().click();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/dashboard/mesas-sesiones/orden-manual'],
      { queryParams: { tipo: 'domicilio' } },
    );
  });

  it("pulsarlo con la pestaña en 'para-llevar' navega con tipo=para-llevar", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();

    cta().click();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/dashboard/mesas-sesiones/orden-manual'],
      { queryParams: { tipo: 'para-llevar' } },
    );
  });

  it("pulsarlo con la pestaña en 'mesas' y una mesa libre seleccionada navega con :tableId, sin tipo (FR-010)", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('mesas');
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    cta().click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });

  it("el CTA solo se deshabilita por falta de mesa libre en la pestaña 'mesas' (FR-007, FR-012)", () => {
    store.setOrderTypeTab('mesas');
    fixture.detectChanges();
    expect(cta().disabled).toBe(true); // sin mesa libre seleccionada

    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();
    expect(cta().disabled).toBe(false); // Domicilio no exige mesa

    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();
    expect(cta().disabled).toBe(false);
  });
});

// spec 111 (FR-001/FR-008): al volver de "Nueva orden" con un pedido recién creado, esta pantalla
// debe activar la pestaña y seleccionar la mesa/pedido correctos — su store no es singleton y por
// defecto arranca en "mesas" sin nada seleccionado (causa raíz documentada en spec.md).
describe('TableSessionsComponent — restaura pestaña/mesa/pedido tras crear un pedido (spec 111)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  function createComponent(queryParams: Record<string, string>): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  }

  it('con ?pestana=para-llevar&pedido=o1 (sin mesa), activa "para-llevar" y selecciona el pedido vía selectStandaloneOrder', () => {
    createComponent({ pestana: 'para-llevar', pedido: 'o1' });
    const spy = vi.spyOn(store, 'selectStandaloneOrder');
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('para-llevar');
    expect(spy).toHaveBeenCalledWith('o1');
    expect(store.selectedOrderId()).toBe('o1');
  });

  it('con ?pestana=domicilios&pedido=o2, activa "domicilios" y selecciona el pedido', () => {
    createComponent({ pestana: 'domicilios', pedido: 'o2' });
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('domicilios');
    expect(store.selectedOrderId()).toBe('o2');
    expect(store.selectedTableId()).toBeNull();
  });

  it('con ?pestana=mesas&mesa=t1&pedido=o3, activa "mesas", selecciona la mesa y fija el pedido exacto', () => {
    createComponent({ pestana: 'mesas', mesa: 't1', pedido: 'o3' });
    const selectTableSpy = vi.spyOn(store, 'selectTable');
    const selectOrderSpy = vi.spyOn(store, 'selectOrder');
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('mesas');
    expect(selectTableSpy).toHaveBeenCalledWith('t1');
    expect(selectOrderSpy).toHaveBeenCalledWith('o3');
    expect(store.selectedTableId()).toBe('t1');
    expect(store.selectedOrderId()).toBe('o3');
  });

  it('sin ningún query param, no selecciona nada y queda en "mesas" (sin regresión)', () => {
    createComponent({});
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('mesas');
    expect(store.selectedTableId()).toBeNull();
    expect(store.selectedOrderId()).toBeNull();
  });

  it('con un `pestana` inválido, lo ignora y queda en "mesas" (defensivo)', () => {
    createComponent({ pestana: 'algo-invalido' });
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('mesas');
  });
});
