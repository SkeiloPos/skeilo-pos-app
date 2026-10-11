import {
  MAX_PAYMENT_LINES,
  PaymentDraft,
  PaymentLineDraft,
  assignedOf,
  assignedTotal,
  changeDue,
  emptyPaymentDraft,
  emptyPaymentLineDraft,
  missingAmount,
  paymentIssue,
  paymentLines,
  pendingBalanceExcluding,
} from './payment-draft.util';
import { PaymentMethod } from '../../sales/interfaces/sales.interface';

const methods = [
  { id: 'efectivo', name: 'Efectivo', type: 'cash', is_cash: true, active: true },
  { id: 'transferencia', name: 'Transferencia', type: 'transfer', is_cash: false, active: true },
  { id: 'tarjeta', name: 'Tarjeta', type: 'card', is_cash: false, active: true },
] as PaymentMethod[];

function line(patch: Partial<PaymentLineDraft> = {}): PaymentLineDraft {
  return { ...emptyPaymentLineDraft(), ...patch };
}

describe('emptyPaymentDraft (spec 112, FR-014: un solo método sigue igual de rápido)', () => {
  it('parte de exactamente una línea vacía, no de una lista vacía', () => {
    expect(emptyPaymentDraft()).toEqual([emptyPaymentLineDraft()]);
  });
});

describe('paymentLines', () => {
  it('manda una sola línea con el método elegido (caso de un solo método, sin cambios)', () => {
    const draft: PaymentDraft = [line({ methodId: 'efectivo', amount: 35000 })];

    expect(paymentLines(draft, methods)).toEqual([
      { payment_method_id: 'efectivo', amount: 35000 },
    ]);
  });

  it('incluye la referencia cuando se escribió una', () => {
    const draft: PaymentDraft = [line({ methodId: 'transferencia', amount: 6000, reference: '4821' })];

    expect(paymentLines(draft, methods)).toEqual([
      { payment_method_id: 'transferencia', amount: 6000, reference: '4821' },
    ]);
  });

  it('en una línea de efectivo, manda lo tecleado (con vuelto incluido), no lo asignado', () => {
    const draft: PaymentDraft = [line({ methodId: 'efectivo', amount: 10000 })];

    expect(paymentLines(draft, methods)).toEqual([
      { payment_method_id: 'efectivo', amount: 10000 },
    ]);
  });

  it('pago mixto: dos líneas que suman el total, cada una con su propio amount', () => {
    const draft: PaymentDraft = [
      line({ methodId: 'efectivo', amount: 8000 }),
      line({ methodId: 'transferencia', amount: 6000 }),
    ];

    expect(paymentLines(draft, methods)).toEqual([
      { payment_method_id: 'efectivo', amount: 8000 },
      { payment_method_id: 'transferencia', amount: 6000 },
    ]);
  });
});

describe('assignedOf / assignedTotal / missingAmount (RN1: suma exacta)', () => {
  it('en una línea no efectivo, lo asignado es lo tecleado tal cual', () => {
    const draft: PaymentDraft = [line({ methodId: 'transferencia', amount: 6000 })];

    expect(assignedOf(draft, 0, 14000, methods)).toBe(6000);
  });

  it('en una línea de efectivo sin otras líneas, lo asignado es lo tecleado (hasta el total)', () => {
    const draft: PaymentDraft = [line({ methodId: 'efectivo', amount: 8000 })];

    expect(assignedOf(draft, 0, 14000, methods)).toBe(8000);
  });

  it('en una línea de efectivo con sobrepago, lo asignado se capa al saldo pendiente -- el resto es vuelto', () => {
    const draft: PaymentDraft = [
      line({ methodId: 'transferencia', amount: 6000 }),
      line({ methodId: 'efectivo', amount: 10000 }),
    ];

    expect(assignedOf(draft, 1, 14000, methods)).toBe(8000);
    expect(assignedTotal(draft, 14000, methods)).toBe(14000);
  });

  it('Faltan $X por asignar cuando lo asignado no cubre el total', () => {
    const draft: PaymentDraft = [
      line({ methodId: 'efectivo', amount: 8000 }),
      line({ methodId: 'transferencia', amount: 4000 }),
    ];

    expect(missingAmount(draft, 14000, methods)).toBe(2000);
  });

  it('negativo cuando lo asignado sobra', () => {
    const draft: PaymentDraft = [line({ methodId: 'transferencia', amount: 15000 })];

    expect(missingAmount(draft, 14000, methods)).toBe(-1000);
  });
});

