import { Injectable, effect, inject, signal } from '@angular/core';
import { RealtimeService } from '../realtime/realtime.service';
import { AvailabilitySyncService } from './availability-sync.service';

/** Un corte de conexión más corto que esto nunca enciende el indicador
 *  (FR-025/US5.6): evita el parpadeo de un microcorte. */
export const LIVE_LOST_DELAY_MS = 5_000;

/**
 * Observa `RealtimeService.status` y expone `liveLost` tras 5 s continuos
 * sin conexión abierta. Solo se apaga tras una reconciliación exitosa
 * (`AvailabilitySyncService.resyncPending() === false`), no con el simple
 * regreso a `open` — así el indicador no desaparece antes de que el catálogo
 * esté realmente al día (contracts/frontend-surfaces.md).
 */
@Injectable({ providedIn: 'root' })
export class LiveStatusService {
  private readonly realtime = inject(RealtimeService);
  private readonly sync = inject(AvailabilitySyncService);

  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly liveLost = signal(false);

  constructor() {
    effect(() => {
      const open = this.realtime.status() === 'open';
      if (!open) {
        this.startTimer();
        return;
      }
      this.cancelTimer();
      // Lee `resyncPending` dentro del mismo efecto para reevaluar cuando
      // la reconciliación termine, sin crear un segundo `effect()`.
      if (!this.sync.resyncPending()) {
        this.liveLost.set(false);
      }
    });
  }

  private startTimer(): void {
    if (this.timer != null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.liveLost.set(true);
    }, LIVE_LOST_DELAY_MS);
  }

  private cancelTimer(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
