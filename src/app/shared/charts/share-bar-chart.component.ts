import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ValueKind, axisColors, formatValue, seriesColor } from './chart-theme';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';

export interface ShareItem {
  label: string;
  value: number;
}

/**
 * Barra apilada al 100 %: parte-de-un-todo (ventas por categoría). Apilada
 * horizontal en vez de tarta porque los nombres de categoría son largos y
 * comparar ángulos es peor que comparar longitudes.
 *
 * Es la única gráfica multiserie de Informes, así que lleva **leyenda con
 * etiqueta directa** debajo: el color nunca es el único canal de identidad.
 * El orden de color es fijo y no se cicla — a partir del sexto, todo cae en
 * «Otros» (`seriesColor` devuelve gris), sin inventar tonos nuevos.
 */
@Component({
  selector: 'app-share-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  template: `
    <div class="h-16">
      <canvas baseChart type="bar" [data]="data()" [options]="options()"></canvas>
    </div>

    <ul class="flex flex-wrap gap-x-5 gap-y-2 mt-4">
      @for (row of rows(); track row.label) {
        <li class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-sm flex-none" [style.background]="row.color"></span>
          <span class="text-sm text-gray-700 truncate">{{ row.label }}</span>
          <span class="text-sm font-bold text-gray-900 whitespace-nowrap">{{ row.share }}%</span>
          <span class="text-xs text-gray-400 whitespace-nowrap">({{ row.amount }})</span>
        </li>
      }
    </ul>
  `,
})
export class ShareBarChartComponent {
  @Input({ required: true }) set items(value: ShareItem[]) {
    this.itemsSig.set(value ?? []);
  }
  @Input() set kind(value: ValueKind) {
    this.kindSig.set(value);
  }

  private readonly panelThemeService = inject(PanelThemeService);

  private readonly itemsSig = signal<ShareItem[]>([]);
  private readonly kindSig = signal<ValueKind>('money');

  private readonly total = computed(() =>
    this.itemsSig().reduce((sum, i) => sum + i.value, 0),
  );

  readonly rows = computed(() => {
    const total = this.total();
    return this.itemsSig().map((item, i) => ({
      label: item.label,
      color: seriesColor(i),
      share: total > 0 ? Math.round((item.value / total) * 100) : 0,
      amount: formatValue(item.value, this.kindSig()),
    }));
  });

  readonly data = computed<ChartConfiguration<'bar'>['data']>(() => {
    const { segmentBorder } = axisColors(this.panelThemeService.theme());
    return {
      labels: [''],
      // Un dataset por categoría: cada uno con su color y su entrada de tooltip.
      datasets: this.itemsSig().map((item, i) => ({
        label: item.label,
        data: [item.value],
        backgroundColor: seriesColor(i),
        hoverBackgroundColor: seriesColor(i),
        // 2 px de hueco entre segmentos contiguos, en el color de la
        // superficie real tras la gráfica (app-chart-card) -- blanco en
        // claro, tarjeta oscura en oscuro (research.md R19).
        borderColor: segmentBorder,
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      })),
    };
  });

  readonly options = computed<ChartOptions<'bar'>>(() => {
    const kind = this.kindSig();
    const total = this.total();
    const { tooltipBg } = axisColors(this.panelThemeService.theme());
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => items[0]?.dataset.label ?? '',
            label: (item) => {
              const value = Number(item.parsed.x ?? 0);
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${formatValue(value, kind)} · ${pct}%`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, display: false, grid: { display: false } },
        y: { stacked: true, display: false, grid: { display: false } },
      },
    };
  });
}
