import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authTokenInterceptor } from './auth-token.interceptor';
import { TokenStorageService } from './token-storage.service';
import { AuthService } from '../services/auth.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { DinerTokenStore } from '../../modules/tables/services/diner-token.store';

const API = environment.apiBaseUrl;

class FakeTokenStorage {
  getAccessToken(): string | null {
    return 'staff-access-token';
  }
}

class FakeTenantContext {
  /** Lo que `TenantContextService.tenantHostHeader()` devolvería en cada contexto. */
  static host: string | null = 'heladeria';
  tenantSlug(): string | null {
    return FakeTenantContext.host;
  }
  tenantHostHeader(): string | null {
    return FakeTenantContext.host;
  }
}

/**
 * Store de token del comensal en memoria.
 *
 * El real lee y escribe `localStorage`, que es global al entorno de pruebas: si
 * dos ficheros de spec lo usan a la vez, el `clear()` de uno borra el token que
 * el otro acaba de escribir y los tests fallan de forma intermitente. Aquí solo
 * interesa qué cabecera pone el interceptor, así que basta con un doble.
 */
class FakeDinerTokens {
  private value: string | null = null;
  token(): string | null {
    return this.value;
  }
  set(v: string): void {
    this.value = v;
  }
  clear(): void {
    this.value = null;
  }
}

class FakeAuth {
  tryRefreshCalls = 0;
  forceLogoutCalls = 0;
  async tryRefresh(): Promise<boolean> {
    this.tryRefreshCalls += 1;
    return false;
  }
  forceLogout(): void {
    this.forceLogoutCalls += 1;
  }
}

describe('authTokenInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: FakeAuth;
  let diner: FakeDinerTokens;

  beforeEach(() => {
    // Los ficheros de spec comparten entorno y corren en paralelo: si otro dejó
    // el TestBed instanciado, `configureTestingModule` lanza
    // "test module has already been instantiated". Resetear aquí hace este spec
    // independiente del orden de ejecución.
    TestBed.resetTestingModule();
    FakeTenantContext.host = 'heladeria';
    auth = new FakeAuth();
    diner = new FakeDinerTokens();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        { provide: DinerTokenStore, useValue: diner },
        { provide: TokenStorageService, useClass: FakeTokenStorage },
        { provide: TenantContextService, useClass: FakeTenantContext },
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── Staff ────────────────────────────────────────────────────────────────

  it('añade Bearer y tenant a las rutas de staff', async () => {
    const promise = firstValueFrom(http.get(`${API}/orders`));
    const req = httpMock.expectOne(`${API}/orders`);

    expect(req.request.headers.get('Authorization')).toBe('Bearer staff-access-token');
    expect(req.request.headers.get(environment.tenantHeaderName)).toBe('heladeria');
    expect(req.request.headers.has('x-session-token')).toBe(false);

    req.flush({});
    await promise;
  });

  // ── Contexto de host (spec 091, A-99) ────────────────────────────────────

  it('en la plataforma manda X-Tenant-Host: admin', async () => {
    FakeTenantContext.host = 'admin';
    const promise = firstValueFrom(http.post(`${API}/auth/login`, {}));
    const req = httpMock.expectOne(`${API}/auth/login`);

    expect(req.request.headers.get(environment.tenantHeaderName)).toBe('admin');

    req.flush({});
    await promise;
  });

  it('en un host no reconocido no manda X-Tenant-Host', async () => {
    FakeTenantContext.host = null;
    const promise = firstValueFrom(http.get(`${API}/orders`));
    const req = httpMock.expectOne(`${API}/orders`);

    expect(req.request.headers.has(environment.tenantHeaderName)).toBe(false);

    req.flush({});
    await promise;
  });

  it('un 401 de staff intenta refrescar y, si falla, fuerza logout', async () => {
    const promise = firstValueFrom(http.get(`${API}/orders`)).catch(() => 'rejected');
    httpMock.expectOne(`${API}/orders`).flush(null, { status: 401, statusText: 'Unauthorized' });

    await promise;
    expect(auth.tryRefreshCalls).toBe(1);
    expect(auth.forceLogoutCalls).toBe(1);
  });

  // ── Comensal ─────────────────────────────────────────────────────────────

  it('envía x-session-token y NO el Bearer del staff en las rutas del comensal', async () => {
    diner.set('diner-session-token');

    const promise = firstValueFrom(http.get(`${API}/cart`));
    const req = httpMock.expectOne(`${API}/cart`);

    expect(req.request.headers.get('x-session-token')).toBe('diner-session-token');
    // Aunque haya un empleado logueado en el mismo navegador, su token no viaja
    // en las peticiones anónimas del comensal.
    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({});
    await promise;
  });

  it('el comensal funciona en un host no reconocido: sin X-Tenant-Host, con su x-session-token (spec 091)', async () => {
    FakeTenantContext.host = null;
    diner.set('diner-session-token');

    const promise = firstValueFrom(http.get(`${API}/cart`));
    const req = httpMock.expectOne(`${API}/cart`);

    expect(req.request.headers.get('x-session-token')).toBe('diner-session-token');
    expect(req.request.headers.has(environment.tenantHeaderName)).toBe(false);

    req.flush({});
    await promise;
  });

  it('el menú por QR firmado tampoco lleva Bearer', async () => {
    const promise = firstValueFrom(http.get(`${API}/menu/qr-token/abc.def.ghi`));
    const req = httpMock.expectOne(`${API}/menu/qr-token/abc.def.ghi`);

    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({});
    await promise;
  });

  /**
   * El caso que motivó separar los caminos: para el comensal un 401 es rutina
   * (mesa cobrada, sesión cerrada, TTL agotado) y significa "vuelve a escanear
   * el QR". Si pasara por el refresh de staff, lo expulsaría al login.
   */
  it('un 401 del comensal NO refresca ni cierra la sesión del staff', async () => {
    diner.set('diner-session-token');

    const promise = firstValueFrom(http.get(`${API}/cart/orders`)).catch(() => 'rejected');
    httpMock
      .expectOne(`${API}/cart/orders`)
      .flush({ detail: 'Sesión no activa' }, { status: 401, statusText: 'Unauthorized' });

    await promise;
    expect(auth.tryRefreshCalls).toBe(0);
    expect(auth.forceLogoutCalls).toBe(0);
  });

  it('no decora peticiones fuera del backend propio', async () => {
    const promise = firstValueFrom(http.get('https://example.com/x'));
    const req = httpMock.expectOne('https://example.com/x');

    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.has(environment.tenantHeaderName)).toBe(false);

    req.flush({});
    await promise;
  });
});
