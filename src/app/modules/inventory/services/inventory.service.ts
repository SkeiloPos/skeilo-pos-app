import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import {
  AdjustForm,
  AdjustmentPayload,
  InventoryItem,
  InventoryItemCreatePayload,
  InventoryItemForm,
  InventoryItemType,
  InventoryItemUpdatePayload,
  InventoryMovement,
  LowStockItem,
  Purchase,
  PurchaseCreatePayload,
  PurchaseForm,
} from '../interfaces/inventory.interface';

/** Raw backend item (decimals arrive as strings). */
interface InventoryItemResponse {
  id: string;
  name: string;
  unit_measure_id: string;
  type: InventoryItem['type'];
  current_stock: string;
  min_stock: string;
  unit_cost: string;
  active: boolean;
}

/** Raw backend movement (decimals arrive as strings). */
interface MovementResponse {
  id: string;
  inventory_item_id: string;
  type: string;
  quantity: string;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  moved_at: string;
}

interface PurchaseItemResponse {
  id: string;
  inventory_item_id: string;
  quantity: string;
  received_quantity: string;
  unit_cost: string;
}

interface PurchaseResponse {
  id: string;
  supplier_id: string | null;
  invoice_number: string | null;
  status: Purchase['status'];
  total: string;
  purchased_at: string;
  items?: PurchaseItemResponse[];
}

