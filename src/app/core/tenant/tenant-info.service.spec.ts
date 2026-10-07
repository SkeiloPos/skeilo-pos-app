import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TenantInfo, TenantInfoService } from './tenant-info.service';
import { TenantContextService } from './tenant-context.service';

const API = environment.apiBaseUrl;
const TENANT = `${API}/tenant`;
const PRESIGN = `${API}/uploads/presign`;
const UPLOAD_URL = 'https://r2.example.invalid/put?sig=1';

/** Drain pending microtasks so the next request in a chained flow gets dispatched. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function tenantInfo(partial: Partial<TenantInfo> = {}): TenantInfo {
  return {
    id: 1,
    name: 'Heladería',
    host: 'acme.local',
    logo_url: null,
    receipt_message: null,
    timezone: 'America/Bogota',
    ...partial,
  };
}

describe('TenantInfoService', () => {
  let service: TenantInfoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        TenantInfoService,
        { provide: TenantContextService, useValue: { tenantSlug: () => 'acme' } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TenantInfoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Recorre presign -> PUT a R2 -> PATCH /tenant y devuelve el PATCH interceptado. */
  async function uploadLogoAndGetPatch(): Promise<{ body: Record<string, unknown>; done: Promise<boolean> }> {
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const done = service.uploadLogo(file);

    http.expectOne(PRESIGN).flush({
      upload_url: UPLOAD_URL,
      key: 'acme/logo/nuevo.png',
      public_url: 'https://pub-x.r2.dev/acme/logo/nuevo.png',
      expires_in: 300,
    });
    await tick();
    http.expectOne(UPLOAD_URL).flush(null);
    await tick();
    const patch = http.expectOne(TENANT);
    expect(patch.request.method).toBe('PATCH');
    const body = patch.request.body as Record<string, unknown>;
    patch.flush(tenantInfo({ logo_url: 'https://assets.skeilopos.com/acme/logo/nuevo.png' }));
    return { body, done };
  }

  describe('uploadLogo (spec 088: imagen base)', () => {
    it('envía el logo nuevo y, como base, el logo que el navegador conocía', async () => {
      const vigente = 'https://assets.skeilopos.com/acme/logo/vigente.png';
      service.info.set(tenantInfo({ logo_url: vigente }));

      const { body, done } = await uploadLogoAndGetPatch();

      expect(body['logo_url']).toBe('https://pub-x.r2.dev/acme/logo/nuevo.png');
      expect(body['logo_url_base']).toBe(vigente);
      expect(await done).toBe(true);
    });

    it('un negocio sin logo envía la base como null explícito', async () => {
      service.info.set(tenantInfo({ logo_url: null }));

      const { body, done } = await uploadLogoAndGetPatch();

      expect('logo_url_base' in body).toBe(true);
      expect(body['logo_url_base']).toBeNull();
      await done;
    });

    it('sin la información cargada todavía también envía null (nunca omite la base)', async () => {
      const { body, done } = await uploadLogoAndGetPatch();

      expect('logo_url_base' in body).toBe(true);
      expect(body['logo_url_base']).toBeNull();
      await done;
    });

    it('refresca info con la respuesta', async () => {
      service.info.set(tenantInfo());
      const { done } = await uploadLogoAndGetPatch();
      await done;
      expect(service.logoUrl()).toBe('https://assets.skeilopos.com/acme/logo/nuevo.png');
    });
  });

  describe('hydrate (spec 100: arranque agregado del panel)', () => {
    it('fija info() sin disparar ninguna petición HTTP', () => {
      service.hydrate(tenantInfo({ name: 'Heladería del Bosque' }));

      expect(service.info()?.name).toBe('Heladería del Bosque');
      http.verify();
    });

    it('acepta null (Super Admin, sin tenant resuelto)', () => {
      service.info.set(tenantInfo());

      service.hydrate(null);

      expect(service.info()).toBeNull();
      http.verify();
    });
  });

  describe('load (spec 101: caché y deduplicación, Historia 1)', () => {
    it('con info() ya cacheada no dispara ninguna petición (Escenario 1)', async () => {
      service.info.set(tenantInfo());

      await service.load();

      http.expectNone(TENANT);
    });

    it('dos llamadas casi simultáneas se unen a una sola petición (Escenario 2)', async () => {
      const first = service.load();
      const second = service.load();

      const req = http.expectOne(TENANT);
      req.flush(tenantInfo({ name: 'Nueva' }));

      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
      expect(service.info()?.name).toBe('Nueva');
    });

    it('tras un load() que termina en error, una llamada posterior sin forzar dispara una nueva petición (Escenario 3)', async () => {
      const first = service.load();
      http.expectOne(TENANT).flush('Error interno', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      await first;
      expect(service.error()).toBeTruthy();

      const second = service.load();
      http.expectOne(TENANT).flush(tenantInfo());
      await second;
      expect(service.info()).not.toBeNull();
    });

    it('un cache-hit no modifica loading() ni error() (FR-011)', async () => {
      service.info.set(tenantInfo());

      await service.load();

      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
      http.expectNone(TENANT);
    });

    it('unirse a una petición en curso no modifica loading()/error() por sí mismo (FR-011)', async () => {
      const first = service.load();
      expect(service.loading()).toBe(true);

      const second = service.load();
      expect(service.loading()).toBe(true);
      expect(service.error()).toBeNull();

      http.expectOne(TENANT).flush(tenantInfo());
      await first;
      await second;
      expect(service.loading()).toBe(false);
    });
  });

  describe('load({ force: true }) (spec 101: forzado, Historia 2)', () => {
    it('con info() ya cacheada, dispara una petición HTTP real (Escenario 1)', async () => {
      service.info.set(tenantInfo({ name: 'Vieja' }));

      const done = service.load({ force: true });
      http.expectOne(TENANT).flush(tenantInfo({ name: 'Nueva' }));
      await done;

      expect(service.info()?.name).toBe('Nueva');
    });

    it('tras la recarga forzada, una llamada sin forzar no dispara otra petición (Escenario 3)', async () => {
      service.info.set(tenantInfo({ name: 'Vieja' }));
      const forced = service.load({ force: true });
      http.expectOne(TENANT).flush(tenantInfo({ name: 'Nueva' }));
      await forced;

      await service.load();

      http.expectNone(TENANT);
      expect(service.info()?.name).toBe('Nueva');
    });

    it('un force que llega mientras ya hay un load() normal en curso dispara una segunda petición independiente (Caso 4 del contrato)', async () => {
      const normal = service.load();
      const req1 = http.expectOne(TENANT);

      const forced = service.load({ force: true });
      const req2 = http.expectOne(TENANT);

      req2.flush(tenantInfo({ name: 'Forzada' }));
      await forced;
      expect(service.info()?.name).toBe('Forzada');

      req1.flush(tenantInfo({ name: 'Vieja respuesta tardía' }));
      await normal;
      expect(service.info()?.name).toBe('Vieja respuesta tardía');
    });
  });

  describe('update (spec 088: nunca reenvía el logo)', () => {
    it('solo envía lo que se le pasa, sin logo_url ni logo_url_base', async () => {
      service.info.set(tenantInfo({ logo_url: 'https://assets.skeilopos.com/acme/logo/vigente.png' }));

      const done = service.update({ receipt_message: 'Gracias' });
      const req = http.expectOne(TENANT);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ receipt_message: 'Gracias' });
      expect('logo_url' in req.request.body).toBe(false);
      req.flush(tenantInfo({ receipt_message: 'Gracias' }));

      expect(await done).toBe(true);
    });
  });
});
