import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ValueKind, axisColors, formatValue, seriesColor } from './chart-theme';
import { PanelThemeService } from '../../modules/dashboard/layout/panel-theme.service';
import { ShareItem } from './share-bar-chart.component';

/**
 * Dona: parte-de-un-todo con forma circular (spec 122, FR-006 revisado de
 * barra apilada a circular a pedido del negocio -- research.md §5 había
 * documentado explícitamente la alternativa de área/línea para que el
 * negocio pudiera objetar la decisión de usar `ShareBarChartComponent`; esta
 * es esa objeción). Conserva la misma leyenda con color, nombre, % y monto
 * que ya tenía `ShareBarChartComponent`, para no perder esa lectura exacta
 * al cambiar solo la forma del gráfico. El orden de color es fijo y no se
 * cicla, igual que el resto de gráficas multiserie (`chart-theme.ts`).
 */
@Component({
  selector: 'app-pie-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  template: `
    <div class="h-48">
      <canvas baseChart type="doughnut" [data]="data()" [options]="options()"></canvas>
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
export class PieChartComponent {
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

  readonly data = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    const { segmentBorder } = axisColors(this.panelThemeService.theme());
    const items = this.itemsSig();
    return {
      labels: items.map((i) => i.label),
      datasets: [
        {
          data: items.map((i) => i.value),
          backgroundColor: items.map((_, i) => seriesColor(i)),
          hoverBackgroundColor: items.map((_, i) => seriesColor(i)),
          borderColor: segmentBorder,
          borderWidth: 2,
        },
      ],
    };
  });

  readonly options = computed<ChartOptions<'doughnut'>>(() => {
    const kind = this.kindSig();
    const total = this.total();
    const { tooltipBg } = axisColors(this.panelThemeService.theme());
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (item) => {
              const value = Number(item.parsed ?? 0);
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${item.label}: ${formatValue(value, kind)} · ${pct}%`;
            },
          },
        },
      },
    };
  });
}
