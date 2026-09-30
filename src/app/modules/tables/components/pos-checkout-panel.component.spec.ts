import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PosCheckoutPanelComponent } from './pos-checkout-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { CashService } from '../../cash-register/services/cash.service';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { DiningOrder } from '../interfaces/dining.interface';
import { CashShift } from '../../cash-register/interfaces/cash.interface';
import { PaymentMethod, PaymentMethodCheckoutOption, Sale } from '../../sales/interfaces/sales.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';

const API = environment.apiBaseUrl;

/** Pedido de mostrador ya creado con `hold_for_payment` (T023), esperando
 *  cobro (T024/T025). */
function manualOrder(): DiningOrder {
  return {
    id: 'o1',
    channel: 'POS',
    status: 'recibida',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-20T10:00:00',
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'pendiente' }],
  } as DiningOrder;
}

const methods: PaymentMethod[] = [
  { id: 'pm-cash', catalog_id: null, name: 'Efectivo', type: 'cash', is_cash: true, active: true, is_complete: true },
  { id: 'pm-transfer', catalog_id: null, name: 'Datáfono', type: 'card', is_cash: false, active: true, is_complete: true },
];

/** Spec 032: lo que ve el checkout es el listado ya filtrado y sin
 * `payment_info` — mismo `id`/`name`/`is_cash` que `methods`, forma reducida. */
const checkoutOptions: PaymentMethodCheckoutOption[] = methods.map(
  ({ id, name, is_cash }) => ({ id, name, is_cash }),
);

/** Feature 028, T024/T026/T032/T033/T035: panel de cobro editable de un
 *  pedido de mostrador (modo `terminal-pos`, canal `counter`/`waiter`). */
