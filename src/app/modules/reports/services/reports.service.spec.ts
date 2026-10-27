import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';
import { businessToday } from '../../../shared/date-format.util';
import { ReportsService } from './reports.service';

const api = environment.apiBaseUrl;

/** Zona horaria fija de prueba — spec 030: "hoy" se compara contra
 * `businessToday(tz)`, no contra el reloj del entorno de ejecución (que
 * puede no estar en UTC-5, quickstart.md Paso 16). */
const TEST_TIMEZONE = 'America/Bogota';

function makeSummary(partial: Partial<PlanSummary>): PlanSummary {
  return {
    plan_name: 'Pro',
    ciclo_facturacion: 'mensual',
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, compras: true, promociones: true },
    ...partial,
  };
}

/**
 * El spec anterior probaba una versión del servicio que agregaba las ventas en
 * el cliente contra `/sales`, `/sales/payment-methods` e `/inventory/items`.
 * Ese servicio dejó de existir cuando los informes pasaron a `/reports/*`, y el
 * spec se quedó pidiendo URLs que ya nadie llama: llevaba roto desde entonces.
 */
describe('ReportsService', () => {
  let service: ReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        ReportsService,
        // Por defecto, el tenant de prueba sí tiene el módulo Inventario —
        // preserva el comportamiento de "seis informes al arrancar" para
        // todos los tests de este describe que no dicen lo contrario. El
        // gating cuando NO lo tiene se prueba aparte (spec 062, describe
        // "gating de inventario/profitability").
        { provide: PlanSummaryService, useValue: { summary: signal<PlanSummary | null>(makeSummary({})) } },
      ],
    });
    const tenantInfo = TestBed.inject(TenantInfoService);
    tenantInfo.info.set({
      id: 1,
      name: 'Heladería de prueba',
      host: 'prueba.skeilopos.com',
      logo_url: null,
      receipt_message: null,
      timezone: TEST_TIMEZONE,
    });
    service = TestBed.inject(ReportsService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick(); // deja correr los efectos que lanzan las queries
  });

  afterEach(() => {
    http.match(() => true); // vacía las peticiones que el test no necesitó
    http.verify();
  });

  /** Deja resolver la promesa del HttpClient y propagar la signal de la query. */
  async function asentar(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
  }

  /** URLs pedidas hasta ahora, sin el prefijo del API. */
  function urlsPedidas(): string[] {
    return http
      .match(() => true)
      .map((r) => r.request.urlWithParams.replace(`${api}/reports/`, ''));
  }

  it('pide los seis informes del rango al arrancar', () => {
    const urls = urlsPedidas();
    const recursos = urls.map((u) => u.split('?')[0]).sort();

    expect(recursos).toEqual([
      'cashiers',
      'categories',
      'inventory',
      'profitability',
      'sales',
      'top-products',
    ]);
  });

  it('acota por fecha todos los informes menos el de inventario', () => {
    const urls = urlsPedidas();
    const hoy = businessToday(TEST_TIMEZONE);

    for (const url of urls) {
      if (url.startsWith('inventory')) {
        // El stock no depende del período: su clave de query tampoco.
        expect(url).not.toContain('date_from');
      } else {
        expect(url).toContain(`date_from=${hoy}`);
        expect(url).toContain(`date_to=${hoy}`);
      }
    }
  });

  it('pide el desglose por día salvo en el año, que lo pide por mes', () => {
    expect(service.groupBy()).toBe('day');
    expect(urlsPedidas().find((u) => u.startsWith('sales'))).toContain('group_by=day');

    service.setPeriod('year');
    TestBed.tick();

    expect(service.groupBy()).toBe('month');
    // Un año por día son 365 puntos: la gráfica necesita 12.
    expect(urlsPedidas().find((u) => u.startsWith('sales'))).toContain('group_by=month');
  });

  it('el rango del año va del 1 de enero al 31 de diciembre', () => {
    service.setPeriod('year');
    const año = Number(businessToday(TEST_TIMEZONE).split('-')[0]);

    expect(service.range()).toEqual({ from: `${año}-01-01`, to: `${año}-12-31` });
  });

  it('convierte a número los decimales que llegan como string', async () => {
    http.expectOne((r) => r.url === `${api}/reports/sales`).flush({
      total_sales: '4780.50',
      ticket_count: 156,
      avg_ticket: '30.64',
      by_day: [{ day: '2026-08-04', total: '320.00', count: 11 }],
    });
    http.expectOne((r) => r.url === `${api}/reports/top-products`).flush([
      { product_variant_id: 'v1', description: 'Cono', units: 84, revenue: '420.00' },
    ]);
    await asentar();

    expect(service.salesSummary()).toEqual({
      total: 4780.5,
      count: 156,
      average: 30.64,
      cashTotal: 0,
      cardTotal: 0,
    });
    expect(service.dailySales()).toEqual([{ date: '2026-08-04', count: 11, total: 320 }]);
    expect(service.topProducts()).toEqual([{ name: 'Cono', totalQty: 84, totalRevenue: 420 }]);
  });

  it('solo lista los insumos por debajo del mínimo', async () => {
    http.expectOne((r) => r.url === `${api}/reports/inventory`).flush([
      {
        inventory_item_id: 'i1', name: 'Leche', current_stock: '2', min_stock: '10',
        unit_cost: '1', stock_value: '2', below_min: true,
      },
      {
        inventory_item_id: 'i2', name: 'Azúcar', current_stock: '50', min_stock: '10',
        unit_cost: '1', stock_value: '50', below_min: false,
      },
    ]);
    await asentar();

    expect(service.lowStockIngredients().map((i) => i.name)).toEqual(['Leche']);
    expect(service.lowStockIngredients()[0].current_stock).toBe(2);
  });
});

