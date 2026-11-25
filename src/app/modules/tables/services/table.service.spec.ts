import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { TableService } from './table.service';
import { Table } from '../interfaces/table.interface';

const base = `${environment.apiBaseUrl}/orders/tables`;

function table(partial: Partial<Table>): Table {
  return {
    id: 't1',
    number: 1,
    name: null,
    qr_token: 'uuid-1',
    active: true,
    status: 'libre',
    ...partial,
  };
}

/** Drain pending microtasks so a chained `loadTables()` reload dispatches its GET. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('TableService', () => {
  let service: TableService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TableService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TableService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads tables sorted by number', async () => {
    const promise = service.loadTables();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([table({ id: 'b', number: 3 }), table({ id: 'a', number: 1 })]);
    await promise;
    expect(service.tables().map((t) => t.number)).toEqual([1, 3]);
  });

  it('getTableDetail pide el endpoint agregado de la mesa', async () => {
    const promise = service.getTableDetail('t1');
    const req = http.expectOne(`${base}/t1/detail`);
    expect(req.request.method).toBe('GET');
    req.flush({
      table: table({ id: 't1', number: 3, status: 'ocupada' }),
      session: { id: 'ts1' },
      orders: [],
    });
    const detail = await promise;
    expect(detail.table?.id).toBe('t1');
    expect(detail.session?.id).toBe('ts1');
    expect(detail.orders).toEqual([]);
  });

  describe('upsertTable', () => {
    it('agrega la mesa si no estaba en tables()', () => {
      service.tables.set([table({ id: 'a', number: 1 })]);

      service.upsertTable(table({ id: 'b', number: 2 }));

      expect(service.tables().map((t) => t.id)).toEqual(['a', 'b']);
    });

    it('actualiza la fila existente sin tocar el resto de tables()', () => {
      service.tables.set([table({ id: 'a', number: 1, status: 'libre' }), table({ id: 'b', number: 2 })]);

      service.upsertTable(table({ id: 'a', number: 1, status: 'ocupada' }));

      expect(service.tables().find((t) => t.id === 'a')?.status).toBe('ocupada');
      expect(service.tables().map((t) => t.id)).toEqual(['a', 'b']);
    });

    it('con null, no hace nada (mesa libre sin fila -- nunca pasa hoy, pero no debe romper)', () => {
      service.tables.set([table({ id: 'a', number: 1 })]);

      service.upsertTable(null);

      expect(service.tables().map((t) => t.id)).toEqual(['a']);
    });
  });

  it('creates a table sending number + name (no client qr_token)', async () => {
    const promise = service.createTable({ number: 5, name: 'Terraza' });
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ number: 5, name: 'Terraza' });
    expect('qr_token' in req.request.body).toBe(false);
    req.flush(table({ id: 't5', number: 5, name: 'Terraza' }));
    await tick(); // let loadTables() dispatch the reload GET
    http.expectOne(base).flush([]);
    await promise;
    expect(service.error()).toBeNull();
  });

  it('normalizes an empty name to null on create', async () => {
    const promise = service.createTable({ number: 2, name: '  ' });
    const req = http.expectOne(base);
    expect(req.request.body).toEqual({ number: 2, name: null });
    req.flush(table({ id: 't2', number: 2 }));
    await tick();
    http.expectOne(base).flush([]);
    await promise;
  });

  it('toggles active via PATCH', async () => {
    const promise = service.toggleActive('t1', true);
    const req = http.expectOne(`${base}/t1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: false });
    req.flush(table({ id: 't1', active: false }));
    await tick();
    http.expectOne(base).flush([]);
    await promise;
  });

  it('fetches the signed qr token', async () => {
    const promise = service.getQrToken('t1');
    const req = http.expectOne(`${base}/t1/qr-token`);
    expect(req.request.method).toBe('GET');
    req.flush({ table_id: 't1', number: 1, qr_token: 'signed', menu_path: '/menu/qr-token/signed' });
    const res = await promise;
    expect(res.menu_path).toBe('/menu/qr-token/signed');
  });

  it('maps an error to the error signal', async () => {
    const promise = service.loadTables();
    http.expectOne(base).flush({ detail: 'Boom' }, { status: 500, statusText: 'Err' });
    await promise;
    expect(service.error()).toBe('Boom');
  });

  // ── Carril paginado (spec 079, US3 — aditivo) ────────────────────────────

  it('loadTablesPage(1, 20) pide GET /orders/tables?page=1&size=20 y mapea el Page', async () => {
    const promise = service.loadTablesPage(1, 20);
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({
      items: [table({ id: 'a', number: 1 }), table({ id: 'b', number: 2 })],
      total: 64,
      page: 1,
      size: 20,
      pages: 4,
    });
    await promise;

    expect(service.pagedTables().map((t) => t.id)).toEqual(['a', 'b']);
    expect(service.tablesTotal()).toBe(64);
    expect(service.tablesTotalPages()).toBe(4);
    expect(service.tablesPage()).toBe(1);
  });

  it('loadTablesPage(2, 20) pide page=2 y adopta el page que devuelve el backend (clamp)', async () => {
    const promise = service.loadTablesPage(2, 20);
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [], total: 15, page: 1, size: 20, pages: 1 });
    await promise;
    expect(service.tablesPage()).toBe(1); // el backend hizo clamp
  });

  it('el carril paginado NO toca tables() ni loading() (los usan Terminal/Dashboard)', async () => {
    const promise = service.loadTablesPage(1, 20);
    http.expectOne((r) => r.url === base).flush({ items: [table({})], total: 1, page: 1, size: 20, pages: 1 });
    await promise;
    expect(service.tables()).toEqual([]); // intacto
    expect(service.loading()).toBe(false);
  });
});
