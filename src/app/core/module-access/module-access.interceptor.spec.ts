import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { moduleAccessInterceptor } from './module-access.interceptor';
import { ModuleAccessLostService } from './module-access-lost.service';
import { MODULE_NOT_IN_PLAN_CODE, MODULE_NOT_IN_PLAN_MESSAGE } from './module-access.messages';

const API = environment.apiBaseUrl;

// jsdom no implementa `Blob.prototype.text()` (los navegadores sí): se completa solo para estas pruebas.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

const CUERPO_MODULO = {
  detail: 'Tu plan actual no incluye el módulo de inventario.',
  code: 'MODULE_NOT_IN_PLAN',
  module: 'inventario',
};

/** Spec 141 (US5, FR-016; contrato `frontend-acceso-modulos.md` §2 y §8). */
describe('moduleAccessInterceptor (spec 141)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let handle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handle = vi.fn(async () => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([moduleAccessInterceptor])),
        provideHttpClientTesting(),
        { provide: ModuleAccessLostService, useValue: { handle } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Envía un GET y devuelve el error con el que terminó (o `null` si tuvo éxito). */
  async function get(url: string, respuesta: () => { cuerpo: unknown; status: number }, opciones?: { blob?: boolean }) {
    const promesa = firstValueFrom(
      opciones?.blob ? http.get(url, { responseType: 'blob' }) : http.get(url),
    ).then(
      () => null,
      (e: unknown) => e as HttpErrorResponse,
    );
    const { cuerpo, status } = respuesta();
    httpMock.expectOne(url).flush(cuerpo as never, { status, statusText: 'x' });
    return promesa;
  }

  // ── 403 MODULE_NOT_IN_PLAN ────────────────────────────────────────────────

  it('403 con código: llama al servicio con el módulo y relanza con el detail del aviso, conservando code y module', async () => {
    const error = await get(`${API}/inventory/items`, () => ({ cuerpo: CUERPO_MODULO, status: 403 }));

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith('inventario');
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error!.status).toBe(403);
    expect(error!.error.detail).toBe(MODULE_NOT_IN_PLAN_MESSAGE);
    expect(error!.error.code).toBe(MODULE_NOT_IN_PLAN_CODE);
    expect(error!.error.module).toBe('inventario');
  });

  it('403 con código pero sin módulo: igual lo atiende (con `undefined`)', async () => {
    const error = await get(`${API}/inventory/items`, () => ({
      cuerpo: { detail: 'x', code: 'MODULE_NOT_IN_PLAN' },
      status: 403,
    }));

    expect(handle).toHaveBeenCalledWith(undefined);
    expect(error!.error.detail).toBe(MODULE_NOT_IN_PLAN_MESSAGE);
  });

  // ── Lo que NO debe tocar ──────────────────────────────────────────────────

  it('403 sin código (plan vencido, rol o límite): pasa intacto y no llama al servicio', async () => {
    const cuerpo = { detail: 'Tu plan venció. Debe renovarse para seguir usando el sistema.' };

    const error = await get(`${API}/inventory/items`, () => ({ cuerpo, status: 403 }));

    expect(handle).not.toHaveBeenCalled();
    expect(error!.status).toBe(403);
    expect(error!.error).toEqual(cuerpo);
  });

  it('403 con cuerpo de texto plano: pasa intacto', async () => {
    const error = await get(`${API}/inventory/items`, () => ({ cuerpo: 'Forbidden', status: 403 }));

    expect(handle).not.toHaveBeenCalled();
    expect(error!.error).toBe('Forbidden');
  });

  for (const status of [401, 404, 422, 500]) {
    it(`${status} pasa intacto aunque su cuerpo traiga el código`, async () => {
      const error = await get(`${API}/inventory/items`, () => ({ cuerpo: CUERPO_MODULO, status }));

      expect(handle).not.toHaveBeenCalled();
      expect(error!.status).toBe(status);
      expect(error!.error).toEqual(CUERPO_MODULO);
    });
  }

  it('una URL fuera de environment.apiBaseUrl pasa intacta', async () => {
    const error = await get('https://otro-servicio.example/inventory', () => ({ cuerpo: CUERPO_MODULO, status: 403 }));

    expect(handle).not.toHaveBeenCalled();
    expect(error!.error).toEqual(CUERPO_MODULO);
  });

  it('una respuesta correcta no se toca', async () => {
    const promesa = firstValueFrom(http.get(`${API}/inventory/items`));
    httpMock.expectOne(`${API}/inventory/items`).flush({ items: [] });

    await expect(promesa).resolves.toEqual({ items: [] });
    expect(handle).not.toHaveBeenCalled();
  });

  // ── Cuerpos Blob (peticiones con responseType: 'blob') ────────────────────

  it('403 con cuerpo Blob que contiene el código: llama al servicio y relanza con `error` ya como objeto', async () => {
    const blob = new Blob([JSON.stringify(CUERPO_MODULO)], { type: 'application/json' });

    const error = await get(`${API}/inventory/items/export`, () => ({ cuerpo: blob, status: 403 }), { blob: true });

    expect(handle).toHaveBeenCalledWith('inventario');
    expect(error!.error).not.toBeInstanceOf(Blob);
    expect(error!.error.code).toBe(MODULE_NOT_IN_PLAN_CODE);
    expect(error!.error.detail).toBe(MODULE_NOT_IN_PLAN_MESSAGE);
  });

  it('403 con Blob de JSON inválido: pasa intacto y no llama al servicio', async () => {
    const blob = new Blob(['no es json'], { type: 'application/json' });

    const error = await get(`${API}/inventory/items/export`, () => ({ cuerpo: blob, status: 403 }), { blob: true });

    expect(handle).not.toHaveBeenCalled();
    expect(error!.error).toBeInstanceOf(Blob);
  });

  it('403 con Blob de JSON sin el código: pasa intacto y no llama al servicio', async () => {
    const blob = new Blob([JSON.stringify({ detail: 'Tenant admin access required' })], { type: 'application/json' });

    const error = await get(`${API}/inventory/items/export`, () => ({ cuerpo: blob, status: 403 }), { blob: true });

    expect(handle).not.toHaveBeenCalled();
    expect(error!.error).toBeInstanceOf(Blob);
  });
});
