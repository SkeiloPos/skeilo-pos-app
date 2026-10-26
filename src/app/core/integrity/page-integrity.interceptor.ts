import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { findProtectedAction } from './protected-actions';
import { PageIntegrityService } from './page-integrity.service';

/**
 * Rechaza **antes de enviarlas** las acciones protegidas (crear pedido, cobrar,
 * aprobar un pago, mover dinero de caja) mientras la página esté alterada por el
 * navegador (spec 134, FR-012/FR-013).
 *
 * - Solo actúa sobre peticiones que aún no salieron: las que ya están en vuelo
 *   siguen su curso, sin cancelar ni duplicar nada (FR-014).
 * - El rechazo es un `HttpErrorResponse` 423 con `error.detail` en español: el
 *   `extractError` de cada pantalla lo muestra sin código nuevo. `423` no lo
 *   ramifica ningún código existente (a diferencia de 401/409/422/429).
 * - Se registra **antes** que `authTokenInterceptor`: el rechazo ocurre sin tocar
 *   tokens ni consumir un refresh.
 * - Nada se decide por el texto en pantalla: el valor enviado sigue saliendo del
 *   estado de la aplicación (FR-023).
 */
export const pageIntegrityInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);

  const integrity = inject(PageIntegrityService);
  if (!integrity.altered()) return next(req);

  const accion = findProtectedAction(req.method, req.url);
  if (!accion) return next(req);

  integrity.notifyBlocked(accion.label);
  return throwError(
    () =>
      new HttpErrorResponse({
        status: 423,
        statusText: 'Page Altered',
        url: req.url,
        error: {
          detail: `No se pudo ${accion.label}: la página fue alterada por el navegador. Recarga para continuar.`,
          code: 'page_altered',
        },
      }),
  );
};
