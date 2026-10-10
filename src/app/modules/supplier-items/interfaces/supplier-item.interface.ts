/**
 * Domain models for the relación proveedor-insumo API (spec 106):
 * `/inventory/items/{id}/suppliers`, `/inventory/suppliers/{id}/items`,
 * `/inventory/supplier-items/{id}`.
 *
 * The backend returns decimals as strings; this interface uses `number`.
 */

/** A proveedor-insumo relation. Mirrors backend `SupplierItemResponse`. */
export interface SupplierItem {
  id: string;
  supplier_id: string;
  supplier_name: string;
  inventory_item_id: string;
  inventory_item_name: string;
  presentation: string;
  conversion_factor: number;
  last_cost: number | null;
  /** ISO datetime; null si nunca se registró un costo (FR-006). */
  last_cost_at: string | null;
  active: boolean;
  preferred: boolean;
  /** "1 Bolsa x 500 g = 500 g · $16/g"; null si no hay último costo (FR-007). */
  equivalence: string | null;
  /** Solo relevante en la respuesta de un PATCH que desactivó la preferida (FR-011). */
  was_preferred: boolean;
}

/** Fields captured by the create/edit form. */
export interface SupplierItemForm {
  presentation: string;
  conversion_factor: number;
  last_cost: number | null;
}

// --- Request payloads (what the service sends to the backend) ---

/** `POST .../suppliers` o `.../items` (`SupplierItemCreate`): el id del lado fijo (por la
 *  URL) no va en el cuerpo -- el service lo agrega según el contexto (item o supplier). */
export interface SupplierItemCreatePayload {
  supplier_id?: string;
  inventory_item_id?: string;
  presentation: string;
  conversion_factor: number;
  last_cost?: number | null;
}

/** `PATCH /inventory/supplier-items/{id}` (`SupplierItemUpdate`) -- todo opcional. */
export interface SupplierItemUpdatePayload {
  presentation?: string;
  conversion_factor?: number;
  last_cost?: number | null;
  active?: boolean;
  preferred?: boolean;
}