/** Raw backend low-stock row (decimals arrive as strings). */
interface LowStockResponse {
  id: string;
  name: string;
  current_stock: string;
  min_stock: string;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/inventory`;

  /** Insumos activos en o bajo su mínimo, cargados desde `/items/low-stock`. */
  readonly lowStockItems = signal<LowStockItem[]>([]);
  readonly purchases = signal<Purchase[]>([]);
  readonly isSubmitting = signal(false);
  /** true mientras carga Compras — sigue siendo 100% imperativo (fuera de
   *  alcance de esta migración). Se funde con la query de items en `isLoading`. */
  private readonly purchasesLoading = signal(false);
  /** Errores fuera de las dos queries de items: low-stock, compras, mutaciones. */
  readonly otherError = signal<string | null>(null);

  // Entrada de las queries reactivas de Insumos (antes: reflejo del `Page<T>` del backend).
  readonly itemsPage = signal(1);
  readonly itemsSize = signal(20);
  readonly itemsSearch = signal('');
  readonly itemsType = signal<InventoryItemType | ''>('');
  readonly itemsActive = signal<'' | 'active' | 'inactive'>('');
  readonly itemsLowStock = signal(false);
  private readonly wantsItemsPage = signal(false);
  private readonly wantsAllItems = signal(false);

  // Estado de paginación de Compras (tamaño fijo, sin selector) — sin cambios.
  readonly purchasesPage = signal(1);
  readonly purchasesTotal = signal(0);
  readonly purchasesTotalPages = signal(1);
  private readonly purchasesSize = 20;

  /** Página actual de la tabla de Insumos. */
  private readonly itemsQuery = injectPagedQuery<InventoryItemResponse>({
    queryKey: () => [
      'inventory-items',
      'page',
      {
        page: this.itemsPage(),
        size: this.itemsSize(),
        search: this.itemsSearch().trim(),
        type: this.itemsType(),
        active: this.itemsActive(),
        lowStock: this.itemsLowStock(),
      },
    ],
    queryFn: () =>
      this.fetchItemsPage(
        this.itemsPage(),
        this.itemsSize(),
        this.itemsSearch().trim(),
        this.itemsType(),
        this.itemsActive(),
        this.itemsLowStock(),
      ),
    enabled: () => this.wantsItemsPage(),
  });

  /** Lista completa (tope 100) para pickers: select de compras y de kardex. */
  private readonly allItemsQuery = injectPagedQuery<InventoryItemResponse>({
    queryKey: () => ['inventory-items', 'all'],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<InventoryItemResponse>>(`${this.baseUrl}/items`, { params: { size: 100 } }),
      ),
    enabled: () => this.wantsAllItems(),
  });

  readonly items = computed(() => (this.itemsQuery.data()?.items ?? []).map((i) => this.toItem(i)));
  readonly allItems = computed(() => (this.allItemsQuery.data()?.items ?? []).map((i) => this.toItem(i)));
  readonly itemsTotal = computed(() => this.itemsQuery.data()?.total ?? 0);
  readonly itemsTotalPages = computed(() => this.itemsQuery.data()?.pages ?? 0);
  /** true en cualquier fetch de items O mientras carga Compras — igual al
   *  booleano compartido de antes (nada más lo escribía). */
  readonly isLoading = computed(() => this.itemsQuery.isFetching() || this.purchasesLoading());
  readonly error = computed(() => {
    if (this.otherError()) return this.otherError();
    if (this.itemsQuery.isError()) return this.extractError(this.itemsQuery.error());
    if (this.allItemsQuery.isError()) return this.extractError(this.allItemsQuery.error());
    return null;
  });

  private fetchItemsPage(
    page: number,
    size: number,
    search: string,
    type: InventoryItemType | '',
    active: '' | 'active' | 'inactive',
    lowStock: boolean,
  ): Promise<Page<InventoryItemResponse>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    if (type) params = params.set('type', type);
    if (active === 'active') params = params.set('active', 'true');
    if (active === 'inactive') params = params.set('active', 'false');
    if (lowStock) params = params.set('low_stock', 'true');
    return firstValueFrom(this.http.get<Page<InventoryItemResponse>>(`${this.baseUrl}/items`, { params }));
  }

  /** Antes: async, esperaba el round-trip. Ahora: setter síncrono. */
  loadItems(page: number = this.itemsPage(), size: number = this.itemsSize()): void {
    this.otherError.set(null);
    this.itemsPage.set(page);
    this.itemsSize.set(size);
    this.wantsItemsPage.set(true);
  }

  /** Lista completa (tope 100) para pickers: select de compras y de kardex. */
  loadAllItems(): void {
    this.otherError.set(null);
    this.wantsAllItems.set(true);
  }

  async loadLowStock(): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<LowStockResponse[]>(`${this.baseUrl}/items/low-stock`)
      );
      this.lowStockItems.set(
        data.map(i => ({
          id: i.id,
          name: i.name,
          current_stock: Number(i.current_stock),
          min_stock: Number(i.min_stock),
        }))
      );
    } catch (err) {
      this.otherError.set(this.extractError(err));
    }
  }

  setItemsSearch(value: string): void {
    this.itemsSearch.set(value);
    this.loadItems(1);
  }

  setItemsType(value: InventoryItemType | ''): void {
    this.itemsType.set(value);
    this.loadItems(1);
  }

  setItemsActive(value: '' | 'active' | 'inactive'): void {
    this.itemsActive.set(value);
    this.loadItems(1);
  }

  setItemsLowStock(value: boolean): void {
    this.itemsLowStock.set(value);
    this.loadItems(1);
  }

  async createItem(form: InventoryItemForm): Promise<boolean> {
    const payload: InventoryItemCreatePayload = {
      name: form.name,
      unit_measure_id: form.unit_measure_id,
      type: form.type,
      current_stock: form.current_stock,
      min_stock: form.min_stock,
      unit_cost: form.unit_cost,
    };
    return this.submit(() =>
      this.http.post<InventoryItemResponse>(`${this.baseUrl}/items`, payload)
    );
  }

  async updateItem(id: string, form: InventoryItemForm): Promise<boolean> {
    const payload: InventoryItemUpdatePayload = {
      name: form.name,
      unit_measure_id: form.unit_measure_id,
      type: form.type,
      min_stock: form.min_stock,
      unit_cost: form.unit_cost,
    };
    return this.submit(() =>
      this.http.patch<InventoryItemResponse>(`${this.baseUrl}/items/${id}`, payload)
    );
  }

  async toggleActive(id: string, current: boolean): Promise<boolean> {
    const payload: InventoryItemUpdatePayload = { active: !current };
    return this.submit(() =>
      this.http.patch<InventoryItemResponse>(`${this.baseUrl}/items/${id}`, payload)
    );
  }

  /** Adjust stock by a signed delta. Direction determines the sign. */
  async adjustStock(id: string, form: AdjustForm): Promise<boolean> {
    const magnitude = Math.abs(form.quantity);
    const payload: AdjustmentPayload = {
      signed_delta: form.direction === 'out' ? -magnitude : magnitude,
      reason: form.reason || null,
    };
    return this.submit(() =>
      this.http.post<MovementResponse>(`${this.baseUrl}/items/${id}/adjust`, payload)
    );
  }

  /** Descarga el respaldo completo del inventario en `.xlsx` (spec 086). */
  exportItems(): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.baseUrl}/items/export`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  /** Fetch the kardex (movements) of a single item, newest first. */
  async loadMovements(itemId: string, page = 1, size = 20): Promise<Page<InventoryMovement>> {
    try {
      const params = new HttpParams().set('page', page).set('size', size);
      const data = await firstValueFrom(
        this.http.get<Page<MovementResponse>>(`${this.baseUrl}/items/${itemId}/movements`, { params })
      );
      return { ...data, items: data.items.map(m => this.toMovement(m)) };
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return { items: [], total: 0, page: 1, size, pages: 0 };
    }
  }

