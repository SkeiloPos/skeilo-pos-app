import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';
import { abortableFirstValueFrom } from '../../../core/query/abortable-request';
import { injectPagedQuery } from '../../../core/query/paged-query';
import { Sale, SaleCreatePayload, SaleStatus } from '../interfaces/sales.interface';

/** Transport for sales / checkout (`/api/v1/sales`). */
@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/sales`;

  readonly isSubmitting = signal(false);
  /** Errores fuera de la query paginada: checkout. */
  private readonly otherError = signal<string | null>(null);

  // Entrada de la query reactiva (antes: reflejo del `Page<T>` del backend).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly status = signal<SaleStatus | ''>('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly invoiceReference = signal('');
  private readonly wantsPage = signal(false);

  private readonly salesQuery = injectPagedQuery<Sale>({
    queryKey: () => [
      'sales',
      'page',
      {
        page: this.page(),
        size: this.size(),
        status: this.status(),
        dateFrom: this.dateFrom(),
        dateTo: this.dateTo(),
        // El backend guarda/busca la referencia sin el guion que sí se muestra en
        // el ticket (ej. "A-000004" → "A000004").
        invoiceReference: this.invoiceReference().trim().replaceAll('-', ''),
      },
    ],
    queryFn: (signal) =>
      this.fetchSalesPage(
        this.page(),
        this.size(),
        this.status(),
        this.dateFrom(),
        this.dateTo(),
        this.invoiceReference().trim().replaceAll('-', ''),
        signal,
      ),
    enabled: () => this.wantsPage(),
  });

  readonly sales = computed(() => this.salesQuery.data()?.items ?? []);
  readonly total = computed(() => this.salesQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.salesQuery.data()?.pages ?? 0);
  readonly loading = computed(() => this.salesQuery.isFetching());
  readonly error = computed(
    () =>
      this.otherError() ??
      (this.salesQuery.isError() ? this.extractError(this.salesQuery.error(), 'No se pudieron cargar las ventas.') : null),
  );

  private fetchSalesPage(
    page: number,
    size: number,
    status: SaleStatus | '',
    dateFrom: string,
    dateTo: string,
    invoiceReference: string,
    signal?: AbortSignal,
  ): Promise<Page<Sale>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) params = params.set('status', status);
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);
    if (invoiceReference) params = params.set('invoice_reference', invoiceReference);
    return abortableFirstValueFrom(this.http.get<Page<Sale>>(this.baseUrl, { params }), signal);
  }

  /** Antes: async, esperaba el round-trip. Ahora: setter síncrono. */
  list(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  setStatus(value: SaleStatus | ''): void {
    this.status.set(value);
    this.list(1);
  }

  setDateFrom(value: string): void {
    this.dateFrom.set(value);
    this.list(1);
  }

  setDateTo(value: string): void {
    this.dateTo.set(value);
    this.list(1);
  }

  setInvoiceReference(value: string): void {
    this.invoiceReference.set(value);
    this.list(1);
  }

  async get(id: string): Promise<Sale> {
    return firstValueFrom(this.http.get<Sale>(`${this.baseUrl}/${id}`));
  }

  /** Checkout: emit and charge a sale. Sets `error` and returns null on failure.
   *  No refresca `sales` — el checkout ocurre desde la terminal, no desde esta
   *  tabla admin, igual que antes de esta migración. */
  async checkout(payload: SaleCreatePayload): Promise<Sale | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    try {
      return await firstValueFrom(this.http.post<Sale>(this.baseUrl, payload));
    } catch (err) {
      this.otherError.set(this.extractError(err, 'No se pudo emitir la venta.'));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
