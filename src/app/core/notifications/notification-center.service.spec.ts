import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { NotificationCenterService } from './notification-center.service';
import { NotificationListResponse } from './notification.model';
import { RealtimeService } from '../realtime/realtime.service';
import { ToastService } from '../../shared/feedback/toast.service';
import { SoundService } from '../../shared/feedback/sound.service';

const API = environment.apiBaseUrl;
const NOTIFICATIONS = `${API}/notifications`;
const LAST_SEEN_KEY = 'pos.notifications.last_seen_id';

function response(partial: Partial<NotificationListResponse> = {}): NotificationListResponse {
  return { items: [], total: 0, page: 1, size: 20, ...partial };
}

function item(id: string, created_at = '2026-10-07T12:00:00Z') {
  return {
    id,
    event_type: 'order.created',
    related_entity_type: 'customer_order',
    related_entity_id: 'r1',
    payload: {},
    created_at,
    attended_at: null,
    attended_by_user_id: null,
  };
}

function setup(clientId = 'tab-propia') {
  TestBed.resetTestingModule();
  const handlers = new Map<string, (ev: any) => void>();
  const toast = { info: vi.fn() };
  const sound = { bell: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      NotificationCenterService,
      {
        provide: RealtimeService,
        useValue: {
          clientId,
          on: vi.fn((type: string, fn: (ev: any) => void) => {
            handlers.set(type, fn);
            return () => {};
          }),
        },
      },
      { provide: ToastService, useValue: toast },
      { provide: SoundService, useValue: sound },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return {
    service: TestBed.inject(NotificationCenterService),
    http: TestBed.inject(HttpTestingController),
    toast,
    sound,
    emitNotificationCreated: (ev: any) => handlers.get('notification.created')?.(ev),
  };
}

describe('NotificationCenterService (spec 100: guarda de una sola carga inicial)', () => {
  afterEach(() => {
    localStorage.removeItem(LAST_SEEN_KEY);
  });

  describe('sesión nueva (sin lastSeenId) — "el bootstrap llega primero"', () => {
    it('hydrate() fusiona los items recibidos sin disparar ninguna petición HTTP', () => {
      const { service, http } = setup();

      service.hydrate(response({ items: [item('n1')] }));

      expect(service.list().map((n) => n.id)).toEqual(['n1']);
      http.expectNone(NOTIFICATIONS);
    });

    it('hydrate(null) deja la lista vacía sin disparar ninguna petición HTTP', () => {
      const { service, http } = setup();

      service.hydrate(null);

      expect(service.list()).toEqual([]);
      http.expectNone(NOTIFICATIONS);
    });

    it('una segunda llamada a hydrate() es no-operativa (la guarda ya la ganó la primera)', () => {
      const { service, http } = setup();

      service.hydrate(response({ items: [item('n1')] }));
      service.hydrate(response({ items: [item('n2')] }));

      expect(service.list().map((n) => n.id)).toEqual(['n1']);
      http.expectNone(NOTIFICATIONS);
    });
  });

  describe('sesión con lastSeenId persistido — "el auto-arranque por DI corre primero"', () => {
    it('recupera por after_id en el constructor y GET /notifications se dispara como máximo una vez', async () => {
      localStorage.setItem(LAST_SEEN_KEY, 'last-seen-id');
      const { service, http } = setup();

      const req = http.expectOne(
        (r) => r.url === NOTIFICATIONS && r.params.get('after_id') === 'last-seen-id',
      );
      req.flush(response({ items: [item('n3')], total: null, page: null, size: null }));
      await Promise.resolve();

      expect(service.list().map((n) => n.id)).toEqual(['n3']);
      http.expectNone(NOTIFICATIONS);
    });

    it('hydrate() posterior es no-operativo: la guarda ya la ganó la recuperación del constructor', async () => {
      localStorage.setItem(LAST_SEEN_KEY, 'last-seen-id');
      const { service, http } = setup();

      const req = http.expectOne(
        (r) => r.url === NOTIFICATIONS && r.params.get('after_id') === 'last-seen-id',
      );
      req.flush(response({ items: [item('n3')], total: null, page: null, size: null }));
      await Promise.resolve();

      service.hydrate(response({ items: [item('n4')] }));

      expect(service.list().map((n) => n.id)).toEqual(['n3']);
      http.expectNone(NOTIFICATIONS);
    });
  });
});

describe('NotificationCenterService.onNotificationCreated — spec 125 (confirmación única de pago)', () => {
  function pagoEvent(originClientId: string | null | undefined) {
    return {
      type: 'notification.created',
      notification_id: 'n1',
      event_type: 'payment.completed',
      related_entity_type: 'sale',
      related_entity_id: 'sale-1',
      summary: 'Pago recibido · $ 22.000',
      origin_client_id: originClientId,
      at: '2026-10-17T18:30:00Z',
    };
  }

  beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  it('FR-007: origin_client_id igual al de esta terminal — se agrega a la lista pero sin toast ni sonido', () => {
    const { toast, sound, emitNotificationCreated, service } = setup('tab-propia');

    emitNotificationCreated(pagoEvent('tab-propia'));

    expect(service.list().map((n) => n.id)).toEqual(['n1']);
    expect(toast.info).not.toHaveBeenCalled();
    expect(sound.bell).not.toHaveBeenCalled();
  });

  it('FR-005/FR-006: origin_client_id de otra terminal — sí muestra el toast con el sonido', () => {
    const { toast, sound, emitNotificationCreated, service } = setup('tab-propia');

    emitNotificationCreated(pagoEvent('otra-tab'));

    expect(service.list().map((n) => n.id)).toEqual(['n1']);
    expect(toast.info).toHaveBeenCalledWith('Pago recibido · $ 22.000');
    expect(sound.bell).toHaveBeenCalled();
  });

  it('sin origin_client_id (evento que no lo manda, p. ej. order.created) — comportamiento sin cambios: muestra el toast', () => {
    const { toast, emitNotificationCreated } = setup('tab-propia');

    emitNotificationCreated({ ...pagoEvent(undefined), event_type: 'order.created' });

    expect(toast.info).toHaveBeenCalled();
  });
});
