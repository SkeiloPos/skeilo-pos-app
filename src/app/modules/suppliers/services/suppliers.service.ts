import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { normalizeText } from '../../../shared/normalize-text';
import {
  Supplier,
  SupplierCreatePayload,
  SupplierForm,
  SupplierUpdatePayload,
} from '../interfaces/supplier.interface';

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/inventory/suppliers`;

  readonly suppliers = signal<Supplier[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadSuppliers(active?: boolean): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    let params = new HttpParams();
    if (active !== undefined) params = params.set('active', String(active));

    try {
      const data = await firstValueFrom(
        this.http.get<Supplier[]>(this.baseUrl, { params })
      );
      this.suppliers.set([...data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Proveedor puntual, para el encabezado del detalle (spec 106). */
  async getSupplier(id: string): Promise<Supplier> {
    return firstValueFrom(this.http.get<Supplier>(`${this.baseUrl}/${id}`));
  }

  /**
   * Búsqueda del selector de "vincular proveedor" (spec 106, FR-012): sin precarga de
   * catálogo completo (memoria de sesión sobre selectores) -- se pide fresco cada vez que
   * el usuario escribe algo en `app-searchable-select`, nunca en la carga de la página.
   * Excluye siempre al proveedor de sistema ("Compra ocasional").
   */
  async searchLinkable(query: string): Promise<Supplier[]> {
    const params = new HttpParams().set('exclude_system', 'true');
    const data = await firstValueFrom(
      this.http.get<Supplier[]>(this.baseUrl, { params }),
    );
    const q = normalizeText(query);
    if (!q) return data;
    return data.filter((s) => normalizeText(s.name).includes(q));
  }

  async createSupplier(form: SupplierForm): Promise<boolean> {
    const payload: SupplierCreatePayload = {
      name: form.name,
      tax_id: form.tax_id,
      phone: form.phone,
      email: form.email,
    };
    return this.submit(() => this.http.post<Supplier>(this.baseUrl, payload));
  }

  async updateSupplier(id: string, form: SupplierForm): Promise<boolean> {
    const payload: SupplierUpdatePayload = {
      name: form.name,
      tax_id: form.tax_id,
      phone: form.phone,
      email: form.email,
    };
    return this.submit(() =>
      this.http.patch<Supplier>(`${this.baseUrl}/${id}`, payload)
    );
  }

  async toggleActive(id: string, current: boolean): Promise<boolean> {
    const payload: SupplierUpdatePayload = { active: !current };
    return this.submit(() =>
      this.http.patch<Supplier>(`${this.baseUrl}/${id}`, payload)
    );
  }

  /**
   * Runs a write request, then refreshes the list. Returns `true` on success so
   * callers can close their modal only when the operation succeeded.
   */
  private async submit(request: () => Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(request());
      await this.loadSuppliers();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
