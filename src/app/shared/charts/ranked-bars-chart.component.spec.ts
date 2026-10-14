import { TestBed } from '@angular/core/testing';
import { RankedBarsChartComponent } from './ranked-bars-chart.component';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';
import { axisColors } from './chart-theme';

/**
 * spec 116 (T054, T056; research.md R19): a diferencia de `BarsChartComponent`,
 * este componente arma su propio `options()` a mano (no llama a `baseOptions`),
 * así que el tooltip y los ticks del eje deben leer `axisColors(theme)`
 * directamente.
 */
describe('RankedBarsChartComponent — tema de la gráfica (spec 116, research.md R19)', () => {
  function crear() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [RankedBarsChartComponent] });
    const fixture = TestBed.createComponent(RankedBarsChartComponent);
    fixture.componentRef.setInput('labels', ['Cono', 'Malteada']);
    fixture.componentRef.setInput('values', [10, 20]);
    fixture.detectChanges();
    return fixture;
  }

  it('options() usa los ticks/tooltip del tema activo y cambia al alternar el tema', () => {
    const fixture = crear();
    const panelTheme = TestBed.inject(PanelThemeService);

    panelTheme.setTheme('light');
    fixture.detectChanges();
    const light = fixture.componentInstance.options();
    expect(light.scales?.['y']?.ticks?.color).toBe(axisColors('light').muted);
    expect((light.plugins?.tooltip as { backgroundColor?: string })?.backgroundColor).toBe(
      axisColors('light').tooltipBg,
    );

    panelTheme.toggleTheme();
    fixture.detectChanges();
    expect(fixture.componentInstance.options().scales?.['y']?.ticks?.color).toBe(
      axisColors('dark').muted,
    );
  });
});
