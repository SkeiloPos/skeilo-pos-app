import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AvailabilityChangedEvent } from '../realtime/realtime-event.model';
import { RealtimeService } from '../realtime/realtime.service';
import { AvailabilitySyncService, AvailabilityTarget } from './availability-sync.service';

type Handler = (ev: any) => void;

class FakeRealtimeService {
  private handlers = new Map<string, Set<Handler>>();
  readonly status = signal<'idle' | 'connecting' | 'open' | 'reconnecting'>('open');

  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(type: string, ev: unknown = undefined): void {
    for (const fn of this.handlers.get(type) ?? []) fn(ev);
  }
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function makeTarget(): AvailabilityTarget & { changesLog: unknown[]; snapshotsLog: unknown[] } {
  return {
    changesLog: [],
    snapshotsLog: [],
    applyAvailability(changes) {
      this.changesLog.push(changes);
    },
    applyAvailabilitySnapshot(snapshot) {
      this.snapshotsLog.push(snapshot);
    },
  };
}

function makeEvent(v: number, overrides: Partial<AvailabilityChangedEvent> = {}): AvailabilityChangedEvent {
  return {
    type: 'availability.changed',
    v,
    at: new Date().toISOString(),
    changes: [{ kind: 'product', id: 'p1', sold_out: true, available: true }],
    refresh: false,
    ...overrides,
  };
}

describe('AvailabilitySyncService', () => {
  let service: AvailabilitySyncService;
  let fakeRealtime: FakeRealtimeService;

  beforeEach(() => {
    fakeRealtime = new FakeRealtimeService();
    TestBed.configureTestingModule({
      providers: [AvailabilitySyncService, { provide: RealtimeService, useValue: fakeRealtime }],
    });
    service = TestBed.inject(AvailabilitySyncService);
  });

  it('entrega un evento a todos los destinos registrados', () => {
    const t1 = makeTarget();
    const t2 = makeTarget();
    service.registerTarget(t1);
    service.registerTarget(t2);
    service.start(async () => ({ as_of: null, products: [], variants: [], options: [] }));

    fakeRealtime.emit('availability.changed', makeEvent(10));

    expect(t1.changesLog.length).toBe(1);
    expect(t2.changesLog.length).toBe(1);
  });

  it('descarta un evento con v menor o igual al ya aplicado', () => {
    const t1 = makeTarget();
    service.registerTarget(t1);
    service.start(async () => ({ as_of: null, products: [], variants: [], options: [] }));

    fakeRealtime.emit('availability.changed', makeEvent(10));
    fakeRealtime.emit('availability.changed', makeEvent(10));
    fakeRealtime.emit('availability.changed', makeEvent(5));

    expect(t1.changesLog.length).toBe(1);
  });

  it('descarta un evento con v menor o igual al as_of del snapshot', async () => {
    const t1 = makeTarget();
    service.registerTarget(t1);
    service.start(async () => ({ as_of: 20, products: [], variants: [], options: [] }));
    await service.reconcile();

    fakeRealtime.emit('availability.changed', makeEvent(15));

    expect(t1.changesLog.length).toBe(0);
  });

  it('refresh:true dispara una reconciliación', async () => {
    let calls = 0;
    const t1 = makeTarget();
    service.registerTarget(t1);
    service.start(async () => {
      calls += 1;
      return { as_of: 1, products: [], variants: [], options: [] };
    });

    fakeRealtime.emit('availability.changed', makeEvent(10, { refresh: true, changes: [] }));
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(1);
    expect(t1.snapshotsLog.length).toBe(1);
  });

  it('dos reconcile() simultáneos hacen una sola petición', async () => {
    let calls = 0;
    service.start(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 0));
      return { as_of: 1, products: [], variants: [], options: [] };
    });

    const [a, b] = await Promise.all([service.reconcile(), service.reconcile()]);

    expect(calls).toBe(1);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it('stop() deja de entregar eventos', () => {
    const t1 = makeTarget();
    service.registerTarget(t1);
    service.start(async () => ({ as_of: null, products: [], variants: [], options: [] }));
    service.stop();

    fakeRealtime.emit('availability.changed', makeEvent(10));

    expect(t1.changesLog.length).toBe(0);
  });

  it('applyLocal no consulta ni usa v: se entrega siempre', () => {
    const t1 = makeTarget();
    service.registerTarget(t1);
    const changes = [{ kind: 'product' as const, id: 'p1', sold_out: true, available: true }];

    service.applyLocal(changes);
    service.applyLocal(changes); // sin v, se entrega siempre, sin guardia

    expect(t1.changesLog.length).toBe(2);
  });

  it('reconcile() sin start() no hace nada', async () => {
    const result = await service.reconcile();
    expect(result).toBe(false);
  });

  it('"reconnected" dispara una reconciliación', async () => {
    let calls = 0;
    const t1 = makeTarget();
    service.registerTarget(t1);
    service.start(async () => {
      calls += 1;
      return { as_of: 1, products: [], variants: [], options: [] };
    });

    fakeRealtime.emit('reconnected');
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(1);
    expect(t1.snapshotsLog.length).toBe(1);
  });

  it('"resync" dispara una reconciliación', async () => {
    let calls = 0;
    service.start(async () => {
      calls += 1;
      return { as_of: 1, products: [], variants: [], options: [] };
    });

    fakeRealtime.emit('resync');
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(1);
  });

  describe('visibilidad y reintentos (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      setVisibility('visible');
    });

    it('volver visible antes de 10s con la conexión abierta no reconcilia', async () => {
      let calls = 0;
      service.start(async () => {
        calls += 1;
        return { as_of: 1, products: [], variants: [], options: [] };
      });
      fakeRealtime.status.set('open');

      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(5_000);
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);

      expect(calls).toBe(0);
    });

    it('volver visible después de 10s oculto reconcilia', async () => {
      let calls = 0;
      service.start(async () => {
        calls += 1;
        return { as_of: 1, products: [], variants: [], options: [] };
      });
      fakeRealtime.status.set('open');

      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(10_001);
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);

      expect(calls).toBe(1);
    });

    it('volver visible con la conexión caída reconcilia aunque haya sido breve', async () => {
      let calls = 0;
      service.start(async () => {
        calls += 1;
        return { as_of: 1, products: [], variants: [], options: [] };
      });
      fakeRealtime.status.set('reconnecting');

      setVisibility('hidden');
      await vi.advanceTimersByTimeAsync(1_000);
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);

      expect(calls).toBe(1);
    });

    it('un fallo de la consulta reintenta con backoff hasta tener éxito', async () => {
      let attempt = 0;
      service.start(async () => {
        attempt += 1;
        if (attempt < 3) throw new Error('falló');
        return { as_of: 1, products: [], variants: [], options: [] };
      });

      void service.reconcile();
      await vi.advanceTimersByTimeAsync(0);
      expect(service.resyncPending()).toBe(true);
      expect(attempt).toBe(1);

      await vi.advanceTimersByTimeAsync(1_000); // primer reintento, 1s
      expect(attempt).toBe(2);
      expect(service.resyncPending()).toBe(true);

      await vi.advanceTimersByTimeAsync(2_000); // segundo reintento, 2s
      expect(attempt).toBe(3);
      expect(service.resyncPending()).toBe(false);
    });
  });
});
