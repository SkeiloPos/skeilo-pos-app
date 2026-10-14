import { TestBed } from '@angular/core/testing';
import { BarsChartComponent } from './bars-chart.component';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';
import { axisColors } from './chart-theme';

/**
 * spec 116 (T053, T056; research.md R19): `options()` debe responder al tema
 * activo de `PanelThemeService` -- Chart.js pinta sobre un `<canvas>`, que no
 * tiene cascada CSS, así que esto no se puede verificar solo con estilos.
 */
describe('BarsChartComponent — tema de la gráfica (spec 116, research.md R19)', () => {
  function crear() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [BarsChartComponent] });
    const fixture = TestBed.createComponent(BarsChartComponent);
    fixture.componentRef.setInput('labels', ['Lun', 'Mar']);
    fixture.componentRef.setInput('values', [10, 20]);
    fixture.detectChanges();
    return fixture;
  }

  it('options() usa los colores de eje del tema activo y cambia al alternar el tema', () => {
    const fixture = crear();
    const panelTheme = TestBed.inject(PanelThemeService);

    panelTheme.setTheme('light');
    fixture.detectChanges();
    expect(fixture.componentInstance.options().scales?.['y']?.ticks?.color).toBe(
      axisColors('light').muted,
    );

    panelTheme.toggleTheme();
    fixture.detectChanges();
    expect(fixture.componentInstance.options().scales?.['y']?.ticks?.color).toBe(
      axisColors('dark').muted,
    );
  });
});
