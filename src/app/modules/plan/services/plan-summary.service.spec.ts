import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { PlanSummaryService } from './plan-summary.service';
import { PlanSummary } from '../interfaces/plan-summary.interface';

const API = environment.apiBaseUrl;
const PLAN = `${API}/plan`;

function planSummary(partial: Partial<PlanSummary> = {}): PlanSummary {
  return {
    plan_name: 'Básico',
    ciclo_facturacion: 'mensual',
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: false, promociones: false, cocina: false },
    ...partial,
  };
}

describe('PlanSummaryService', () => {
  let service: PlanSummaryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PlanSummaryService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlanSummaryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('load', () => {
    it('trae el resumen vía GET /plan y lo fija en summary()', async () => {
      const done = service.load();
      const req = http.expectOne(PLAN);
      expect(req.request.method).toBe('GET');
      req.flush(planSummary({ plan_name: 'Pro' }));
      await done;

      expect(service.summary()?.plan_name).toBe('Pro');
    });
  });

  describe('load (spec 101: caché y deduplicación, Historia 1)', () => {
    it('con summary() ya cacheado no dispara ninguna petición (Escenario 1)', async () => {
      service.summary.set(planSummary());

      await service.load();

      http.expectNone(PLAN);
    });

    it('dos llamadas casi simultáneas se unen a una sola petición (Escenario 2)', async () => {
      const first = service.load();
      const second = service.load();

      const req = http.expectOne(PLAN);
      req.flush(planSummary({ plan_name: 'Pro' }));

      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
      expect(service.summary()?.plan_name).toBe('Pro');
    });

    it('tras un load() que termina en error, una llamada posterior sin forzar dispara una nueva petición (Escenario 3)', async () => {
      const first = service.load();
      http.expectOne(PLAN).flush('Error interno', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      await first;
      expect(service.error()).toBeTruthy();

      const second = service.load();
      http.expectOne(PLAN).flush(planSummary());
      await second;
      expect(service.summary()).not.toBeNull();
    });

    it('un cache-hit no modifica loading() ni error() (FR-011)', async () => {
      service.summary.set(planSummary());

      await service.load();

      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
      http.expectNone(PLAN);
    });

    it('unirse a una petición en curso no modifica loading()/error() por sí mismo (FR-011)', async () => {
      const first = service.load();
      expect(service.loading()).toBe(true);

      const second = service.load();
      expect(service.loading()).toBe(true);
      expect(service.error()).toBeNull();

      http.expectOne(PLAN).flush(planSummary());
      await first;
      await second;
      expect(service.loading()).toBe(false);
    });
  });

  describe('load({ force: true }) (spec 101: forzado, Historia 2)', () => {
    it('con summary() ya cacheado, dispara una petición HTTP real (Escenario 1)', async () => {
      service.summary.set(planSummary({ plan_name: 'Básico' }));

      const done = service.load({ force: true });
      http.expectOne(PLAN).flush(planSummary({ plan_name: 'Pro' }));
      await done;

      expect(service.summary()?.plan_name).toBe('Pro');
    });

    it('tras la recarga forzada, una llamada sin forzar no dispara otra petición (Escenario 3)', async () => {
      service.summary.set(planSummary({ plan_name: 'Básico' }));
      const forced = service.load({ force: true });
      http.expectOne(PLAN).flush(planSummary({ plan_name: 'Pro' }));
      await forced;

      await service.load();

      http.expectNone(PLAN);
      expect(service.summary()?.plan_name).toBe('Pro');
    });

    it('un force que llega mientras ya hay un load() normal en curso dispara una segunda petición independiente (Caso 4 del contrato)', async () => {
      const normal = service.load();
      const req1 = http.expectOne(PLAN);

      const forced = service.load({ force: true });
      const req2 = http.expectOne(PLAN);

      req2.flush(planSummary({ plan_name: 'Forzado' }));
      await forced;
      expect(service.summary()?.plan_name).toBe('Forzado');

      req1.flush(planSummary({ plan_name: 'Vieja respuesta tardía' }));
      await normal;
      expect(service.summary()?.plan_name).toBe('Vieja respuesta tardía');
    });
  });

  describe('includes (spec 141: predicado fail-closed para CARGAR datos, FR-014)', () => {
    it('summary = null (plan desconocido) → false', () => {
      expect(service.summary()).toBeNull();

      expect(service.includes('inventario')).toBe(false);
      expect(service.includes('promociones')).toBe(false);
    });

    it('plan vencido → false aunque el módulo figure como incluido', () => {
      service.summary.set(planSummary({ vencido: true, modules: { inventario: true, promociones: true, cocina: false } }));

      expect(service.includes('inventario')).toBe(false);
    });

    it('módulo ausente del plan → false', () => {
      service.summary.set(planSummary({ modules: { inventario: false, promociones: true, cocina: false } }));

      expect(service.includes('inventario')).toBe(false);
      expect(service.includes('promociones')).toBe(true);
    });

    it('módulo incluido y plan no vencido → true', () => {
      service.summary.set(planSummary({ modules: { inventario: true, promociones: false, cocina: false } }));

      expect(service.includes('inventario')).toBe(true);
    });

    it('es reactivo: leído dentro de un computed cambia cuando el resumen llega o cambia', () => {
      const incluido = computed(() => service.includes('inventario'));
      expect(incluido()).toBe(false); // todavía sin resumen

      service.summary.set(planSummary({ modules: { inventario: true, promociones: false, cocina: false } }));
      expect(incluido()).toBe(true); // llegó el resumen

      service.summary.set(planSummary({ modules: { inventario: false, promociones: false, cocina: false } }));
      expect(incluido()).toBe(false); // se perdió el módulo
    });
  });

  describe('markModuleMissing (spec 141: el menú se corrige en el acto, FR-016)', () => {
    it('pone el módulo en false de inmediato y de forma síncrona, sin ninguna petición', () => {
      service.summary.set(planSummary({ modules: { inventario: true, promociones: true, cocina: false } }));

      service.markModuleMissing('inventario');

      expect(service.summary()!.modules.inventario).toBe(false);
      expect(service.includes('inventario')).toBe(false);
      http.expectNone(PLAN);
    });

    it('no toca otros módulos ni el resto del resumen', () => {
      const original = planSummary({ plan_name: 'Pro', modules: { inventario: true, promociones: true, cocina: false } });
      service.summary.set(original);

      service.markModuleMissing('inventario');

      expect(service.summary()!.modules.promociones).toBe(true);
      expect(service.summary()!.plan_name).toBe('Pro');
      // actualización inmutable: el objeto anterior no se mutó
      expect(original.modules.inventario).toBe(true);
    });

    it('si el resumen aún no llegó (null), no hace nada', () => {
      expect(service.summary()).toBeNull();

      service.markModuleMissing('inventario');

      expect(service.summary()).toBeNull();
    });

    it('una clave que no es un módulo del resumen no agrega propiedades', () => {
      service.summary.set(planSummary({ modules: { inventario: true, promociones: true, cocina: false } }));

      service.markModuleMissing('compras' as never);

      expect(Object.keys(service.summary()!.modules)).toEqual(['inventario', 'promociones', 'cocina']);
    });
  });

  describe('hydrate (spec 100: arranque agregado del panel)', () => {
    it('fija summary() sin disparar ninguna petición HTTP', () => {
      service.hydrate(planSummary({ plan_name: 'Pro' }));

      expect(service.summary()?.plan_name).toBe('Pro');
      http.verify();
    });

    it('acepta null (Super Admin, sin tenant ni plan resueltos)', () => {
      service.summary.set(planSummary());

      service.hydrate(null);

      expect(service.summary()).toBeNull();
      http.verify();
    });
  });
});
