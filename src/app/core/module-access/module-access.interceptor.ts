import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { Observable, catchError, from, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ModuleAccessLostService } from './module-access-lost.service';
import { MODULE_NOT_IN_PLAN_CODE, MODULE_NOT_IN_PLAN_MESSAGE } from './module-access.messages';

interface ModuleErrorBody {
  code?: unknown;
  module?: unknown;
  detail?: unknown;
  [key: string]: unknown;
}

/** Cuerpo del error como objeto, o `null` si no se puede interpretar. Un `Blob` (petición con
 *  `responseType: 'blob'`, p. ej. `exportItems` / `downloadImportErrors`) se lee como JSON. */
function readErrorBody(raw: unknown): Observable<ModuleErrorBody | null> {
  if (raw instanceof Blob) {
    // Cualquier falla de lectura o de JSON (incluso un `text()` que no exista) deja el error intacto.
    return from(
      Promise.resolve()
        .then(() => raw.text())
        .then((text) => JSON.parse(text) as unknown)
        .then((parsed) => (parsed !== null && typeof parsed === 'object' ? (parsed as ModuleErrorBody) : null))
        .catch(() => null),
    );
  }
  // Síncrono a propósito para el caso normal: no cambia el momento en que un error llega a su llamador.
  return of(raw !== null && typeof raw === 'object' ? (raw as ModuleErrorBody) : null);
}

/**
 * Detecta el 403 `MODULE_NOT_IN_PLAN` de cualquier petición al API (spec 141, US5, FR-016) y delega en
 * `ModuleAccessLostService`: un solo aviso, una sola redirección y el menú corregido sin recargar. Luego
 * **relanza** el error con `detail` = «Esta funcionalidad no está incluida en tu plan» (el mismo texto del
 * aviso, así el `ToastService` descarta el duplicado si una pantalla muestra `detail` por su cuenta) y con
 * `error` siempre como objeto —nunca un `Blob`— para que los llamadores cierren su estado de carga como
 * siempre.
 *
 * - Solo actúa sobre URLs de `environment.apiBaseUrl` y sobre respuestas 403 con `code === 'MODULE_NOT_IN_PLAN'`.
 *   El 403 de plan vencido, de rol o de límite no lleva ese código y pasa intacto.
 * - Va **último** en `withInterceptors([...])` (`app.config.ts`): ve el 403 real, también el de un reintento
 *   tras refrescar el token.
 * - Las rutas del comensal (`/cart`, `/menu/qr-token`) nunca devuelven este código; no necesitan lógica extra.
 */
export const moduleAccessInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);

  // El servicio se resuelve solo cuando hace falta (en un 403 con código), no en cada petición.
  const injector = inject(Injector);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 403) return throwError(() => err);

      return readErrorBody(err.error).pipe(
        switchMap((body) => {
          if (body?.code !== MODULE_NOT_IN_PLAN_CODE) return throwError(() => err);

          const module = typeof body.module === 'string' ? body.module : undefined;
          void injector.get(ModuleAccessLostService).handle(module);

          return throwError(
            () =>
              new HttpErrorResponse({
                error: { ...body, detail: MODULE_NOT_IN_PLAN_MESSAGE },
                headers: err.headers,
                status: err.status,
                statusText: err.statusText,
                url: err.url ?? undefined,
              }),
          );
        }),
      );
    }),
  );
};
