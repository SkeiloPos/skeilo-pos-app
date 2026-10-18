import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { PromotionService } from './promotion.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import type { PromotionForm } from '../interfaces/promotion.interface';

/** Drain pending microtasks so the reactive query effect fires the HTTP request. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const base = `${environment.apiBaseUrl}/promotions`;

function emptyPage() {
  return { items: [], total: 0, page: 1, size: 100, pages: 0 };
}

describe('PromotionService — hora sincronizada con el servidor (A-09)', () => {
  let service: PromotionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PromotionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(PromotionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('antes del primer sync, ready() es false y now() no debe consultarse (FR-004)', () => {
    expect(service.ready()).toBe(false);
  });

  it('tras el primer GET /promotions?status=active, now() usa el offset del servidor, no el reloj local (FR-001/FR-002)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // solo Date: setTimeout real para que tick() siga funcionando
    vi.setSystemTime(new Date('2026-08-18T22:30:00.000Z')); // reloj local del terminal

    service.loadActive();
    await tick();

    const req = http.expectOne((r) => r.url === base && r.params.get('status') === 'active');
    req.flush(emptyPage(), { headers: { 'X-Server-Time': '2026-08-18T22:32:00.000Z' } }); // servidor 2 min adelantado
    await tick();

    expect(service.ready()).toBe(true);
    expect(service.now().toISOString()).toBe('2026-08-18T22:32:00.000Z');
  });
});

/** spec 127 (FR-001): respaldo de `toCreate()` cuando `form.starts_at` llega
 *  vacío — mismo defecto UTC-vs-local que `continueToConfigure()`, pero en
 *  el constructor del payload en vez del componente. */
describe('PromotionService.create — starts_at usa el día calendario LOCAL del tenant (spec 127)', () => {
  let service: PromotionService;
  let http: HttpTestingController;
  let tenantInfo: TenantInfoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PromotionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(PromotionService);
    http = TestBed.inject(HttpTestingController);
    tenantInfo = TestBed.inject(TenantInfoService);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  const formWithoutStartsAt: PromotionForm = {
    name: '2x1 Granizados',
    starts_at: null,
    ends_at: null,
    days_of_week: [],
    start_time: null,
    end_time: null,
    type: 'package_price',
    rules: [],
  };

  it('sin starts_at explícito, el payload usa el día LOCAL del tenant, no el día UTC', async () => {
    // 2026-10-19T02:00:00Z = 2026-10-18 21:00 hora de Bogotá (UTC-5).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T02:00:00Z'));
    tenantInfo.info.set({
      id: 1,
      name: 'Heladería de prueba',
      host: 'prueba.skeilopos.com',
      logo_url: null,
      receipt_message: null,
      timezone: 'America/Bogota',
    });

    void service.create(formWithoutStartsAt, 'draft');

    const req = http.expectOne((r) => r.url === base && r.method === 'POST');
    expect(req.request.body.starts_at).toBe('2026-10-18');
    req.flush({ id: 'new-id' });
  });
});

/** spec 127 (FR-005): `starts_at` ahora viaja en `PATCH /promotions/{id}`,
 *  pero el backend solo la acepta mientras la promoción sigue en `draft`
 *  (409 fuera de ese estado) -- `includeStartsAt` evita reenviarla sin
 *  querer cuando el campo del formulario está deshabilitado. */
describe('PromotionService.update — starts_at solo viaja cuando includeStartsAt (spec 127)', () => {
  let service: PromotionService;
  let http: HttpTestingController;

  const form: PromotionForm = {
    name: 'Promo',
    starts_at: '2026-10-18',
    ends_at: null,
    days_of_week: [],
    start_time: null,
    end_time: null,
    type: 'package_price',
    rules: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PromotionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(PromotionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('includeStartsAt=true (default): el PATCH incluye starts_at', () => {
    void service.update('p1', form);

    const req = http.expectOne((r) => r.url === `${base}/p1` && r.method === 'PATCH');
    expect(req.request.body.starts_at).toBe('2026-10-18');
    req.flush({ id: 'p1' });
  });

  it('includeStartsAt=false: el PATCH NO incluye starts_at', () => {
    void service.update('p1', form, false);

    const req = http.expectOne((r) => r.url === `${base}/p1` && r.method === 'PATCH');
    expect('starts_at' in req.request.body).toBe(false);
    req.flush({ id: 'p1' });
  });
});
