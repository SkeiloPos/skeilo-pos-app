import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ReportsPageComponent } from './reports-page.component';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';

function makeSummary(partial: Partial<PlanSummary>): PlanSummary {
  return {
    plan_name: 'Pro',
    ciclo_facturacion: 'mensual',
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, promociones: true, cocina: false },
    ...partial,
  };
}

/**
 * Spec 030, Historia 5 (FR-006): el filtro "Fecha exacta" de Reportes es
 * string-a-string vía `(change)` sobre `input[type=date]` — nunca pasa por
 * un `new Date(string)` intermedio que pudiera correr el día por el offset
 * del navegador. Test de regresión preventivo (research.md Decisión 11).
 */
describe('ReportsPageComponent — filtro de fecha exacta (FR-006)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(() => true); // vacía las peticiones que el test no necesitó
    http.verify();
  });

  function changeEvent(value: string): Event {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = value;
    return { target: input } as unknown as Event;
  }

  it('la fecha elegida vuelve idéntica, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.onDateChange(changeEvent('2026-08-24'));

    expect(fixture.componentInstance.svc.selectedDate()).toBe('2026-08-24');
  });

  it('una fecha de fin/inicio de año conserva el valor exacto elegido', () => {
    const fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.onDateChange(changeEvent('2025-12-31'));
    expect(fixture.componentInstance.svc.selectedDate()).toBe('2025-12-31');

    fixture.componentInstance.onDateChange(changeEvent('2026-01-01'));
    expect(fixture.componentInstance.svc.selectedDate()).toBe('2026-01-01');
  });
});

/**
 * Spec 062 (FR-005): la sección "Insumos con stock bajo" depende enteramente
 * de datos de Inventario — no debe aparecer en el DOM cuando el plan del
 * tenant no incluye ese módulo (ni siquiera vacía o en estado de carga).
 */
describe('ReportsPageComponent — sección de insumos con stock bajo (spec 062, FR-005)', () => {
  let http: HttpTestingController;

  function crear(summary: PlanSummary | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: PlanSummaryService, useValue: { summary: signal(summary) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    http.match(() => true);
    http.verify();
  });

  it('no aparece cuando el plan no incluye Inventario', () => {
    const fixture = crear(makeSummary({ modules: { inventario: false, promociones: true, cocina: false } }));

    expect(fixture.nativeElement.textContent).not.toContain('Insumos con stock bajo');
  });

  it('aparece cuando el plan incluye Inventario', () => {
    const fixture = crear(makeSummary({}));

    expect(fixture.nativeElement.textContent).toContain('Insumos con stock bajo');
  });
});

/**
 * Spec 062 (FR-007): la tarjeta "Margen" depende enteramente del costo de
 * insumos de Inventario — no debe aparecer cuando el plan del tenant no
 * incluye ese módulo (research.md, Decisión de la spec: ocultar por completo
 * en vez de mostrar un valor calculado con costo cero).
 */
describe('ReportsPageComponent — tarjeta de Margen (spec 062, FR-007)', () => {
  let http: HttpTestingController;

  function crear(summary: PlanSummary | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: PlanSummaryService, useValue: { summary: signal(summary) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    http.match(() => true);
    http.verify();
  });

  it('no aparece cuando el plan no incluye Inventario', () => {
    const fixture = crear(makeSummary({ modules: { inventario: false, promociones: true, cocina: false } }));

    expect(fixture.nativeElement.textContent).not.toContain('Margen');
  });

  it('aparece y calcula con normalidad cuando el plan incluye Inventario', async () => {
    const fixture = crear(makeSummary({}));

    http.expectOne((r) => r.url.endsWith('/reports/profitability')).flush({
      revenue: '1000.00', cogs: '400.00', margin: '600.00', by_category: [],
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Margen');
  });
});

describe('ReportsPageComponent — íconos de las tarjetas (spec 082)', () => {
  let http: HttpTestingController;

  function crear() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: PlanSummaryService, useValue: { summary: signal(makeSummary({})) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    http.match(() => true);
    http.verify();
  });

  it('ninguna tarjeta muestra ya su ícono de cabecera como SVG artesanal', () => {
    const fixture = crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon[card-icon] .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(
      expect.arrayContaining(['calendar_month', 'emoji_events', 'person', 'sell', 'warning']),
    );
  });
});
