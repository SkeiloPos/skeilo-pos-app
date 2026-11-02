import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LiveStatusService } from './live-status.service';

/**
 * «Sin actualización en vivo» (FR-025 a FR-029): discreto, nunca bloquea ni
 * desplaza el contenido. Se puede seguir armando y enviando mientras está
 * visible (FR-029) — el bloqueo real lo da `hasAffectedLines`, no esto.
 *
 * Contrato: specs/148-disponibilidad-productos-tiempo-real/contracts/frontend-surfaces.md.
 */
@Component({
  selector: 'app-live-status-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (live.liveLost()) {
      <span
        role="status"
        aria-live="polite"
        class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
      >
        Sin actualización en vivo
      </span>
    }
  `,
})
export class LiveStatusIndicatorComponent {
  readonly live = inject(LiveStatusService);
}
