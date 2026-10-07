import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { createCachedLoader } from '../../../shared/cached-loader.util';
import { PlanSummary } from '../interfaces/plan-summary.interface';

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
