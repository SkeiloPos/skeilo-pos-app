import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import { PaymentLine } from '../interfaces/dining.interface';
import { formatMoney } from './receipt.util';

/**
 * Cómo paga el cliente un cobro concreto: de 1 a 3 líneas de pago (spec 112,
 * RN3) — reabre lo que spec 046 (FR-006/FR-007) había retirado, ver
 * `registro-de-anomalias.md` A-124. El backend ya aceptaba N pagos desde
 * spec 011; esto solo generaliza el borrador del frontend.
 *
 * Un solo número por línea, igual que antes de esta spec: en una línea no
 * efectivo es el monto asignado (lo que cubre de la cuenta); en una línea en
 * efectivo es "con cuánto paga" el cliente -- puede ser mayor a lo que esa
 * línea necesitaba cubrir, y el exceso es el vuelto (RN2). Lo "asignado" de
 * una línea en efectivo no es el número tecleado sino lo que `assignedOf`
 * deriva de él -- no hace falta un segundo campo.
 */
export interface PaymentLineDraft {
  methodId: string;
  amount: number;
  reference: string | null;
}

export type PaymentDraft = PaymentLineDraft[];

export const MAX_PAYMENT_LINES = 3;

export function emptyPaymentLineDraft(amount = 0): PaymentLineDraft {
  return { methodId: '', amount, reference: null };
}

/** Borrador inicial: una sola línea vacía -- el caso de un único método
 * (spec 112, FR-014) sigue partiendo exactamente de aquí, sin pasos nuevos. */
export function emptyPaymentDraft(): PaymentDraft {
  return [emptyPaymentLineDraft()];
}

function isCash(methodId: string, methods: PaymentMethodCheckoutOption[]): boolean {
  return !!methods.find((m) => m.id === methodId)?.is_cash;
}

function methodName(methodId: string, methods: PaymentMethodCheckoutOption[]): string {
  return methods.find((m) => m.id === methodId)?.name ?? 'El método elegido';
}

/**
 * Lo que esta línea aporta a la suma exacta de RN1, en el orden en que se
 * capturaron las líneas (`draft` solo crece por el final, nunca se
 * reordena): en una línea no efectivo, el monto tecleado tal cual -- sin
 * límite propio, lo acota `paymentIssue` (RN2). En una línea en efectivo,
 * el monto tecleado pero sin superar lo que las líneas ANTERIORES (no las
 * posteriores) ya reclamaron -- el exceso es vuelto (`changeDue`), no una
 * porción adicional cubierta.
 *
 * Mirar solo hacia atrás es intencional, no una limitación: una línea en
 * efectivo que se escribe o se edita DESPUÉS de fijar otra línea nunca debe
 * poder invalidar retroactivamente esa línea ya fijada (Historia 3,
 * "vuelto calculado solo sobre la porción en efectivo" -- subir el monto
 * recibido en efectivo de $8.000 a $10.000 jamás debe reabrir el error de
 * una transferencia que ya había sido válida).
 */
export function assignedOf(
  draft: PaymentDraft,
  index: number,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): number {
  const line = draft[index];
  if (!isCash(line.methodId, methods)) return line.amount || 0;
  let usedBefore = 0;
  for (let j = 0; j < index; j++) usedBefore += assignedOf(draft, j, total, methods);
  return Math.min(line.amount || 0, Math.max(0, total - usedBefore));
}

/** Suma de lo asignado por todas las líneas -- contra lo que RN1 exige que
 * el total cuadre exacto. */
export function assignedTotal(
  draft: PaymentDraft,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): number {
  return draft.reduce((sum, _line, i) => sum + assignedOf(draft, i, total, methods), 0);
}

/** Lo que falta para cubrir el total. Dado que toda línea no efectivo que
 * superaría el saldo pendiente queda rechazada por `paymentIssue` (RN2) y
 * toda línea en efectivo se capa a sí misma (`assignedOf`), lo asignado
 * nunca sobra una vez que `paymentIssue` no reporta ningún problema --
 * `missingAmount` nunca es negativo en ese punto; solo puede quedar en 0 o
 * positivo ("Faltan $X por asignar"). */
export function missingAmount(
  draft: PaymentDraft,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): number {
  return total - assignedTotal(draft, total, methods);
}

