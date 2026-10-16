import { TestBed } from '@angular/core/testing';
import { PieChartComponent } from './pie-chart.component';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';
import { axisColors } from './chart-theme';

/**
 * spec 122 (FR-006 revisado de barra apilada a circular): mismo contrato de
 * tema y de leyenda que `ShareBarChartComponent` (research.md R19) -- el
 * hueco entre segmentos debe fundirse con la tarjeta real tras la gráfica.
 */
describe('PieChartComponent — tema de la gráfica y leyenda (spec 122)', () => {
  function crear() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PieChartComponent] });
    const fixture = TestBed.createComponent(PieChartComponent);
    fixture.componentRef.setInput('items', [
      { label: 'Helados', value: 70 },
      { label: 'Bebidas', value: 30 },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('el separador de segmentos cambia con el tema activo', () => {
    const fixture = crear();
    const panelTheme = TestBed.inject(PanelThemeService);

    panelTheme.setTheme('light');
    fixture.detectChanges();
    const lightDataset = fixture.componentInstance.data().datasets[0];
    expect(lightDataset.borderColor).toBe(axisColors('light').segmentBorder);

    panelTheme.toggleTheme();
    fixture.detectChanges();
    const darkDataset = fixture.componentInstance.data().datasets[0];
    expect(darkDataset.borderColor).toBe(axisColors('dark').segmentBorder);
    expect(darkDataset.borderColor).not.toBe(axisColors('light').segmentBorder);
  });

  it('calcula el porcentaje de cada fila de la leyenda contra el total', () => {
    const fixture = crear();
    const rows = fixture.componentInstance.rows();
    expect(rows.map((r) => r.label)).toEqual(['Helados', 'Bebidas']);
    expect(rows.map((r) => r.share)).toEqual([70, 30]);
  });
});
