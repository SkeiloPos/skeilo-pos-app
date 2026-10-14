import { TestBed } from '@angular/core/testing';
import { ShareBarChartComponent } from './share-bar-chart.component';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';
import { axisColors } from './chart-theme';

/**
 * spec 116 (T055, T056; research.md R19/R17): el hueco de 2px entre segmentos
 * (`borderColor`) debe fundirse con la tarjeta real tras la gráfica en cada
 * tema -- blanco en claro, `--panel-color-surface-card` oscuro en oscuro
 * (un separador blanco fijo se vería como una línea brillante en oscuro).
 */
describe('ShareBarChartComponent — tema de la gráfica (spec 116, research.md R19)', () => {
  function crear() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ShareBarChartComponent] });
    const fixture = TestBed.createComponent(ShareBarChartComponent);
    fixture.componentRef.setInput('items', [
      { label: 'Helados', value: 70 },
      { label: 'Bebidas', value: 30 },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('el separador de segmentos y el tooltip cambian con el tema activo', () => {
    const fixture = crear();
    const panelTheme = TestBed.inject(PanelThemeService);

    panelTheme.setTheme('light');
    fixture.detectChanges();
    const lightDatasets = fixture.componentInstance.data().datasets;
    expect(lightDatasets[0]?.borderColor).toBe(axisColors('light').segmentBorder);

    panelTheme.toggleTheme();
    fixture.detectChanges();
    const darkDatasets = fixture.componentInstance.data().datasets;
    expect(darkDatasets[0]?.borderColor).toBe(axisColors('dark').segmentBorder);
    expect(darkDatasets[0]?.borderColor).not.toBe(axisColors('light').segmentBorder);
  });

  it('la paleta categórica (CHART_COLORS) no cambia con el tema (identifica datos, no superficie)', () => {
    const fixture = crear();
    const panelTheme = TestBed.inject(PanelThemeService);

    panelTheme.setTheme('light');
    fixture.detectChanges();
    const lightColors = fixture.componentInstance.data().datasets.map((d) => d.backgroundColor);

    panelTheme.toggleTheme();
    fixture.detectChanges();
    const darkColors = fixture.componentInstance.data().datasets.map((d) => d.backgroundColor);

    expect(darkColors).toEqual(lightColors);
  });
});
