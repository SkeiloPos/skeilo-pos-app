// Types for the sales module (`/api/v1/sales/*`).

/**
 * Clasificación del método de pago (`PaymentMethodType`). Es lo que agrupa el
 * desglose del arqueo, y solo `cash` entra en el efectivo esperado del cajón.
 */
export type PaymentMethodType = 'cash' | 'card' | 'transfer' | 'other';

/** `PaymentMethodResponse`. */
export interface PaymentMethod {
  id: string;
  /** `null` en filas creadas antes de la migración de la spec 032, hasta que se backfillee. */
  catalog_id: string | null;
  name: string;
  type: PaymentMethodType;
  /** Invariante del backend: `is_cash ⇔ type === 'cash'`. */
  is_cash: boolean;
  active: boolean;
  /** Todo lo obligatorio de `catalog.fields` está diligenciado y validado (spec 032, FR-009). */
  is_complete: boolean;
  /**
   * Datos de pago que el comensal necesita ver para transferir (cuenta,
   * titular, teléfono, código…) — spec 024. Sin esquema fijo: cada método
   * usa las claves que necesite. `null`/ausente en efectivo.
   */
  payment_info?: Record<string, string> | null;
}

/**
 * Body for `POST /sales/payment-methods` (`PaymentMethodCreate`, spec 032).
 * `name`/`type`/`is_cash` ya no se aceptan — se copian del catálogo elegido
 * (`catalog_id`); un tenant no puede crear métodos fuera del catálogo (FR-007/FR-011).
 */
export interface PaymentMethodCreatePayload {
  catalog_id: string;
  payment_info?: Record<string, string> | null;
}

/** Body for `PATCH /sales/payment-methods/{id}` (`PaymentMethodUpdate`). `name` ya no aplica
 * (viene del catálogo) — reactivar (`active: true`) es también el camino para volver a usar un
 * método desactivado, conservando el `payment_info` si no se manda uno nuevo (spec 032, FR-017). */
export interface PaymentMethodUpdatePayload {
  payment_info?: Record<string, string> | null;
  /**
   * `payment_info` que el formulario mostraba al abrirse (spec 088, FR-002). Una imagen (QR)
   * enviada en `payment_info` solo cuenta como cambio si su valor base coincide con el vigente;
   * si otra sesión ya la cambió, el backend conserva la vigente y guarda el resto de los campos.
   * El QR sin tocar **sí** se sigue enviando dentro de `payment_info` (omitirlo lo eliminaría).
   */
  payment_info_base?: Record<string, string> | null;
  active?: boolean;
}

/** Un campo de integración definido por el catálogo (mismo shape que
 * `PaymentMethodFieldDefinition` del módulo `super-admin`). */
export interface CatalogPaymentMethodField {
  key: string;
  label: string;
  required: boolean;
  format: 'text' | 'numeric' | 'image';
  length?: number | null;
}

/** `CatalogPaymentMethodOption` (`GET /sales/payment-methods/catalog`, spec 032 FR-005/FR-006). */
export interface CatalogPaymentMethodOption {
  id: string;
  name: string;
  fields: CatalogPaymentMethodField[];
  /** Estado del catálogo a nivel plataforma (no el de la activación del tenant). */
  active: boolean;
  /** `true` si este tenant ya tiene una fila para este `catalog_id` (activa o no). */
  already_activated: boolean;
}

/** `PaymentMethodCheckoutOption` (`GET /sales/payment-methods?available=true`, spec 032 FR-012a):
 * lo que ve el cajero. Nunca `payment_info` (cuenta, celular, QR — los "datos de integración" que
 * la clarificación reserva al Tenant Admin). `is_cash` sí viaja: es clasificación operativa, no un
 * dato de integración — el checkout la necesita para decidir si calcula vuelto. */
export interface PaymentMethodCheckoutOption {
  id: string;
  name: string;
  is_cash: boolean;
}

// ── Checkout (`POST /sales`) ───────────────────────────────────────────────

/** Una opción elegida junto con cuántas unidades de ella (spec 065,
 *  `OptionSelectionIn`). `quantity` es opcional, default 1. */
export interface SaleOptionSelectionPayload {
  option_id: string;
  quantity?: number;
}

/** One line of a sale (`SaleItemIn`). */
export interface SaleItemPayload {
  product_variant_id: string;
  quantity: number;
  options?: SaleOptionSelectionPayload[];
}

/** One payment of a sale (`PaymentIn`). Split payments = multiple entries. */
export interface PaymentPayload {
  payment_method_id: string;
  amount: number;
  reference?: string | null;
}

/** Body for `POST /sales` (`SaleCreate`). Requires an open `cash_shift_id`. */
export interface SaleCreatePayload {
  cash_shift_id: string;
  dining_session_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  discount?: number;
  tax?: number;
  tip?: number;
  items: SaleItemPayload[];
  payments: PaymentPayload[];
}

/** `SaleItemResponse` — amounts are decimal strings; `description` is the name. */
export interface SaleItem {
  id: string;
  product_variant_id: string;
  description: string;
  /**
   * Snapshot de las opciones elegidas, congelado al vender. Se conserva el nombre
   * para que el ticket siga siendo legible aunque la opción se desactive después.
   */
  /** `quantity` ausente = 1 (snapshot anterior a spec 065, sin esa clave). */
  options?: { option_id: string; name: string; extra_price: string; quantity?: number }[];
  quantity: number;
  unit_price: string;
  line_total: string;
}

/** `PaymentResponse`. */
export interface SalePayment {
  id: string;
  payment_method_id: string;
  amount: string;
  reference?: string | null;
}

/** `SaleInvoiceRef` — consecutivo fiscal de la venta. */
export interface SaleInvoice {
  prefix: string;
  number: number;
}

/** `SaleTableRef` — mesa cobrada; `null` en ventas de mostrador. */
export interface SaleTable {
  id: string;
  number: number;
  name: string | null;
}

/** Estado de la venta (check constraint `Sale.status` en el backend). */
export type SaleStatus = 'issued' | 'paid' | 'void';

/** `SaleResponse` — the emitted, paid sale (receipt). */
export interface Sale {
  id: string;
  cash_shift_id: string;
  user_id: string;
  user_name?: string | null;
  customer_name?: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  tip: string;
  total: string;
  /** Efectivo recibido y cambio entregado (RF-029). */
  paid_amount?: string | null;
  change_given?: string | null;
  status: SaleStatus;
  sold_at: string;
  /**
   * spec 073 (FR-011a): instante contra el que se evaluó la vigencia temporal
   * de las promociones de esta venta. `null` en ventas anteriores a esa spec.
   */
  promotion_evaluated_at?: string | null;
  items?: SaleItem[];
  payments?: SalePayment[];
  /** Consecutivo fiscal; `null` en ventas anteriores a la facturación. */
  invoice?: SaleInvoice | null;
  dining_table?: SaleTable | null;
}

/** Filtros de `GET /sales` (`status`, `date_from`/`date_to` en `YYYY-MM-DD`, `invoice_reference`). */
export interface SaleListFilters {
  status: SaleStatus | '';
  dateFrom: string;
  dateTo: string;
  invoiceReference: string;
}
