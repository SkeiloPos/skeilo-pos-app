import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * La tarjeta que envuelve a cada gráfica: título, icono, ranura de acciones y
 * los tres estados —cargando, error, vacío— que antes cada sección de Informes
 * repetía a mano con su propio marcado.
 *
 * El contenido se proyecta, así que sirve igual para una gráfica que para una
 * tabla o una lista.
 */
@Component({
  selector: 'app-chart-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El host es una etiqueta sin significado para el navegador -- sin esto cae
  // al `display: inline` por defecto del user-agent, y el `margin-top` de
  // `space-y-*` entre dos `<app-chart-card>` seguidos (p. ej. "Estadísticas
  // de ventas" + "Ingresos por método de pago") no tiene ningún efecto: los
  // márgenes verticales se ignoran en elementos inline.
  host: { class: 'block' },
  template: `
    <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
      <div class="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div class="min-w-0">
          <h2 class="text-base font-bold text-gray-900 flex items-center gap-2">
            <ng-content select="[card-icon]" />
            {{ title }}
          </h2>
          @if (subtitle) {
            <p class="text-xs text-gray-400 mt-0.5">{{ subtitle }}</p>
          }
        </div>
        <ng-content select="[card-actions]" />
      </div>

      @if (loading) {
        <!-- Esqueleto del alto real, para que la tarjeta no salte al llegar los datos. -->
        <div class="animate-pulse space-y-3" [style.min-height.px]="height">
          <div class="h-full w-full bg-gray-100 rounded-xl" [style.height.px]="height"></div>
        </div>
      } @else if (error) {
        <div
          class="flex items-center justify-center text-center text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4"
          [style.min-height.px]="height"
        >
          {{ error }}
        </div>
      } @else if (empty) {
        <div
          class="flex flex-col items-center justify-center text-center gap-1"
          [style.min-height.px]="height"
        >
          <p class="text-sm text-gray-500">{{ emptyText }}</p>
          @if (emptyHint) {
            <p class="text-xs text-gray-400">{{ emptyHint }}</p>
          }
        </div>
      } @else {
        <ng-content />
      }
    </section>
  `,
})
export class ChartCardComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() empty = false;
  @Input() emptyText = 'Sin datos en este período';
  @Input() emptyHint = '';
  /** Alto reservado, para que esqueleto y estados vacíos midan lo mismo que la gráfica. */
  @Input() height = 220;
}
