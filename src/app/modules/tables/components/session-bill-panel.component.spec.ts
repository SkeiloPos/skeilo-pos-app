import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { SessionBillPanelComponent } from './session-bill-panel.component';
import { CloseSessionPayload, SessionBill } from '../interfaces/dining.interface';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';
import { emptyPaymentDraft } from '../services/payment-draft.util';

const API = environment.apiBaseUrl;

/** Cuenta de una mesa con un solo comensal: no se puede dividir. */
const bill: SessionBill = {
  table_session_id: 'ts1',
  dining_table_id: 't1',
  total: '12000',
  order_ids: ['o1'],
  split: [{ participant_id: 'p1', display_label: 'Ana', subtotal: '12000', items: [], discount: '0' }],
};

/** Dos comensales con consumo: habilita el modo dividido. */
const splitBill: SessionBill = {
  table_session_id: 'ts2',
  dining_table_id: 't2',
  total: '20000',
  order_ids: ['o2'],
  split: [
    { participant_id: 'p1', display_label: 'Ana', subtotal: '12000', items: [], discount: '0' },
    { participant_id: 'p2', display_label: 'Luis', subtotal: '8000', items: [], discount: '0' },
  ],
};

/** Dos comensales, uno con descuento aplicado. */
const billWithDiscount: SessionBill = {
  table_session_id: 'ts3',
  dining_table_id: 't3',
  total: '18000',
  order_ids: ['o3'],
  split: [
    { participant_id: 'p1', display_label: 'Ana', subtotal: '12000', items: [], discount: '2000' },
    { participant_id: 'p2', display_label: 'Luis', subtotal: '8000', items: [], discount: '0' },
  ],
};

const methods = [
  { id: 'pm1', name: 'Efectivo', type: 'cash', is_cash: true, active: true },
  { id: 'pm2', name: 'Tarjeta', type: 'card', is_cash: false, active: true },
] as PaymentMethod[];

