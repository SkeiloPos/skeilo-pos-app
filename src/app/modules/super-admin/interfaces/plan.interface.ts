/** Mirrors `PlanResponse` (`GET /super-admin/plans`, spec 033). `null` en un
 * límite numérico significa "ilimitado" (FR-007); no confundir con `0`
 * (bloqueado). */
export interface Plan {
  id: string;
  name: string;
  description?: string | null;

  mesas_limit: number | null;
  cajas_limit: number | null;
  usuarios_limit: number | null;
  productos_limit: number | null;
  metodos_pago_activos_limit: number | null;

  inventario_access: boolean;
  promociones_access: boolean;
  cocina_access: boolean;

  modalidad_pago_qr: 'PAY_AFTER_RECEIVING' | 'PAY_BEFORE_RECEIVING';

  precio_mensual: string | null;
  precio_anual: string | null;

  created_at: string;
  updated_at?: string | null;
}

/** Request body for `POST /super-admin/plans`. Toda característica es
 * opcional (FR-001) — omitirla la deja bloqueada (0/false); `null` explícito
 * en un límite es "ilimitado" (FR-007). */
export interface PlanCreatePayload {
  name: string;
  description?: string | null;

  mesas_limit?: number | null;
  cajas_limit?: number | null;
  usuarios_limit?: number | null;
  productos_limit?: number | null;
  metodos_pago_activos_limit?: number | null;

  inventario_access?: boolean;
  promociones_access?: boolean;
  cocina_access?: boolean;

  modalidad_pago_qr?: 'PAY_AFTER_RECEIVING' | 'PAY_BEFORE_RECEIVING';

  precio_mensual?: number | null;
  precio_anual?: number | null;
}

/** Request body for `PATCH /super-admin/plans/{id}`. Solo se envían los
 * campos que cambiaron. */
export type PlanUpdatePayload = Partial<PlanCreatePayload>;
