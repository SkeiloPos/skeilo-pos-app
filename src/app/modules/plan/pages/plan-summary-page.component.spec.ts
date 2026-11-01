import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlanSummaryPageComponent } from './plan-summary-page.component';
import { PlanSummaryService } from '../services/plan-summary.service';
import { PlanSummary } from '../interfaces/plan-summary.interface';

function makeSummary(partial: Partial<PlanSummary> = {}): PlanSummary {
  return {
    plan_name: 'Básico',
    ciclo_facturacion: null,
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, promociones: false },
    ...partial,
  };
}

describe('PlanSummaryPageComponent — «Mi plan» con dos módulos (spec 141, US1.7, FR-019)', () => {
  function crear(summary: PlanSummary | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlanSummaryPageComponent],
      providers: [
        {
          provide: PlanSummaryService,
          useValue: {
            summary: signal(summary),
            loading: signal(false),
            error: signal<string | null>(null),
            load: vi.fn(async () => undefined),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlanSummaryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  function seccionDeModulos(fixture: ReturnType<typeof crear>): HTMLElement {
    const titulos = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2'));
    const titulo = titulos.find((h) => h.textContent?.trim() === 'Módulos');
    expect(titulo).toBeDefined();
    return titulo!.parentElement as HTMLElement;
  }

  it('lista exactamente 2 módulos, Inventario y Promociones, y ningún «Compras»', () => {
    const fixture = crear(makeSummary());
    const seccion = seccionDeModulos(fixture);

    const etiquetas = Array.from(seccion.querySelectorAll('dt')).map((dt) => dt.textContent?.trim());

    expect(etiquetas).toEqual(['Inventario', 'Promociones']);
    expect(seccion.textContent).not.toContain('Compras');
  });

  it('marca «Incluido» o «No incluido» según el plan', () => {
    const fixture = crear(makeSummary({ modules: { inventario: true, promociones: false } }));
    const seccion = seccionDeModulos(fixture);

    const estados = Array.from(seccion.querySelectorAll('dd')).map((dd) => dd.textContent?.trim());

    expect(estados).toEqual(['Incluido', 'No incluido']);
  });
});