describe('PosCheckoutPanelComponent — modo terminal-pos', () => {
  let fixture: ComponentFixture<PosCheckoutPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;

  /**
   * spec 073, FR-001: el panel pide `GET /orders/{id}/checkout-preview` al
   * seleccionar el pedido de mostrador. Responde a cualquier petición de
   * preview pendiente con el desglose indicado (por defecto sin descuento,
   * total $10.000 — el subtotal de `manualOrder()`).
   */
  async function flushPreview(over: Partial<Record<string, string>> = {}): Promise<void> {
    for (const req of http.match((r) => r.url.endsWith('/checkout-preview'))) {
      req.flush({
        subtotal: '10000.00',
        discount: '0.00',
        delivery_fee: '0.00',
        total: '10000.00',
        promotion_evaluated_at: '2026-08-20T10:00:00Z',
        ...over,
      });
    }
    // El effect dispara `loadCheckoutPreview()` en fire-and-forget: `whenStable()`
    // no basta para su continuación async, hace falta un tick de macrotarea.
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosCheckoutPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosCheckoutPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);

    TestBed.inject(CashService).shift.set({
      id: 'shift-1',
      cash_register_id: 'r1',
      user_id: 'u1',
      opening_amount: '0',
      opened_at: '2026-08-20T08:00:00',
      status: 'open',
    } as CashShift);
    TestBed.inject(PaymentMethodService).methods.set(methods);
    TestBed.inject(PaymentMethodService).checkoutOptions.set(checkoutOptions);

    store.orders.set([manualOrder()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
    await fixture.whenStable(); // deja correr el effect que pide el preview
    await flushPreview();
  });

  afterEach(() => http.verify());

  const selects = (): HTMLSelectElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('select'));
  // `app-money-input` (spec 035) renderiza su <input> como
  // `type="text" inputmode="decimal"` — no `type="number"` (selector obsoleto
  // de antes de que ese componente reemplazara el campo de importe, spec 057
  // research.md Decisión 5). `inputmode="decimal"` es exclusivo de ese
  // campo, así que sigue distinguiéndolo de "Facturar a nombre de" (también
  // `type="text"`, sin `inputmode`).
  const numberInputs = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[inputmode="decimal"]'));
  const textInputs = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[type="text"]'));

  async function fill(el: HTMLSelectElement | HTMLInputElement, value: string): Promise<void> {
    el.value = value;
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('el nombre de facturación va por defecto "Consumidor Final", en modo solo lectura (spec 058, FR-001)', () => {
    const billingInput = textInputs().find((i) => i.placeholder === 'Consumidor Final');
    expect(billingInput).toBeDefined();
    expect(billingInput!.value).toBe('Consumidor Final');
    expect(billingInput!.readOnly).toBe(true);
  });

  it('spec 058, FR-001/FR-002: el botón "editar" habilita el nombre de facturación, y vuelve a solo lectura al perder foco', async () => {
    const editButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).title === 'Editar nombre de facturación',
    ) as HTMLButtonElement;
    expect(editButton).toBeDefined();

    const billingInput = () => textInputs().find((i) => i.placeholder === 'Consumidor Final')!;
    expect(billingInput().readOnly).toBe(true);

    editButton.click();
    fixture.detectChanges();
    expect(billingInput().readOnly).toBe(false);

    await fill(billingInput(), 'María Pérez');
    billingInput().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(billingInput().readOnly).toBe(true);
    expect(billingInput().value).toBe('María Pérez');
  });

  it('spec 058, research.md Decisión 2: el modo edición del nombre de facturación se reinicia al cambiar de pedido seleccionado', async () => {
    const editButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).title === 'Editar nombre de facturación',
    ) as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();
    expect(textInputs().find((i) => i.placeholder === 'Consumidor Final')!.readOnly).toBe(false);

    store.orders.set([manualOrder(), { ...manualOrder(), id: 'o2' }]);
    store.selectedOrderId.set('o2');
    fixture.detectChanges();
    await fixture.whenStable();
    await flushPreview(); // spec 073: la nueva selección repide el preview

    expect(textInputs().find((i) => i.placeholder === 'Consumidor Final')!.readOnly).toBe(true);
  });

  it('en efectivo muestra el vuelto calculado antes de cobrar (T026)', async () => {
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '15000');

    expect(fixture.nativeElement.textContent).toContain('Vuelto');
    expect(fixture.nativeElement.textContent).toContain('5.000');
  });

  it('con datáfono/transferencia no hay ningún paso de comprobante ni revisión (T026)', async () => {
    await fill(selects()[0], 'pm-transfer');

    expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('comprobante');
    expect(fixture.nativeElement.textContent).not.toContain('Pendiente de revisión');
  });

  it('con datáfono/transferencia, el importe queda fijo en el total exacto y no se puede editar (spec 057, FR-001, FR-003)', async () => {
    await fill(selects()[0], 'pm-transfer');

    expect(numberInputs()[0].disabled).toBe(true);
    expect(numberInputs()[0].value).toBe('10.000');
  });

  it('al volver de datáfono a efectivo, el importe vuelve a ser editable (spec 057, FR-004, no regresión)', async () => {
    await fill(selects()[0], 'pm-transfer');
    expect(numberInputs()[0].disabled).toBe(true);

    await fill(selects()[0], 'pm-cash');
    expect(numberInputs()[0].disabled).toBe(false);
  });

  it('cobra, factura y envía a cocina con "checkout-and-send" (T025, texto de botón "Cobrar" spec 058 FR-004)', async () => {
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '10000');

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Cobrar',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    button.click();
    // spec 073, FR-007: `checkout()` repide el preview justo antes de someter.
    await new Promise((r) => setTimeout(r));
    await flushPreview(); // mismo total → sin reconfirmación
    await fixture.whenStable();

    const req = http.expectOne(`${API}/orders/o1/checkout-and-send`);
    expect(req.request.body.version).toBe(1);
    expect(req.request.body.cash_shift_id).toBe('shift-1');
    expect(req.request.body.billing_customer_name).toBe('Consumidor Final');
    req.flush({ id: 's1', total: '10000', customer_name: 'Consumidor Final', status: 'paid', sold_at: '2026-08-20T10:05:00', items: [], payments: [] } as unknown as Sale);
    await fixture.whenStable();
  });

  // El click real dispara `printReceiptHtml` (iframe + `window.print`), que
  // en jsdom deja un listener asíncrono colgado y hace que el runner de esta
  // suite (Angular + Vitest, sin soporte de `vi.mock` para imports relativos)
  // rompa el siguiente test al recomputar señales sobre un injector ya
  // destruido — por eso, igual que "Imprimir Pre-cuenta" (T032) aquí abajo,
  // este test solo comprueba la presencia del botón; la lógica real de
  // caché/red/toast (T033) se prueba sin pasar por el DOM ni por
  // `printReceiptHtml`, directamente sobre `PosTerminalStore.resolveSaleForOrder`
  // en `pos-terminal.store.spec.ts`.
  it('spec 058, FR-007: no ofrece "Imprimir Factura" mientras el cobro sigue pendiente, aunque ya haya cuenta de sesión', () => {
    const reprintButton = (): HTMLButtonElement | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Imprimir Factura'),
      ) as HTMLButtonElement | undefined;

    expect(reprintButton()).toBeUndefined(); // sin `sessionBill`, todavía no hay dónde anclarlo

    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    fixture.detectChanges();

    // El pedido sigue 'recibida' (cobro aún no efectuado): "Imprimir Factura" es una
    // acción post-cobro y no debe verse todavía, aunque ya exista `sessionBill`
    // (spec 058, FR-007 — endurece lo que probaba T033/spec 029 antes de este ajuste).
    expect(reprintButton()).toBeUndefined();
  });

  it('spec 046, FR-005/FR-006/SC-004: "Dividir la cuenta entre varias personas" ya no existe en el panel de mostrador', () => {
    // Sin sessionBill: rama "+ Crear pedido nuevo" / cobro editable sin cuenta todavía.
    expect(fixture.nativeElement.textContent).not.toContain('Dividir la cuenta entre varias personas');

    // Con sessionBill: hoy ahí vivía el botón, junto a "Liberar Mesa"/"Imprimir Factura".
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [
        { participant_id: 'p1', display_label: 'Ana', subtotal: '5000', items: [], discount: '0' },
        { participant_id: 'p2', display_label: 'Luis', subtotal: '5000', items: [], discount: '0' },
      ],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Dividir la cuenta entre varias personas');
  });

  it('spec 046, FR-001/SC-001: "Liberar Mesa" no se muestra mientras la mesa tiene un pago pendiente de confirmar', () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    // Pedido QR 'recibida' en la misma mesa: pone a centralState() en 'validar-pago'.
    // 'o1' (el pedido propio de este panel, ya seleccionado en el beforeEach)
    // sigue siendo el seleccionado -- 'o2' no lo está, así que su tarjeta de
    // revisión no se renderiza aquí (solo se ve al entrar puntualmente a su
    // pestaña), pero "Liberar Mesa" igual se oculta por el mismo
    // `centralState() === 'validar-pago'`.
    store.orders.set([manualOrder(), { ...manualOrder(), id: 'o2', channel: 'QR_MENU', status: 'recibida' }]);
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
    );
    expect(button).toBeUndefined();
  });

  it('spec 058, FR-007: "Liberar Mesa" sigue oculto tras confirmarse el pago pendiente, mientras el pedido propio siga sin cobrar', () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    store.orders.set([manualOrder(), { ...manualOrder(), id: 'o2', channel: 'QR_MENU', status: 'recibida' }]);
    fixture.detectChanges();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
      ),
    ).toBeUndefined();

    // Confirmar el pago pendiente: la orden QR ya no queda 'recibida' para esa mesa.
    store.orders.set([manualOrder()]);
    fixture.detectChanges();

    // 'o1' (el pedido propio de este panel) sigue 'recibida' -- el cobro sigue
    // pendiente, así que "Liberar Mesa" no reaparece todavía: la regla nueva de
    // spec 058 (FR-007) es más estricta que la de spec 046, que solo miraba si
    // había OTRO pago QR pendiente de confirmar en la mesa.
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
    );
    expect(button).toBeUndefined();
  });

  it('T032: ofrece "Imprimir Pre-cuenta" cuando hay cuenta de sesión', () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Imprimir Pre-cuenta'),
    );
    expect(button).toBeDefined();
  });

  // ── spec 078 (US3/US4, FR-025; research.md D5) ──────────────────────────────

  it('el panel apilado va min-w-0, sin scroll ni techo propios por debajo de lg (a pedido del usuario: un solo scroll para toda la columna); desde lg es su propia columna al 40% con scroll propio', () => {
    // Las clases viven en el HOST (`fixture.nativeElement` ES
    // <app-pos-checkout-panel>), no en un <div> del template -- ver el
    // comentario del `host: {}` en el componente sobre por qué un <div>
    // interno nunca participa en el flex del padre.
    const wrapper = fixture.nativeElement as HTMLElement;
    expect(wrapper.className).toContain('min-w-0');
    // Por debajo de lg no tiene scroll ni techo SIN prefijo -- antes tenía su
    // propia zona con overflow-y-auto y un techo (max-h-[…]), otra caja
    // interna recortando su contenido aparte del carrito. Ahora crece a su
    // alto natural; el scroll único vive en la columna de detalle
    // (table-sessions.component.ts).
    const classes = wrapper.className.split(/\s+/);
    expect(classes).not.toContain('overflow-y-auto');
    expect(classes.some((c) => /^max-h-\[/.test(c))).toBe(false);
    // Desde lg: columna aparte al 40% del ancho con su propio scroll (a
    // pedido del usuario, layout de dos columnas en desktop).
    expect(classes).toContain('lg:w-[40%]');
    expect(classes).toContain('lg:overflow-y-auto');
  });

  it('los botones de acción post-cobro quedan shrink-0', () => {
    store.sessionBill.set({
      table_session_id: 'ts1',
      dining_table_id: 't1',
      total: '10000',
      order_ids: ['o1'],
      split: [],
    });
    fixture.detectChanges();
    const printBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Imprimir Pre-cuenta'),
    ) as HTMLButtonElement | undefined;
    if (printBtn) {
      expect((printBtn.parentElement as HTMLElement).className).toContain('shrink-0');
    }
  });

  it('spec 029 hotfix #4: "Rechazar pedido" pide confirmación y cancela sin venta ni movimiento de caja', async () => {
    const confirm = TestBed.inject(ConfirmService);

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Rechazar pedido'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/o1/cancel`);
    expect(req.request.body).toEqual({ motivo: 'Rechazado desde terminal' });
    req.flush({ detail: 'boom' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
  });

  // ─── spec 073 (US1): el importe lo manda el backend (checkoutPreview) ─────────

  /** Fija el preview directamente en la señal (sin pasar por HTTP) — para
   *  aserciones de render puro. */
  function setPreview(subtotal: string, discount: string, total: string, deliveryFee = '0.00'): void {
    store.checkoutPreview.set({
      subtotal,
      discount,
      delivery_fee: deliveryFee,
      total,
      promotion_evaluated_at: '2026-09-02T19:59:00Z',
    });
    fixture.detectChanges();
  }

  const cobrarButton = (): HTMLButtonElement =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === 'Cobrar',
    ) as HTMLButtonElement;

  it('FR-004: muestra el desglose Subtotal $16.000 / Descuento −$8.000 / Total $8.000 (Scenario 1)', () => {
    setPreview('16000.00', '8000.00', '8000.00');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Subtotal');
    expect(text).toContain('16.000');
    expect(text).toContain('Descuento');
    expect(text).toContain('8.000');
    expect(text).toContain('Total');
  });

  it('FR-005: $8.000 en efectivo → sin faltante, vuelto $0, "Cobrar" habilitado (Scenario 2)', async () => {
    setPreview('16000.00', '8000.00', '8000.00');
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '8000');

    expect(fixture.nativeElement.textContent).not.toContain('Faltan');
    expect(cobrarButton().disabled).toBe(false);
  });

  it('FR-005: $10.000 en efectivo sobre un total de $8.000 → vuelto $2.000 (Scenario 3)', async () => {
    setPreview('16000.00', '8000.00', '8000.00');
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '10000');

    expect(fixture.nativeElement.textContent).toContain('Vuelto');
    expect(fixture.nativeElement.textContent).toContain('2.000');
  });

  it('FR-005: $5.000 sobre un total de $8.000 → "Faltan $3.000", "Cobrar" deshabilitado (Scenario 4)', async () => {
    setPreview('16000.00', '8000.00', '8000.00');
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '5000');

    expect(fixture.nativeElement.textContent).toContain('Faltan');
    expect(fixture.nativeElement.textContent).toContain('3.000');
    expect(cobrarButton().disabled).toBe(true);
  });

  it('FR-007a: mientras se calcula el total, muestra "Calculando" y "Cobrar" deshabilitado', async () => {
    store.checkoutPreview.set(null);
    store.checkoutPreviewLoading.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Calculando el total');
    expect(cobrarButton().disabled).toBe(true);
    // No hay campo de pago mientras no llegó el total (nunca un total provisional).
    expect(fixture.nativeElement.querySelector('app-payment-input')).toBeNull();

    store.checkoutPreviewLoading.set(false);
  });

  it('spec 089 (A-96, FR-027/FR-028): si el total cambió justo antes de cobrar, NO abre modal: avisa dentro del panel y no somete el pago; el segundo Cobrar cobra el importe visible', async () => {
    // Antes (spec 073, FR-007) esto abría el modal "El total cambió" y exigía confirmarlo.
    const confirm = TestBed.inject(ConfirmService);
    setPreview('16000.00', '8000.00', '8000.00');
    await fixture.whenStable();
    fixture.detectChanges();

    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '8000');

    cobrarButton().click();
    await new Promise((r) => setTimeout(r));
    // El re-chequeo del preview devuelve otro total (causa externa).
    await flushPreview({ subtotal: '16000.00', discount: '0.00', total: '16000.00' });
    await fixture.whenStable();
    fixture.detectChanges();

    // Sin diálogo, sin cobro, con aviso no bloqueante dentro del panel.
    expect(confirm.state()).toBeNull();
    http.expectNone(`${API}/orders/o1/checkout-and-send`);
    const aviso = fixture.nativeElement.querySelector('[data-testid="total-cambio-aviso"]') as HTMLElement;
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).toContain('El total cambió');
    expect(aviso.textContent).toContain('vuelve a pulsar Cobrar');
    expect(cobrarButton().textContent).toContain('Cobrar');
  });

  it('spec 089 (A-96, FR-026): mientras la cifra sea un estimado, Cobrar está deshabilitado y el panel dice "actualizando…"', async () => {
    setPreview('20000.00', '0.00', '20000.00');
    await fixture.whenStable();
    fixture.detectChanges();
    await fill(selects()[0], 'pm-cash');
    await fill(numberInputs()[0], '25000');
    expect(cobrarButton().disabled).toBe(false);

    // Se agregó una gaseosa de $5.000 y el servidor aún no confirma.
    store.checkoutPreviewEstimate.set({ subtotal: 25000, total: 25000 });
    fixture.detectChanges();

    expect(cobrarButton().disabled).toBe(true);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('25.000');
    expect(fixture.nativeElement.querySelector('[data-testid="total-actualizando"]')).toBeTruthy();

    // Llega la cifra confirmada: se limpia el estimado y Cobrar vuelve.
    store.checkoutPreviewEstimate.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="total-actualizando"]')).toBeNull();
  });

  it('spec 089 (A-96): Cobrar con un estimado en curso no llama al backend', async () => {
    setPreview('20000.00', '0.00', '20000.00');
    store.checkoutPreviewEstimate.set({ subtotal: 25000, total: 25000 });
    fixture.detectChanges();

    await fixture.componentInstance.checkout();

    http.expectNone(`${API}/orders/o1/checkout-preview`);
    http.expectNone(`${API}/orders/o1/checkout-and-send`);
  });

  // ─── spec 073 (US2): método no efectivo precargado al total real ─────────────

  it('FR-006 (US2 Scenario 1): con un método no efectivo, el importe se precarga al total con descuento ($8.000), no al pleno', async () => {
    setPreview('16000.00', '8000.00', '8000.00');

    await fill(selects()[0], 'pm-transfer');

    // `payment-input` precarga `this.total` = previewTotal() = 8000, y el campo
    // queda deshabilitado (no efectivo). Formateado como "8.000".
    expect(numberInputs()[0].disabled).toBe(true);
    expect(numberInputs()[0].value).toBe('8.000');
  });

  it('FR-001 (US2 Scenario 2): "Cobrar" con transferencia llama a checkout-and-send por $8.000', async () => {
    setPreview('16000.00', '8000.00', '8000.00');
    await fill(selects()[0], 'pm-transfer');

    cobrarButton().click();
    await new Promise((r) => setTimeout(r));
    await flushPreview({ subtotal: '16000.00', discount: '8000.00', total: '8000.00' });

    // (el resto del flujo de checkoutAndSend — recibo/reload — no se ejercita
    // aquí: TenantInfoService no está mockeado en este describe, igual que el
    // test "checkout-and-send (T025)" existente.)
    const req = http.expectOne(`${API}/orders/o1/checkout-and-send`);
    expect(req.request.body.payments[0].amount).toBe(8000);
    req.flush({ id: 's1', total: '8000', customer_name: 'Consumidor Final', status: 'paid', sold_at: '2026-08-20T10:05:00', items: [], payments: [] } as unknown as Sale);
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  });

  // ─── spec 073 (US3): para llevar / domicilio, con la fila Domicilio ──────────

  it('US3 Scenario 1: orden para llevar con promoción → total con descuento, sin fila Domicilio', () => {
    setPreview('16000.00', '8000.00', '8000.00'); // delivery_fee 0
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('8.000');
    expect(text).not.toContain('Domicilio');
  });

  it('US3 Scenario 2: domicilio con envío $5.000 sin promoción → fila "Domicilio" visible, total la incluye', () => {
    setPreview('10000.00', '0.00', '15000.00', '5000.00');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Domicilio');
    expect(text).toContain('5.000');
    expect(text).toContain('15.000'); // total incluye el domicilio
    expect(text).not.toContain('Descuento'); // sin promoción, sin fila
  });

  it('US3 Scenario 3: domicilio + promoción → Subtotal 16.000 / Descuento −8.000 / Domicilio 5.000 / Total 13.000', () => {
    setPreview('16000.00', '8000.00', '13000.00', '5000.00');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Descuento');
    expect(text).toContain('Domicilio');
    expect(text).toContain('16.000');
    expect(text).toContain('8.000');
    expect(text).toContain('5.000');
    expect(text).toContain('13.000');
  });
});

