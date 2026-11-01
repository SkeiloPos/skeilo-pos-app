/**
 * Texto y código únicos del rechazo «el plan no incluye este módulo» (spec 141,
 * FR-006/FR-016). Una sola fuente para la guardia de rutas, el interceptor HTTP,
 * `ModuleAccessLostService` y las pruebas: el aviso y el `detail` que reescribe el
 * interceptor son idénticos, así el `ToastService` descarta el duplicado (spec 050).
 */
export const MODULE_NOT_IN_PLAN_MESSAGE = 'Esta funcionalidad no está incluida en tu plan';

/** Valor de `code` que el servidor pone en el 403 por módulo no incluido. */
export const MODULE_NOT_IN_PLAN_CODE = 'MODULE_NOT_IN_PLAN';

/**
 * ¿El error es el 403 `MODULE_NOT_IN_PLAN` ya atendido por `moduleAccessInterceptor`? Para las pantallas
 * que muestran un texto fijo propio ante un fallo: si el módulo se perdió, el interceptor ya dio el aviso
 * y llevó al inicio, así que no repiten el suyo. El interceptor entrega `error` siempre como objeto.
 */
export function isModuleNotInPlan(err: unknown): boolean {
  return (err as { error?: { code?: unknown } } | null)?.error?.code === MODULE_NOT_IN_PLAN_CODE;
}