/**
 * Spec 062 (FR-006/FR-007, research.md Decisión 4): sin el módulo Inventario
 * (o con el tenant vencido), `/reports/inventory` y `/reports/profitability`
 * no deben pedirse — y el resto de la pantalla (isLoading/error) no debe
 * quedar contaminado por esas dos queries deshabilitadas. Describe aparte
 * (TestBed propio, mismo patrón que el segundo describe de
 * sidebar.component.spec.ts) para controlar `PlanSummaryService.summary()`
 * desde antes de que `ReportsService` se construya — así el `enabled:`
 * inicial de las queries ya nace en el valor correcto, sin depender del
 * orden de los `beforeEach` anidados.
 */
describe('ReportsService — gating de inventario/profitability (spec 062)', () => {
  let http: HttpTestingController;

  function crearServicio(summary: PlanSummary | null): ReportsService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        ReportsService,
        { provide: PlanSummaryService, useValue: { summary: signal(summary) } },
      ],
    });
    const tenantInfo = TestBed.inject(TenantInfoService);
    tenantInfo.info.set({
      id: 1,
      name: 'Heladería de prueba',
      host: 'prueba.skeilopos.com',
      logo_url: null,
      receipt_message: null,
      timezone: TEST_TIMEZONE,
    });
    const service = TestBed.inject(ReportsService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    return service;
  }

  afterEach(() => {
    http.match(() => true);
    http.verify();
  });

  function recursosPedidos(): string[] {
    return http
      .match(() => true)
      .map((r) => r.request.urlWithParams.replace(`${api}/reports/`, '').split('?')[0]);
  }

  it('no pide /reports/inventory ni /reports/profitability cuando el plan no incluye Inventario', () => {
    crearServicio(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));

    const recursos = recursosPedidos();
    expect(recursos).not.toContain('inventory');
    expect(recursos).not.toContain('profitability');
    // El resto de informes no depende de Inventario — siguen pidiéndose.
    expect(recursos.sort()).toEqual(['cashiers', 'categories', 'sales', 'top-products']);
  });

  it('no pide inventory/profitability mientras el resumen del plan no ha cargado (fail-closed)', () => {
    crearServicio(null);

    const recursos = recursosPedidos();
    expect(recursos).not.toContain('inventory');
    expect(recursos).not.toContain('profitability');
  });

  it('no pide inventory/profitability cuando el tenant está vencido, aunque el plan los incluya', () => {
    crearServicio(
      makeSummary({ vencido: true, modules: { inventario: true, compras: true, promociones: true } }),
    );

    const recursos = recursosPedidos();
    expect(recursos).not.toContain('inventory');
    expect(recursos).not.toContain('profitability');
  });

  it('isLoading() e error() no dependen de inventory/profitability cuando están excluidas', async () => {
    const service = crearServicio(
      makeSummary({ modules: { inventario: false, compras: true, promociones: true } }),
    );

    // Sin resolver la promesa de ninguna query real, isLoading() debe poder
    // llegar a false apenas las cuatro queries restantes respondan — si
    // inventory/profitability siguieran en el agregado pese a estar
    // deshabilitadas, quedarían `isPending()` para siempre y esto no pasaría
    // nunca (la regresión que esta spec existe para prevenir).
    for (const recurso of ['sales', 'top-products', 'categories', 'cashiers']) {
      const req = http.expectOne((r) => r.url === `${api}/reports/${recurso}`);
      req.flush(recurso === 'sales'
        ? { total_sales: '0', ticket_count: 0, avg_ticket: '0', by_day: [] }
        : []);
    }
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();

    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('sí pide inventory/profitability cuando el plan incluye Inventario y el tenant no está vencido', () => {
    crearServicio(makeSummary({}));

    const recursos = recursosPedidos();
    expect(recursos).toContain('inventory');
    expect(recursos).toContain('profitability');
  });
});

