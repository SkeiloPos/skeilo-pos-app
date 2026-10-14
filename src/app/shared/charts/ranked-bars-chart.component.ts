import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { PRIMARY_SERIES, ValueKind, axisColors, formatValue } from './chart-theme';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';

/**
 * Barras horizontales ordenadas: un ranking de magnitud (productos más
 * vendidos, ventas por cajero). Horizontal porque los nombres de producto son
 * largos y en vertical se cortan o se giran.
 *
 * El alto se calcula por fila en vez de fijarse: con tres cajeros no sobra
 * media tarjeta vacía, y con diez productos no se aplastan las barras.
 */
@Component({
  selector: 'app-ranked-bars-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  template: `
    <div [style.height.px]="chartHeight()">
      <canvas baseChart type="bar" [data]="data()" [options]="options()"></canvas>
    </div>
  `,
})
export class RankedBarsChartComponent {
  @Input({ required: true }) set labels(value: string[]) {
    this.labelsSig.set(value ?? []);
  }
  @Input({ required: true }) set values(value: number[]) {
    this.valuesSig.set(value ?? []);
  }
  @Input() set kind(value: ValueKind) {
    this.kindSig.set(value);
  }
  /** Alto por fila, incluido el hueco entre barras. */
  @Input() rowHeight = 34;
  @Input() minHeight = 120;

  private readonly panelThemeService = inject(PanelThemeService);

  private readonly labelsSig = signal<string[]>([]);
  private readonly valuesSig = signal<number[]>([]);
  private readonly kindSig = signal<ValueKind>('units');

  readonly chartHeight = computed(() =>
    Math.max(this.minHeight, this.labelsSig().length * this.rowHeight + 16),
  );

  readonly data = computed<ChartConfiguration<'bar'>['data']>(() => ({
    labels: this.labelsSig(),
    datasets: [
      {
        data: this.valuesSig(),
        backgroundColor: PRIMARY_SERIES,
        hoverBackgroundColor: PRIMARY_SERIES,
        borderRadius: 4,
        // Ancla la barra al eje: solo se redondea el extremo del dato.
        borderSkipped: 'start',
        maxBarThickness: 22,
      },
    ],
  }));

  readonly options = computed<ChartOptions<'bar'>>(() => {
    const kind = this.kindSig();
    const { muted, tooltipBg } = axisColors(this.panelThemeService.theme());
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 12 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: { label: (item) => formatValue(Number(item.parsed.x ?? 0), kind) },
        },
      },
      scales: {
        x: { display: false, grid: { display: false } },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: muted, crossAlign: 'far', autoSkip: false },
        },
      },
    };
  });
}
