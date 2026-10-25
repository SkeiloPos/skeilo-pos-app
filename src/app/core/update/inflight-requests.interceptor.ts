import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UpdateGateService } from './update-gate.service';

const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cuenta las escrituras (POST/PUT/PATCH/DELETE) al backend propio mientras están
 * en vuelo, para que una actualización de versión nunca recargue la página con un
 * envío o un pago a medias (spec 134, M2). No bloquea ni modifica nada.
 *
 * Va **después** de `pageIntegrityInterceptor`: una acción rechazada por la
 * integridad de la página nunca llega a contarse.
 */
export const inflightRequestsInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl) || METODOS_DE_LECTURA.has(req.method)) {
    return next(req);
  }
  const gate = inject(UpdateGateService);
  gate.beginRequest();
  return next(req).pipe(finalize(() => gate.endRequest()));
};
