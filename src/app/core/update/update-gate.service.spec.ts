import { DOCUMENT, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageIntegrityService } from '../integrity/page-integrity.service';
import { UpdateGateService } from './update-gate.service';

/** Doble del servicio de integridad: solo lo que lee el momento seguro (M1). */
class FakeIntegrity {
  readonly altered = signal(false);
}

describe('UpdateGateService (spec 134, contracts/app-update.md)', () => {
  let gate: UpdateGateService;
  let integrity: FakeIntegrity;

  function crear(providers: unknown[] = []): UpdateGateService {
    TestBed.resetTestingModule();
    integrity = new FakeIntegrity();
    TestBed.configureTestingModule({
      providers: [{ provide: PageIntegrityService, useValue: integrity }, ...(providers as never[])],
    });
    return TestBed.inject(UpdateGateService);
  }

  /** Un overlay como los de la app: `.fixed.inset-0`, visible o no (jsdom no tiene layout). */
  function overlay(visible: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'fixed inset-0';
    el.getClientRects = () => (visible ? [{} as DOMRect] : []) as unknown as DOMRectList;
    document.body.appendChild(el);
    return el;
  }

  beforeEach(() => {
    document.body.replaceChildren();
    gate = crear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('en reposo (sin nada activo) es un momento seguro', () => {
    expect(gate.isSafeMoment()).toBe(true);
  });

  describe('M1 · página alterada', () => {
    it('con la página alterada no es seguro (el aviso tiene prioridad y se evita un bucle traducción↔recarga)', () => {
      integrity.altered.set(true);
      expect(gate.isSafeMoment()).toBe(false);

      integrity.altered.set(false);
      expect(gate.isSafeMoment()).toBe(true);
    });
  });

  describe('M2 · escrituras en vuelo', () => {
    it('una escritura en curso lo impide hasta que termina', () => {
      gate.beginRequest();
      expect(gate.isSafeMoment()).toBe(false);

      gate.endRequest();
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('cuenta varias a la vez: solo es seguro cuando terminaron todas', () => {
      gate.beginRequest();
      gate.beginRequest();
      gate.endRequest();
      expect(gate.isSafeMoment()).toBe(false);

      gate.endRequest();
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('un endRequest de más no deja el contador en negativo', () => {
      gate.endRequest();
      gate.beginRequest();
      expect(gate.isSafeMoment()).toBe(false);
    });
  });

  describe('M3 · overlay visible', () => {
    it('un .fixed.inset-0 visible (modal, telón, cajón) lo impide', () => {
      const modal = overlay(true);
      expect(gate.isSafeMoment()).toBe(false);

      modal.remove();
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('un .fixed.inset-0 oculto (sin caja de layout) no cuenta', () => {
      overlay(false);
      expect(gate.isSafeMoment()).toBe(true);
    });
  });

  describe('M4 · controles sucios', () => {
    it('un .ng-dirty en el documento (formulario con datos sin guardar) lo impide', () => {
      const campo = document.createElement('input');
      campo.className = 'ng-dirty';
      document.body.appendChild(campo);
      expect(gate.isSafeMoment()).toBe(false);

      campo.classList.remove('ng-dirty');
      expect(gate.isSafeMoment()).toBe(true);
    });
  });

  describe('M5 · campo de texto con foco y valor', () => {
    function enfocar<T extends HTMLElement>(el: T): T {
      document.body.appendChild(el);
      el.focus();
      expect(document.activeElement).toBe(el);
      return el;
    }

    it('un input de texto con foco y valor lo impide; sin valor, no', () => {
      const input = enfocar(document.createElement('input'));
      expect(gate.isSafeMoment()).toBe(true);

      input.value = 'Juan';
      expect(gate.isSafeMoment()).toBe(false);
    });

    it('un textarea con foco y valor lo impide', () => {
      const area = enfocar(document.createElement('textarea'));
      area.value = 'sin helado de fresa';
      expect(gate.isSafeMoment()).toBe(false);
    });

    it('un elemento contenteditable con foco y texto lo impide', () => {
      const div = document.createElement('div');
      div.setAttribute('contenteditable', 'true');
      div.tabIndex = 0;
      div.textContent = 'nota a medias';
      enfocar(div);
      expect(gate.isSafeMoment()).toBe(false);
    });

    it('un checkbox o un botón con foco no cuentan (su `value` no es texto escrito)', () => {
      const check = enfocar(document.createElement('input'));
      check.type = 'checkbox';
      expect(gate.isSafeMoment()).toBe(true);

      const boton = enfocar(document.createElement('button'));
      boton.textContent = 'Agregar';
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('un input con valor que NO tiene el foco no impide nada', () => {
      const input = document.createElement('input');
      input.value = 'Juan';
      document.body.appendChild(input);
      expect(gate.isSafeMoment()).toBe(true);
    });
  });

  describe('M6 · bloqueadores registrados', () => {
    it('un bloqueador activo lo impide y el "retirar" devuelto lo quita', () => {
      let hayBorrador = true;
      const retirar = gate.registerBlocker('pos-terminal-draft', () => hayBorrador);
      expect(gate.isSafeMoment()).toBe(false);

      hayBorrador = false;
      expect(gate.isSafeMoment()).toBe(true); // el predicado se evalúa en cada consulta

      hayBorrador = true;
      expect(gate.isSafeMoment()).toBe(false);
      retirar();
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('dos registros con el mismo nombre coexisten y retirar uno no quita el otro', () => {
      // La Terminal y la orden manual usan instancias distintas del store.
      const retirarTerminal = gate.registerBlocker('pos-terminal-draft', () => true);
      const retirarManual = gate.registerBlocker('pos-terminal-draft', () => true);
      expect(gate.isSafeMoment()).toBe(false);

      retirarTerminal();
      expect(gate.isSafeMoment()).toBe(false); // sigue el de la orden manual

      retirarManual();
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('retirar dos veces es inocuo', () => {
      const retirar = gate.registerBlocker('x', () => true);
      const otro = gate.registerBlocker('y', () => true);
      retirar();
      retirar();
      expect(gate.isSafeMoment()).toBe(false);
      otro();
      expect(gate.isSafeMoment()).toBe(true);
    });

    it('un predicado que lanza se toma como "no es seguro" (ante la duda, espera)', () => {
      gate.registerBlocker('roto', () => {
        throw new Error('boom');
      });
      expect(() => gate.isSafeMoment()).not.toThrow();
      expect(gate.isSafeMoment()).toBe(false);
    });
  });

  describe('robustez del acceso al DOM', () => {
    it('si leer el DOM lanza, no lanza hacia fuera y se toma como "no es seguro"', () => {
      vi.spyOn(document, 'querySelector').mockImplementation(() => {
        throw new Error('dom roto');
      });
      expect(() => gate.isSafeMoment()).not.toThrow();
      expect(gate.isSafeMoment()).toBe(false);
    });

    it('sin un documento utilizable no lanza: las condiciones del DOM se omiten, las internas siguen', () => {
      const sinDom = crear([{ provide: DOCUMENT, useValue: {} }]);
      expect(() => sinDom.isSafeMoment()).not.toThrow();
      expect(sinDom.isSafeMoment()).toBe(true);

      sinDom.beginRequest();
      expect(sinDom.isSafeMoment()).toBe(false);
    });
  });
});