/**
 * Spec 029, hotfix #3: un pedido de mesero que ya se envió a cocina
 * (`status !== 'recibida'`) no se puede cobrar con checkout-and-send — el
 * backend lo rechaza con 409 ("Solo se cobra y envía pedidos en
 * 'recibida'"), dejándolo `abierta` para siempre sin factura. Debe cobrarse
 * cerrando la sesión de mesa (`app-session-bill-panel`, `readOnly=false`),
 * el mismo mecanismo que el modo `resumen` ya usa en solo lectura.
 */
describe('PosCheckoutPanelComponent — pedido ya en cocina, cobro por sesión de mesa', () => {
  let fixture: ComponentFixture<PosCheckoutPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let toast: ToastService;

  function abiertaOrder(estado: 'listo' | 'pendiente' = 'listo'): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      status: 'abierta',
      version: 1,
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-21T10:00:00',
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: estado }],
    } as DiningOrder;
  }

  const bill = {
    table_session_id: 'ts1',
    dining_table_id: 't1',
    total: '10000',
    order_ids: ['o1'],
    split: [{ participant_id: null, display_label: null, subtotal: '10000', discount: '0', items: [] }],
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosCheckoutPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosCheckoutPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);

    TestBed.inject(CashService).shift.set({
      id: 'shift-1',
      cash_register_id: 'r1',
      user_id: 'u1',
      opening_amount: '0',
      opened_at: '2026-08-20T08:00:00',
      status: 'open',
    } as CashShift);
    TestBed.inject(PaymentMethodService).methods.set(methods);
    TestBed.inject(PaymentMethodService).checkoutOptions.set(checkoutOptions);

    store.orders.set([abiertaOrder()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    store.sessionBill.set(bill as unknown as ReturnType<PosTerminalStore['sessionBill']>);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('muestra el panel de cobro por sesión ("Cobrar y cerrar mesa"), no el de checkout-and-send', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cobrar y cerrar mesa');
    expect(texto).not.toContain('Cobrar, Facturar y Enviar a Cocina');
  });

  it('spec 058, FR-008: "Imprimir Factura" y "Liberar Mesa" siguen apareciendo en el cobro por sesión de mesa, sin cambios', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Imprimir Factura');
    expect(texto).toContain('Liberar Mesa');
  });

  it('"Imprimir Factura" y "Liberar Mesa" ya no usan emoji ni SVG artesanal (spec 082)', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).not.toContain('🧾');
    expect(el.textContent).not.toContain('🔓');
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['receipt', 'lock_open']));
  });

  it('T035: "Liberar Mesa" pide la liberación y muestra el motivo del 409 si falla', async () => {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Liberar Mesa'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    const req = http.expectOne(`${API}/table-sessions/ts1/release`);
    req.flush({ detail: { error: 'Quedan ítems sin terminar en cocina' } }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();

    expect(toast.toasts().some((t) => t.kind === 'error' && t.text.includes('Quedan ítems sin terminar'))).toBe(
      true,
    );
  });

  it('spec 046, FR-005/FR-006/SC-004: no ofrece "Dividir la cuenta entre varias personas" en el cobro por sesión de mesa', () => {
    expect(fixture.nativeElement.textContent).not.toContain('Dividir la cuenta entre varias personas');
  });

  it('al cobrar, llama primero a ensureReadyToCharge (beforeCharge conectado) y luego cierra la sesión', async () => {
    const spy = vi.spyOn(store, 'ensureReadyToCharge').mockResolvedValue(true);

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'pm-cash';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    input.value = '10000';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Cobrar y cerrar mesa'),
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    button.click();
    await Promise.resolve();
    expect(spy).toHaveBeenCalled();

    // Se prueba con un 409 (igual que "Liberar Mesa", T035 arriba) para
    // aislar la conexión beforeCharge → close() sin encadenar todo el
    // reload posterior a un cierre exitoso (`onCharged`), que no es lo que
    // este test verifica.
    const req = http.expectOne(`${API}/table-sessions/ts1/close`);
    expect(req.request.body.cash_shift_id).toBe('shift-1');
    req.flush({ detail: { error: 'Quedan ítems sin terminar en cocina' } }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
  });

  it('si ensureReadyToCharge devuelve false (cajero canceló), no cierra la sesión', async () => {
    vi.spyOn(store, 'ensureReadyToCharge').mockResolvedValue(false);

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'pm-cash';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    input.value = '10000';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Cobrar y cerrar mesa'),
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    http.expectNone(`${API}/table-sessions/ts1/close`);
  });

  it('spec 029 hotfix #4: también ofrece "Rechazar pedido" junto al cobro por sesión de mesa', async () => {
    const confirm = TestBed.inject(ConfirmService);

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Rechazar pedido'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/orders/o1/cancel`);
    expect(req.request.body).toEqual({ motivo: 'Rechazado desde terminal' });
    req.flush({ detail: 'boom' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
  });

  it('spec 029 hotfix #7: un pedido ya pagado (paid) pasa a solo lectura, sin dividir cuenta, método de pago ni "Rechazar pedido"', () => {
    store.orders.set([{ ...abiertaOrder(), paid: true }]);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).not.toContain('nada que cobrar aquí');
    expect(texto).not.toContain('Dividir la cuenta entre varias personas');
    expect(texto).not.toContain('Cuenta única');
    expect(texto).not.toContain('Método de pago');

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Rechazar pedido'),
    );
    expect(button).toBeUndefined();
  });
});

