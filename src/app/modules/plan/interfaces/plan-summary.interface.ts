/** Mirrors `PlanSummaryResponse` (`GET /api/v1/plan`, spec 033, Historia de
 * Usuario 6). `limit: null` = ilimitado (FR-007); `plan_vence_en: null` =
 * sin vencimiento (FR-021). */
export interface ResourceUsage {
  used: number;
  limit: number | null;
}

/** Módulos que un plan puede incluir (spec 141): «Inventario» cubre también Proveedores y
 * Compras, que ya no son un módulo aparte. */
export interface ModuleAccess {
  inventario: boolean;
  promociones: boolean;
  cocina: boolean;
}

export interface PlanSummary {
  plan_name: string;
  ciclo_facturacion: 'mensual' | 'anual' | null;
  plan_vence_en: string | null;
  vencido: boolean;
  resources: Record<string, ResourceUsage>;
  modules: ModuleAccess;
}
