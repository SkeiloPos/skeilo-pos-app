import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { CashService } from './cash.service';
import { CashShift } from '../interfaces/cash.interface';

const base = `${environment.apiBaseUrl}/cash`;

/** Deja correr un turno de microtareas — necesario entre dos peticiones HTTP
 *  encadenadas por un `await` dentro del servicio (p. ej. listar cajas y
 *  luego, con esa respuesta ya resuelta, pedir el turno de cada una). */
const tick = () => Promise.resolve().then(() => Promise.resolve());

function shift(partial: Partial<CashShift> = {}): CashShift {
  return {
    id: 's1',
    cash_register_id: 'r1',
    user_id: 'u1',
    opening_amount: '100.00',
    opened_at: '2026-01-01T08:00:00Z',
    status: 'open',
    ...partial,
  };
}

describe('CashService', () => {
  let service: CashService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CashService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CashService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists registers', async () => {
    const p = service.listRegisters();
    const req = http.expectOne(`${base}/registers`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'r1', name: 'Caja 1', active: true }]);
    expect((await p)[0].name).toBe('Caja 1');
  });

  it('opens a shift', async () => {
    const p = service.openShift('r1', 100);
    const req = http.expectOne(`${base}/shifts/open`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ cash_register_id: 'r1', opening_amount: 100 });
    req.flush(shift());
    expect((await p).id).toBe('s1');
  });

  it('gets the current open shift by register', async () => {
    const p = service.getCurrentShift('r1');
    const req = http.expectOne((r) => r.url === `${base}/shifts/current`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('cash_register_id')).toBe('r1');
    req.flush(shift());
    expect((await p).cash_register_id).toBe('r1');
  });

  it('registers a movement with kind/amount/category', async () => {
    const p = service.addMovement('s1', {
      kind: 'egreso',
      amount: 20,
      category: 'Bolsas',
      description: null,
    });
    const req = http.expectOne(`${base}/shifts/s1/movements`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      kind: 'egreso',
      amount: 20,
      category: 'Bolsas',
      description: null,
    });
    req.flush({
      id: 'm1',
      cash_shift_id: 's1',
      kind: 'egreso',
      amount: '20.00',
      category: 'Bolsas',
      occurred_at: 'x',
    });
    expect((await p).id).toBe('m1');
  });

  it('lists movements of a shift', async () => {
    const p = service.listMovements('s1');
    const req = http.expectOne(`${base}/shifts/s1/movements`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(await p).toEqual([]);
  });

  it('closes a shift with denominations and close_note, WITHOUT counted_amount (spec 121, D-1)', async () => {
    const p = service.closeShift('s1', {
      denominations: [{ denomination: 50000, quantity: 1 }],
      close_note: 'faltante caja',
    });
    const req = http.expectOne(`${base}/shifts/s1/close`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.denominations).toEqual([{ denomination: 50000, quantity: 1 }]);
    expect(req.request.body.close_note).toBe('faltante caja');
    // El servidor calcula el efectivo contado; el cliente ya no lo envía.
    expect('counted_amount' in req.request.body).toBe(false);
    req.flush(shift({ status: 'closed', closed_at: 'x', counted_amount: '95000.00' }));
    expect((await p).status).toBe('closed');
  });

  it('gets the denomination catalog of the business (spec 121, FR-009)', async () => {
    const p = service.getDenominations();
    const req = http.expectOne(`${base}/denominations`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { denomination: '100000.00', kind: 'billete' },
      { denomination: '50.00', kind: 'moneda' },
    ]);
    expect(await p).toEqual([
      { denomination: '100000.00', kind: 'billete' },
      { denomination: '50.00', kind: 'moneda' },
    ]);
  });

  it('propagates the error when the catalog cannot be loaded', async () => {
    const p = service.getDenominations();
    http.expectOne(`${base}/denominations`).flush(null, { status: 500, statusText: 'Server Error' });
    await expect(p).rejects.toBeTruthy();
  });

  it('gets the shift report', async () => {
    const p = service.getReport('s1');
    const req = http.expectOne(`${base}/shifts/s1/report`);
    expect(req.request.method).toBe('GET');
    req.flush({ shift: shift({ status: 'closed' }), reconciliation: {}, movements: [], denominations: [] });
    expect((await p).shift.id).toBe('s1');
  });

  it('gets the shift report with the denomination breakdown and who closed it (spec 121)', async () => {
    const p = service.getReport('s1');
    const req = http.expectOne(`${base}/shifts/s1/report`);
    req.flush({
      shift: shift({ status: 'closed', closed_by_user_name: 'Luis', closed_by_user_id: 'u9' }),
      reconciliation: {},
      movements: [],
      denominations: [
        { denomination: '100000.00', kind: 'billete', quantity: 1, subtotal: '100000.00' },
      ],
    });
    const report = await p;
    expect(report.shift.closed_by_user_name).toBe('Luis');
    expect(report.denominations[0]).toEqual({
      denomination: '100000.00',
      kind: 'billete',
      quantity: 1,
      subtotal: '100000.00',
    });
  });

  /**
   * spec 072 (FR-001 a FR-004, contracts/descubrimiento-turno-abierto.md): reemplaza
   * `restoreShift()`. `restoreShift()` no tenía ningún test propio — este describe
   * lo cubre desde cero.
   */
  describe('discoverOpenShift', () => {
    const REGISTER_STORAGE_KEY = 'cash.register';

    afterEach(() => localStorage.removeItem(REGISTER_STORAGE_KEY));

    it('camino rápido: localStorage ya apunta a una caja con turno abierto — no lista las cajas', async () => {
      localStorage.setItem(REGISTER_STORAGE_KEY, 'reg-1');
      const p = service.discoverOpenShift();
      http
        .expectOne((r) => r.url === `${base}/shifts/current` && r.params.get('cash_register_id') === 'reg-1')
        .flush(shift({ cash_register_id: 'reg-1' }));
      await p;
      expect(service.shift()?.cash_register_id).toBe('reg-1');
      http.expectNone(`${base}/registers`);
    });

    it('sin localStorage, exactamente un turno abierto entre varias cajas — lo adopta y lo persiste', async () => {
      const p = service.discoverOpenShift();
      http.expectOne(`${base}/registers`).flush([
        { id: 'reg-1', name: 'Principal', active: true },
        { id: 'reg-2', name: 'Caja 2', active: true },
      ]);
      await tick();
      const reqs = http.match((r) => r.url === `${base}/shifts/current`);
      expect(reqs.length).toBe(2);
      for (const r of reqs) {
        if (r.request.params.get('cash_register_id') === 'reg-1') {
          r.flush(shift({ cash_register_id: 'reg-1' }));
        } else {
          r.flush(null, { status: 404, statusText: 'Not Found' });
        }
      }
      await p;
      expect(service.shift()?.cash_register_id).toBe('reg-1');
      expect(localStorage.getItem(REGISTER_STORAGE_KEY)).toBe('reg-1');
    });

    it('sin localStorage y ningún turno abierto en ninguna caja — shift queda en null (FR-003)', async () => {
      const p = service.discoverOpenShift();
      http.expectOne(`${base}/registers`).flush([{ id: 'reg-1', name: 'Principal', active: true }]);
      await tick();
      http
        .expectOne((r) => r.url === `${base}/shifts/current`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      await p;
      expect(service.shift()).toBeNull();
    });

    it('sin localStorage y dos turnos abiertos a la vez — shift queda en null, no elige ninguno (FR-004)', async () => {
      const p = service.discoverOpenShift();
      http.expectOne(`${base}/registers`).flush([
        { id: 'reg-1', name: 'Principal', active: true },
        { id: 'reg-2', name: 'Caja 2', active: true },
      ]);
      await tick();
      const reqs = http.match((r) => r.url === `${base}/shifts/current`);
      expect(reqs.length).toBe(2);
      reqs[0].flush(shift({ cash_register_id: reqs[0].request.params.get('cash_register_id')! }));
      reqs[1].flush(shift({ cash_register_id: reqs[1].request.params.get('cash_register_id')! }));
      await p;
      expect(service.shift()).toBeNull();
      expect(localStorage.getItem(REGISTER_STORAGE_KEY)).toBeNull();
    });

    it('localStorage apunta a una caja sin turno (404) — cae al descubrimiento completo', async () => {
      localStorage.setItem(REGISTER_STORAGE_KEY, 'reg-1');
      const p = service.discoverOpenShift();
      http
        .expectOne((r) => r.url === `${base}/shifts/current` && r.params.get('cash_register_id') === 'reg-1')
        .flush(null, { status: 404, statusText: 'Not Found' });
      await tick();
      http.expectOne(`${base}/registers`).flush([
        { id: 'reg-1', name: 'Principal', active: true },
        { id: 'reg-2', name: 'Caja 2', active: true },
      ]);
      await tick();
      const reqs = http.match((r) => r.url === `${base}/shifts/current`);
      expect(reqs.length).toBe(2);
      for (const r of reqs) {
        if (r.request.params.get('cash_register_id') === 'reg-2') {
          r.flush(shift({ cash_register_id: 'reg-2' }));
        } else {
          r.flush(null, { status: 404, statusText: 'Not Found' });
        }
      }
      await p;
      expect(service.shift()?.cash_register_id).toBe('reg-2');
    });
  });
});
