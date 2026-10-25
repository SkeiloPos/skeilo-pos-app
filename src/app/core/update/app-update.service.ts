import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { RELOAD_PAGE } from '../reload-page';
import { UpdateGateService } from './update-gate.service';

/** Con una versión pendiente, cada cuánto se reintenta aplicarla si el momento no era seguro. */
const APPLY_TICK_MS = 15_000;
/** Mínimo entre dos `checkForUpdate()`: volver a primer plano varias veces seguidas no debe saturar. */
const MIN_BETWEEN_CHECKS_MS = 60_000;
/** El registro del Service Worker es `registerWhenStable:30000`; esperar más de 60 s a `ready` no tiene sentido. */
const SW_READY_TIMEOUT_MS = 60_000;
/** Guardián anti-bucle: tras una recarga automática no se vuelve a hacer otra en este plazo. */
const MIN_BETWEEN_AUTO_RELOADS_MS = 120_000;
const AUTO_RELOAD_KEY = 'pos.update.autoReloadAt';

/**
 * Lleva la versión nueva de la aplicación a las pestañas que llevan días abiertas
 * (spec 134, US4/FR-018 a FR-020): una terminal POS no navega, así que el Service
 * Worker nunca le sirve el `index.html` nuevo por sí solo.
 *
 * - Comprueba si hay versión nueva al arrancar (cuando el Service Worker está
 *   listo) y cada vez que la pestaña vuelve a primer plano, como mucho una vez por minuto.
 * - Una versión descargada (`VERSION_READY`) o un estado irrecuperable dejan una
 *   actualización **pendiente**.
 * - La aplica —`activateUpdate()` y recarga— **solo en un momento seguro**
 *   (`UpdateGateService`); si no lo es, reintenta cada 15 s y al volver a primer plano.
 * - Un guardián en `sessionStorage` impide recargar dos veces en menos de 2 min: un
 *   despliegue roto que siempre reporte "versión nueva" no puede dejar la pestaña en bucle.
 *
 * No hace nada si el Service Worker está deshabilitado (desarrollo) y nunca lanza.
 * Contrato: specs/134-bloqueo-traduccion-automatica/contracts/app-update.md.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly gate = inject(UpdateGateService);
  private readonly doc = inject(DOCUMENT);
  private readonly reloadPage = inject(RELOAD_PAGE);

  private started = false;
  private pending = false;
  private applying = false;
  private lastCheckAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly cleanups: Array<() => void> = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Se llama desde un inicializador de la app. Idempotente. */
  start(): void {
    if (this.started) return;
    this.started = true;

    const sw = this.sw;
    if (!sw?.isEnabled) return;

    const versiones = sw.versionUpdates.subscribe((evento) => {
      if (evento.type === 'VERSION_READY') this.markPending();
    });
    const irrecuperable = sw.unrecoverable.subscribe(() => this.markPending());
    this.cleanups.push(() => versiones.unsubscribe(), () => irrecuperable.unsubscribe());

    const alVolver = (): void => {
      if (this.doc.visibilityState !== 'visible') return;
      void this.check();
      void this.tryApply();
    };
    this.doc.addEventListener('visibilitychange', alVolver);
    this.cleanups.push(() => this.doc.removeEventListener('visibilitychange', alVolver));

    void this.checkWhenReady();
  }

  /**
   * "Recargar" del aviso de página alterada: la única recarga que pide una persona.
   * Si hay una versión pendiente la activa primero, para que la recarga ya entre en
   * la versión nueva. Siempre termina recargando, aunque el Service Worker falle.
   */
  async reloadNow(): Promise<void> {
    if (this.pending && this.sw?.isEnabled) {
      try {
        await this.sw.activateUpdate();
      } catch (err) {
        console.warn('[app-update] No se pudo activar la versión nueva antes de recargar.', err);
      }
    }
    this.reloadPage();
  }

  private markPending(): void {
    this.pending = true;
    if (this.timer === null) {
      this.timer = setInterval(() => void this.tryApply(), APPLY_TICK_MS);
    }
  }

  private async checkWhenReady(): Promise<void> {
    const ready = this.doc.defaultView?.navigator?.serviceWorker?.ready;
    if (!ready) return;

    let aviso: ReturnType<typeof setTimeout> | undefined;
    const vencido = new Promise<boolean>((resolve) => {
      aviso = setTimeout(() => resolve(false), SW_READY_TIMEOUT_MS);
    });
    const listo = await Promise.race([ready.then(() => true, () => false), vencido]);
    clearTimeout(aviso);

    // Si no llegó a estar listo, la comprobación queda para el próximo regreso a primer plano.
    if (listo) await this.check();
  }

  private async check(): Promise<void> {
    const ahora = Date.now();
    if (ahora - this.lastCheckAt < MIN_BETWEEN_CHECKS_MS) return;
    this.lastCheckAt = ahora;
    try {
      await this.sw?.checkForUpdate();
    } catch (err) {
      console.warn('[app-update] No se pudo comprobar si hay una versión nueva.', err);
    }
  }

  private async tryApply(): Promise<void> {
    if (!this.pending || this.applying) return;
    if (!this.gate.isSafeMoment()) return;
    if (this.recentAutoReload()) return;

    this.applying = true;
    try {
      try {
        await this.sw?.activateUpdate();
      } catch (err) {
        console.warn('[app-update] No se pudo activar la versión nueva; se reintenta.', err);
        return;
      }
      // Mientras se activaba pudo empezar un envío o abrirse un modal: se vuelve a mirar.
      if (!this.gate.isSafeMoment()) return;

      this.markAutoReload();
      this.pending = false;
      this.reloadPage();
    } finally {
      this.applying = false;
    }
  }

  private recentAutoReload(): boolean {
    try {
      const marca = this.doc.defaultView?.sessionStorage.getItem(AUTO_RELOAD_KEY);
      if (marca === null || marca === undefined) return false;
      const desde = Number(marca);
      return Number.isFinite(desde) && Date.now() - desde < MIN_BETWEEN_AUTO_RELOADS_MS;
    } catch {
      return false; // sin almacenamiento = sin marca
    }
  }

  private markAutoReload(): void {
    try {
      this.doc.defaultView?.sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
    } catch {
      // sin almacenamiento no hay guardián, pero tampoco se impide la actualización
    }
  }

  private stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const limpiar of this.cleanups.splice(0)) limpiar();
    this.started = false;
  }
}
