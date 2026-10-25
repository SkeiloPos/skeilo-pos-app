import { DestroyRef, DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { RELOAD_PAGE } from '../reload-page';
import { startVisibleInterval, VisibleInterval } from '../realtime/visible-interval';
import {
  Canary,
  IntegritySignalId,
  evaluateSignals,
  findCanaryText,
  isDomErrorSignal,
} from './integrity-signals';

/** Cada cuánto se revisa el documento con la pestaña visible. Peor caso de detección ≈ 1,5 s (SC-003: < 3 s). */
const POLL_MS = 1500;

/** Evaluaciones limpias consecutivas que hacen falta para dar por revertida una alteración (FR-010). */
const CLEAN_EVALUATIONS_TO_RECOVER = 2;

/**
 * Sabe si el navegador o una extensión alteró el contenido de la página
 * (traducción automática, sobre todo) y lo expone como una señal que consumen el
 * aviso, el bloqueo de acciones y el momento seguro de la actualización.
 *
 * Spec 134. La traducción deja la pantalla desfasada del estado real **sin ningún
 * error**: por eso la detección no depende de capturar excepciones sino de marcas
 * conocidas (S1–S4), de un canario estructural (S5) y, solo como complemento, de
 * un error de DOM atribuible (S6, latched). Contrato:
 * specs/134-bloqueo-traduccion-automatica/contracts/page-integrity.md.
 *
 * Nunca lanza y **nunca recarga por sí solo** (FR-017): recargar es siempre una
 * decisión de la persona, vía `reload()`.
 */
@Injectable({ providedIn: 'root' })
export class PageIntegrityService {
  private readonly doc = inject(DOCUMENT);
  private readonly reloadPage = inject(RELOAD_PAGE);

  private readonly status = signal<'intact' | 'altered'>('intact');
  private readonly reasonsState = signal<IntegritySignalId[]>([]);
  private readonly blockedState = signal<string | null>(null);

  /** `true` ⇔ la página está alterada: gobierna el aviso, el bloqueo y el momento seguro. */
  readonly altered = computed(() => this.status() === 'altered');
  /** Señales activas en la última evaluación (diagnóstico y pruebas; no se muestra). */
  readonly reasons = this.reasonsState.asReadonly();
  /** Etiqueta de la última acción rechazada por el bloqueo, para el aviso. */
  readonly blockedNotice = this.blockedState.asReadonly();

  private started = false;
  /** S6 no se auto-limpia: el DOM quedó inconsistente y solo recargar lo arregla. */
  private latched = false;
  private cleanStreak = 0;
  private canary: Canary | null = null;

  private htmlObserver: MutationObserver | null = null;
  private canaryObserver: MutationObserver | null = null;
  private poll: VisibleInterval | null = null;
  private pageshowTarget: Window | null = null;
  private readonly onPageshow = (): void => this.evaluate(true);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /**
   * Arranca la vigilancia y **evalúa de inmediato** (FR-007): una página que ya
   * llega traducida arranca como "alterada". Idempotente. Se llama desde un
   * inicializador de la app, antes del primer pintado.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    try {
      if (typeof MutationObserver !== 'undefined') {
        // Solo `<html>` y solo estos tres atributos, sin `subtree`: observar todo el
        // `body` de una app que repinta tablas y gráficos sin parar cuesta más que
        // el sondeo y no mejora la latencia exigida.
        this.htmlObserver = new MutationObserver(() => this.evaluate(false));
        this.htmlObserver.observe(this.doc.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'lang', 'translate'],
        });
      }
    } catch {
      // Sin observador solo funciona el sondeo; sigue siendo suficiente.
    }

    // Solo con la pestaña visible; al volver a primer plano evalúa de inmediato.
    this.poll = startVisibleInterval(() => this.evaluate(true), POLL_MS);

    this.pageshowTarget = this.doc.defaultView;
    this.pageshowTarget?.addEventListener('pageshow', this.onPageshow);

    this.evaluate(true);
  }

  /** Lo llama el banner al montarse con el elemento oculto que contiene el canario. */
  registerCanary(el: HTMLElement): void {
    try {
      const textNode = findCanaryText(el);
      // Sin el nodo de texto no hay nada que comparar: mejor sin S5 que inventar una alteración.
      if (!textNode) return;

      this.canaryObserver?.disconnect();
      this.canaryObserver = null;
      this.canary = { el, textNode };

      if (typeof MutationObserver !== 'undefined') {
        this.canaryObserver = new MutationObserver(() => this.evaluate(false));
        this.canaryObserver.observe(el, { childList: true, characterData: true, subtree: true });
      }
      this.evaluate(false);
    } catch {
      // Nunca lanza.
    }
  }

  /** Lo llama el `ErrorHandler`. Ignora todo lo que no sea un error de DOM atribuible (S6). */
  reportDomError(err: unknown): void {
    try {
      if (!isDomErrorSignal(err)) return;
      this.latched = true;
      this.evaluate(false);
    } catch {
      // Nunca lanza.
    }
  }

  /** Lo llama el interceptor al rechazar una acción protegida. */
  notifyBlocked(label: string): void {
    this.blockedState.set(label);
  }

  /** Botón "Recargar" del aviso. Nunca se invoca sin una acción de la persona (FR-017). */
  async reload(): Promise<void> {
    this.reloadPage();
  }

  /**
   * @param countsForRecovery `true` en el arranque, el sondeo, `visibilitychange` y
   * `pageshow`; `false` en los observadores. Un observador puede **subir** a
   * "alterada" al instante, pero no adelantar la vuelta a "íntegra": si no, las dos
   * evaluaciones limpias consecutivas caerían en el mismo milisegundo y la
   * histéresis (FR-010) no serviría de nada.
   */
  private evaluate(countsForRecovery: boolean): void {
    let activas: IntegritySignalId[];
    try {
      activas = evaluateSignals(this.doc, this.canary);
    } catch {
      activas = [];
    }
    if (this.latched) activas = [...activas, 'dom-error'];
    this.setReasons(activas);

    if (activas.length > 0) {
      this.cleanStreak = 0;
      this.status.set('altered');
      return;
    }

    if (this.status() === 'intact' || !countsForRecovery) return;

    this.cleanStreak += 1;
    if (this.cleanStreak >= CLEAN_EVALUATIONS_TO_RECOVER) {
      this.cleanStreak = 0;
      this.status.set('intact');
      this.blockedState.set(null);
    }
  }

  private setReasons(next: IntegritySignalId[]): void {
    const actual = this.reasonsState();
    if (actual.length === next.length && actual.every((r, i) => r === next[i])) return;
    this.reasonsState.set(next);
  }

  private stop(): void {
    this.htmlObserver?.disconnect();
    this.canaryObserver?.disconnect();
    this.poll?.stop();
    this.pageshowTarget?.removeEventListener('pageshow', this.onPageshow);
    this.htmlObserver = this.canaryObserver = null;
    this.poll = null;
    this.pageshowTarget = null;
    this.started = false;
  }
}
