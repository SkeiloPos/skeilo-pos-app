/** Mirrors the backend `UnitMeasureResponse`. */
export interface UnitMeasure {
  id: string;
  name: string;
  abbreviation: string;
  /** Factor hacia la base de su dimensión (spec 134), p. ej. kg→1000 g. */
  factor_to_base: number;
  active: boolean;
  /** Grupo al que pertenece (spec 137). */
  group_id: string;
  /** `true` si es la unidad base de su grupo (spec 137, FR-007/FR-008). */
  is_base: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Editable fields captured by the unit-measure form (editar unidad existente, spec 137:
 *  ya no incluye `dimension` -- se edita vía grupo). */
export interface UnitMeasureForm {
  name: string;
  abbreviation: string;
  factor_to_base: number;
}

/** Request body for `POST /unit-measures` (`UnitMeasureCreate`, spec 137: retirado del
 *  flujo normal -- usar `UnitMeasureGroupService` en su lugar). */
export interface UnitMeasureCreatePayload {
  name: string;
  abbreviation: string;
  group_id: string;
  factor_to_base: number;
}

/** Request body for `PATCH /unit-measures/{id}` (`UnitMeasureUpdate`). */
export interface UnitMeasureUpdatePayload {
  name?: string;
  abbreviation?: string;
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
