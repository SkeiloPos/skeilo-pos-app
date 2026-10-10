/**
 * Domain models for the `/inventory/suppliers` API (proveedores).
 *
 * The backend has no decimals here; all fields map 1:1.
 */

/** A supplier (proveedor). Mirrors backend `SupplierResponse`. */
export interface Supplier {
  id: string;
  name: string;
  /** Tax id / NIT. */
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  /** Proveedor de sistema ("Compra ocasional", spec 106) -- nunca se vincula a un insumo
   *  ni es preferido (RN-17); su fila no enlaza a "Insumos que vende" (FR-012). */
  is_system: boolean;
}

/** Editable fields captured by the supplier form (create/edit). */
export interface SupplierForm {
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
}

// --- Request payloads (what the service sends to the backend) ---

/** `POST /inventory/suppliers` (`SupplierCreate`). */
export interface SupplierCreatePayload {
  name: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** `PATCH /inventory/suppliers/{id}` (`SupplierUpdate`) — all fields optional. */
export interface SupplierUpdatePayload {
  name?: string;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  active?: boolean;
}
