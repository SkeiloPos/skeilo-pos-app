import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  Tenant,
  TenantCreateWithUser,
  TenantPlanUpdatePayload,
} from '../interfaces/tenant.interface';
import { Page } from '../interfaces/page.interface';
import { stripValueErrorPrefix } from '../../../shared/api-error.util';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin`;

  readonly tenants = signal<Tenant[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  loadTenants() {
    return this.http.get<Page<Tenant>>(`${this.baseUrl}/tenants`);
  }

  /**
   * Create a tenant together with its first administrator user via
   * `POST /api/v1/admin/tenants`. Response body is empty; callers reload the list.
   */
  async createTenant(payload: TenantCreateWithUser): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.http.post<void>(`${this.baseUrl}/tenants`, payload));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Asigna, cambia O renueva el plan de un tenant vía
   * `PATCH /api/v1/super-admin/tenants/{id}` — mismo método sirve las tres
   * operaciones (research.md Decisión 16, spec 033): pasar el mismo
   * `plan_id` que el tenant ya tenía es una renovación.
   */
  async changePlan(tenantId: number, payload: TenantPlanUpdatePayload): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.patch<Tenant>(`${this.baseUrl}/tenants/${tenantId}`, payload));
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    const fallback = 'No se pudo completar la operación.';
    if (err instanceof HttpErrorResponse) {
      const body = err.error as {
        detail?: unknown;
        message?: string;
        error?: { details?: { errors?: { msg?: string }[] } | null };
      } | null;
      // Envelope de errores del Super Admin: el 422 trae los mensajes de campo en
      // `error.details.errors` y `detail` solo el texto genérico.
      const fieldMsg = body?.error?.details?.errors?.[0]?.msg;
      if (fieldMsg) return stripValueErrorPrefix(fieldMsg);
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      // FastAPI 422: `detail` is an array of `{ msg, loc, ... }`.
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as { msg?: string };
        return first?.msg ? stripValueErrorPrefix(first.msg) : fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
