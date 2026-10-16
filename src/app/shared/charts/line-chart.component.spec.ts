import { TestBed } from '@angular/core/testing';
import { LineChartComponent } from './line-chart.component';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';
import { axisColors } from './chart-theme';

/**
 * spec 122 (FR-004 revisado de barras a línea): mismo contrato de tema que
 * `BarsChartComponent` (research.md R19) -- un `<canvas>` no tiene cascada
 * CSS, así que esto no se puede verificar solo con estilos.
 */
describe('LineChartComponent — tema de la gráfica (spec 122)', () => {
  function crear() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [LineChartComponent] });
    const fixture = TestBed.createComponent(LineChartComponent);
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

  it('dibuja una sola serie con los valores y etiquetas recibidos', () => {
    const fixture = crear();
    const data = fixture.componentInstance.data();
    expect(data.labels).toEqual(['Lun', 'Mar']);
    expect(data.datasets.length).toBe(1);
    expect(data.datasets[0].data).toEqual([10, 20]);
  });
});
