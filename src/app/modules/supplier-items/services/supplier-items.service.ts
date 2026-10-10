import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import {
  SupplierItem,
  SupplierItemCreatePayload,
  SupplierItemForm,
  SupplierItemUpdatePayload,
} from '../interfaces/supplier-item.interface';

/** Raw backend relation (decimals arrive as strings). */
interface SupplierItemResponse {
  id: string;
  supplier_id: string;
  supplier_name: string;
  inventory_item_id: string;
  inventory_item_name: string;
  presentation: string;
  conversion_factor: string;
  last_cost: string | null;
  last_cost_at: string | null;
  active: boolean;
  preferred: boolean;
  equivalence: string | null;
  was_preferred?: boolean;
}

/**
 * Cliente de la relación proveedor-insumo (spec 106). Sin signal de lista propio -- a
 * diferencia de `SuppliersService`/`InventoryService`, esta relación se consume
 * simétricamente desde dos páginas de detalle distintas (insumo y proveedor), cada una con
 * su propio estado de lista; este servicio solo envuelve las llamadas HTTP.
 */
@Injectable({ providedIn: 'root' })
export class SupplierItemsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/inventory`;

  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  /** Id de la relación activa con la que colisionó el último alta (FR-004); `null` salvo
   *  justo después de un 409, para que el formulario pueda ofrecer "editar la existente". */
  readonly conflictExistingId = signal<string | null>(null);

  async listForItem(itemId: string, includeInactive: boolean): Promise<SupplierItem[]> {
    const params = new HttpParams().set('include_inactive', String(includeInactive));
    const data = await firstValueFrom(
      this.http.get<SupplierItemResponse[]>(`${this.baseUrl}/items/${itemId}/suppliers`, { params }),
    );
    return data.map((r) => this.toItem(r));
  }

  async listForSupplier(supplierId: string, includeInactive: boolean): Promise<SupplierItem[]> {
    const params = new HttpParams().set('include_inactive', String(includeInactive));
    const data = await firstValueFrom(
      this.http.get<SupplierItemResponse[]>(`${this.baseUrl}/suppliers/${supplierId}/items`, { params }),
    );
    return data.map((r) => this.toItem(r));
  }

  /** Alta (o reactivación, FR-005) desde la pestaña "Proveedores" del insumo. */
  async createFromItem(itemId: string, supplierId: string, form: SupplierItemForm): Promise<SupplierItem | null> {
    return this.submit(() =>
      this.http.post<SupplierItemResponse>(`${this.baseUrl}/items/${itemId}/suppliers`, {
        supplier_id: supplierId,
        ...this.payload(form),
      } satisfies SupplierItemCreatePayload),
    );
  }

  /** Alta (o reactivación, FR-005) desde la pestaña "Insumos que vende" del proveedor. */
  async createFromSupplier(supplierId: string, itemId: string, form: SupplierItemForm): Promise<SupplierItem | null> {
    return this.submit(() =>
      this.http.post<SupplierItemResponse>(`${this.baseUrl}/suppliers/${supplierId}/items`, {
        inventory_item_id: itemId,
        ...this.payload(form),
      } satisfies SupplierItemCreatePayload),
    );
  }

  async update(relationId: string, payload: SupplierItemUpdatePayload): Promise<SupplierItem | null> {
    return this.submit(() =>
      this.http.patch<SupplierItemResponse>(`${this.baseUrl}/supplier-items/${relationId}`, payload),
    );
  }

  async setPreferred(relationId: string): Promise<SupplierItem | null> {
    return this.update(relationId, { preferred: true });
  }

  async deactivate(relationId: string): Promise<SupplierItem | null> {
    return this.update(relationId, { active: false });
  }

  private payload(form: SupplierItemForm): Omit<SupplierItemCreatePayload, 'supplier_id' | 'inventory_item_id'> {
    return {
      presentation: form.presentation,
      conversion_factor: form.conversion_factor,
      last_cost: form.last_cost,
    };
  }

  private async submit(request: () => Observable<SupplierItemResponse>): Promise<SupplierItem | null> {
    this.isSubmitting.set(true);
    this.error.set(null);
    this.conflictExistingId.set(null);
    try {
      const data = await firstValueFrom(request());
      return this.toItem(data);
    } catch (err) {
      this.error.set(this.extractError(err));
      if (err instanceof HttpErrorResponse && err.status === 409) {
        const existingId = (err.error as { detail?: { existing_id?: string } } | null)?.detail?.existing_id;
        if (existingId) this.conflictExistingId.set(existingId);
      }
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toItem(r: SupplierItemResponse): SupplierItem {
    return {
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      inventory_item_id: r.inventory_item_id,
      inventory_item_name: r.inventory_item_name,
      presentation: r.presentation,
      conversion_factor: Number(r.conversion_factor),
      last_cost: r.last_cost === null ? null : Number(r.last_cost),
      last_cost_at: r.last_cost_at,
      active: r.active,
      preferred: r.preferred,
      equivalence: r.equivalence,
      was_preferred: r.was_preferred ?? false,
    };
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | { detail?: { detail?: string } } | null;
      const detail = (body as ApiErrorBody | null)?.detail;
      if (typeof detail === 'string') return detail;
      const nested = (body as { detail?: { detail?: string } } | null)?.detail?.detail;
      if (typeof nested === 'string') return nested;
      return 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
