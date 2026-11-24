import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
import {
  GroupBill,
  Table,
  TableCreatePayload,
  TableForm,
  TableQrToken,
  TableStatus,
  TableUpdatePayload,
} from '../interfaces/table.interface';
import {
  MoveItemRequest,
  MoveItemResponse,
  SplitItemToNewRequest,
  SplitItemToNewResponse,
  SplitOrderResponse,
} from '../interfaces/dining.interface';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/orders/tables`;
  private readonly ordersUrl = `${environment.apiBaseUrl}/orders`;

  readonly tables = signal<Table[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  // ── Carril paginado (spec 079, US3) ──────────────────────────────────────
  // Aditivo: `loadTables()` / `tables()` / las mutaciones NO cambian — Terminal,
  // Dashboard, `order-detail` y la hoja de QR las siguen consumiendo completas
  // (FR-025). Solo `tables-page.component.ts` usa este carril. Se resuelve con
  // signals + HTTP manual (mismo estilo que `loadTables()`), sin añadir ninguna
  // dependencia nueva de construcción al singleton — los demás consumidores no
  // se enteran.
  readonly tablesPage = signal(1);
  readonly tablesSize = signal(20);
  readonly pagedTables = signal<Table[]>([]);
  readonly tablesTotal = signal(0);
  readonly tablesTotalPages = signal(0);
  readonly tablesLoading = signal(false);
  private tablesLaneReady = false;

  /** Carga (y fija como página actual) una página del listado de mesas. El
   *  backend hace clamp si la página queda fuera de rango y devuelve la última
   *  válida en `res.page` (FR-005). Cambiar el tamaño se llama con `page = 1`. */
  async loadTablesPage(
    page: number = this.tablesPage(),
    size: number = this.tablesSize(),
  ): Promise<void> {
    this.tablesLaneReady = true;
    this.tablesPage.set(page);
    this.tablesSize.set(size);
    this.tablesLoading.set(true);
    this.error.set(null);
    try {
      const params = new HttpParams().set('page', page).set('size', size);
      const res = await firstValueFrom(
        this.http.get<Page<Table>>(this.baseUrl, { params }),
      );
      this.pagedTables.set(res.items);
      this.tablesTotal.set(res.total);
      this.tablesTotalPages.set(res.pages);
      this.tablesPage.set(res.page);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.tablesLoading.set(false);
    }
  }

  /** Re-carga la página actual del carril paginado — se llama tras una mutación
   *  disparada desde `tables-page.component.ts` para que la lista quede
   *  coherente (FR-022). No hace nada si el carril nunca se inicializó. */
  refreshTablesPage(): void {
    if (this.tablesLaneReady) void this.loadTablesPage(this.tablesPage(), this.tablesSize());
  }

  async loadTables(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const data = await firstValueFrom(this.http.get<Table[]>(this.baseUrl));
      this.tables.set([...data].sort((a, b) => a.number - b.number));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Carga solo una mesa (`?dining_table_id=`) -- usado al entrar directo al
   * detalle de un pedido por URL, donde la grilla queda oculta y no hace
   * falta el negocio completo (spec: Terminal, carga acotada al deep-link).
   *
   * Nunca reemplaza `tables()` por completo -- hace upsert de esta fila sola.
   * `tables` es `providedIn: 'root'` y otras pantallas (detalle de orden,
   * listado de órdenes, hoja de QR) lo consumen completo; si alguna ya lo
   * cargó entero en esta pestaña, acotar una mesa no debe borrarle el resto.
   */
  async loadTable(tableId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = new HttpParams().set('dining_table_id', tableId);
      const [row] = await firstValueFrom(this.http.get<Table[]>(this.baseUrl, { params }));
      if (row) {
        this.tables.update((list) => {
          const idx = list.findIndex((t) => t.id === row.id);
          if (idx === -1) return [...list, row].sort((a, b) => a.number - b.number);
          const copy = [...list];
          copy[idx] = row;
          return copy;
        });
      }
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async createTable(data: TableForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    // The backend generates the `qr_token`; the client only sends number + name.
    const payload: TableCreatePayload = {
      number: data.number,
      name: data.name?.trim() || null,
    };

    try {
      await firstValueFrom(this.http.post<Table>(this.baseUrl, payload));
      await this.loadTables();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateTable(id: string, data: TableForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: TableUpdatePayload = { name: data.name?.trim() || null };

    try {
      await firstValueFrom(this.http.patch<Table>(`${this.baseUrl}/${id}`, payload));
      await this.loadTables();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: TableUpdatePayload = { active: !current };

    try {
      await firstValueFrom(this.http.patch<Table>(`${this.baseUrl}/${id}`, payload));
      await this.loadTables();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Fetch the signed, printable QR token for a table. Throws `HttpErrorResponse`. */
  async getQrToken(id: string): Promise<TableQrToken> {
    return firstValueFrom(this.http.get<TableQrToken>(`${this.baseUrl}/${id}/qr-token`));
  }

  /** Cambiar el estado operativo de la mesa (RF-051). Refresca la lista. */
  async setStatus(id: string, status: TableStatus): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.patch<Table>(`${this.baseUrl}/${id}/status`, { status }));
      await this.loadTables();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Mover una orden abierta a otra mesa (RF-052). Throws `HttpErrorResponse`. */
  async moveOrder(orderId: string, targetTableId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.ordersUrl}/${orderId}/move`, { dining_table_id: targetTableId }),
    );
  }

  /** Unir órdenes en una sola cuenta (RF-053). Devuelve el grupo. */
  async mergeOrders(orderIds: string[]): Promise<{ merged_group_id: string; order_ids: string[] }> {
    return firstValueFrom(
      this.http.post<{ merged_group_id: string; order_ids: string[] }>(
        `${this.ordersUrl}/merge`,
        { order_ids: orderIds },
      ),
    );
  }

  /** Cuenta consolidada de un grupo de mesas (RF-053). */
  async groupBill(groupId: string): Promise<GroupBill> {
    return firstValueFrom(this.http.get<GroupBill>(`${this.ordersUrl}/group/${groupId}/bill`));
  }

  /** Dividir una orden en una cuenta independiente por línea (spec 164).
   *  Throws `HttpErrorResponse`. */
  async splitOrder(orderId: string): Promise<SplitOrderResponse> {
    return firstValueFrom(
      this.http.post<SplitOrderResponse>(`${this.ordersUrl}/${orderId}/split`, {}),
    );
  }

  /** Mover un ítem (completo o parcial) hacia otra orden de la misma mesa
   *  (spec 164). Throws `HttpErrorResponse`. */
  async moveItem(
    orderId: string, itemId: string, targetOrderId: string, quantity?: number,
  ): Promise<MoveItemResponse> {
    const body: MoveItemRequest = { target_order_id: targetOrderId, quantity };
    return firstValueFrom(
      this.http.post<MoveItemResponse>(`${this.ordersUrl}/${orderId}/items/${itemId}/move`, body),
    );
  }

  /** Crear una cuenta nueva a partir de un ítem (spec 164). Throws
   *  `HttpErrorResponse`. */
  async splitItemToNewOrder(
    orderId: string, itemId: string, quantity?: number,
  ): Promise<SplitItemToNewResponse> {
    const body: SplitItemToNewRequest = { quantity };
    return firstValueFrom(
      this.http.post<SplitItemToNewResponse>(
        `${this.ordersUrl}/${orderId}/items/${itemId}/split-to-new`, body,
      ),
    );
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
