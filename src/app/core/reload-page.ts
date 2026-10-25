import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/**
 * Único punto de recarga de la aplicación (spec 134).
 *
 * Lo usan el botón "Recargar" del aviso de página alterada y la actualización
 * automática de versión. Va detrás de un token para poder sustituirlo en las
 * pruebas: `location.reload()` real recargaría jsdom y, además, así se puede
 * afirmar "recarga / no recarga" sin efectos.
 */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return () => doc.defaultView?.location.reload();
  },
});
