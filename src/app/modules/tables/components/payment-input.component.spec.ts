import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaymentInputComponent } from './payment-input.component';
import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';

/**
 * Spec 112 (RN3, FR-004/FR-010/FR-014): de 1 a 3 líneas de pago. Reemplaza
 * las aserciones de spec 046/057 que exigían un único método sin importe
 * editable para lo no efectivo -- ese tope de negocio se retiró (`A-124`,
 * registro de anomalías); ahora toda línea es editable, y la validación de
 * "no superar el saldo pendiente" (RN2) se hace vía el mensaje de `issue()`.
 */
describe('PaymentInputComponent', () => {
  let fixture: ComponentFixture<PaymentInputComponent>;
  let component: PaymentInputComponent;

  const methods: PaymentMethodCheckoutOption[] = [
    { id: 'pm-cash', name: 'Efectivo', is_cash: true },
    { id: 'pm-transfer', name: 'Nequi', is_cash: false },
  ];

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PaymentInputComponent] });
    fixture = TestBed.createComponent(PaymentInputComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('total', 12000);
    fixture.componentRef.setInput('methods', methods);
    fixture.detectChanges();
  });

  function selectEls(): HTMLSelectElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('select'));
  }

  function amountEls(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input[inputmode="decimal"]'));
  }

  function addLineBtn(): HTMLButtonElement | null {
    return Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Agregar otro método'),
    ) ?? null;
  }

  function removeLineBtns(): HTMLButtonElement[] {
    return Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Eliminar'),
    );
  }

  async function chooseMethod(methodId: string, index = 0): Promise<void> {
    const select = selectEls()[index];
    select.value = methodId;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setAmount(value: number, index = 0): Promise<void> {
    const input = amountEls()[index];
    input.value = String(value);
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function clickAddLine(): Promise<void> {
    addLineBtn()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ── Un solo método (FR-014: sin pasos adicionales respecto a antes) ──────

  it('parte de una sola línea, sin el botón de eliminar', () => {
    expect(selectEls().length).toBe(1);
    expect(removeLineBtns().length).toBe(0);
  });

  it('con efectivo elegido, el campo "Con cuánto paga" nace precargado con el total (spec 124, FR-010/FR-012: revierte A-135 a pedido del usuario)', async () => {
    await chooseMethod('pm-cash');

    expect(amountEls()[0].value).toBe('12.000');
    expect(component.draft()[0].amount).toBe(12000);
  });

  it('con un método no efectivo elegido, el importe también se precarga con el total (ahora editable, no fijo)', async () => {
    await chooseMethod('pm-transfer');

    expect(amountEls()[0].value).toBe('12.000');
    expect(component.draft()[0].amount).toBe(12000);
  });

  it('eligiendo un único método y cobrando el total, no pide ningún paso adicional', async () => {
    await chooseMethod('pm-cash');

    expect(fixture.nativeElement.textContent).not.toContain('Agregar otro método disabled');
    expect(addLineBtn()).not.toBeNull(); // ofrecido, pero no obligatorio
    expect(removeLineBtns().length).toBe(0);
  });

  // ── Pago mixto (RN3/FR-004/FR-010) ────────────────────────────────────────

  it('"Agregar otro método" crea una segunda línea precargada con el saldo pendiente', async () => {
    await chooseMethod('pm-cash');
    await setAmount(8000);

    await clickAddLine();

    expect(selectEls().length).toBe(2);
    expect(amountEls().length).toBe(1); // la 2ª línea aún no tiene método elegido, solo la 1ª muestra importe
    expect(component.draft()[1].amount).toBe(4000);
  });

  it('al elegir el método de la segunda línea, no le toca el importe ya precargado', async () => {
    await chooseMethod('pm-cash');
    await setAmount(8000);
    await clickAddLine();

    await chooseMethod('pm-transfer', 1);

    expect(component.draft()[1].amount).toBe(4000);
  });

  it('bloquea una 4ta línea (tope de 3, RN3)', async () => {
    await chooseMethod('pm-cash');
    await clickAddLine();
    await clickAddLine();

    expect(selectEls().length).toBe(3);
    expect(addLineBtn()).toBeNull();
  });

  it('eliminar una línea recalcula el mensaje de saldo pendiente de inmediato (FR-010)', async () => {
    await chooseMethod('pm-cash');
    await setAmount(8000);
    await clickAddLine();
    await chooseMethod('pm-transfer', 1);
    await setAmount(4000, 1);

    expect(fixture.nativeElement.textContent).not.toContain('Faltan');

    removeLineBtns()[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(selectEls().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Faltan');
    expect(fixture.nativeElement.textContent).toContain('4.000');
  });

  it('una transferencia que supera el saldo pendiente muestra el error con el nombre del método (RN2)', async () => {
    await chooseMethod('pm-cash');
    await setAmount(8000);
    await clickAddLine();
    await chooseMethod('pm-transfer', 1);

    await setAmount(9000, 1);

    expect(fixture.nativeElement.textContent).toContain('Nequi');
    expect(fixture.nativeElement.textContent).toContain('no puede superar el saldo pendiente');
    expect(fixture.nativeElement.textContent).toContain('4.000');
  });

  it('muestra el cambio solo en la línea de efectivo cuando se teclea más de lo asignado', async () => {
    await chooseMethod('pm-transfer');
    await setAmount(4000);
    await clickAddLine();
    await chooseMethod('pm-cash', 1);

    await setAmount(10000, 1);

    expect(fixture.nativeElement.textContent).toContain('Cambio');
    expect(fixture.nativeElement.textContent).toContain('2.000');
  });

  it('muestra el campo de referencia opcional solo para métodos no efectivo (RN5)', async () => {
    await chooseMethod('pm-cash');
    expect(fixture.nativeElement.querySelector('input[placeholder*="comprobante"]')).toBeNull();

    await chooseMethod('pm-transfer');
    expect(fixture.nativeElement.querySelector('input[placeholder*="comprobante"]')).not.toBeNull();
  });

  // ── Sugerencias de monto en efectivo (spec 124, FR-001 a FR-012) ─────────

  function suggestionBtns(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="sugerencia-monto"]'));
  }

  async function setTotal(total: number): Promise<void> {
    fixture.componentRef.setInput('total', total);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('con saldo $22.000, muestra las 5 sugerencias redondeadas, ninguna "Exacto" (FR-001/002/003)', async () => {
    await setTotal(22000);
    await chooseMethod('pm-cash');

    const textos = suggestionBtns().map((b) => b.textContent?.trim());
    expect(textos).toEqual(['$ 24.000', '$ 30.000', '$ 40.000', '$ 50.000', '$ 100.000']);
  });

  it('con saldo $47.500, elimina duplicados y muestra 4 sugerencias (FR-003)', async () => {
    await setTotal(47500);
    await chooseMethod('pm-cash');

    const textos = suggestionBtns().map((b) => b.textContent?.trim());
    expect(textos).toEqual(['$ 48.000', '$ 50.000', '$ 60.000', '$ 100.000']);
  });

  it('con saldo $100.000, no ofrece un botón para el monto exacto -- ya está precargado en el campo (FR-012, revierte A-135)', async () => {
    await setTotal(100000);
    await chooseMethod('pm-cash');

    expect(amountEls()[0].value).toBe('100.000');
    const textos = suggestionBtns().map((b) => b.textContent?.trim());
    expect(textos).toEqual(['$ 104.000']);
  });

  it('tocar una sugerencia llena "Con cuánto paga" y muestra el Cambio correspondiente (FR-005/006)', async () => {
    await setTotal(22000);
    await chooseMethod('pm-cash');

    suggestionBtns()
      .find((b) => b.textContent?.trim() === '$ 50.000')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(amountEls()[0].value).toBe('50.000');
    expect(fixture.nativeElement.textContent).toContain('Cambio');
    expect(fixture.nativeElement.textContent).toContain('28.000');
  });

  it('no muestra ninguna sugerencia cuando el método no es efectivo (FR-008)', async () => {
    await setTotal(22000);
    await chooseMethod('pm-transfer');

    expect(suggestionBtns().length).toBe(0);
  });

  it('sugerencias de la segunda línea en pago mixto usan el saldo pendiente, no el total (FR-009)', async () => {
    await setTotal(22000);
    await chooseMethod('pm-transfer');
    await setAmount(10000);
    await clickAddLine();
    await chooseMethod('pm-cash', 1);

    const textos = suggestionBtns().map((b) => b.textContent?.trim());
    expect(textos).toEqual(['$ 16.000', '$ 20.000', '$ 50.000', '$ 100.000']);
  });

  it('eliminar la línea de Nequi recalcula de inmediato las sugerencias de efectivo (FR-009)', async () => {
    await setTotal(22000);
    await chooseMethod('pm-transfer');
    await setAmount(10000);
    await clickAddLine();
    await chooseMethod('pm-cash', 1);

    removeLineBtns()[0].click();
    await fixture.whenStable();
    fixture.detectChanges();

    const textos = suggestionBtns().map((b) => b.textContent?.trim());
    expect(textos).toEqual(['$ 24.000', '$ 30.000', '$ 40.000', '$ 50.000', '$ 100.000']);
  });

  it('escribir a mano un monto menor al saldo pendiente sigue mostrando "Faltan... por asignar" (FR-007)', async () => {
    await setTotal(22000);
    await chooseMethod('pm-cash');
    await setAmount(20000);

    expect(fixture.nativeElement.textContent).toContain('Faltan');
    expect(fixture.nativeElement.textContent).toContain('2.000');
    expect(fixture.nativeElement.textContent).toContain('por asignar');
  });
});
