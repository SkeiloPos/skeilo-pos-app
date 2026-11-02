import { Injectable, inject, signal } from '@angular/core';
import { RealtimeService } from '../realtime/realtime.service';
import { AvailabilityChange, AvailabilitySnapshot } from './availability.model';
import { availabilityKey, shouldApply } from './availability.util';

/** Pestaña oculta más de esto fuerza una reconciliación al volver a ser
 *  visible, aunque el stream nunca se haya caído (research.md D12): un
 *  `EventSource` en segundo plano puede quedar suspendido sin aviso. */
const HIDDEN_RECONCILE_MS = 10_000;

/** Backoff de reintento de `reconcile()` cuando la consulta falla: 1s, 2s,
 *  4s… tope 30s, mientras el servicio siga arrancado. */
const RETRY_BACKOFF_START_MS = 1_000;
const RETRY_BACKOFF_MAX_MS = 30_000;

/** Un destino que sabe aplicar cambios/snapshots de disponibilidad sobre su
 *  propia copia del menú (p. ej. `MenuService`, `DiningCartService`). */
export interface AvailabilityTarget {
  applyAvailability(changes: readonly AvailabilityChange[]): void;
  applyAvailabilitySnapshot(snapshot: AvailabilitySnapshot): void;
}

/**
 * Único punto de suscripción a `availability.changed` (research.md D10).
 *
 * No parcha nada por su cuenta: delega a cada `AvailabilityTarget` registrado
 * (Staff: `MenuService`; Comensal: `DiningCartService`), aplicando la guardia
 * de orden (`v`/`as_of`, D9) antes de entregar.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilitySyncService {
  private readonly realtime = inject(RealtimeService);

  private readonly targets = new Set<AvailabilityTarget>();
  private readonly lastV = new Map<string, number>();
  private snapshotAsOf: number | null = null;

  private fetchSnapshot: (() => Promise<AvailabilitySnapshot>) | null = null;
  private unsubscribers: Array<() => void> = [];
  private inFlight: Promise<boolean> | null = null;
  private hiddenAt: number | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs = RETRY_BACKOFF_START_MS;
  private visibilityHandler: (() => void) | null = null;

  readonly resyncPending = signal(false);

  registerTarget(target: AvailabilityTarget): () => void {
    this.targets.add(target);
    return () => this.targets.delete(target);
  }

  start(fetchSnapshot: () => Promise<AvailabilitySnapshot>): void {
    if (this.fetchSnapshot) return; // idempotente: ya arrancado
    this.fetchSnapshot = fetchSnapshot;

    const offChanged = this.realtime.on('availability.changed', (ev) => {
      if (ev.refresh) {
        this.resyncPending.set(true);
        void this.reconcile();
        return;
      }
      this.applyWithGuard(ev.v, ev.changes);
    });
    const offReconnected = this.realtime.on('reconnected', () => {
      this.resyncPending.set(true);
      void this.reconcile();
    });
    const offResync = this.realtime.on('resync', () => {
      this.resyncPending.set(true);
      void this.reconcile();
    });
    this.unsubscribers.push(offChanged, offReconnected, offResync);

    this.visibilityHandler = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        return;
      }
      // visible
      const hiddenMs = this.hiddenAt == null ? 0 : Date.now() - this.hiddenAt;
      this.hiddenAt = null;
      if (hiddenMs > HIDDEN_RECONCILE_MS || this.realtime.status() !== 'open') {
        this.resyncPending.set(true);
        void this.reconcile();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  stop(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    this.visibilityHandler = null;
    this.hiddenAt = null;
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryDelayMs = RETRY_BACKOFF_START_MS;
    this.fetchSnapshot = null;
    this.lastV.clear();
    this.snapshotAsOf = null;
    this.inFlight = null;
    this.resyncPending.set(false);
  }

  /** Aplica sin guardia de orden a todos los destinos (lo usa el 409, US3). */
  applyLocal(changes: readonly AvailabilityChange[]): void {
    for (const target of this.targets) {
      target.applyAvailability(changes);
    }
  }

  async reconcile(): Promise<boolean> {
    if (!this.fetchSnapshot) return false;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.doReconcile(this.fetchSnapshot);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async doReconcile(fetchSnapshot: () => Promise<AvailabilitySnapshot>): Promise<boolean> {
    this.resyncPending.set(true);
    try {
      const snapshot = await fetchSnapshot();
      this.snapshotAsOf = snapshot.as_of;
      this.lastV.clear();
      for (const target of this.targets) {
        target.applyAvailabilitySnapshot(snapshot);
      }
      this.resyncPending.set(false);
      this.retryDelayMs = RETRY_BACKOFF_START_MS;
      if (this.retryTimer != null) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      return true;
    } catch {
      this.scheduleRetry();
      return false;
    }
  }

  /** Reintenta `reconcile()` con backoff (1s, 2s, 4s… tope 30s) mientras el
   *  servicio siga arrancado (`stop()` cancela el temporizador). */
  private scheduleRetry(): void {
    if (!this.fetchSnapshot) return; // se detuvo entretanto
    if (this.retryTimer != null) return; // ya hay un reintento pendiente
    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, RETRY_BACKOFF_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.fetchSnapshot) return;
      void this.reconcile();
    }, delay);
  }

  /** Filtra `changes` por la guardia v/as_of (D9), actualiza `lastV` por los
   *  que sí se aplican, y entrega solo esos a cada destino registrado. */
  private applyWithGuard(v: number, changes: readonly AvailabilityChange[]): void {
    const toApply: AvailabilityChange[] = [];
    for (const c of changes) {
      const key = availabilityKey(c.kind, c.id);
      if (shouldApply(key, v, this.lastV, this.snapshotAsOf)) {
        this.lastV.set(key, v);
        toApply.push(c);
      }
    }
    if (toApply.length === 0) return;
    for (const target of this.targets) {
      target.applyAvailability(toApply);
    }
  }
}
