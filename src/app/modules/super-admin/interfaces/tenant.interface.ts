/** Ciclo de facturación de la asignación de plan vigente (spec 033). `null`
 * = sin vencimiento. */
export type BillingCycle = 'mensual' | 'anual' | null;

/** Mirrors the backend tenant resource (`TenantResponse`, spec 033: pierde
 * `plan` de texto libre, gana la asignación de plan real). */
export interface Tenant {
  id: number;
  name: string;
  schema: string;
  plan_id: string;
  plan_name?: string | null;
  ciclo_facturacion: BillingCycle;
  plan_vence_en?: string | null;
  /** Zona horaria IANA del tenant (spec 138, FR-008): el vencimiento de cada fila se muestra en SU zona. */
  timezone: string;
  host: string;
  created_at: string;
  updated_at?: string | null;
}

/**
 * Request body for `POST /api/v1/admin/tenants` (`TenantCreateWithUser`).
 * Creates the tenant together with its first administrator user.
 * `plan_id`/`ciclo_facturacion` son obligatorios (FR-004/FR-017, spec 033) —
 * no hay plan por defecto implícito.
 */
export interface TenantCreateWithUser {
  tenant_name: string;
  schema_name: string;
  host: string;
  /** Administrator user fields. */
  name: string;
  email: string;
  plan_id: string;
  ciclo_facturacion: BillingCycle;
  /** Zona horaria IANA del negocio (spec 138, FR-010). La pantalla siempre la envía (obligatoria, sin valor
   *  inicial); es opcional en el tipo porque la API lo es (sin ella el tenant nace en `America/Bogota`). */
  timezone?: string;
}

/** Request body for `PATCH /api/v1/super-admin/tenants/{id}` — asigna,
 * cambia o renueva el plan de un tenant (spec 033). */
export interface TenantPlanUpdatePayload {
  plan_id: string;
  ciclo_facturacion: BillingCycle;
}
