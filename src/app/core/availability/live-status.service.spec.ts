import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RealtimeService } from '../realtime/realtime.service';
import { AvailabilitySyncService } from './availability-sync.service';
import { LIVE_LOST_DELAY_MS, LiveStatusService } from './live-status.service';

class FakeRealtimeService {
  readonly status = signal<'idle' | 'connecting' | 'open' | 'reconnecting'>('open');
}

class FakeSyncService {
  readonly resyncPending = signal(false);
}

describe('LiveStatusService', () => {
  let realtime: FakeRealtimeService;
  let sync: FakeSyncService;
  let service: LiveStatusService;

  beforeEach(() => {
    vi.useFakeTimers();
    realtime = new FakeRealtimeService();
    sync = new FakeSyncService();
    TestBed.configureTestingModule({
      providers: [
        { provide: RealtimeService, useValue: realtime },
        { provide: AvailabilitySyncService, useValue: sync },
      ],
    });
    service = TestBed.inject(LiveStatusService);
    TestBed.tick();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('un corte de 4s nunca muestra el indicador', async () => {
    realtime.status.set('reconnecting');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(4_000);
    TestBed.tick();

    expect(service.liveLost()).toBe(false);
  });

  it('un corte de 5s muestra el indicador', async () => {
    realtime.status.set('reconnecting');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(LIVE_LOST_DELAY_MS);
    TestBed.tick();

    expect(service.liveLost()).toBe(true);
  });

  it('la conexión vuelve pero la reconciliación falla: sigue visible', async () => {
    realtime.status.set('reconnecting');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(LIVE_LOST_DELAY_MS);
    TestBed.tick();
    expect(service.liveLost()).toBe(true);

    sync.resyncPending.set(true);
    realtime.status.set('open');
    TestBed.tick();

    expect(service.liveLost()).toBe(true);
  });

  it('una reconciliación exitosa apaga el indicador', async () => {
    realtime.status.set('reconnecting');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(LIVE_LOST_DELAY_MS);
    TestBed.tick();
    sync.resyncPending.set(true);
    realtime.status.set('open');
    TestBed.tick();
    expect(service.liveLost()).toBe(true);

    sync.resyncPending.set(false);
    TestBed.tick();

    expect(service.liveLost()).toBe(false);
  });

  it('volver a open antes de los 5s cancela el temporizador, sin mostrar nunca el indicador', async () => {
    realtime.status.set('reconnecting');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(3_000);
    realtime.status.set('open');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(5_000);
    TestBed.tick();

    expect(service.liveLost()).toBe(false);
  });
});
