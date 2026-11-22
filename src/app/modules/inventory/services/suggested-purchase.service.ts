import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';
import { abortableFirstValueFrom } from '../../../core/query/abortable-request';
import { injectPagedQuery } from '../../../core/query/paged-query';
import {
  GenerateSuggestedPurchasesError,
  GenerateSuggestedPurchasesPayload,
  Purchase,
  SuggestedPurchaseLine,
} from '../interfaces/inventory.interface';

/** Raw backend row (decimals arrive as strings). Mirrors `SuggestedPurchaseLineResponse`. */
interface SuggestedPurchaseLineResponse {
  inventory_item_id: string;
  code: string;
  name: string;
  current_stock: string;
  min_stock: string;
  deficit: string;
  base_unit_abbreviation: string;
  supplier_item_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_unit_label: string | null;
  conversion_factor: string | null;
  unit_price: string | null;
  suggested_quantity: string;
  is_preselected: boolean;
  missing_supplier_reason: string | null;
}

interface PurchaseItemResponse {
  id: string;
  inventory_item_id: string;
  quantity: string;
  received_quantity: string;
  unit_cost: string;
  supplier_item_id: string | null;
  presentation_quantity: string | null;
  presentation_label: string | null;
  conversion_factor: string | null;
  unit_measure_id: string;
  conversion_factor_applied: string;
  quantity_base: string;
  cost_base: string;
}

interface PurchaseResponse {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  status: Purchase['status'];
  is_incomplete: boolean;
  total: string;
  purchased_at: string;
  voided_at: string | null;
  voided_by: string | null;
  items?: PurchaseItemResponse[];
}

interface GenerateSuggestedPurchasesResponse {
  purchases: PurchaseResponse[];
}

/** Cliente de "Compra Sugerida de Insumos" (spec 158): listado paginado de insumos en o
 *  bajo su mínimo (`GET /purchases/suggested`) y generación transaccional agrupada por
 *  proveedor (`POST /purchases/suggested/generate`). Servicio propio y acotado -- a
 *  diferencia de `InventoryService`, no comparte estado de paginación con `/items`. */
@Injectable({ providedIn: 'root' })
export class SuggestedPurchaseService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/inventory/purchases/suggested`;

  readonly page = signal(1);
  readonly size = signal(20);
  readonly isGenerating = signal(false);

  private readonly listQuery = injectPagedQuery<SuggestedPurchaseLineResponse>({
    queryKey: () => ['suggested-purchases', 'page', { page: this.page(), size: this.size() }],
    queryFn: (signal) => this.fetchPage(this.page(), this.size(), signal),
    enabled: () => true,
  });

  readonly lines = computed(() => (this.listQuery.data()?.items ?? []).map((l) => this.toLine(l)));
  readonly total = computed(() => this.listQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.listQuery.data()?.pages ?? 0);
  readonly isLoading = computed(() => this.listQuery.isFetching());

  private fetchPage(
    page: number,
    size: number,
    signal?: AbortSignal,
  ): Promise<Page<SuggestedPurchaseLineResponse>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return abortableFirstValueFrom(
      this.http.get<Page<SuggestedPurchaseLineResponse>>(this.baseUrl, { params }),
      signal,
    );
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  /** Genera, en una sola solicitud idempotente, una orden `draft` por cada proveedor
   *  distinto entre `lines` (FR-008/FR-009). Devuelve las `Purchase` creadas (o ya
   *  existentes, si `idempotencyKey` ya se había procesado, FR-010); lanza
   *  `GenerateSuggestedPurchasesError` si el servidor rechazó alguna línea (422). */
  async generate(idempotencyKey: string, payload: GenerateSuggestedPurchasesPayload): Promise<Purchase[]> {
    this.isGenerating.set(true);
    try {
      const data = await firstValueFrom(
        this.http.post<GenerateSuggestedPurchasesResponse>(
          `${this.baseUrl}/generate`,
          { ...payload, idempotency_key: idempotencyKey },
        ),
      );
      await this.queryClient.invalidateQueries({ queryKey: ['suggested-purchases'] });
      return data.purchases.map((p) => this.toPurchase(p));
    } catch (err) {
      throw this.toGenerateError(err);
    } finally {
      this.isGenerating.set(false);
    }
  }

  private toLine(l: SuggestedPurchaseLineResponse): SuggestedPurchaseLine {
    return {
      inventory_item_id: l.inventory_item_id,
      code: l.code,
      name: l.name,
      current_stock: Number(l.current_stock),
      min_stock: Number(l.min_stock),
      deficit: Number(l.deficit),
      base_unit_abbreviation: l.base_unit_abbreviation,
      supplier_item_id: l.supplier_item_id,
      supplier_id: l.supplier_id,
      supplier_name: l.supplier_name,
      purchase_unit_label: l.purchase_unit_label,
      conversion_factor: l.conversion_factor === null ? null : Number(l.conversion_factor),
      unit_price: l.unit_price === null ? null : Number(l.unit_price),
      suggested_quantity: Number(l.suggested_quantity),
      is_preselected: l.is_preselected,
      missing_supplier_reason: l.missing_supplier_reason,
    };
  }

  private toPurchase(p: PurchaseResponse): Purchase {
    return {
      id: p.id,
      supplier_id: p.supplier_id,
      invoice_number: p.invoice_number,
      status: p.status ?? 'draft',
      isIncomplete: p.is_incomplete ?? false,
      total: Number(p.total),
      purchased_at: p.purchased_at,
      voided_at: p.voided_at,
      voided_by: p.voided_by,
      items: (p.items ?? []).map((it) => ({
        id: it.id,
        inventory_item_id: it.inventory_item_id,
        quantity: Number(it.quantity),
        received_quantity: Number(it.received_quantity ?? 0),
        unit_cost: Number(it.unit_cost),
        supplier_item_id: it.supplier_item_id,
        presentation_quantity: it.presentation_quantity === null ? null : Number(it.presentation_quantity),
        presentation_label: it.presentation_label,
        conversion_factor: it.conversion_factor === null ? null : Number(it.conversion_factor),
        unit_measure_id: it.unit_measure_id,
        conversion_factor_applied: Number(it.conversion_factor_applied),
        quantity_base: Number(it.quantity_base),
        cost_base: Number(it.cost_base),
      })),
    };
  }

  /** `detail` del 422 trae `{message, lines}` (`GenerateSuggestedPurchasesError`), no un
   *  string como el resto de la API -- se devuelve tal cual para que el componente resalte
   *  cada fila por `inventory_item_id`; cualquier otro error se devuelve como mensaje
   *  genérico en `message` con `lines: []` (FR-019: el componente conserva el estado igual). */
  private toGenerateError(err: unknown): GenerateSuggestedPurchasesError {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const detail = (err.error as { detail?: GenerateSuggestedPurchasesError } | null)?.detail;
      if (detail && Array.isArray(detail.lines)) return detail;
    }
    return { message: 'No se pudo generar la compra sugerida.', lines: [] };
  }
}
