import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { PRIMARY_SERIES, ValueKind, baseOptions } from './chart-theme';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';

/**
 * Barras verticales de **una sola serie**: evolución en el tiempo (ventas por
 * día o por mes). Sin leyenda a propósito — con una serie, el título de la
 * tarjeta ya la nombra.
 *
 * Las esquinas se redondean 4 px solo arriba (`borderSkipped: 'bottom'`), para
 * que la marca quede anclada a la línea base y no flote.
 */
@Component({
  selector: 'app-bars-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  template: `
    <div [style.height.px]="height">
      <canvas baseChart type="bar" [data]="data()" [options]="options()"></canvas>
    </div>
  `,
})
export class BarsChartComponent {
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

  readonly data = computed<ChartConfiguration<'bar'>['data']>(() => ({
    labels: this.labelsSig(),
    datasets: [
      {
        data: this.valuesSig(),
        backgroundColor: PRIMARY_SERIES,
        hoverBackgroundColor: PRIMARY_SERIES,
        borderRadius: 4,
        borderSkipped: 'bottom',
        maxBarThickness: 44,
      },
    ],
  }));

  readonly options = computed(() => baseOptions(this.kindSig(), this.panelThemeService.theme()));
}
