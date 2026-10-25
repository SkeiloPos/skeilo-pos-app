/** Mirrors the backend `UnitMeasureResponse`. */
export interface UnitMeasure {
  id: string;
  name: string;
  abbreviation: string;
  /** Grupo de medida (spec 134): dos unidades son convertibles entre sí si coincide. */
  dimension: string;
  /** Factor hacia la base de su dimensión (spec 134), p. ej. kg→1000 g. */
  factor_to_base: number;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Editable fields captured by the unit-measure form. */
export interface UnitMeasureForm {
  name: string;
  abbreviation: string;
  dimension: string;
  factor_to_base: number;
}

/** Request body for `POST /unit-measures` (`UnitMeasureCreate`). */
export interface UnitMeasureCreatePayload {
  name: string;
  abbreviation: string;
  dimension: string;
  factor_to_base: number;
}

/** Request body for `PATCH /unit-measures/{id}` (`UnitMeasureUpdate`). */
export interface UnitMeasureUpdatePayload {
  name?: string;
  abbreviation?: string;
  dimension?: string;
  factor_to_base?: number;
  active?: boolean;
}

/** Mirrors the backend `FactorChangeResponse` (spec 134, FR-011). */
export interface UnitMeasureFactorChange {
  id: string;
  unit_measure_id: string;
  old_factor: number;
  new_factor: number;
  changed_by: string;
  changed_at: string;
}
