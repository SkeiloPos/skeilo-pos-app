import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PageIntegrityService } from '../integrity/page-integrity.service';
import { inflightRequestsInterceptor } from './inflight-requests.interceptor';
import { UpdateGateService } from './update-gate.service';

const API = environment.apiBaseUrl;

describe('inflightRequestsInterceptor (spec 134, contracts/app-update.md)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let gate: UpdateGateService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([inflightRequestsInterceptor])),
        provideHttpClientTesting(),
        { provide: PageIntegrityService, useValue: { altered: signal(false) } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    gate = TestBed.inject(UpdateGateService);
  });

  afterEach(() => httpMock.verify());

  describe.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s al backend propio', (metodo) => {
    it('cuenta mientras está en vuelo y deja de contar al terminar', async () => {
      const promesa = firstValueFrom(http.request(metodo, `${API}/orders`, { body: {} }));
      const req = httpMock.expectOne(`${API}/orders`);
      expect(gate.isSafeMoment()).toBe(false); // en vuelo

      req.flush({ ok: true });
      await promesa;
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('también deja de contar cuando la petición falla', async () => {
      const promesa = firstValueFrom(http.request(metodo, `${API}/orders`, { body: {} })).catch(() => 'error');
      httpMock.expectOne(`${API}/orders`).flush({ detail: 'x' }, { status: 500, statusText: 'Server Error' });

      await promesa;
      expect(gate.isSafeMoment()).toBe(true);
    });
  });

  it('también deja de contar si se cancela la suscripción antes de la respuesta', () => {
    const sub = http.post(`${API}/orders`, {}).subscribe();
    const req = httpMock.expectOne(`${API}/orders`);
    expect(gate.isSafeMoment()).toBe(false);

    sub.unsubscribe();
    expect(req.cancelled).toBe(true);
    expect(gate.isSafeMoment()).toBe(true);
  });

  it('cuenta varias escrituras simultáneas', async () => {
    const a = firstValueFrom(http.post(`${API}/a`, {}));
    const b = firstValueFrom(http.post(`${API}/b`, {}));
    const reqA = httpMock.expectOne(`${API}/a`);
    const reqB = httpMock.expectOne(`${API}/b`);

    reqA.flush({});
    await a;
    expect(gate.isSafeMoment()).toBe(false); // falta la B

    reqB.flush({});
    await b;
    expect(gate.isSafeMoment()).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('%s no se cuenta', async (metodo) => {
    const promesa = firstValueFrom(http.request(metodo, `${API}/orders`));
    const req = httpMock.expectOne(`${API}/orders`);
    expect(gate.isSafeMoment()).toBe(true);

    req.flush({});
    await promesa;
  });

  it('una escritura a una URL ajena al backend no se cuenta', async () => {
    const promesa = firstValueFrom(http.post('https://otro-dominio.example/x', {}));
    const req = httpMock.expectOne('https://otro-dominio.example/x');
    expect(gate.isSafeMoment()).toBe(true);

    req.flush({});
    await promesa;
  });

  it('no modifica la petición', async () => {
    const promesa = firstValueFrom(http.post(`${API}/orders`, { a: 1 }, { headers: { 'X-Prueba': '1' } }));
    const req = httpMock.expectOne(`${API}/orders`);

    expect(req.request.body).toEqual({ a: 1 });
    expect(req.request.headers.get('X-Prueba')).toBe('1');
    expect(req.request.method).toBe('POST');

    req.flush({});
    await promesa;
  });
});
