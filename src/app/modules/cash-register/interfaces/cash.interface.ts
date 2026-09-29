// DTOs del módulo de caja real (`/api/v1/cash/*`). Los montos decimales llegan
// como **strings** (Numeric(12,2) del backend); se coercionan con Number() en la UI.

/** `RegisterResponse` — una caja física/lógica. */
export interface CashRegister {
  id: string;
  name: string;
  active: boolean;
}

/** `ShiftResponse` — un turno de caja. */
export interface CashShift {
  id: string;
  cash_register_id: string;
  user_id: string;
  user_name?: string | null;
  opening_amount: string;
  opened_at: string;
  closed_at?: string | null;
  counted_amount?: string | null;
  status: 'open' | 'closed';
  close_note?: string | null;
}

/** Tipo de movimiento manual de efectivo. */
export type MovementKind = 'ingreso' | 'egreso' | 'retiro';

/** Body para `POST /cash/shifts/{id}/movements`. */
export interface CashMovementPayload {
  kind: MovementKind;
  amount: number;
  category: string;
  description?: string | null;
}

/** `CashMovementResponse`. */
export interface CashMovement {
  id: string;
  cash_shift_id: string;
  kind: MovementKind;
  amount: string;
  category?: string | null;
  description?: string | null;
  user_name?: string | null;
  occurred_at: string;
}

/** Una denominación contada en el arqueo. */
export interface DenominationIn {
  denomination: number;
  quantity: number;
}

/** Body para `POST /cash/shifts/{id}/close`. */
export interface ShiftClosePayload {
  counted_amount?: number | null;
  denominations: DenominationIn[];
  close_note?: string | null;
}

/** Ventas del turno agrupadas por clasificación del método de pago. */
export interface SalesByMethod {
  method_id: string;
  method_name: string;
  method_type: 'cash' | 'card' | 'transfer' | 'other';
  total: string;
  count: number;
}

/** `ReconciliationResponse` — arqueo del turno. */
export interface Reconciliation {
  cash_shift_id: string;
  status: string;
  opening_amount: string;
  ventas_efectivo: string;
  ventas_tarjeta: string;
  ventas_transferencia: string;
  /** Cambio entregado del cajón; `ventas_efectivo` ya lo lleva restado. */
  cambio_entregado?: string;
  /** Una fila por método de pago activo, aunque no haya vendido nada. */
  sales_by_method: SalesByMethod[];
  ingresos: string;
  egresos: string;
  retiros: string;
  expected: string;
  counted_amount?: string | null;
  difference?: string | null;
  /** DEPRECADO: alias de `ventas_efectivo`. */
  cash_sales?: string;
}

/** `ShiftReportResponse` — reporte de cierre consolidado. */
export interface ShiftReport {
  shift: CashShift;
  reconciliation: Reconciliation;
  movements: CashMovement[];
  denominations: DenominationIn[];
  close_note?: string | null;
}

/** Respuesta paginada genérica del backend (`Page[T]`). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** `ShiftSummaryResponse` — fila del histórico de cierres (montos como string). */
export interface ShiftSummary {
  id: string;
  cash_register_id: string;
  register_name: string;
  user_name?: string | null;
  opening_amount: string;
  counted_amount?: string | null;
  opened_at: string;
  closed_at?: string | null;
  status: string;
  close_note?: string | null;
  expected: string;
  difference?: string | null;
}
