import { TestBed } from '@angular/core/testing';
import { BillSummaryComponent } from './bill-summary.component';

describe('BillSummaryComponent — ícono de domicilio (spec 082)', () => {
  function crear(showDeliveryIcon: boolean) {
    TestBed.configureTestingModule({ imports: [BillSummaryComponent] });
    const fixture = TestBed.createComponent(BillSummaryComponent);
    fixture.componentRef.setInput('total', 20000);
    fixture.componentRef.setInput('deliveryFee', 5000);
    fixture.componentRef.setInput('showDeliveryIcon', showDeliveryIcon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza el ícono de domicilio como SVG artesanal', () => {
    const el = crear(true);
    expect(el.querySelector('svg')).toBeNull();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('delivery_dining');
  });

  it('no renderiza el ícono cuando showDeliveryIcon es false', () => {
    const el = crear(false);
    expect(el.querySelector('app-mi-icon')).toBeNull();
  });
});

/**
 * spec 094 (FR-009, research.md D10): la fila de descuento puede llevar el
 * nombre de la promoción que la explica, en vez del literal "Descuento".
 *
 * El input es **aditivo y con valor por defecto**: el primer caso es el que
 * protege a las cuatro pantallas que ya consumen este componente
 * (`pos-checkout-panel`, `payment-attempt-review-panel`, `manual-order-page`,
 * `session-bill-panel`), que no pasan el input y no deben cambiar ni un píxel
 * (Principio II).
 */
describe('BillSummaryComponent — etiqueta de la fila de descuento (spec 094)', () => {
  function crear(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [BillSummaryComponent] });
    const fixture = TestBed.createComponent(BillSummaryComponent);
    fixture.componentRef.setInput('total', 24000);
    fixture.componentRef.setInput('subtotal', 28000);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sin discountLabel, la fila sigue diciendo exactamente "Descuento"', () => {
    const el = crear({ discount: 4000 });
    expect(el.textContent).toContain('Descuento');
    expect(el.textContent).toContain('− $ 4.000');
  });

  it('con discountLabel, la fila dice el nombre de la promoción y conserva el importe', () => {
    const el = crear({ discount: 4000, discountLabel: '2 x $12.000' });
    expect(el.textContent).toContain('2 x $12.000');
    expect(el.textContent).toContain('− $ 4.000');
    // El literal por defecto ya no aparece: lo reemplazó el nombre, no se sumó a él.
    expect(el.textContent).not.toContain('Descuento');
  });
});
