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
  /** spec 121 (D-5): quien CERRÓ el turno (`user_*` es quien lo abrió). `null` en
   * turnos abiertos y en los cerrados antes de la spec. */
  closed_by_user_id?: string | null;
  closed_by_user_name?: string | null;
}

/** Tipo de movimiento manual de efectivo. */
export type MovementKind = 'ingreso' | 'egreso' | 'retiro';

/** spec 135 (FR-004/FR-005): una línea de un ingreso con método explícito.
 * `payment_method_id` en snake_case -- este objeto viaja tal cual al backend,
 * sin transformación de claves (mismo patrón que `paymentLines()` en
 * `payment-draft.util.ts`). */
export interface CashMovementLinePayload {
  payment_method_id: string;
  amount: number;
}

/** Body para `POST /cash/shifts/{id}/movements`. `lines` es exclusivo con
 * `amount` -- solo aplica a `kind: 'ingreso'` (FR-004/FR-005); egreso/retiro y
 * el ingreso en efectivo siguen enviando `amount` sin cambios (FR-009/FR-012). */
export interface CashMovementPayload {
  kind: MovementKind;
  amount?: number;
  lines?: CashMovementLinePayload[];
  category: string;
  description?: string | null;
}

/** `CashMovementResponse`. */
export interface CashMovement {
  id: string;
  cash_shift_id: string;
  kind: MovementKind;
  amount: string;
  payment_method_id: string;
  payment_method_name: string;
  group_id?: string | null;
  category?: string | null;
  description?: string | null;
  user_name?: string | null;
  occurred_at: string;
}

/** Tipo de una denominación de efectivo (spec 121, D-4). */
export type DenominationKind = 'billete' | 'moneda';

/** Una denominación del catálogo del negocio (`GET /cash/denominations`). El importe
 * viaja como decimal-string (`"100000.00"`). */
export interface CatalogDenomination {
  denomination: string;
  kind: DenominationKind;
}

/** Una denominación contada en el arqueo. */
export interface DenominationIn {
  denomination: number;
  quantity: number;
}

/**
 * Body para `POST /cash/shifts/{id}/close`.
 *
 * spec 121 (D-1, A-130): el cliente ya NO envía el efectivo contado; lo calcula el
 * servidor a partir de las líneas `{denominación, cantidad}`. Enviar `counted_amount`
 * (u otro total) se rechaza con 422.
 */
export interface ShiftClosePayload {
  denominations: DenominationIn[];
  close_note?: string | null;
}

/** Ventas del turno agrupadas por clasificación del método de pago. */
export interface SalesByMethod {
  method_id: string;
  method_name: string;
  method_type: 'cash' | 'card' | 'transfer' | 'other' | 'mixed';
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
  /** spec 135 (FR-008): ingresos en métodos distintos a efectivo -- sin ceros
   * rellenados, a diferencia de `sales_by_method`. */
  ingresos_by_method?: SalesByMethod[];
  expected: string;
  counted_amount?: string | null;
  difference?: string | null;
  /** DEPRECADO: alias de `ventas_efectivo`. */
  cash_sales?: string;
}

/** Línea del desglose del conteo en el reporte (spec 121): lo calcula el servidor. */
export interface CountLine {
  denomination: string;
  kind: DenominationKind;
  quantity: number;
  subtotal: string;
}

/** `ShiftReportResponse` — reporte de cierre consolidado. */
export interface ShiftReport {
  shift: CashShift;
  reconciliation: Reconciliation;
  movements: CashMovement[];
  denominations: CountLine[];
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
