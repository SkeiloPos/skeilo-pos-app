import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { SuggestedPurchaseService } from './suggested-purchase.service';

const base = `${environment.apiBaseUrl}/inventory/purchases/suggested`;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** `generate()` exitoso invalida `['suggested-purchases']` (FR-011a), lo que dispara un
 *  refetch del `listQuery` activo del propio servicio -- hay que satisfacerlo o la petición
 *  queda pendiente (`http.verify()` en el `afterEach`) y `invalidateQueries()` nunca resuelve. */
async function flushInvalidationRefetch(http: HttpTestingController): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await tick();
    const pending = http.match((r) => r.url === base);
    if (pending.length > 0) {
      pending.forEach((r) => r.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }));
      return;
    }
  }
}

function makeLineResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    inventory_item_id: 'item-1',
    code: '0001',
    name: 'ALMENDRAS',
    current_stock: '10.000000',
    min_stock: '500.000',
    deficit: '490.000',
    base_unit_abbreviation: 'g',
    supplier_item_id: 'rel-1',
    supplier_id: 'sup-1',
    supplier_name: 'AGRO SUR',
    purchase_unit_label: 'Bolsa x 500 g',
    conversion_factor: '500.000',
    unit_price: '8000.00',
    suggested_quantity: '1',
    is_preselected: true,
    missing_supplier_reason: null,
    ...overrides,
  };
}

describe('SuggestedPurchaseService', () => {
  let service: SuggestedPurchaseService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SuggestedPurchaseService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(SuggestedPurchaseService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });

  afterEach(() => {
    http.verify();
  });

  async function asentar(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
  }

  it('pide page/size y mapea la respuesta paginada a número', async () => {
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');

    req.flush({
      items: [makeLineResponse()],
      total: 1, page: 1, size: 20, pages: 1,
    });
    await asentar();

    expect(service.lines().length).toBe(1);
    const line = service.lines()[0];
    expect(line.current_stock).toBe(10);
    expect(line.min_stock).toBe(500);
    expect(line.deficit).toBe(490);
    expect(line.unit_price).toBe(8000);
    expect(line.is_preselected).toBe(true);
    expect(service.total()).toBe(1);
  });

  it('cambiar de página pide de nuevo con el page/size nuevos', async () => {
    http.expectOne((r) => r.url === base).flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
    await asentar();

    service.setPage(2);
    await asentar();

    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [], total: 0, page: 2, size: 20, pages: 0 });
  });

  it('mapea una fila desmarcada sin proveedor (nulls en vez de 0)', async () => {
    const req = http.expectOne((r) => r.url === base);
    req.flush({
      items: [makeLineResponse({
        supplier_item_id: null, supplier_id: null, supplier_name: null,
        purchase_unit_label: null, conversion_factor: null, unit_price: null,
        is_preselected: false, missing_supplier_reason: 'Sin proveedor configurado. Elige uno.',
      })],
      total: 1, page: 1, size: 20, pages: 1,
    });
    await asentar();

    const line = service.lines()[0];
    expect(line.is_preselected).toBe(false);
    expect(line.supplier_item_id).toBeNull();
    expect(line.unit_price).toBeNull();
    expect(line.missing_supplier_reason).toBe('Sin proveedor configurado. Elige uno.');
  });

  describe('generate()', () => {
    beforeEach(() => {
      http.expectOne((r) => r.url === base).flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
    });

    it('envía idempotency_key + lines y mapea la respuesta (201 o 200)', async () => {
      const promise = service.generate('idem-1', {
        idempotency_key: 'idem-1',
        lines: [{
          inventory_item_id: 'item-1', supplier_item_id: 'rel-1',
          presentation_quantity: 2, presentation_unit_cost: 8000,
        }],
      });

      const req = http.expectOne(`${base}/generate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        idempotency_key: 'idem-1',
        lines: [{
          inventory_item_id: 'item-1', supplier_item_id: 'rel-1',
          presentation_quantity: 2, presentation_unit_cost: 8000,
        }],
      });

      req.flush({
        purchases: [{
          id: 'p-1', supplier_id: 'sup-1', invoice_number: null, status: 'draft',
          is_incomplete: false, total: '16000.00', purchased_at: '2026-11-15T00:00:00',
          voided_at: null, voided_by: null, items: [],
        }],
      }, { status: 201, statusText: 'Created' });
      await flushInvalidationRefetch(http);

      const purchases = await promise;
      expect(purchases.length).toBe(1);
      expect(purchases[0].id).toBe('p-1');
      expect(purchases[0].total).toBe(16000);
      expect(purchases[0].status).toBe('draft');
    });

    it('propaga detail.lines[] en un 422 sin transformarlo en string', async () => {
      const promise = service.generate('idem-2', {
        idempotency_key: 'idem-2',
        lines: [{
          inventory_item_id: 'item-1', supplier_item_id: 'rel-1',
          presentation_quantity: 1, presentation_unit_cost: 8000,
        }],
      });

      const req = http.expectOne(`${base}/generate`);
      req.flush(
        { detail: { message: 'No se pudo generar la compra sugerida', lines: [{ inventory_item_id: 'item-1', reason: 'unit_price_zero' }] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

      await expect(promise).rejects.toMatchObject({
        message: 'No se pudo generar la compra sugerida',
        lines: [{ inventory_item_id: 'item-1', reason: 'unit_price_zero' }],
      });
    });

    it('invalida la query de listado tras un generate() exitoso', async () => {
      const queryClient = TestBed.inject(QueryClient);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const promise = service.generate('idem-4', {
        idempotency_key: 'idem-4',
        lines: [{
          inventory_item_id: 'item-1', supplier_item_id: 'rel-1',
          presentation_quantity: 1, presentation_unit_cost: 8000,
        }],
      });

      const req = http.expectOne(`${base}/generate`);
      req.flush({
        purchases: [{
          id: 'p-1', supplier_id: 'sup-1', invoice_number: null, status: 'received',
          is_incomplete: false, total: '8000.00', purchased_at: '2026-11-21T00:00:00',
          voided_at: null, voided_by: null, items: [],
        }],
      }, { status: 201, statusText: 'Created' });
      await flushInvalidationRefetch(http);

      await promise;

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['suggested-purchases'] });
    });

    it('un error 5xx se propaga como mensaje genérico con lines: []', async () => {
      const promise = service.generate('idem-3', {
        idempotency_key: 'idem-3',
        lines: [{
          inventory_item_id: 'item-1', supplier_item_id: 'rel-1',
          presentation_quantity: 1, presentation_unit_cost: 8000,
        }],
      });

      const req = http.expectOne(`${base}/generate`);
      req.flush({ detail: 'Internal Server Error' }, { status: 500, statusText: 'Server Error' });

      await expect(promise).rejects.toMatchObject({ lines: [] });
    });
  });
});
