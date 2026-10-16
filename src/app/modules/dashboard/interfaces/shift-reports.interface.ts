// DTOs del reporte operativo de ventas por turno de caja (spec 119,
// `/api/v1/cash/shifts/{id}/sales-report`, `/cash/reports/current`,
// `/cash/reports/period`, `/cash/active-orders`). Los montos decimales
// llegan como **strings** (Numeric(12,2) del backend, mismo criterio que
// `cash.interface.ts`); se coercionan con Number()/+ en la UI.

/** Fila del desglose de productos (`ProductBreakdownRow`). */
export interface ProductBreakdownRow {
  product_variant_id: string;
  name: string;
  units: number;
  revenue: string;
}

/** Fila del desglose de categorías (`CategoryBreakdownRow`). */
export interface CategoryBreakdownRow {
  category_id: string | null;
  category_name: string;
  units: number;
  revenue: string;
}

/** `ShiftSalesReportResponse` — reporte operativo de UN turno puntual. */
export interface ShiftSalesReport {
  shift_id: string;
  cash_register_id: string;
  cash_register_name: string;
  status: 'open' | 'closed';
  /** `true` si el turno sigue abierto, o si está cerrado sin snapshot (turno
   * anterior a esta spec, research.md D8). */
  is_live: boolean;
  opened_at: string;
  closed_at?: string | null;
  total_sales: string;
  order_count: number;
  avg_ticket: string;
  top_products: ProductBreakdownRow[];
  categories: CategoryBreakdownRow[];
  /** Solo no-null cuando `status === 'open'` (FR-012). */
  active_orders_count?: number | null;
}

export type ReportPeriodKind = 'shift' | 'current_shift' | 'day' | 'week' | 'month' | 'range';

/** `PeriodSalesReportResponse` — reporte agregado de turno actual/día/semana/mes/rango. */
export interface PeriodSalesReport {
  period: ReportPeriodKind;
  date_from: string;
  date_to: string;
  cash_register_id?: string | null;
  shift_ids: string[];
  is_live: boolean;
  total_sales: string;
  order_count: number;
  avg_ticket: string;
  top_products: ProductBreakdownRow[];
  categories: CategoryBreakdownRow[];
}

/** `ActiveOrderSummary` — pedido activo que bloquea cualquier cierre de turno. */
export interface ActiveOrderSummary {
  id: string;
  order_type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | null;
  status: string;
  dining_table_id?: string | null;
  table_number?: number | null;
  customer_name?: string | null;
  created_at: string;
}

/** Fila de `by_day` de `GET /reports/sales` (RF-059) — consumida por la
 *  tendencia reciente del Dashboard (spec 122, FR-004), independiente del
 *  reporte operativo por turno de arriba. */
export interface DailySalesPoint {
  day: string;
  total: string;
  count: number;
}

/** Fila de `GET /cash/reports/payment-methods` (spec 122, FR-007,
 *  contracts/payment-methods-report-api.md). */
export interface PaymentMethodBucketRow {
  bucket_start: string;
  payment_method_id: string;
  payment_method_name: string;
  amount: string;
}

/** `bucket_unit` es uno solo para toda la respuesta, no por fila (igual que
 *  en el backend, data-model.md §3). */
export interface PaymentMethodsReport {
  bucket_unit: 'hour' | 'day' | 'week';
  rows: PaymentMethodBucketRow[];
}
