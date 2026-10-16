import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ChartConfiguration, ChartOptions, TooltipItem } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { axisColors, formatValue } from '../../../shared/charts/chart-theme';
import { PanelThemeService } from '../layout/panel-theme.service';

export interface PaymentMethodSeries {
  name: string;
  /** Fijo por método, asignado por quien arma las series (`seriesColor` sobre
   *  el orden de aparición en el reporte, no el índice del arreglo filtrado
   *  que llega aquí) -- así un método conserva su color aunque se desactiven
   *  otros y la lista visible cambie de orden/posición (consistencia con los
   *  chips y las tarjetas de total que lo muestran en `admin-dashboard.component.ts`). */
  color: string;
  /** Un valor por elemento de `labels` (spec 122, FR-007) — `0` donde el
   *  backend no mandó fila para ese bucket/método (sin rellenar con montos
   *  inventados: el cero aquí es puramente de presentación del hueco). */
  values: number[];
}

/**
 * Barras agrupadas multiserie: ingresos por método de pago, un grupo por
 * intervalo de tiempo (hora/día/semana) y una barra por método dentro de cada
 * grupo (spec 122, FR-007) — a diferencia de `app-share-bar-chart` (apilada al
 * 100%, parte-de-un-todo), aquí interesa comparar métodos entre sí a lo largo
 * del tiempo, no su participación en un total.
 */
@Component({
  selector: 'app-payment-methods-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  template: `
    <div [style.height.px]="height">
      <canvas baseChart type="bar" [data]="data()" [options]="options()"></canvas>
    </div>
  `,
})
export class PaymentMethodsChartComponent {
  @Input({ required: true }) set labels(value: string[]) {
    this.labelsSig.set(value ?? []);
  }
  @Input({ required: true }) set series(value: PaymentMethodSeries[]) {
    this.seriesSig.set(value ?? []);
  }
  @Input() height = 220;

  private readonly panelThemeService = inject(PanelThemeService);

  private readonly labelsSig = signal<string[]>([]);
  private readonly seriesSig = signal<PaymentMethodSeries[]>([]);

  readonly data = computed<ChartConfiguration<'bar'>['data']>(() => ({
    labels: this.labelsSig(),
    datasets: this.seriesSig().map((s) => ({
      label: s.name,
      data: s.values,
      backgroundColor: s.color,
      hoverBackgroundColor: s.color,
      borderRadius: 3,
      borderSkipped: 'bottom',
      maxBarThickness: 18,
    })),
  }));

  readonly options = computed<ChartOptions<'bar'>>(() => {
    const { muted, grid, tooltipBg } = axisColors(this.panelThemeService.theme());
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items: TooltipItem<'bar'>[]) => items[0]?.dataset.label ?? '',
            label: (item: TooltipItem<'bar'>) => `${item.label}: ${formatValue(Number(item.parsed.y ?? 0), 'money')}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: muted } },
        y: {
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted, maxTicksLimit: 5, callback: (v) => formatValue(Number(v), 'money') },
        },
      },
    };
  });
}
