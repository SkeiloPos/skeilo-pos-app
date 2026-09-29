import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { PaymentMethodService } from './payment-method.service';

const base = `${environment.apiBaseUrl}/sales/payment-methods`;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('PaymentMethodService', () => {
  let service: PaymentMethodService;
  let http: HttpTestingController;

  beforeEach(() => {
    // Ver nota en `diner.service.spec.ts`: los ficheros de spec comparten
    // entorno, así que sin resetear falla según el orden de ejecución.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PaymentMethodService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PaymentMethodService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads payment methods', async () => {
    const p = service.load();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'pm1', name: 'Efectivo', is_cash: true, active: true }]);
    await p;
    expect(service.methods()[0].name).toBe('Efectivo');
  });

  it('activates a payment method from the catalog then reloads (spec 032)', async () => {
    const p = service.create('cat-nequi', { celular: '3001234567' });
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    // Ya no se manda `name`/`type` libres — solo `catalog_id` (FR-007/FR-011).
    expect(req.request.body).toEqual({
      catalog_id: 'cat-nequi',
      payment_info: { celular: '3001234567' },
    });
    req.flush({
      id: 'pm2', catalog_id: 'cat-nequi', name: 'Nequi', type: 'transfer',
      is_cash: false, active: true, is_complete: true,
    });
    await tick();
    http.expectOne(base).flush([]);
    expect(await p).toBe(true);
  });

  it('update transmite payment_info_base tal cual junto con payment_info (spec 088)', async () => {
    const info = { celular: '3009999999', qr: 'https://assets.skeilopos.com/acme/payment-methods/qr.png' };
    const infoBase = { celular: '3001234567', qr: 'https://assets.skeilopos.com/acme/payment-methods/qr.png' };
    const p = service.update('pm2', { payment_info: info, payment_info_base: infoBase });
    const req = http.expectOne(`${base}/pm2`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ payment_info: info, payment_info_base: infoBase });
    req.flush({ id: 'pm2', name: 'Nequi', is_cash: false, active: true });
    await tick();
    http.expectOne(base).flush([]);
    expect(await p).toBe(true);
  });

  it('update sin base no inventa un payment_info_base (toggleActive no lo envía)', async () => {
    const p = service.update('pm2', { active: false });
    const req = http.expectOne(`${base}/pm2`);
    expect('payment_info_base' in req.request.body).toBe(false);
    req.flush({ id: 'pm2', name: 'Nequi', is_cash: false, active: false });
    await tick();
    http.expectOne(base).flush([]);
    await p;
  });

  it('loads only the methods available for checkout (spec 032, FR-012)', async () => {
    const p = service.loadAvailableForCheckout();
    const req = http.expectOne((r) => r.url === base && r.params.get('available') === 'true');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'pm1', name: 'Efectivo', is_cash: true }]);
    await p;
    expect(service.checkoutOptions()).toEqual([{ id: 'pm1', name: 'Efectivo', is_cash: true }]);
  });

  it('maps an error', async () => {
    const p = service.load();
    http.expectOne(base).flush({ detail: 'Boom' }, { status: 500, statusText: 'Err' });
    await p;
    expect(service.error()).toBe('Boom');
  });
});
