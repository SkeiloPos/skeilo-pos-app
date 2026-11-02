import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { DinerShellComponent } from './diner-shell.component';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DinerTokenStore } from '../services/diner-token.store';
import { DinerService } from '../services/diner.service';
import { AvailabilitySyncService } from '../../../core/availability/availability-sync.service';
import { DiningCartService } from '../services/dining-cart.service';
import { LiveStatusService } from '../../../core/availability/live-status.service';

/** El indicador «Sin actualización en vivo» no es lo que prueban estos
 *  specs: se reemplaza para no tener que simular `RealtimeService.status`
 *  ni `AvailabilitySyncService.resyncPending` aquí. */
class FakeLiveStatusService {
  liveLost = signal(false);
}

class FakeRealtimeService {
  connectDiner = vi.fn();
  disconnect = vi.fn();
}

class FakeDinerTokenStore {
  readonly token = signal<string | null>(null);
}

class FakeDinerService {
  getAvailability = vi.fn(async () => ({ as_of: 1, products: [], variants: [], options: [] }));
}

class FakeAvailabilitySyncService {
  start = vi.fn();
  stop = vi.fn();
  registerTarget = vi.fn(() => vi.fn());
}

class FakeDiningCartService {}

class FakeRouter {
  url = '/menu/t/qr-abc';
  events = new Subject<unknown>();
}

describe('DinerShellComponent (spec 148)', () => {
  let fixture: ComponentFixture<DinerShellComponent>;
  let availabilitySync: FakeAvailabilitySyncService;
  let dinerService: FakeDinerService;
  let router: FakeRouter;

  async function createComponent(initialUrl = '/menu/t/qr-abc'): Promise<void> {
    router = new FakeRouter();
    router.url = initialUrl;
    TestBed.configureTestingModule({
      imports: [DinerShellComponent],
      providers: [
        { provide: RealtimeService, useClass: FakeRealtimeService },
        { provide: DinerTokenStore, useClass: FakeDinerTokenStore },
        { provide: DinerService, useClass: FakeDinerService },
        { provide: AvailabilitySyncService, useClass: FakeAvailabilitySyncService },
        { provide: DiningCartService, useClass: FakeDiningCartService },
        { provide: LiveStatusService, useClass: FakeLiveStatusService },
        { provide: Router, useValue: router },
      ],
    });
    fixture = TestBed.createComponent(DinerShellComponent);
    availabilitySync = TestBed.inject(AvailabilitySyncService) as unknown as FakeAvailabilitySyncService;
    dinerService = TestBed.inject(DinerService) as unknown as FakeDinerService;
    fixture.detectChanges();
  }

  it('arranca el sincronizador con el token firmado de la URL al construirse', async () => {
    await createComponent('/menu/t/qr-abc');
    expect(availabilitySync.start).toHaveBeenCalledTimes(1);

    const fetchSnapshot = availabilitySync.start.mock.calls[0][0] as () => Promise<unknown>;
    await fetchSnapshot();
    expect(dinerService.getAvailability).toHaveBeenCalledWith('qr-abc');
  });

  it('usa el endpoint firmado del comensal, nunca GET /menu/availability', async () => {
    await createComponent('/menu/t/qr-abc/checkout/review');
    const fetchSnapshot = availabilitySync.start.mock.calls[0][0] as () => Promise<unknown>;
    await fetchSnapshot();
    expect(dinerService.getAvailability).toHaveBeenCalledWith('qr-abc');
    expect(dinerService.getAvailability).toHaveBeenCalledTimes(1);
  });

  it('se detiene cuando la URL deja de tener token (navegación fuera del menú)', async () => {
    await createComponent('/menu/t/qr-abc');
    expect(availabilitySync.start).toHaveBeenCalledTimes(1);

    router.events.next(new NavigationEnd(2, '/otra-ruta', '/otra-ruta'));
    fixture.detectChanges();

    expect(availabilitySync.stop).toHaveBeenCalled();
  });

  it('se detiene al destruirse el componente', async () => {
    await createComponent('/menu/t/qr-abc');
    fixture.destroy();
    expect(availabilitySync.stop).toHaveBeenCalled();
  });

  it('registra DiningCartService como destino del sincronizador (spec 148, T053)', async () => {
    const cartService = {} as DiningCartService;
    const sync = new FakeAvailabilitySyncService();
    const r = new FakeRouter();
    TestBed.configureTestingModule({
      imports: [DinerShellComponent],
      providers: [
        { provide: RealtimeService, useClass: FakeRealtimeService },
        { provide: DinerTokenStore, useClass: FakeDinerTokenStore },
        { provide: DinerService, useClass: FakeDinerService },
        { provide: AvailabilitySyncService, useValue: sync },
        { provide: DiningCartService, useValue: cartService },
        { provide: LiveStatusService, useClass: FakeLiveStatusService },
        { provide: Router, useValue: r },
      ],
    });
    const f = TestBed.createComponent(DinerShellComponent);
    f.detectChanges();

    expect(sync.registerTarget).toHaveBeenCalledWith(cartService);
  });

  it('da de baja a DiningCartService al detenerse', async () => {
    const unregister = vi.fn();
    const sync = new FakeAvailabilitySyncService();
    sync.registerTarget = vi.fn(() => unregister);
    const r = new FakeRouter();
    TestBed.configureTestingModule({
      imports: [DinerShellComponent],
      providers: [
        { provide: RealtimeService, useClass: FakeRealtimeService },
        { provide: DinerTokenStore, useClass: FakeDinerTokenStore },
        { provide: DinerService, useClass: FakeDinerService },
        { provide: AvailabilitySyncService, useValue: sync },
        { provide: DiningCartService, useClass: FakeDiningCartService },
        { provide: Router, useValue: r },
        { provide: LiveStatusService, useClass: FakeLiveStatusService },
      ],
    });
    const f = TestBed.createComponent(DinerShellComponent);
    f.detectChanges();

    r.events.next(new NavigationEnd(2, '/otra-ruta', '/otra-ruta'));
    f.detectChanges();

    expect(unregister).toHaveBeenCalled();
  });

  it('no se detiene al navegar entre menú y checkout con el mismo token', async () => {
    await createComponent('/menu/t/qr-abc');

    router.events.next(
      new NavigationEnd(2, '/menu/t/qr-abc/checkout/review', '/menu/t/qr-abc/checkout/review'),
    );
    fixture.detectChanges();

    expect(availabilitySync.stop).not.toHaveBeenCalled();
  });
});
