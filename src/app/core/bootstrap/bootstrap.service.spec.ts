import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { BootstrapService } from './bootstrap.service';
import { BootstrapResponse } from './bootstrap.model';
import { TenantInfoService } from '../tenant/tenant-info.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PlanSummaryService } from '../../modules/plan/services/plan-summary.service';
import { NotificationCenterService } from '../notifications/notification-center.service';

const API = environment.apiBaseUrl;
const BOOTSTRAP = `${API}/bootstrap`;

function bootstrapResponse(partial: Partial<BootstrapResponse> = {}): BootstrapResponse {
  return {
    tenant: {
      id: 1,
      name: 'Heladería',
      host: 'acme.local',
      logo_url: null,
      receipt_message: null,
      timezone: 'America/Bogota',
    },
    plan: {
      plan_name: 'Básico',
      ciclo_facturacion: 'mensual',
      plan_vence_en: null,
      vencido: false,
      resources: {},
      modules: { inventario: false, compras: false, promociones: false },
    },
    notifications: { items: [], total: 0, page: 1, size: 20 },
    ...partial,
  };
}

describe('BootstrapService', () => {
  let service: BootstrapService;
  let http: HttpTestingController;
  let notificationCenter: { hydrate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    notificationCenter = { hydrate: vi.fn() };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        BootstrapService,
        TenantInfoService,
        PlanSummaryService,
        { provide: TenantContextService, useValue: { tenantSlug: () => 'acme' } },
        { provide: NotificationCenterService, useValue: notificationCenter },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(BootstrapService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('una sola GET /bootstrap reparte cada bloque al hydrate() correspondiente', async () => {
    const tenantInfo = TestBed.inject(TenantInfoService);
    const planSummaryService = TestBed.inject(PlanSummaryService);
    const res = bootstrapResponse();

    const done = service.load();
    const req = http.expectOne(BOOTSTRAP);
    expect(req.request.method).toBe('GET');
    req.flush(res);
    await done;

    expect(tenantInfo.info()).toEqual(res.tenant);
    expect(planSummaryService.summary()).toEqual(res.plan);
    expect(notificationCenter.hydrate).toHaveBeenCalledWith(res.notifications);
  });

  it('bloques en null (Super Admin) también se reparten tal cual', async () => {
    const tenantInfo = TestBed.inject(TenantInfoService);
    const planSummaryService = TestBed.inject(PlanSummaryService);
    const res: BootstrapResponse = { tenant: null, plan: null, notifications: null };

    const done = service.load();
    http.expectOne(BOOTSTRAP).flush(res);
    await done;

    expect(tenantInfo.info()).toBeNull();
    expect(planSummaryService.summary()).toBeNull();
    expect(notificationCenter.hydrate).toHaveBeenCalledWith(null);
  });

  it('fallo total: ningún hydrate() se llama y no hay reintentos dentro de la misma carga', async () => {
    const tenantInfo = TestBed.inject(TenantInfoService);
    const planSummaryService = TestBed.inject(PlanSummaryService);
    tenantInfo.info.set(null);
    planSummaryService.summary.set(null);

    const done = service.load();
    http.expectOne(BOOTSTRAP).flush('boom', { status: 500, statusText: 'Internal Server Error' });
    await done;

    expect(notificationCenter.hydrate).not.toHaveBeenCalled();
    http.expectNone(BOOTSTRAP);
  });
});
