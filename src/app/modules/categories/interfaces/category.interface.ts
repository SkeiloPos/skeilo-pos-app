/** Mirrors the backend `PresentationSummary` (spec 083). */
export interface CategoryPresentationSummary {
  id: string;
  name: string;
}

/** Mirrors the backend `CategoryResponse`. */
export interface Category {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  /** spec 128 (FR-001/FR-002): visibilidad específica del menú QR,
   *  independiente de `active`. */
  visible_en_qr: boolean;
  display_order: number;
  created_at: string;
  updated_at?: string | null;
  /** spec 083 (FR-004): presentaciones asociadas actualmente. */
  presentations: CategoryPresentationSummary[];
}

/** Editable fields captured by the category form. */
export interface CategoryForm {
  name: string;
  description: string;
  display_order: number | null;
  /** spec 083: ids de presentaciones asociadas (reemplazo total al guardar). */
  presentation_ids: string[];
}

/** Request body for `POST /categories` (`CategoryCreate`). */
export interface CategoryCreatePayload {
  name: string;
  description: string | null;
  display_order: number | null;
  presentation_ids: string[];
}

/** Request body for `PATCH /categories/{id}` (`CategoryUpdate`). */
export interface CategoryUpdatePayload {
  name?: string;
  description?: string | null;
  active?: boolean;
  /** spec 128 (FR-005/FR-006): solo ADMIN, y solo con la categoría activa —
   *  el backend responde 403/422 en caso contrario. */
  visible_en_qr?: boolean;
  display_order: number | null;
  presentation_ids?: string[];
}
