/**
 * spec 063 — modelo por **conjunto explícito de variantes**, partición
 * `Promoción`/`Regla` (revisión 2026-09-01, FR-001/FR-001a). Los tipos vivos
 * quedan en dos (decisión de negocio A-58…A-65, registro-de-anomalias.md):
 *
 * - `percent`: `value` = % de descuento (0 < value ≤ 100).
 * - `package_price`: `value` = precio total de `min_qty` unidades cualesquiera
 *   del conjunto de variantes de **una regla**.
 *
 * Una `Promotion` ya no tiene `type`/`value`/`min_qty`/`variants` propios —
 * agrupa una o más `PromotionRule`, que comparten su vigencia y su estado
 * (no tienen vigencia ni estado propios). `PromotionRule.type` puede además
 * traer un tipo viejo (`combo` / `qty_price` / `qty_price_presentation` /
 * `fixed`) **solo** si la regla vino de migrar una promoción `finished` que
 * `063a` cerró (FR-025); el formulario nunca las edita.
 */
export type PromotionType = 'percent' | 'package_price';

/** Cualquier `type` que el backend puede serializar (incluye los `finished` de
 *  tipo viejo: `combo` / `qty_price` / `qty_price_presentation` / `fixed`). */
export type PromotionTypeAny = string;

/**
 * Máquina de estados del backend (`PROMOTION_TRANSITIONS`). Es de la
 * **promoción**, no de cada regla — `draft` es el único estado en el que se
 * pueden agregar, quitar o editar reglas. `finished` es terminal.
 */
export type PromotionStatus = 'draft' | 'active' | 'paused' | 'finished';

export const PROMOTION_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  draft: ['active', 'finished'],
  active: ['paused', 'finished'],
  paused: ['active', 'finished'],
  finished: [],
};

/** Una variante del conjunto elegible de una regla, con su precio normal
 *  vigente (FR-005). */
export interface PromotionVariant {
  product_variant_id: string;
  description: string;
  /** Decimal serializado como string (`"8000.00"`). */
  unit_price: string;
}

/** spec 063 (revisión 2026-09-01): la combinación (tipo, valor, cantidad
 *  mínima) + su propio conjunto de variantes — antes vivía directo en
 *  `Promotion`. */
export interface PromotionRule {
  id: string;
  type: PromotionTypeAny;
  value: string;
  min_qty: number;
  /** Condición en lenguaje llano (FR-005); `null` para una regla de tipo viejo. */
  condition_text: string | null;
  variants: PromotionVariant[];
}

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  status: PromotionStatus;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  /** Marca de "finalizada por la migración de la spec 063" (FR-025). */
  closed_by_refactor_at: string | null;
  /** spec 063 (revisión 2026-09-01, FR-001): reemplaza type/value/min_qty/
   *  condition_text/variants sueltos — cada regla lleva los suyos. */
  rules: PromotionRule[];
}

/** Modelo de **una regla** dentro del formulario (UI). spec 083 (US3): cada
 *  fila se agrega ya completa desde el Paso 1/Paso 2 de la pantalla de
 *  configuración ("Agregar a la lista") — no hay edición in-situ, solo alta
 *  y baja de filas, así que ya no hace falta distinguir una regla "nueva en
 *  esta sesión" de una que ya existía (`isExisting` de spec 071 se retira). */
export interface PromotionRuleForm {
  type: PromotionType;
  value: number;
  /** `package_price`: tamaño del paquete (≥1). `percent`: cantidad mínima. */
  min_qty: number;
  /** Conjunto explícito de variantes elegibles de esta regla (FR-001a): ≥1,
   *  sin repetidos dentro de la regla. */
  variantIds: string[];
}

/** Modelo del formulario (UI): vigencia de la promoción + su lista repetible
 *  de reglas (research.md D-R4, creación por lote). spec 083 (FR-010): el
 *  tipo se fija una sola vez (pantalla de creación) y se aplica a toda
 *  regla que se agregue después — ya no es un campo por regla en la UI. */
export interface PromotionForm {
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: number[]; // 0=lunes..6=domingo
  start_time: string | null;
  end_time: string | null;
  type: PromotionType;
  rules: PromotionRuleForm[];
}

export interface PromotionRuleInPayload {
  type: PromotionType;
  value: number;
  min_qty: number;
  variant_ids: string[];
}

/** Campos escalares comunes a create y update — de la **promoción**. spec 083
 *  (FR-023): `description` se retira por completo del flujo de UI — el
 *  frontend ya no lo lee ni lo envía en ningún payload (el campo del backend
 *  sigue existiendo, sin cambios, para no perder datos históricos). */
interface PromotionScalars {
  name: string;
  /** spec 127 (FR-005): editable en update, pero el backend solo la acepta
   *  mientras la promoción sigue en `draft` (409 fuera de ese estado) — ver
   *  `PromotionCreatePayload`, donde además es obligatoria. */
  starts_at: string | null;
  ends_at: string | null;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface PromotionCreatePayload extends PromotionScalars {
  /** El backend crea en `draft` por defecto; activar es explícito. */
  status: Extract<PromotionStatus, 'draft' | 'active'>;
  /** FR-012: obligatoria al crear. */
  starts_at: string;
  /** FR-001: una promoción agrupa una o más reglas, capturadas en la misma
   *  sesión del formulario (creación por lote). */
  rules: PromotionRuleInPayload[];
}

/**
 * `PATCH /promotions/{id}` solo acepta escalares de la promoción. spec 063
 * (revisión 2026-09-01, FR-018): `type`/`value`/`min_qty`/conjunto ya no
 * existen aquí — viven en cada regla y solo se editan por
 * `PATCH /{id}/shape`, y solo en borrador (reemplazo completo de la lista).
 * spec 127 (FR-005): `starts_at` se suma a los escalares editables.
 */
export type PromotionUpdatePayload = Partial<PromotionScalars>;

export interface PromotionShapePayload {
  rules: PromotionRuleInPayload[];
}

export interface PromotionStatusPayload {
  status: PromotionStatus;
}

export interface PromotionDuplicatePayload {
  name: string;
  /** spec 084 (A-83): reemplazar la promoción que ya usa ese nombre (se elimina con sus reglas). */
  replace_existing?: boolean;
}

/**
 * Cuerpo del 409 de FR-014 (solape real bloqueado, entre reglas de
 * promociones distintas): nombra la promoción y la regla en conflicto y las
 * variantes compartidas.
 */
export interface OverlapConflictError {
  error: string;
  conflicts: {
    promotion_id: string;
    promotion_name: string;
    rule_id: string;
    variant_ids: string[];
  }[];
}

/**
 * Cuerpo del 409 de FR-001a: la misma variante está en más de una regla de
 * la promoción que se está guardando.
 */
export interface RuleVariantConflictError {
  error: string;
  rule_index_a: number;
  rule_index_b: number;
  variant_ids: string[];
}

/** Cuerpo del 409 de FR-016/FR-026: el precio de paquete de una regla no
 *  representa un descuento frente a la suma de precios regulares de las
 *  unidades del paquete. */
export interface PackageNotDiscountError {
  error: string;
  rule_id: string;
  value: string;
  min_qty: number;
  regular_price_sum: string;
  variant_id: string;
}
