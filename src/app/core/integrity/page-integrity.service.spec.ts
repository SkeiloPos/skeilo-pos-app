import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { RELOAD_PAGE } from '../reload-page';
import { AppUpdateService } from '../update/app-update.service';
import { CANARY_TEXT } from './integrity-signals';
import { PageIntegrityService } from './page-integrity.service';

/** Fuerza `document.visibilityState` y dispara el evento, como hace el navegador. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function limpiarDocumento(): void {
  document.documentElement.className = '';
  document.documentElement.lang = 'es';
  document.body.replaceChildren();
}

function montarCanario(): HTMLElement {
  const el = document.createElement('span');
  el.setAttribute('data-integrity-canary', '');
  el.textContent = CANARY_TEXT;
  document.body.appendChild(el);
  return el;
}

const PERIODO_MS = 1500;

describe('PageIntegrityService (spec 134, contracts/page-integrity.md)', () => {
  let recargar: ReturnType<typeof vi.fn>;

  function crear(): PageIntegrityService {
    TestBed.resetTestingModule();
    recargar = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: RELOAD_PAGE, useValue: recargar }],
    });
    return TestBed.inject(PageIntegrityService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    limpiarDocumento();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    limpiarDocumento();
    setVisibility('visible');
  });

  describe('arranque (FR-007)', () => {
    it('con la página íntegra arranca "íntegra", sin razones ni aviso', () => {
      const svc = crear();
      svc.start();

      expect(svc.altered()).toBe(false);
      expect(svc.reasons()).toEqual([]);
      expect(svc.blockedNotice()).toBeNull();
    });

    it('con <html class="translated-ltr"> ya presente, la primera evaluación la marca alterada', () => {
      document.documentElement.classList.add('translated-ltr');
      const svc = crear();
      svc.start();

      expect(svc.altered()).toBe(true);
      expect(svc.reasons()).toEqual(['html-class']);
    });

    it('con lang="en" ya presente, la primera evaluación la marca alterada', () => {
      document.documentElement.lang = 'en';
      const svc = crear();
      svc.start();

      expect(svc.altered()).toBe(true);
      expect(svc.reasons()).toEqual(['html-lang']);
    });

    it('start() es idempotente: llamarlo dos veces no duplica observadores ni sondeos', () => {
      const svc = crear();
      svc.start();
      svc.start();
      const evaluar = vi.spyOn(document, 'getElementsByTagName');

      vi.advanceTimersByTime(PERIODO_MS);

      expect(evaluar).toHaveBeenCalledTimes(1);
    });
  });

  describe('detección durante el uso', () => {
    it('un <font> que aparece se detecta en el siguiente sondeo (< 3 s, SC-003)', () => {
      const svc = crear();
      svc.start();
      document.body.appendChild(document.createElement('font'));

      vi.advanceTimersByTime(PERIODO_MS);

      expect(svc.altered()).toBe(true);
      expect(svc.reasons()).toEqual(['font-wrapper']);
    });

    it('un cambio de clase en <html> se detecta sin esperar al sondeo (MutationObserver)', async () => {
      const svc = crear();
      svc.start();

      document.documentElement.classList.add('translated-ltr');
      await Promise.resolve();

      expect(svc.altered()).toBe(true);
    });

    it('atributos _msttexthash se detectan en el sondeo', () => {
      const svc = crear();
      svc.start();
      const p = document.createElement('p');
      p.setAttribute('_msttexthash', '99');
      document.body.appendChild(p);

      vi.advanceTimersByTime(PERIODO_MS);

      expect(svc.reasons()).toEqual(['ms-translator-attr']);
    });

    it('acumula varias razones a la vez', () => {
      const svc = crear();
      svc.start();
      document.documentElement.lang = 'en';
      document.body.appendChild(document.createElement('font'));

      vi.advanceTimersByTime(PERIODO_MS);

      expect([...svc.reasons()].sort()).toEqual(['font-wrapper', 'html-lang']);
    });
  });

  describe('canario estructural (S5)', () => {
    it('registrado e íntegro no altera nada', () => {
      const svc = crear();
      svc.start();
      svc.registerCanary(montarCanario());

      vi.advanceTimersByTime(PERIODO_MS * 3);

      expect(svc.altered()).toBe(false);
    });

    it('si un traductor reemplaza su nodo de texto, se detecta aunque no deje ninguna marca', async () => {
      const svc = crear();
      svc.start();
      const canario = montarCanario();
      svc.registerCanary(canario);

      // Mecanismo medido en la spec: el original queda desconectado y se pone una copia.
      const copia = document.createElement('span');
      copia.textContent = CANARY_TEXT;
      canario.replaceChild(copia, canario.firstChild as Text);
      await Promise.resolve();

      expect(svc.altered()).toBe(true);
      expect(svc.reasons()).toEqual(['canary']);
    });

    it('si se reescribe el texto del nodo, se detecta', async () => {
      const svc = crear();
      svc.start();
      const canario = montarCanario();
      svc.registerCanary(canario);

      (canario.firstChild as Text).nodeValue = 'Application content';
      await Promise.resolve();

      expect(svc.altered()).toBe(true);
    });

    it('un elemento sin el texto del canario no se registra (no inventa una alteración)', () => {
      const svc = crear();
      svc.start();
      const vacio = document.createElement('span');
      document.body.appendChild(vacio);

      svc.registerCanary(vacio);
      vi.advanceTimersByTime(PERIODO_MS * 3);

      expect(svc.altered()).toBe(false);
    });
  });

  describe('histéresis (FR-010)', () => {
    it('una evaluación limpia no basta para volver a "íntegra"; dos consecutivas sí', () => {
      const svc = crear();
      svc.start();
      const font = document.createElement('font');
      document.body.appendChild(font);
      vi.advanceTimersByTime(PERIODO_MS);
      expect(svc.altered()).toBe(true);

      font.remove();
      vi.advanceTimersByTime(PERIODO_MS);
      expect(svc.altered()).toBe(true); // 1 evaluación limpia

      vi.advanceTimersByTime(PERIODO_MS);
      expect(svc.altered()).toBe(false); // 2 consecutivas
      expect(svc.reasons()).toEqual([]);
    });

    it('una señal que reaparece entre las dos reinicia la cuenta', () => {
      const svc = crear();
      svc.start();
      const font = document.createElement('font');
      document.body.appendChild(font);
      vi.advanceTimersByTime(PERIODO_MS);

      font.remove();
      vi.advanceTimersByTime(PERIODO_MS); // limpia #1
      document.body.appendChild(font);
      vi.advanceTimersByTime(PERIODO_MS); // vuelve a estar alterada
      font.remove();
      vi.advanceTimersByTime(PERIODO_MS); // limpia #1 otra vez

      expect(svc.altered()).toBe(true);
    });

    it('las evaluaciones disparadas por observadores no adelantan la recuperación', async () => {
      const svc = crear();
      svc.start();
      document.documentElement.classList.add('translated-ltr');
      await Promise.resolve();
      expect(svc.altered()).toBe(true);

      document.documentElement.classList.remove('translated-ltr');
      await Promise.resolve(); // el observador evalúa: limpio, pero no cuenta como recuperación
      expect(svc.altered()).toBe(true);

      vi.advanceTimersByTime(PERIODO_MS);
      expect(svc.altered()).toBe(true); // limpia #1
      vi.advanceTimersByTime(PERIODO_MS);
      expect(svc.altered()).toBe(false); // limpia #2
    });

    it('un error de DOM atribuible queda latched: nunca vuelve a "íntegra" sin recargar', () => {
      const svc = crear();
      svc.start();

      svc.reportDomError(new DOMException("Failed to execute 'removeChild' on 'Node'", 'NotFoundError'));
      expect(svc.altered()).toBe(true);
      expect(svc.reasons()).toContain('dom-error');

      vi.advanceTimersByTime(PERIODO_MS * 20);
      expect(svc.altered()).toBe(true);
    });
  });

  describe('cuándo se evalúa', () => {
    it('con la pestaña oculta no sondea; al volver a verse evalúa de inmediato', () => {
      const svc = crear();
      svc.start();
      setVisibility('hidden');
      document.body.appendChild(document.createElement('font')); // S3 no tiene observador

      vi.advanceTimersByTime(PERIODO_MS * 10);
      expect(svc.altered()).toBe(false);

      setVisibility('visible');
      expect(svc.altered()).toBe(true);
    });

    it('pageshow (p. ej. volver con el botón atrás) reevalúa de inmediato', () => {
      const svc = crear();
      svc.start();
      document.body.appendChild(document.createElement('font'));

      window.dispatchEvent(new Event('pageshow'));

      expect(svc.altered()).toBe(true);
    });

    it('sin MutationObserver (entorno de pruebas) solo funciona el sondeo y no lanza', () => {
      vi.stubGlobal('MutationObserver', undefined);
      const svc = crear();

      expect(() => svc.start()).not.toThrow();
      expect(() => svc.registerCanary(montarCanario())).not.toThrow();

      document.body.appendChild(document.createElement('font'));
      vi.advanceTimersByTime(PERIODO_MS);
      expect(svc.altered()).toBe(true);
    });
  });

  describe('aviso de acción bloqueada', () => {
    it('notifyBlocked fija el aviso y se limpia al volver a "íntegra"', () => {
      const svc = crear();
      svc.start();
      const font = document.createElement('font');
      document.body.appendChild(font);
      vi.advanceTimersByTime(PERIODO_MS);

      svc.notifyBlocked('enviar el pedido');
      expect(svc.blockedNotice()).toBe('enviar el pedido');

      font.remove();
      vi.advanceTimersByTime(PERIODO_MS * 2);
      expect(svc.altered()).toBe(false);
      expect(svc.blockedNotice()).toBeNull();
    });
  });

  describe('sin falsos positivos (FR-008)', () => {
    it('errores de red, validación y genéricos no alteran el estado en todo un recorrido', () => {
      const svc = crear();
      svc.start();
      svc.registerCanary(montarCanario());

      const errores: unknown[] = [
        new HttpErrorResponse({ status: 0 }),
        new HttpErrorResponse({ status: 401 }),
        new HttpErrorResponse({ status: 404 }),
        new HttpErrorResponse({ status: 409 }),
        new HttpErrorResponse({ status: 422 }),
        new HttpErrorResponse({ status: 500 }),
        new TypeError('x is undefined'),
        new Error('network'),
      ];
      for (const err of errores) {
        svc.reportDomError(err);
        vi.advanceTimersByTime(PERIODO_MS);
      }

      expect(svc.altered()).toBe(false);
      expect(svc.reasons()).toEqual([]);
    });
  });

  describe('recarga (FR-017)', () => {
    it('nunca recarga por sí solo, ni con la página alterada durante mucho tiempo', () => {
      const svc = crear();
      document.documentElement.classList.add('translated-ltr');
      svc.start();

      vi.advanceTimersByTime(PERIODO_MS * 200);

      expect(svc.altered()).toBe(true);
      expect(recargar).not.toHaveBeenCalled();
    });

    it('reload() —la acción de la persona— recarga la página una vez', async () => {
      const svc = crear();
      svc.start();

      await svc.reload();

      expect(recargar).toHaveBeenCalledTimes(1);
    });

    it('con una versión nueva ya descargada, la activa antes de recargar (spec 134, T046)', async () => {
      const orden: string[] = [];
      const versiones = new Subject<VersionEvent>();
      const activateUpdate = vi.fn(async () => {
        orden.push('activar');
        return true;
      });
      TestBed.resetTestingModule();
      recargar = vi.fn(() => orden.push('recargar'));
      TestBed.configureTestingModule({
        providers: [
          { provide: RELOAD_PAGE, useValue: recargar },
          {
            provide: SwUpdate,
            useValue: { isEnabled: true, versionUpdates: versiones, unrecoverable: new Subject(), checkForUpdate: vi.fn(async () => false), activateUpdate },
          },
        ],
      });
      const svc = TestBed.inject(PageIntegrityService);
      TestBed.inject(AppUpdateService).start();
      versiones.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } } as VersionEvent);

      await svc.reload();

      expect(orden).toEqual(['activar', 'recargar']);
    });

    it('si el Service Worker falla, "Recargar" igual recarga', async () => {
      TestBed.resetTestingModule();
      recargar = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          { provide: RELOAD_PAGE, useValue: recargar },
          { provide: AppUpdateService, useValue: { reloadNow: () => Promise.reject(new Error('sw roto')) } },
        ],
      });

      await TestBed.inject(PageIntegrityService).reload();

      expect(recargar).toHaveBeenCalledTimes(1);
    });
  });
});