// spec 138 (FR-009): la «fecha específica» por defecto es el «hoy» del NEGOCIO, no el del navegador.
describe('ReportsService — fecha específica por defecto en la zona del negocio (spec 138)', () => {
  let http: HttpTestingController;

  afterEach(() => {
    vi.useRealTimers();
    // Se usa la referencia capturada al armar el módulo: llamar `TestBed.inject` aquí podría instanciar un módulo NUEVO
    // si el reinicio global de TestBed ya corrió, y dejarlo instanciado para el siguiente archivo del mismo worker.
    http?.match(() => true);
  });

  function servicio(timezone: string | null): ReportsService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        ReportsService,
        { provide: PlanSummaryService, useValue: { summary: signal<PlanSummary | null>(makeSummary({})) } },
      ],
    });
    if (timezone) {
      TestBed.inject(TenantInfoService).info.set({
        id: 1, name: 'Heladería', host: 'h.skeilopos.com', logo_url: null, receipt_message: null, timezone,
      });
    }
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(ReportsService);
  }

  // 2026-10-26T01:00Z = 20:00 del 25/10 en Bogotá · 19:00 del 25/10 en México · 02:00 del 26/10 en Madrid
  function conRelojEn(instante: string): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(instante));
  }

  it('Bogotá a las 20:00: el día es el 25, no el 26 (UTC)', () => {
    conRelojEn('2026-10-26T01:00:00Z');
    expect(servicio('America/Bogota').selectedDate()).toBe('2026-10-25');
  });

  it('Ciudad de México: 25/10', () => {
    conRelojEn('2026-10-26T01:00:00Z');
    expect(servicio('America/Mexico_City').selectedDate()).toBe('2026-10-25');
  });

  it('Madrid a las 02:00 locales: ya es el 26/10', () => {
    conRelojEn('2026-10-26T01:00:00Z');
    expect(servicio('Europe/Madrid').selectedDate()).toBe('2026-10-26');
  });

  it('si la información del negocio llega DESPUÉS de crear el servicio, la fecha se corrige sola', () => {
    conRelojEn('2026-10-26T01:00:00Z');
    const service = servicio(null); // aún con la zona de respaldo (Bogotá)
    expect(service.selectedDate()).toBe('2026-10-25');
    TestBed.inject(TenantInfoService).info.set({
      id: 1, name: 'Heladería', host: 'h.skeilopos.com', logo_url: null, receipt_message: null, timezone: 'Europe/Madrid',
    });
    expect(service.selectedDate()).toBe('2026-10-26');
  });

  it('la fecha que el usuario elige gana al «hoy» por defecto', () => {
    conRelojEn('2026-10-26T01:00:00Z');
    const service = servicio('Asia/Tokyo');
    service.setSelectedDate('2026-08-24');
    expect(service.selectedDate()).toBe('2026-08-24');
  });
});

