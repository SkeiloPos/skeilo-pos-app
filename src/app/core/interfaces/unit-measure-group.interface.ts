/** Unidad anidada dentro de `UnitMeasureGroupResponse` (spec 137). */
export interface UnitInGroup {
  id: string;
  name: string;
  abbreviation: string;
  factor_to_base: number;
  is_base: boolean;
  active: boolean;
}

/** Mirrors the backend `UnitMeasureGroupResponse`. */
export interface UnitMeasureGroup {
  id: string;
  name: string;
  units: UnitInGroup[];
  created_at: string;
  updated_at?: string | null;
}

/** Request body for `POST /unit-measure-groups` (`UnitMeasureGroupCreate`). */
export interface UnitMeasureGroupCreatePayload {
  name: string;
  base_unit: { name: string; abbreviation: string };
}

/** Request body for `POST /unit-measure-groups/{id}/units` (`UnitMeasureGroupAddUnit`). */
export interface UnitMeasureGroupAddUnitPayload {
  name: string;
  abbreviation: string;
  factor_to_base: number;
}

/** Request body for `PATCH /unit-measure-groups/{id}` (`UnitMeasureGroupRename`). */
export interface UnitMeasureGroupRenamePayload {
  name: string;
}

/** Request body for `PATCH /unit-measure-groups/{id}/base-unit`
 *  (`UnitMeasureGroupBaseReassign`). */
export interface UnitMeasureGroupBaseReassignPayload {
  unit_measure_id: string;
}

/** Unidad que bloquea una acción (409, `contracts/unit-measure-groups-api.md`). */
export interface BlockingUnit {
  id: string;
  name: string;
  abbreviation?: string;
  reason?: string;
}

/** Forma del detalle de un 409 "en uso" (FR-008/FR-009/FR-011/FR-014). */
export interface UnitInUseErrorBody {
  error: string;
  blocking_units: BlockingUnit[];
}
