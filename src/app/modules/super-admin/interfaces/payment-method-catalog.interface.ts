/** Formato esperado de un campo de integración del catálogo (spec 032, FR-004). */
export type PaymentMethodFieldFormat = 'text' | 'numeric' | 'image';

/** Clasificación del método, reutilizada del arqueo (`sales.interface.ts`).
 *  `'mixed'` (spec 130, FR-004): "Pago mixto" (efectivo + transferencia). */
export type PaymentMethodCatalogType = 'cash' | 'card' | 'transfer' | 'other' | 'mixed';

/** Un campo de integración que el catálogo exige/permite a un tenant. */
export interface PaymentMethodFieldDefinition {
  key: string;
  label: string;
  required: boolean;
  format: PaymentMethodFieldFormat;
  /** Longitud exacta esperada; solo aplica a `format` 'text'/'numeric'. */
  length?: number | null;
}

/** Mirrors `PaymentMethodCatalogResponse` (`GET /super-admin/payment-methods-catalog`). */
export interface PaymentMethodCatalogEntry {
  id: string;
  name: string;
  type: PaymentMethodCatalogType;
  active: boolean;
  fields: PaymentMethodFieldDefinition[];
  created_at: string;
  updated_at?: string | null;
}

/** Request body for `POST /super-admin/payment-methods-catalog`. */
export interface PaymentMethodCatalogCreatePayload {
  name: string;
  type: PaymentMethodCatalogType;
  fields: PaymentMethodFieldDefinition[];
}

/** Request body for `PATCH /super-admin/payment-methods-catalog/{id}`. */
export interface PaymentMethodCatalogUpdatePayload {
  name?: string;
  type?: PaymentMethodCatalogType;
  fields?: PaymentMethodFieldDefinition[];
  active?: boolean;
}
