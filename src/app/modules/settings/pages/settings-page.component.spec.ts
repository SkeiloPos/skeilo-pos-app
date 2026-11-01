import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SettingsPageComponent } from './settings-page.component';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';

function makeSummary(partial: Partial<PlanSummary>): PlanSummary {
  return {
    plan_name: 'Pro',
    ciclo_facturacion: 'mensual',
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, promociones: true },
    ...partial,
  };
}

describe('SettingsPageComponent.visibleTabs', () => {
  const planSummary = signal<PlanSummary | null>(null);

  function createComponent(): SettingsPageComponent {
    TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [
        provideRouter([]),
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
      ],
    });
    return TestBed.createComponent(SettingsPageComponent).componentInstance;
  }

  beforeEach(() => {
    planSummary.set(null);
  });

  it('hides "Unidades de medida" when the plan does not include Inventario', () => {
    planSummary.set(makeSummary({ modules: { inventario: false, promociones: true } }));
    const settings = createComponent();

    const paths = settings.visibleTabs().map((t) => t.path);
    expect(paths).not.toContain('unidades');
    expect(paths).toContain('informacion');
  });

  it('shows "Unidades de medida" when the plan includes Inventario', () => {
    planSummary.set(makeSummary({ modules: { inventario: true, promociones: true } }));
    const settings = createComponent();

    expect(settings.visibleTabs().map((t) => t.path)).toContain('unidades');
  });

  it('fails open (keeps the tab visible) while the plan summary has not loaded yet', () => {
    planSummary.set(null);
    const settings = createComponent();

    expect(settings.visibleTabs().map((t) => t.path)).toContain('unidades');
  });

  it('hides "Unidades de medida" when the tenant is vencido, regardless of module flags', () => {
    planSummary.set(makeSummary({ vencido: true, modules: { inventario: true, promociones: true } }));
    const settings = createComponent();

    expect(settings.visibleTabs().map((t) => t.path)).not.toContain('unidades');
  });
});
