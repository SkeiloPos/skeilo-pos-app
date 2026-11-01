import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { createCachedLoader } from '../../../shared/cached-loader.util';
import { ModuleAccess, PlanSummary } from '../interfaces/plan-summary.interface';

/** Transport for `GET /api/v1/plan` (spec 033) — consumo del tenant y datos
 * de gating de navegación (Historias de Usuario 4 y 6). Cualquier usuario
 * autenticado del dashboard puede consultarlo, no solo ADMIN. */
@Injectable({ providedIn: 'root' })
export class PlanSummaryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/plan`;

  readonly summary = signal<PlanSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Observable crudo — usado por `plan-module.guard.ts`, que necesita
   * resolver antes de activar una ruta sin depender del signal. */
  fetch(): Observable<PlanSummary> {
    return this.http.get<PlanSummary>(this.baseUrl);
  }

  /** Fija el signal directamente desde el arranque agregado (`BootstrapService`),
   * sin disparar ninguna petición HTTP propia (spec 100, research.md Decisión 7). */
  hydrate(value: PlanSummary | null): void {
    this.summary.set(value);
  }

  /**
   * ¿El plan vigente incluye el módulo? Predicado **fail-closed para CARGAR datos** (spec 141, FR-014):
   * verdadero solo si el resumen ya llegó, el plan no venció y el módulo está incluido. Mientras el plan
   * es desconocido (`summary() === null`) devuelve `false`, así que una carga de fondo de un endpoint del
   * módulo no sale hasta saber que está incluido. Es una lectura de un signal: dentro de un `effect` o un
   * `computed` es reactivo, y la carga sale en cuanto el resumen llega.
   *
   * El menú (`visibleItems` de `SidebarComponent` y `TenantSidebarComponent`) usa el predicado contrario,
   * **fail-open**: mientras el plan es desconocido muestra la opción, no la oculta.
   */
  includes(key: keyof ModuleAccess): boolean {
    const summary = this.summary();
    return summary !== null && !summary.vencido && summary.modules[key] === true;
  }

  /**
   * Marca de inmediato y sin petición que el plan ya no incluye `module` (spec 141, FR-016): el servidor
   * acaba de responder `MODULE_NOT_IN_PLAN`, así que el menú se corrige en el acto aunque el refresco de
   * `GET /plan` tarde o falle. Actualización inmutable del signal; si el resumen aún no llegó, o la clave
   * no es un módulo del resumen, no hace nada.
   */
  markModuleMissing(module: keyof ModuleAccess): void {
    this.summary.update((current) => {
      if (current === null || !(module in current.modules)) return current;
      return { ...current, modules: { ...current.modules, [module]: false } };
    });
  }

  private readonly cachedLoad = createCachedLoader(
    () => this.summary() !== null,
    () => this.fetchAndStore(),
  );

  /** Caché y deduplicación: ver `createCachedLoader` (spec 101). */
  load(options?: { force?: boolean }): Promise<void> {
    return this.cachedLoad.load(options);
  }

  private async fetchAndStore(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.summary.set(await firstValueFrom(this.fetch()));
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar la información de tu plan.'));
    } finally {
      this.loading.set(false);
    }
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
    }
    return fallback;
  }
}
