import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PageIntegrityService } from '../integrity/page-integrity.service';
import { RELOAD_PAGE } from '../reload-page';
import { AppUpdateService } from './app-update.service';
import { UpdateGateService } from './update-gate.service';

const TICK_MS = 15_000;
const MIN_ENTRE_COMPROBACIONES_MS = 60_000;
const MARCA = 'pos.update.autoReloadAt';

/** `SwUpdate` simulado: solo lo que usa el servicio. */
class FakeSwUpdate {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
  readonly checkForUpdate = vi.fn(async () => true);
  readonly activateUpdate = vi.fn(async () => true);
}

class FakeIntegrity {
  readonly altered = signal(false);
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const versionLista = (): VersionEvent =>
  ({
    type: 'VERSION_READY',
    currentVersion: { hash: 'a' },
    latestVersion: { hash: 'b' },
  }) as VersionEvent;

describe('AppUpdateService (spec 134, contracts/app-update.md)', () => {
  let sw: FakeSwUpdate;
  let integrity: FakeIntegrity;
  let gate: UpdateGateService;
  let svc: AppUpdateService;
  let recargar: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  /** Deja pasar las promesas pendientes sin avanzar el reloj. */
  const flush = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
  };

  function crear(opts: { swEnabled?: boolean } = {}): void {
    TestBed.resetTestingModule();
    sw = new FakeSwUpdate();
    sw.isEnabled = opts.swEnabled ?? true;
    integrity = new FakeIntegrity();
    recargar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: sw },
        { provide: PageIntegrityService, useValue: integrity },
        { provide: RELOAD_PAGE, useValue: recargar },
      ],
    });
    gate = TestBed.inject(UpdateGateService);
    svc = TestBed.inject(AppUpdateService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    document.body.replaceChildren();
    sessionStorage.clear();
    // Service Worker listo: `navigator.serviceWorker.ready` ya resuelto.
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({}) },
    });
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (navigator as unknown as Record<string, unknown>)['serviceWorker'];
    sessionStorage.clear();
    document.body.replaceChildren();
    setVisibility('visible');
  });

  describe('desactivado (desarrollo)', () => {
    it('con isEnabled=false ni comprueba ni recarga, aunque llegue una versión', async () => {
      crear({ swEnabled: false });
      svc.start();
      sw.versionUpdates.next(versionLista());
      await vi.advanceTimersByTimeAsync(TICK_MS * 10);

      expect(sw.checkForUpdate).not.toHaveBeenCalled();
      expect(sw.activateUpdate).not.toHaveBeenCalled();
      expect(recargar).not.toHaveBeenCalled();
    });
  });

  describe('comprobación de versión', () => {
    it('comprueba al arrancar, cuando el Service Worker está listo', async () => {
      crear();
      svc.start();
      await flush();

      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    });

    it('si el Service Worker tarda más de 60 s en estar listo, no comprueba al arrancar (lo hará al volver a primer plano)', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { ready: new Promise(() => undefined) },
      });
      crear();
      svc.start();
      await vi.advanceTimersByTimeAsync(61_000);

      expect(sw.checkForUpdate).not.toHaveBeenCalled();

      setVisibility('hidden');
      setVisibility('visible');
      await flush();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    });

    it('comprueba al volver a primer plano, no más de una vez por 60 s', async () => {
      crear();
      svc.start();
      await flush();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);

      // Dentro de la ventana de 60 s: no vuelve a comprobar.
      await vi.advanceTimersByTimeAsync(10_000);
      setVisibility('hidden');
      setVisibility('visible');
      await flush();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);

      // Pasada la ventana: sí.
      await vi.advanceTimersByTimeAsync(MIN_ENTRE_COMPROBACIONES_MS);
      setVisibility('hidden');
      setVisibility('visible');
      await flush();
      expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
    });

    it('no comprueba al pasar a segundo plano', async () => {
      crear();
      svc.start();
      await flush();
      await vi.advanceTimersByTimeAsync(MIN_ENTRE_COMPROBACIONES_MS * 2);

      setVisibility('hidden');
      await flush();

      expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    });

    it('un checkForUpdate que falla se registra con console.warn y no lanza', async () => {
      crear();
      sw.checkForUpdate.mockRejectedValueOnce(new Error('sin red'));
      svc.start();

      await expect(flush()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('aplicar la versión nueva', () => {
    it('VERSION_READY con momento seguro ⇒ activateUpdate() y recarga', async () => {
      crear();
      svc.start();
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS);

      expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('unrecoverable también deja una actualización pendiente', async () => {
      crear();
      svc.start();
      sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'hash mismatch' });

      await vi.advanceTimersByTimeAsync(TICK_MS);

      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('otros eventos (VERSION_DETECTED, NO_NEW_VERSION_DETECTED) no dejan nada pendiente', async () => {
      crear();
      svc.start();
      sw.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } } as VersionEvent);
      sw.versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: { hash: 'a' } } as VersionEvent);

      await vi.advanceTimersByTimeAsync(TICK_MS * 5);

      expect(recargar).not.toHaveBeenCalled();
    });

    it('sin versión pendiente nunca recarga, por mucho tiempo que pase', async () => {
      crear();
      svc.start();

      await vi.advanceTimersByTimeAsync(TICK_MS * 100);

      expect(recargar).not.toHaveBeenCalled();
    });

    it('recarga una sola vez aunque lleguen varios VERSION_READY', async () => {
      crear();
      svc.start();
      sw.versionUpdates.next(versionLista());
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS * 3);

      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('al volver a primer plano con una versión pendiente intenta aplicarla sin esperar al ciclo', async () => {
      crear();
      svc.start();
      await flush();
      sw.versionUpdates.next(versionLista());
      await flush();

      setVisibility('hidden');
      setVisibility('visible');
      await flush();

      expect(recargar).toHaveBeenCalledTimes(1);
    });
  });

  describe('momento seguro: cada condición retiene la recarga y se reintenta a los 15 s', () => {
    type Condicion = [nombre: string, activar: () => void, desactivar: () => void];

    function condiciones(): Condicion[] {
      let overlay: HTMLElement | null = null;
      let campoSucio: HTMLElement | null = null;
      let input: HTMLInputElement | null = null;
      let hayBorrador = false;
      gate.registerBlocker('pos-terminal-draft', () => hayBorrador);
      return [
        ['M1 · página alterada', () => integrity.altered.set(true), () => integrity.altered.set(false)],
        ['M2 · escritura en vuelo', () => gate.beginRequest(), () => gate.endRequest()],
        [
          'M3 · overlay visible',
          () => {
            overlay = document.createElement('div');
            overlay.className = 'fixed inset-0';
            overlay.getClientRects = () => [{} as DOMRect] as unknown as DOMRectList;
            document.body.appendChild(overlay);
          },
          () => overlay?.remove(),
        ],
        [
          'M4 · control sucio',
          () => {
            campoSucio = document.createElement('div');
            campoSucio.className = 'ng-dirty';
            document.body.appendChild(campoSucio);
          },
          () => campoSucio?.remove(),
        ],
        [
          'M5 · campo con foco y valor',
          () => {
            input = document.createElement('input');
            document.body.appendChild(input);
            input.focus();
            input.value = 'Juan';
          },
          () => input?.remove(),
        ],
        ['M6 · borrador sin enviar', () => (hayBorrador = true), () => (hayBorrador = false)],
      ];
    }

    it.each([0, 1, 2, 3, 4, 5])('condición #%i', async (i) => {
      crear();
      const [, activar, desactivar] = condiciones()[i];
      svc.start();
      activar();
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS * 3);
      expect(recargar).not.toHaveBeenCalled();
      expect(sw.activateUpdate).not.toHaveBeenCalled();

      desactivar();
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('un POST sin completar retiene la recarga hasta que termina', async () => {
      crear();
      svc.start();
      gate.beginRequest(); // envío o pago en curso
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS * 4);
      expect(recargar).not.toHaveBeenCalled();

      gate.endRequest(); // la respuesta llegó
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('alteración activa + versión pendiente ⇒ no recarga solo (la decisión es de la persona)', async () => {
      crear();
      svc.start();
      integrity.altered.set(true);
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS * 50);

      expect(recargar).not.toHaveBeenCalled();
    });
  });

  describe('guardián anti-bucle', () => {
    it('antes de recargar escribe la marca pos.update.autoReloadAt', async () => {
      crear();
      svc.start();
      const antes = Date.now();
      sw.versionUpdates.next(versionLista());
      await vi.advanceTimersByTimeAsync(TICK_MS);

      expect(recargar).toHaveBeenCalledTimes(1);
      expect(Number(sessionStorage.getItem(MARCA))).toBeGreaterThanOrEqual(antes);
    });

    it('con una marca de menos de 120 s no recarga', async () => {
      crear();
      svc.start();
      sessionStorage.setItem(MARCA, String(Date.now() - 30_000));
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS);

      expect(recargar).not.toHaveBeenCalled();
    });

    it('cuando la marca ya tiene más de 120 s, vuelve a poder recargar', async () => {
      crear();
      svc.start();
      sessionStorage.setItem(MARCA, String(Date.now() - 30_000));
      sw.versionUpdates.next(versionLista());
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(recargar).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100_000); // la marca cumple 130 s
      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('un sessionStorage que lanza se comporta como "sin marca": recarga igual', async () => {
      crear();
      svc.start();
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('almacenamiento bloqueado');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('almacenamiento bloqueado');
      });
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS);

      expect(recargar).toHaveBeenCalledTimes(1);
    });
  });

  describe('errores de activación', () => {
    it('un activateUpdate() que falla se registra con console.warn, no recarga y se reintenta en el siguiente ciclo', async () => {
      crear();
      svc.start();
      sw.activateUpdate.mockRejectedValueOnce(new Error('no se pudo activar'));
      sw.versionUpdates.next(versionLista());

      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(warn).toHaveBeenCalled();
      expect(recargar).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(sw.activateUpdate).toHaveBeenCalledTimes(2);
      expect(recargar).toHaveBeenCalledTimes(1);
    });
  });

  describe('reloadNow() (botón "Recargar" del aviso)', () => {
    it('con una versión pendiente, la activa antes de recargar', async () => {
      crear();
      svc.start();
      sw.versionUpdates.next(versionLista());
      const orden: string[] = [];
      sw.activateUpdate.mockImplementation(async () => {
        orden.push('activar');
        return true;
      });
      recargar.mockImplementation(() => orden.push('recargar'));

      await svc.reloadNow();

      expect(orden).toEqual(['activar', 'recargar']);
    });

    it('sin versión pendiente, recarga directo sin tocar el Service Worker', async () => {
      crear();
      svc.start();

      await svc.reloadNow();

      expect(sw.activateUpdate).not.toHaveBeenCalled();
      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('recarga aunque el momento no sea seguro (la decide la persona), y aunque activateUpdate falle', async () => {
      crear();
      svc.start();
      sw.versionUpdates.next(versionLista());
      gate.beginRequest();
      sw.activateUpdate.mockRejectedValueOnce(new Error('fallo'));

      await svc.reloadNow();

      expect(recargar).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
    });

    it('no escribe la marca anti-bucle: es una recarga pedida por una persona', async () => {
      crear();
      svc.start();

      await svc.reloadNow();

      expect(sessionStorage.getItem(MARCA)).toBeNull();
    });

    it('con SwUpdate desactivado igual recarga', async () => {
      crear({ swEnabled: false });
      svc.start();

      await svc.reloadNow();

      expect(recargar).toHaveBeenCalledTimes(1);
    });
  });
});