  async loadPurchases(page: number = this.purchasesPage()): Promise<void> {
    this.purchasesLoading.set(true);
    this.otherError.set(null);
    const params = new HttpParams().set('page', page).set('size', this.purchasesSize);
    try {
      const data = await firstValueFrom(
        this.http.get<Page<PurchaseResponse>>(`${this.baseUrl}/purchases`, { params })
      );
      this.purchases.set(data.items.map(p => this.toPurchase(p)));
      this.purchasesPage.set(data.page);
      this.purchasesTotal.set(data.total);
      this.purchasesTotalPages.set(data.pages);
    } catch (err) {
      this.otherError.set(this.extractError(err));
    } finally {
      this.purchasesLoading.set(false);
    }
  }

  /** Register a purchase; refreshes items (stock rises) and the purchase list. */
  async createPurchase(form: PurchaseForm): Promise<boolean> {
    return this.postPurchase(`${this.baseUrl}/purchases`, form);
  }

  /** Crear una orden de compra (draft, sin alta de stock) — RF-022. */
  async createPurchaseOrder(form: PurchaseForm): Promise<boolean> {
    return this.postPurchase(`${this.baseUrl}/purchases/order`, form);
  }

  private async postPurchase(url: string, form: PurchaseForm): Promise<boolean> {
    const payload: PurchaseCreatePayload = {
      supplier_id: form.supplier_id || null,
      invoice_number: form.invoice_number || null,
      items: form.items.map(i => ({
        inventory_item_id: i.inventory_item_id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
      })),
    };
    this.isSubmitting.set(true);
    this.otherError.set(null);
    try {
      await firstValueFrom(this.http.post<PurchaseResponse>(url, payload));
      await Promise.all([
        this.queryClient.invalidateQueries({ queryKey: ['inventory-items'] }),
        this.loadLowStock(),
        this.loadPurchases(),
      ]);
      return true;
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Recibir (parcial o total) una orden de compra — RF-022. */
  async receivePurchase(
    purchaseId: string,
    items: { purchase_item_id: string; quantity: number }[],
  ): Promise<boolean> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    try {
      await firstValueFrom(
        this.http.post<PurchaseResponse>(`${this.baseUrl}/purchases/${purchaseId}/receive`, { items }),
      );
      await Promise.all([
        this.queryClient.invalidateQueries({ queryKey: ['inventory-items'] }),
        this.loadLowStock(),
        this.loadPurchases(),
      ]);
      return true;
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Runs a write request against items, then refreshes the item list. Returns
   * `true` on success so callers can close their modal only when it succeeded.
   */
  private async submit(request: () => Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    try {
      await firstValueFrom(request());
      await Promise.all([
        this.queryClient.invalidateQueries({ queryKey: ['inventory-items'] }),
        this.loadLowStock(),
      ]);
      return true;
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toItem(i: InventoryItemResponse): InventoryItem {
    return {
      id: i.id,
      name: i.name,
      unit_measure_id: i.unit_measure_id,
      type: i.type,
      current_stock: Number(i.current_stock),
      min_stock: Number(i.min_stock),
      unit_cost: Number(i.unit_cost),
      active: i.active,
    };
  }

  private toMovement(m: MovementResponse): InventoryMovement {
    return {
      id: m.id,
      inventory_item_id: m.inventory_item_id,
      type: m.type,
      quantity: Number(m.quantity),
      reason: m.reason,
      reference_type: m.reference_type,
      reference_id: m.reference_id,
      moved_at: m.moved_at,
    };
  }

  private toPurchase(p: PurchaseResponse): Purchase {
    return {
      id: p.id,
      supplier_id: p.supplier_id,
      invoice_number: p.invoice_number,
      status: p.status ?? 'received',
      total: Number(p.total),
      purchased_at: p.purchased_at,
      items: (p.items ?? []).map(it => ({
        id: it.id,
        inventory_item_id: it.inventory_item_id,
        quantity: Number(it.quantity),
        received_quantity: Number(it.received_quantity ?? 0),
        unit_cost: Number(it.unit_cost),
      })),
    };
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
