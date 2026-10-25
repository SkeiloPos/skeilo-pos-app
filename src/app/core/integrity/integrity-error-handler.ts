import { ErrorHandler, Injectable, inject } from '@angular/core';
import { PageIntegrityService } from './page-integrity.service';

/**
 * `ErrorHandler` de Angular que, antes de registrar el error como siempre, se lo
 * pasa al servicio de integridad (spec 134, FR-011).
 *
 * Solo un `NotFoundError` de `removeChild`/`insertBefore` cambia algo: es la
 * huella de que Angular intentó tocar un nodo cuyo padre alteró el navegador. El
 * resto de errores (red, validación, 4xx/5xx, genéricos) los ignora el servicio.
 * No traga ni transforma nada: el error se sigue registrando igual.
 */
@Injectable()
export class IntegrityAwareErrorHandler extends ErrorHandler {
  private readonly integrity = inject(PageIntegrityService);

  override handleError(error: unknown): void {
    try {
      this.integrity.reportDomError(error);
    } catch {
      // El aviso nunca debe esconder el error original.
    }
    super.handleError(error);
  }
}
