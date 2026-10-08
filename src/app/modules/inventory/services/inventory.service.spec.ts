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

describe('InventoryService.resolveMissingItems() (spec 102)', () => {
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

  it('resuelve por id, en paralelo, los ids que no estén ya en allItems() ni en resolvedExtraItems()', async () => {
    const promise = service.resolveMissingItems(['item-105', 'item-106']);

    const req1 = http.expectOne(`${base}/items/item-105`);
    const req2 = http.expectOne(`${base}/items/item-106`);
    expect(req1.request.method).toBe('GET');
    expect(req2.request.method).toBe('GET');

    req1.flush({
      id: 'item-105',
      name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS',
      unit_measure_id: 'um-1',
      type: 'insumo',
      current_stock: '11.250',
      min_stock: '1',
      unit_cost: '20000',
      active: true,
    });
    req2.flush({
      id: 'item-106',
      name: 'CREMA DE LECHE',
      unit_measure_id: 'um-2',
      type: 'insumo',
      current_stock: '5',
      min_stock: '1',
      unit_cost: '8000',
      active: true,
    });

    await promise;

    expect(service.resolvedExtraItems()).toEqual([
      {
        id: 'item-105',
        name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS',
        unit_measure_id: 'um-1',
        type: 'insumo',
        current_stock: 11.25,
        min_stock: 1,
        unit_cost: 20000,
        active: true,
      },
      {
        id: 'item-106',
        name: 'CREMA DE LECHE',
        unit_measure_id: 'um-2',
        type: 'insumo',
        current_stock: 5,
        min_stock: 1,
        unit_cost: 8000,
        active: true,
      },
    ]);
  });

  it('no pide de nuevo un id que ya esté en resolvedExtraItems()', async () => {
    const first = service.resolveMissingItems(['item-105']);
    http.expectOne(`${base}/items/item-105`).flush({
      id: 'item-105',
      name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS',
      unit_measure_id: 'um-1',
      type: 'insumo',
      current_stock: '11.250',
      min_stock: '1',
      unit_cost: '20000',
      active: true,
    });
    await first;

    // Segunda llamada con el mismo id: no debe disparar ninguna petición nueva.
    await service.resolveMissingItems(['item-105']);
    http.verify();
  });

  it('un id que responde 404 no se agrega a resolvedExtraItems()', async () => {
    const promise = service.resolveMissingItems(['item-inexistente']);
    const req = http.expectOne(`${base}/items/item-inexistente`);
    req.flush('No encontrado', { status: 404, statusText: 'Not Found' });

    await promise;
    expect(service.resolvedExtraItems()).toEqual([]);
  });
});