describe('pendingBalanceExcluding (RN2: saldo pendiente contra el que se valida una línea no efectivo)', () => {
  it('es el total menos lo tecleado en las demás líneas', () => {
    const draft: PaymentDraft = [
      line({ methodId: 'efectivo', amount: 8000 }),
      line({ methodId: 'transferencia', amount: 0 }),
    ];

    expect(pendingBalanceExcluding(draft, 1, 14000, methods)).toBe(6000);
  });
});

describe('changeDue (RN2: el vuelto solo sale de una línea en efectivo)', () => {
  it('es cero cuando lo tecleado no supera lo asignado', () => {
    const draft: PaymentDraft = [line({ methodId: 'efectivo', amount: 8000 })];

    expect(changeDue(draft, 0, 8000, methods)).toBe(0);
  });

  it('es la diferencia entre lo tecleado y lo asignado, solo en efectivo', () => {
    const draft: PaymentDraft = [
      line({ methodId: 'transferencia', amount: 6000 }),
      line({ methodId: 'efectivo', amount: 10000 }),
    ];

    expect(changeDue(draft, 1, 14000, methods)).toBe(2000);
  });

  it('es siempre cero en una línea no efectivo, sin importar el monto', () => {
    const draft: PaymentDraft = [line({ methodId: 'transferencia', amount: 6000 })];

    expect(changeDue(draft, 0, 6000, methods)).toBe(0);
  });
});

describe('paymentIssue', () => {
  it('exige elegir método e importe en cada línea', () => {
    expect(paymentIssue([line()], 35000, methods)).toBe('Elige el método de pago.');
    expect(paymentIssue([line({ methodId: 'efectivo' })], 35000, methods)).toBe(
      'Escribe el importe del pago.',
    );
  });

  it('avisa de lo que falta por asignar', () => {
    const issue = paymentIssue([line({ methodId: 'efectivo', amount: 20000 })], 35000, methods);

    expect(issue).toContain('Faltan');
    expect(issue).toContain('15.000');
    expect(issue).toContain('por asignar');
  });

  it('una línea no efectivo sola que supera el total se rechaza por RN2, no por "sobra" (RN1 queda cubierta por RN2)', () => {
    // Ninguna línea en efectivo compensa el exceso -- una transferencia
    // nunca puede superar lo que queda, ni siquiera cuando es la única
    // línea (el saldo pendiente sin otras líneas es el total completo).
    const issue = paymentIssue([line({ methodId: 'transferencia', amount: 40000 })], 35000, methods);

    expect(issue).toContain('Transferencia');
    expect(issue).toContain('no puede superar el saldo pendiente');
    expect(issue).toContain('35.000');
  });

  it('una línea no efectivo que supera el saldo pendiente se rechaza con el nombre del método (RN2)', () => {
    const draft: PaymentDraft = [
      line({ methodId: 'efectivo', amount: 8000 }),
      line({ methodId: 'transferencia', amount: 9000 }),
    ];

    const issue = paymentIssue(draft, 14000, methods);
    expect(issue).toContain('Transferencia');
    expect(issue).toContain('no puede superar el saldo pendiente');
    expect(issue).toContain('6.000');
  });

  it('null cuando una sola línea cubre el total exacto (sin cambios respecto a antes de spec 112)', () => {
    const pago: PaymentDraft = [line({ methodId: 'efectivo', amount: 35000 })];

    expect(paymentIssue(pago, 35000, methods)).toBeNull();
    expect(changeDue(pago, 0, 35000, methods)).toBe(0);
  });

  it('null cuando el pago mixto suma exactamente el total (Historia 1)', () => {
    const pago: PaymentDraft = [
      line({ methodId: 'efectivo', amount: 8000 }),
      line({ methodId: 'transferencia', amount: 6000 }),
    ];

    expect(paymentIssue(pago, 14000, methods)).toBeNull();
  });

  it('el sobrepago en efectivo se devuelve como vuelto sin afectar la validación (Historia 3)', () => {
    const pago: PaymentDraft = [
      line({ methodId: 'transferencia', amount: 6000 }),
      line({ methodId: 'efectivo', amount: 10000 }),
    ];

    expect(paymentIssue(pago, 14000, methods)).toBeNull();
    expect(changeDue(pago, 1, 14000, methods)).toBe(2000);
  });
});

describe('MAX_PAYMENT_LINES (RN3)', () => {
  it('es 3', () => {
    expect(MAX_PAYMENT_LINES).toBe(3);
  });
});