/**
 * Spec 059, Historia 3 — test de regresión: confirma el hallazgo hecho
 * durante `/speckit-tasks` de que este componente **no necesita ningún
 * cambio de código** para cobrar un pedido de Domicilio/Para llevar sin
 * mesa. `sidebarMode()`, `showSessionCharge()` y `checkout()` ya operan
 * exclusivamente sobre `store.selectedOrder()`/`store.cashShiftId()`, sin
 * ninguna dependencia de `selectedTableId()` — si un cambio futuro
 * introdujera una dependencia oculta de mesa aquí, este test lo detectaría.
 */
describe('PosCheckoutPanelComponent — pedido sin mesa (spec 059, Historia 3)', () => {
  let fixture: ComponentFixture<PosCheckoutPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  function standaloneOrder(): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      order_type: 'TAKEAWAY',
      status: 'recibida',
      version: 1,
      dining_table_id: null,
      customer_name: 'María G.',
      created_at: '2026-08-20T10:00:00',
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'pendiente' }],
    } as DiningOrder;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosCheckoutPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        // Necesario para llegar hasta el final de checkoutAndSend():
        // receiptContext() lee TenantInfoService, que en la app real se
        // inicializa en el arranque (provideTenantInitializer()) — sin
        // mockearlo aquí, TenantContextService lanza "read before
        // initialization" (gap de infraestructura de test preexistente, no
        // introducido por spec 059: ningún otro test de este archivo llega a
        // ejercitar receiptContext() con una aserción sobre store.error()).
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null, receiptMessage: () => 'Gracias' } },
      ],
    });

    fixture = TestBed.createComponent(PosCheckoutPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);

    TestBed.inject(CashService).shift.set({
      id: 'shift-1',
      cash_register_id: 'r1',
      user_id: 'u1',
      opening_amount: '0',
      opened_at: '2026-08-20T08:00:00',
      status: 'open',
    } as CashShift);
    TestBed.inject(PaymentMethodService).methods.set(methods);
    TestBed.inject(PaymentMethodService).checkoutOptions.set(checkoutOptions);

    // Selección "sin mesa" — mismo estado que deja selectStandaloneOrder().
    store.orders.set([standaloneOrder()]);
    store.selectedTableId.set(null);
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
    await fixture.whenStable();
    await flushPreviewH3();
  });

  /** spec 073: responde el `checkout-preview` del pedido sin mesa. */
  async function flushPreviewH3(over: Partial<Record<string, string>> = {}): Promise<void> {
    for (const req of http.match((r) => r.url.endsWith('/checkout-preview'))) {
      req.flush({
        subtotal: '10000.00',
        discount: '0.00',
        delivery_fee: '0.00',
        total: '10000.00',
        promotion_evaluated_at: '2026-08-20T10:00:00Z',
        ...over,
      });
    }
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('muestra el panel de cobro editable ("Cobrar pedido"), no el de resumen de solo lectura ni el de sesión', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Cobrar pedido');
    expect(text).not.toContain('Cobrar y cerrar mesa');
  });

  it('cobra un pedido sin mesa con el mismo checkout-and-send ya implementado, sin cambios', async () => {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'pm-cash';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    const amountInput = fixture.nativeElement.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    amountInput.value = '10000';
    amountInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === 'Cobrar',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    button.click();
    // spec 073, FR-007: re-chequeo del preview antes de someter (mismo total).
    await new Promise((r) => setTimeout(r));
    await flushPreviewH3();

    const req = http.expectOne(`${API}/orders/o1/checkout-and-send`);
    expect(req.request.body.cash_shift_id).toBe('shift-1');
    req.flush({
      id: 's1',
      total: '10000',
      customer_name: 'María G.',
      status: 'paid',
      sold_at: '2026-08-20T10:05:00',
      items: [],
      payments: [],
    } as unknown as Sale);
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();

    // checkoutAndSend() termina en reload() (loadTables()+reloadOrders()) —
    // mismos dos GET ya existentes que cualquier cobro dispara hoy.
    http.expectOne(`${API}/orders/tables`).flush([]);
    http.expectOne((r) => r.url === `${API}/orders`).flush([]);
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();

    expect(store.error()).toBeNull();
  });
});
