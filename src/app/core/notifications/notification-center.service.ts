import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationCreatedEvent } from '../realtime/realtime-event.model';
import { SoundService } from '../../shared/feedback/sound.service';
import { ToastService } from '../../shared/feedback/toast.service';
import { NotificationItem, NotificationListResponse } from './notification.model';

const LAST_SEEN_KEY = 'pos.notifications.last_seen_id';
/** Tope del centro de notificaciones en memoria — es una bandeja reciente,
 * no el histórico completo (ese vive en `GET /notifications` paginado). */
const MAX_ITEMS = 100;

/**
 * Estado del centro de notificaciones del staff (spec 077, US1/US5).
 *
 * Se suscribe **una sola vez** (es `providedIn: 'root'`, vive toda la sesión)
 * al tipo SSE genérico `notification.created` — nunca a `order.created`/
 * `payment.completed` directamente, que siguen sirviendo a quien ya los
 * consume (p. ej. `pos-terminal.store.ts`). La conexión SSE en sí la abre
 * `DashboardLayoutComponent`; este servicio solo escucha.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private readonly http = inject(HttpClient);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(ToastService);
  private readonly sound = inject(SoundService);
  private readonly baseUrl = `${environment.apiBaseUrl}/notifications`;

  private readonly items = signal<NotificationItem[]>([]);
  readonly list = computed(() => this.items());
  readonly pendingCount = computed(
    () => this.items().filter((n) => n.attended_at === null).length,
  );

  /**
   * Spec 100: guarda de una sola carga inicial entre la recuperación por
   * `lastSeenId` (RF-008, ver constructor) y la hidratación desde el
   * agregador (`hydrate()`). La que marca esta guarda primero gana; la otra
   * queda no-operativa.
   *
   * Antes de esta spec, el constructor disparaba siempre su propio `GET
   * /notifications` (vía un `bootstrap()` privado) — HeaderComponent lo
   * inyecta como campo de clase, y Angular construye los componentes de
   * forma síncrona de padre a hijo, así que ese auto-arranque corría
   * **siempre** antes de que `ngOnInit()` del shell llegara a pedir
   * `GET /bootstrap` (research.md Decisión 8 asumía una carrera que, en la
   * práctica, el auto-arranque ganaba de forma determinista, no aleatoria —
   * JS es de un solo hilo y la construcción es síncrona). Se retira ese
   * auto-arranque incondicional para que la carga común (sesión nueva, sin
   * `lastSeenId`) llegue **solo** vía `hydrate()`, sin disparar una petición
   * aparte (SC-001). La única fuente que sigue disparando su propia petición
   * de forma independiente es la recuperación por `lastSeenId` (abajo), que
   * ya estaba fuera del alcance del agregador (research.md §5: el modo
   * `after_id` no participa de `/bootstrap`).
   */
  private initialized = false;

  constructor() {
    this.realtime.on('notification.created', (ev) => this.onNotificationCreated(ev));
    // `reconnected` solo se emite tras una caída con el stream ya abierto en
    // esta misma pestaña (US5, quickstart.md §5).
    this.realtime.on('reconnected', () => void this.recoverMissed());

    // RF-008: si ya hay un `lastSeenId` persistido de una pestaña anterior,
    // recupera lo que llegó desde entonces — el agregador no ofrece el modo
    // `after_id`, así que esta recuperación sigue siendo una petición propia,
    // independiente de `hydrate()`. Marca la guarda de forma síncrona para
    // que un `hydrate()` que llegue después (con el bloque `notifications`
    // del agregador, que trae page=1/size=20, no la recuperación) no compita.
    if (this.readLastSeenId()) {
      this.initialized = true;
      void this.recoverMissed();
    }
  }

  /** Hidrata desde el bloque `notifications` del arranque agregado
   * (`BootstrapService`), sin disparar `GET /notifications` — salvo que la
   * recuperación por `lastSeenId` del constructor ya haya ganado la guarda,
   * en cuyo caso no hace nada. */
  hydrate(value: NotificationListResponse | null): void {
    if (this.initialized) return;
    this.initialized = true;
    if (value) this.merge(value.items);
  }

  /** Marca una notificación como atendida (compartido por tenant, idempotente). */
  async attend(id: string): Promise<void> {
    const attended = await firstValueFrom(
      this.http.post<{ id: string; attended_at: string; attended_by_user_id: string }>(
        `${this.baseUrl}/${id}/attend`,
        {},
      ),
    );
    this.items.update((list) =>
      list.map((n) =>
        n.id === id
          ? { ...n, attended_at: attended.attended_at, attended_by_user_id: attended.attended_by_user_id }
          : n,
      ),
    );
  }

  /** US5: notificaciones generadas mientras el cajero estuvo desconectado. */
  private async recoverMissed(): Promise<void> {
    const afterId = this.readLastSeenId();
    if (!afterId) return;
    try {
      const res = await firstValueFrom(
        this.http.get<NotificationListResponse>(this.baseUrl, {
          params: { after_id: afterId, limit: 100 },
        }),
      );
      this.merge(res.items);
    } catch (err) {
      // 404 = la referencia ya no existe (purgada); no es un error del
      // cajero, solo se sigue desde lo que llegue en vivo de aquí en más.
      if (!(err instanceof HttpErrorResponse) || err.status !== 404) {
        console.error('[notifications] no se pudo recuperar lo perdido', err);
      }
    }
  }

  private onNotificationCreated(ev: NotificationCreatedEvent): void {
    const item: NotificationItem = {
      id: ev.notification_id,
      event_type: ev.event_type,
      related_entity_type: ev.related_entity_type,
      related_entity_id: ev.related_entity_id,
      payload: {},
      created_at: ev.at,
      attended_at: null,
      attended_by_user_id: null,
      summary: ev.summary,
    };
    const eraNueva = this.merge([item]);
    if (!eraNueva) return;

    // FR-003: aviso visual + sonoro solo con la pestaña enfocada. Sin foco,
    // el canal push (US3) es quien avisa — evita el doble aviso.
    if (typeof document !== 'undefined' && document.hasFocus()) {
      this.toast.info(ev.summary);
      this.sound.bell();
    }
  }

  /** Fusiona sin duplicados (por `id`), recorta al tope y actualiza el
   * `lastSeenId` persistido. Devuelve si trajo algo nuevo. */
  private merge(nuevas: NotificationItem[]): boolean {
    if (nuevas.length === 0) return false;
    let agregadas = false;
    this.items.update((actuales) => {
      const vistos = new Set(actuales.map((n) => n.id));
      const aAgregar = nuevas.filter((n) => !vistos.has(n.id));
      if (aAgregar.length === 0) return actuales;
      agregadas = true;
      const combinadas = [...aAgregar, ...actuales].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      return combinadas.slice(0, MAX_ITEMS);
    });
    if (agregadas) {
      const masReciente = [...nuevas].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      this.writeLastSeenId(masReciente.id);
    }
    return agregadas;
  }

  private readLastSeenId(): string | null {
    try {
      return localStorage.getItem(LAST_SEEN_KEY);
    } catch {
      return null;
    }
  }

  private writeLastSeenId(id: string): void {
    try {
      localStorage.setItem(LAST_SEEN_KEY, id);
    } catch {
      /* storage bloqueado: vale solo para esta sesión */
    }
  }
}
