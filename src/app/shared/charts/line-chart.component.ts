import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ChartConfiguration, ChartOptions, TooltipItem } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { PRIMARY_SERIES, ValueKind, axisColors, formatValue } from './chart-theme';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';

/**
 * Línea de una sola serie: evolución en el tiempo (spec 122, FR-004 revisado
 * de barras a línea a pedido del negocio). Relleno suave bajo la línea para
 * que el área ocupada por la serie se perciba de un vistazo. Sin leyenda a
 * propósito, igual que `BarsChartComponent`: con una serie, el título de la
 * tarjeta ya la nombra.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  template: `
    <div [style.height.px]="height">
      <canvas baseChart type="line" [data]="data()" [options]="options()"></canvas>
    </div>
  `,
})
export class LineChartComponent {
  @Input({ required: true }) set labels(value: string[]) {
    this.labelsSig.set(value ?? []);
  }
  @Input({ required: true }) set values(value: number[]) {
    this.valuesSig.set(value ?? []);
  }
  @Input() set kind(value: ValueKind) {
    this.kindSig.set(value);
  }
  @Input() height = 220;

  private readonly panelThemeService = inject(PanelThemeService);

  private readonly labelsSig = signal<string[]>([]);
  private readonly valuesSig = signal<number[]>([]);
  private readonly kindSig = signal<ValueKind>('money');

  readonly data = computed<ChartConfiguration<'line'>['data']>(() => ({
    labels: this.labelsSig(),
    datasets: [
      {
        data: this.valuesSig(),
        borderColor: PRIMARY_SERIES,
        backgroundColor: `${PRIMARY_SERIES}1f`, // ~12% opacidad: relleno bajo la línea
        pointBackgroundColor: PRIMARY_SERIES,
        pointBorderColor: PRIMARY_SERIES,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
      },
    ],
  }));

  readonly options = computed<ChartOptions<'line'>>(() => {
    const { muted, grid, tooltipBg } = axisColors(this.panelThemeService.theme());
    const kind = this.kindSig();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          titleFont: { weight: 'bold' },
          callbacks: {
            label: (item: TooltipItem<'line'>) => formatValue(item.parsed.y ?? 0, kind),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: muted } },
        y: {
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted, maxTicksLimit: 5 },
        },
      },
    };
  });
}
