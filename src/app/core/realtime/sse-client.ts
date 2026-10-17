import { RealtimeStatus } from './realtime-event.model';

/**
 * Envoltorio sobre `EventSource` con reconexión propia.
 *
 * El detalle que obliga a reimplementar la reconexión: **`EventSource` deja de
 * reintentar para siempre ante cualquier respuesta que no sea 2xx**, y su evento
 * `error` no expone el código de estado. Como el ticket del staff es de un solo
 * uso, el reintento automático del navegador reusaría un ticket ya consumido →
 * 401 → muerte permanente del stream. Hay que cerrar, pedir credencial nueva y
 * abrir otro `EventSource`.
 *
 * De ahí también que `last_event_id` viaje como query param: al reconectar a
 * mano no se puede poner la cabecera `Last-Event-ID` que el navegador enviaría
 * solo.
 */
export interface SseClientOptions {
  /** Se re-evalúa en **cada** intento: es lo que permite mintear ticket nuevo. */
  url: (lastEventId: string | null) => Promise<string>;
  onEvent: (type: string, data: unknown, id: string | null) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** Tope del backoff exponencial. */
  maxBackoffMs?: number;
  /** Inyectable para test. */
  factory?: (url: string) => EventSource;
}

const BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

/** Tipos que el servidor emite y que no son eventos de negocio. */
const CONTROL_TYPES = ['hello', 'resync'];

export class SseClient {
  private es: EventSource | null = null;
  private lastEventId: string | null = null;
  private attempt = 0;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  /** Evita emitir `reconnected` en la primera conexión. */
  private everOpened = false;

  constructor(private readonly opts: SseClientOptions) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearRetry();
    this.closeSource();
    this.opts.onStatus('idle');
  }

  /** Solo para tests y diagnóstico. */
  get currentLastEventId(): string | null {
    return this.lastEventId;
  }

  private clearRetry(): void {
    if (this.retryHandle !== null) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }

  private closeSource(): void {
    // `close()` antes de programar nada: si no, el reintento propio del
    // navegador competiría con el nuestro y se abrirían dos conexiones.
    this.es?.close();
    this.es = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.opts.onStatus(this.everOpened ? 'reconnecting' : 'connecting');

    let url: string;
    try {
      url = await this.opts.url(this.lastEventId);
    } catch {
      // No se pudo mintear el ticket (sin red, sesión caída): se reintenta.
      this.scheduleRetry();
      return;
    }
    if (this.stopped) return;

    const make = this.opts.factory ?? ((u: string) => new EventSource(u));
    const es = make(url);
    this.es = es;

    es.onopen = () => {
      this.attempt = 0;
      this.opts.onStatus('open');
      if (this.everOpened) this.opts.onEvent('reconnected', null, null);
      this.everOpened = true;
    };

    es.onerror = () => {
      // No se puede distinguir un 401 de un corte de red: `error` no lleva
      // estado. Por eso el sondeo de respaldo sigue existiendo — su 401 sí es
      // una señal fiable de "tu sesión murió".
      if (this.stopped) return;
      this.closeSource();
      this.scheduleRetry();
    };

    es.onmessage = (ev) => this.dispatch('message', ev);
    for (const type of [...CONTROL_TYPES, ...KNOWN_EVENT_TYPES]) {
      es.addEventListener(type, (ev) => this.dispatch(type, ev as MessageEvent));
    }
  }

  private dispatch(type: string, ev: MessageEvent): void {
    if (ev.lastEventId) this.lastEventId = ev.lastEventId;
    let data: unknown = null;
    if (ev.data) {
      try {
        data = JSON.parse(ev.data);
      } catch {
        return; // frame ilegible: descartarlo es mejor que romper el consumidor
      }
    }
    this.opts.onEvent(type, data, ev.lastEventId || null);
  }

  private scheduleRetry(): void {
    this.clearRetry();
    this.opts.onStatus('reconnecting');
    const max = this.opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    const base = Math.min(BASE_BACKOFF_MS * 2 ** this.attempt, max);
    // Jitter ±20 %: sin él, todas las tablets del local reconectan a la vez tras
    // un corte y le caen encima al servidor en el mismo instante.
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    this.attempt += 1;
    this.retryHandle = setTimeout(() => void this.connect(), Math.max(0, base + jitter));
  }
}

/**
 * `EventSource` entrega los eventos con nombre por `addEventListener`, no por
 * `onmessage`, así que hay que registrarlos explícitamente.
 */
export const KNOWN_EVENT_TYPES = [
  'order.created',
  'order.confirmed',
  'order.item_kitchen_changed',
  'order.item_addon_added',
  'order.item_voided',
  'order.cancelled',
  'session.bill_changed',
  'payment.completed',
  'session.closed',
  'table.status_changed',
  // Spec 077: sin esto el frame llega pero el navegador nunca dispara ningún
  // callback para él (se descarta en silencio) — sigue el mismo patrón que
  // el resto de esta lista.
  'notification.created',
] as const;
