/**
 * Domain models for the `/inventory` API (insumos, movimientos y compras).
 *
 * The backend returns decimals as strings; these domain types use `number`.
 * The service is responsible for the string↔number conversion.
 */

/** `raw_material` = materia prima a granel. `packaged` = insumo empacado. */
export type InventoryItemType = 'raw_material' | 'packaged';

/** Fila de alerta de bajo stock. Mirrors backend `LowStockResponse`. */
export interface LowStockItem {
  id: string;
  name: string;
  current_stock: number;
  min_stock: number;
}

/** An inventory item (insumo). Mirrors backend `InventoryItemResponse`. */
export interface InventoryItem {
  id: string;
  /** Identificador de negocio para el export/import masivo (spec 109). */
  code: string;
  name: string;
  unit_measure_id: string;
  type: InventoryItemType;
  /** Read-only after creation: changes through adjustments and purchases. */
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  active: boolean;
  /** ISO datetime. */
  created_at: string;
  /** ISO datetime; null si nunca se ha editado desde que se creó. */
  updated_at: string | null;
  /** Nombre del proveedor preferido activo (spec 106, RN-16); null si no tiene ninguno. */
  preferred_supplier_name: string | null;
}

/** Editable fields captured by the item form (create/edit). */
export interface InventoryItemForm {
  name: string;
  unit_measure_id: string;
  type: InventoryItemType;
  /** Only used on create; ignored on edit (backend has no stock edit). */
  current_stock: number;
  min_stock: number;
  unit_cost: number;
}

/** A stock movement / kardex line. Mirrors backend `MovementResponse`. */
export interface InventoryMovement {
  id: string;
  inventory_item_id: string;
  type: string;
  quantity: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  /** ISO datetime. */
  moved_at: string;
}

/** Fields captured for a stock adjustment (signed delta). */
export interface AdjustForm {
  /** Positive quantity; sign applied from the chosen direction. */
  quantity: number;
  direction: 'in' | 'out';
  reason: string | null;
}

export type PurchaseStatus = 'draft' | 'partial' | 'received';

/** A purchase line item. Mirrors backend `PurchaseItemResponse`. */
export interface PurchaseItem {
  id: string;
  inventory_item_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  /** spec 107: presente solo si la línea se compró en una presentación guardada. */
  supplier_item_id: string | null;
  presentation_quantity: number | null;
  /** Copia del texto de la presentación en el momento de la compra (snapshot). */
  presentation_label: string | null;
  /** Denormalizado por el backend; sirve para mostrar "pendiente en presentaciones" al recibir. */
  conversion_factor: number | null;
}

/** A purchase (compra). Mirrors backend `PurchaseResponse`. */
export interface Purchase {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  status: PurchaseStatus;
  total: number;
  /** ISO datetime. */
  purchased_at: string;
  items: PurchaseItem[];
}

/** Recepción de ítems (RF-022): cantidad recibida por línea de compra. spec 107: exactamente
 *  uno de `quantity` (unidad base) o `presentation_quantity` (si la línea se pactó en una
 *  presentación), según `PurchaseItem.supplier_item_id`. */
export interface PurchaseReceivePayload {
  items: { purchase_item_id: string; quantity?: number; presentation_quantity?: number }[];
}

/** A single line captured in the purchase form. spec 107: si `supplier_item_id` está
 *  presente, `quantity` es la cantidad de presentaciones y `unit_cost` el costo de una sola
 *  presentación -- el backend calcula la equivalencia en unidad base. */
export interface PurchaseLineForm {
  inventory_item_id: string;
  quantity: number;
  unit_cost: number;
  supplier_item_id?: string | null;
}

/** Fields captured when registering a purchase. */
export interface PurchaseForm {
  supplier_id: string | null;
  invoice_number: string | null;
  items: PurchaseLineForm[];
}

// --- Request payloads (what the service sends to the backend) ---

/** `POST /inventory/items` (`InventoryItemCreate`). */
export interface InventoryItemCreatePayload {
  name: string;
  unit_measure_id: string;
  type: InventoryItemType;
  current_stock: number;
  min_stock: number;
  unit_cost: number;
}

/** `PATCH /inventory/items/{id}` (`InventoryItemUpdate`) — all fields optional. */
export interface InventoryItemUpdatePayload {
  name?: string;
  unit_measure_id?: string;
  type?: InventoryItemType;
  min_stock?: number;
  unit_cost?: number;
  active?: boolean;
}

/** `POST /inventory/items/{id}/adjust` (`AdjustmentIn`). */
export interface AdjustmentPayload {
  signed_delta: number;
  reason?: string | null;
}

/** A purchase line as sent to the backend (`PurchaseItemIn`). spec 107: exactamente uno de
 *  los dos modos -- `quantity`/`unit_cost` (unidad base, como siempre) o `supplier_item_id` +
 *  `presentation_quantity` + `presentation_unit_cost` (presentación guardada). */
export interface PurchaseItemPayload {
  inventory_item_id: string;
  quantity?: number;
  unit_cost?: number;
  supplier_item_id?: string;
  presentation_quantity?: number;
  presentation_unit_cost?: number;
}

/** `POST /inventory/purchases` (`PurchaseCreate`). */
export interface PurchaseCreatePayload {
  supplier_id?: string | null;
  invoice_number?: string | null;
  items: PurchaseItemPayload[];
}

// --- Importación masiva (spec 109) ---

export type InventoryImportJobStatus = 'procesando' | 'finalizado' | 'interrumpido';

/** Resultado de un import en curso o finalizado. Mirrors backend
 *  `InventoryImportJobResponse` (`GET /items/import/current`, `GET /items/import/{id}`,
 *  y la respuesta de `POST /items/import`). */
export interface InventoryImportJob {
  id: string;
  status: InventoryImportJobStatus;
  file_name: string;
  /** ISO datetime. */
  started_at: string;
  /** ISO datetime; null mientras `status === 'procesando'`. */
  finished_at: string | null;
  total_rows: number;
  created_count: number;
  updated_count: number;
  failed_count: number;
  has_errors: boolean;
}