/** Saldo pendiente contra el que se valida una línea no efectivo (RN2): el
 * total menos lo que las líneas ANTERIORES ya tienen asignado -- mismo
 * criterio de `assignedOf`, y el mismo monto con el que se precarga una
 * línea nueva al pulsar "Agregar otro método" (en ese caso, `index` es la
 * posición donde la línea nueva va a quedar, al final del borrador actual). */
export function pendingBalanceExcluding(
  draft: PaymentDraft,
  index: number,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): number {
  let usedBefore = 0;
  for (let j = 0; j < index; j++) usedBefore += assignedOf(draft, j, total, methods);
  return total - usedBefore;
}

/** Vuelto de una línea en efectivo: lo tecleado por encima de lo asignado.
 * Cero para cualquier línea no efectivo. */
export function changeDue(
  draft: PaymentDraft,
  index: number,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): number {
  const line = draft[index];
  if (!isCash(line.methodId, methods)) return 0;
  return Math.max(0, (line.amount || 0) - assignedOf(draft, index, total, methods));
}

/** Las líneas de pago que se mandan al backend al pulsar "Cobrar": el monto
 * tecleado de cada línea tal cual -- en efectivo es lo recibido (con
 * vuelto incluido, `research.md` D3), en las demás es lo asignado. */
export function paymentLines(draft: PaymentDraft, _methods: PaymentMethodCheckoutOption[]): PaymentLine[] {
  return draft
    .filter((line) => line.methodId)
    .map((line) => ({
      payment_method_id: line.methodId,
      amount: line.amount,
      ...(line.reference ? { reference: line.reference } : {}),
    }));
}

/**
 * Motivo por el que este cobro **no** se puede registrar, o `null` si está
 * bien -- primer problema encontrado, en orden de prioridad (data-model.md):
 * método/importe vacíos → una línea no efectivo supera el saldo que las
 * líneas anteriores ya reclamaron (RN2) → falta por asignar (RN1).
 */
/**
 * Denominaciones de redondeo para las sugerencias de monto en efectivo (spec 124), por código de
 * moneda del tenant -- hoy solo `COP`, el único valor real (ningún tenant tiene un campo de
 * moneda todavía, `research.md` D1 de spec 124). Lista propia e independiente del catálogo de
 * denominaciones del arqueo de caja (spec 121): ese catálogo sirve para contar efectivo físico y
 * mete valores (monedas, $2.000, $20.000) que esta lista de redondeo no quiere.
 */
export const ROUNDING_DENOMINATIONS_BY_CURRENCY: Record<'COP', number[]> = {
  COP: [8000, 10000, 20000, 50000, 100000],
};

/**
 * Hasta 5 montos sugeridos para "Con cuánto paga" en efectivo (spec 124, FR-001 a FR-004):
 * redondea `saldoPendiente` hacia arriba a cada denominación, sin duplicados, ascendente. El
 * monto exacto no se agrega como candidato aparte -- si un redondeo coincide con el saldo, el
 * componente lo etiqueta "Exacto" (FR-012), no esta función.
 */
export function roundingSuggestions(
  saldoPendiente: number,
  denominations: number[] = ROUNDING_DENOMINATIONS_BY_CURRENCY.COP,
): number[] {
  const values = denominations.map((d) => Math.ceil(saldoPendiente / d) * d);
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function paymentIssue(
  draft: PaymentDraft,
  total: number,
  methods: PaymentMethodCheckoutOption[],
): string | null {
  for (const line of draft) {
    if (!line.methodId) return 'Elige el método de pago.';
    if (line.amount <= 0) return 'Escribe el importe del pago.';
  }

  for (let i = 0; i < draft.length; i++) {
    const line = draft[i];
    if (isCash(line.methodId, methods)) continue;
    const saldo = pendingBalanceExcluding(draft, i, total, methods);
    if (line.amount > saldo) {
      return `${methodName(line.methodId, methods)} no puede superar el saldo pendiente (${formatMoney(Math.max(0, saldo))}).`;
    }
  }

  const missing = missingAmount(draft, total, methods);
  if (missing > 0) return `Faltan ${formatMoney(missing)} por asignar.`;

  return null;
}