describe('SessionBillPanelComponent', () => {
  let fixture: ComponentFixture<SessionBillPanelComponent>;
  let panel: SessionBillPanelComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SessionBillPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(SessionBillPanelComponent);
    panel = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    // `setInput` (y no asignar el campo) es lo que dispara `ngOnChanges`, que es
    // donde el panel toma la cuenta.
    setBill(bill);
    fixture.componentRef.setInput('methods', methods);
    fixture.componentRef.setInput('cashShiftId', 'shift-1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function setBill(value: SessionBill): void {
    fixture.componentRef.setInput('bill', value);
    fixture.detectChanges();
  }

  const selects = (): HTMLSelectElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('select'));

  // `app-money-input` (spec 035) renderiza su <input> como
  // `type="text" inputmode="decimal"` — no `type="number"` (selector
  // obsoleto de antes de que ese componente reemplazara el campo de
  // importe, spec 057 research.md Decisión 5).
  const amounts = (): HTMLInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input[inputmode="decimal"]'));

  const combineBox = (): HTMLInputElement | null =>
    fixture.nativeElement.querySelector('input[type="checkbox"]');

  const chargeButton = (): HTMLButtonElement =>
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cobrar'),
    )!;

  /** Escribe en un control real y espera al binding de ngModel. */
  async function fill(el: HTMLSelectElement | HTMLInputElement, value: string): Promise<void> {
    el.value = value;
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const chooseMethod = (methodId: string): Promise<void> => fill(selects()[0], methodId);

  /** Cobra y devuelve el cuerpo del `POST .../close`. */
  async function charge(): Promise<CloseSessionPayload> {
    const done = panel.charge();
    const req = http.expectOne(`${API}/table-sessions/ts1/close`);
    const body = req.request.body as CloseSessionPayload;
    req.flush({ table_session: {}, sale_ids: ['s1'] });
    await done;
    return body;
  }

  it('avisa cuando la mesa tiene consumo pero no hay sesión que cobrar', () => {
    fixture.componentRef.setInput('bill', null);
    fixture.componentRef.setInput('orphan', true);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    // Antes decía "Selecciona una mesa con consumo", que era falso y dejaba al
    // cajero sin saber por qué no puede cobrar.
    expect(texto).toContain('No se puede cobrar esta mesa');
    expect(texto).not.toContain('Selecciona una mesa con consumo');
  });

  it('no deja cobrar mientras no se elige método de pago', () => {
    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  // ── feature 028, T004/T009: modo `resumen` (pedido de canal `qr`) ────────
  describe('readOnly (T009 — el bug de origen)', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('readOnly', true);
      fixture.detectChanges();
    });

    it('no muestra el botón "Cobrar y cerrar mesa"', () => {
      const buttons = Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('button'),
      );
      expect(buttons.some((b) => b.textContent?.includes('Cobrar'))).toBe(false);
    });

    it('no muestra el selector de método de pago', () => {
      expect(fixture.nativeElement.querySelectorAll('select').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('input[inputmode="decimal"]').length).toBe(0);
    });

    it('sigue mostrando el "Total a cobrar" de toda la mesa (bugfix: título repetido sin contenido)', () => {
      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('Total a cobrar');
      expect(texto).toContain('12.000');
    });

    it('oculta "Subtotal mesa", "Total a cobrar" y el aviso de solo-lectura cuando no queda nada por cobrar', () => {
      setBill({ ...bill, total: '0', split: [{ ...bill.split[0], subtotal: '0', discount: '0' }] });

      const texto = fixture.nativeElement.textContent as string;
      expect(texto).not.toContain('Subtotal mesa');
      expect(texto).not.toContain('Total a cobrar');
      expect(texto).not.toContain('nada que cobrar aquí');
    });
  });

  it('habilita el cobro al elegir método en la cuenta única', async () => {
    await chooseMethod('pm2');

    expect(panel.ready()).toBe(true);
    expect(chargeButton().disabled).toBe(false);
  });

  it('olvida el pago al cambiar de mesa', async () => {
    await chooseMethod('pm2');
    expect(panel.ready()).toBe(true);

    setBill({ ...bill, table_session_id: 'ts9', dining_table_id: 't9' });

    expect(panel.unifiedPayment()).toEqual(emptyPaymentDraft());
    expect(panel.ready()).toBe(false);
  });

  it('NO borra el pago tecleado si cambia otro @Input', async () => {
    await chooseMethod('pm2');
    expect(panel.ready()).toBe(true);

    // Regresión: `ngOnChanges` reseteaba el pago ante cualquier @Input, así que
    // un cambio en los métodos, el turno de caja o el nombre del cliente le
    // borraba al cajero lo que estaba tecleando.
    fixture.componentRef.setInput('customerName', 'Ana Pérez');
    fixture.componentRef.setInput('cashShiftId', 'shift-2');
    fixture.detectChanges();

    expect(panel.ready()).toBe(true);
    expect(panel.unifiedPayment()).not.toEqual(emptyPaymentDraft());
  });

  it('sí reinicia el pago cuando la cuenta cambia de importe', async () => {
    await chooseMethod('pm2');
    expect(panel.ready()).toBe(true);

    // Es lo que llega al pulsar "Actualizar" tras entrar otro pedido. Reiniciar
    // aquí es lo correcto: cobrar 12000 de una cuenta de 18000 descuadraría el
    // turno. Por eso el evento marca la cuenta obsoleta en vez de recargarla, y
    // la recarga la decide el cajero.
    setBill({ ...bill, total: '18000' });

    expect(panel.total()).toBe(18000);
    expect(panel.unifiedPayment()).toEqual(emptyPaymentDraft());
    expect(panel.ready()).toBe(false);
  });

  it('spec 046, FR-005/SC-004: no ofrece ningún modo "Dividir por comensal", ni siquiera con más de un comensal con consumo', () => {
    setBill(splitBill);

    expect(fixture.nativeElement.textContent).not.toContain('Dividir por comensal');
    expect(fixture.nativeElement.textContent).not.toContain('Cuenta única');
  });

  // ── Resumen agregado Subtotal/Descuento (spec 049, FR-003/FR-004) ────────
  describe('resumen agregado Subtotal/Descuento', () => {
    it('muestra "Subtotal" con la suma de subtotal de todas las líneas, sin ninguna fila "Descuento" cuando ninguna línea tiene descuento', () => {
      setBill(splitBill);

      const texto = fixture.nativeElement.textContent as string;
      expect(panel.billSummary()).toEqual({ subtotal: 20000, discount: 0 });
      expect(texto).toContain('Subtotal');
      expect(texto).not.toContain('Descuento');
    });

    it('spec 115 (A-132): con descuento, "Subtotal mesa" se muestra ya neto, sin fila "Descuento"', () => {
      setBill(billWithDiscount);

      const texto = fixture.nativeElement.textContent as string;
      expect(panel.billSummary()).toEqual({ subtotal: 20000, discount: 2000 });
      expect(texto).toContain('Subtotal');
      expect(texto).not.toContain('Descuento');
      expect(texto).not.toContain('20.000'); // el bruto no debe aparecer
      expect(texto).toContain('18.000'); // 20.000 - 2.000, ya neto
    });

    it('billSummary() es null sin ninguna cuenta cargada', () => {
      fixture.componentRef.setInput('bill', null);
      fixture.componentRef.setInput('orphan', true);
      fixture.detectChanges();

      expect(panel.billSummary()).toBeNull();
    });
  });

  // ── "Ya pagado" (bugfix spec 049: mesa con pedido ya cobrado, bill=$0) ────
  describe('resumen "Ya pagado" (paidSummary)', () => {
    it('sin paidSummary no muestra ninguna sección "Ya pagado"', () => {
      expect(fixture.nativeElement.textContent).not.toContain('Ya pagado');
    });

    it('spec 115 (A-132): con paidSummary muestra Subtotal y Total ambos ya netos (7.000), sin fila "Descuento" ni el bruto 8.000', () => {
      fixture.componentRef.setInput('paidSummary', { subtotal: 8000, discount: 1000, total: 7000 });
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('Ya pagado');
      expect(texto).not.toContain('Descuento');
      expect(texto).not.toContain('8.000');
      expect(texto).toContain('7.000');
    });

    it('se muestra incluso sin ninguna cuenta pendiente (bill=null, mesa ya toda pagada)', () => {
      fixture.componentRef.setInput('bill', null);
      fixture.componentRef.setInput('orphan', true);
      fixture.componentRef.setInput('paidSummary', { subtotal: 8000, discount: 0, total: 8000 });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Ya pagado');
    });

    it('sin descuento en lo pagado, no muestra la fila "Descuento" de esa sección', () => {
      fixture.componentRef.setInput('paidSummary', { subtotal: 8000, discount: 0, total: 8000 });
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('Ya pagado');
      expect(texto).not.toContain('Descuento');
    });
  });

  // ── A pedido del usuario: total del pedido enfocado por su pestaña "Pedido N" ──
  describe('selectedOrderTotal (total del pedido enfocado)', () => {
    it('sin selectedOrderTotal no muestra "Total de este pedido" (mesa con un único pedido, sin pestañas)', () => {
      expect(fixture.nativeElement.textContent).not.toContain('Total de este pedido');
    });

    it('con selectedOrderTotal, lo muestra aparte del resto del desglose de la mesa', () => {
      fixture.componentRef.setInput('selectedOrderTotal', 12000);
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('Total de este pedido');
      expect(texto).toContain('12.000');
    });
  });

  // ── Efectivo: monto recibido y vuelto ────────────────────────────────────

  it('precarga el importe justo al elegir método', async () => {
    await chooseMethod('pm1');

    // `app-money-input` agrupa la parte entera con Intl.NumberFormat('es-CO')
    // (money-input.component.ts:119-125) — "12.000", no "12000" (el valor
    // numérico real, sin formatear, es el que expone `unifiedPayment()[0].assigned`).
    expect(amounts()[0].value).toBe('12.000');
    expect(panel.unifiedPayment()[0].amount).toBe(12000);
  });

  // ── spec 112: importe precargado (editable) para métodos no efectivo ──────

  it('con un método no efectivo, el importe se precarga en el total exacto y el botón de cobrar se habilita solo (SC-002)', async () => {
    await chooseMethod('pm2'); // Tarjeta, is_cash: false

    expect(amounts()[0].value).toBe('12.000');
    expect(panel.ready()).toBe(true);
    expect(chargeButton().disabled).toBe(false);
  });

  it('cobra enviando el efectivo recibido, no el total', async () => {
    await chooseMethod('pm1');
    await fill(amounts()[0], '50000');

    expect(chargeButton().disabled).toBe(false);
    // El backend deriva `paid_amount` y `change_given` de este importe.
    expect((await charge()).payments).toEqual([
      { payment_method_id: 'pm1', amount: 50000 },
    ]);
  });

  it('no deja cobrar si el pago no cubre la cuenta', async () => {
    await chooseMethod('pm1');
    await fill(amounts()[0], '10000');

    expect(panel.ready()).toBe(false);
    expect(chargeButton().disabled).toBe(true);
  });

  it('spec 046, FR-004/FR-007/SC-002: no ofrece ninguna opción de combinar método de pago', async () => {
    await chooseMethod('pm1');

    expect(combineBox()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Combinar con otro método');
  });

  // ── Nombre de la factura ──────────────────────────────────────────────────

  it('manda el nombre del cliente al cobrar la cuenta única', async () => {
    fixture.componentRef.setInput('customerName', '  Panadería El Trigo  ');
    await chooseMethod('pm2');

    // Sin esto la factura de una cuenta unificada quedaba sin nombre.
    expect((await charge()).customer_name).toBe('Panadería El Trigo');
  });

  it('no manda nombre vacío: lo resuelve el backend', async () => {
    fixture.componentRef.setInput('customerName', '   ');
    await chooseMethod('pm2');

    expect((await charge()).customer_name).toBeUndefined();
  });

  it('spec 046, FR-005/SC-004: el cobro de una cuenta con varios comensales sigue construyendo billing_mode "unified"', async () => {
    setBill(splitBill);
    await chooseMethod('pm2');

    const done = panel.charge();
    const req = http.expectOne(`${API}/table-sessions/ts2/close`);
    expect((req.request.body as CloseSessionPayload).billing_mode).toBe('unified');
    req.flush({ table_session: {}, sale_ids: ['s1'] });
    await done;
  });
});

