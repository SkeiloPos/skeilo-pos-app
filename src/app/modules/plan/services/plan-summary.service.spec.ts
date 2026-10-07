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
    modules: { inventario: false, compras: false, promociones: false },
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
