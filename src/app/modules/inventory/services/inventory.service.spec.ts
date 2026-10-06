import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { InventoryService } from './inventory.service';

const base = `${environment.apiBaseUrl}/inventory`;

describe('InventoryService.exportItems() (spec 086)', () => {
  let service: InventoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(InventoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('hace GET a items/export pidiendo un blob con la respuesta completa', () => {
    let result: unknown;
    service.exportItems().subscribe((resp) => (result = resp));

    const req = http.expectOne(`${base}/items/export`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');

    const blob = new Blob(['contenido'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    req.flush(blob, {
      headers: { 'Content-Disposition': 'attachment; filename="inventario_2026-09-22.xlsx"' },
    });

    expect((result as { body: Blob }).body).toBe(blob);
    expect((result as { headers: { get(name: string): string | null } }).headers.get('Content-Disposition'))
      .toBe('attachment; filename="inventario_2026-09-22.xlsx"');
  });
});

describe('InventoryService.searchActiveItems() (spec 098)', () => {
  let service: InventoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(InventoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('busca con search/active=true/page=1/size=20, sin depender de allItems()', async () => {
    const promise = service.searchActiveItems('mozar');

    const req = http.expectOne(
      (r) => r.url === `${base}/items` && r.params.get('search') === 'mozar',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('active')).toBe('true');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');

    req.flush({
      items: [
        {
          id: 'item-1',
          name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS',
          unit_measure_id: 'um-1',
          type: 'insumo',
          current_stock: '11.250',
          min_stock: '1',
          unit_cost: '20000',
          active: true,
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
    });

    const items = await promise;
    expect(items).toEqual([
      {
        id: 'item-1',
        name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS',
        unit_measure_id: 'um-1',
        type: 'insumo',
        current_stock: 11.25,
        min_stock: 1,
        unit_cost: 20000,
        active: true,
      },
    ]);
  });

  it('recorta el texto de búsqueda antes de enviarlo', () => {
    service.searchActiveItems('  mozar  ');

    const req = http.expectOne(
      (r) => r.url === `${base}/items` && r.params.get('search') === 'mozar',
    );
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
  });
});
