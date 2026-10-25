import { HttpErrorResponse } from '@angular/common/http';
import {
  CANARY_TEXT,
  Canary,
  evaluateSignals,
  findCanaryText,
  hasFontWrapper,
  hasMsTranslatorAttr,
  isCanaryBroken,
  isDomErrorSignal,
  isHtmlClassAltered,
  isHtmlLangAltered,
} from './integrity-signals';

/** Deja `<html>` y `<body>` como los declara `index.html` (español, sin marcas). */
function limpiarDocumento(): void {
  document.documentElement.className = '';
  document.documentElement.lang = 'es';
  document.documentElement.removeAttribute('translate');
  document.body.replaceChildren();
}

/** Canario íntegro montado en el documento, como lo deja el banner. */
function montarCanario(): Canary {
  const el = document.createElement('span');
  el.setAttribute('data-integrity-canary', '');
  el.textContent = CANARY_TEXT;
  document.body.appendChild(el);
  return { el, textNode: el.firstChild as Text };
}

describe('integrity-signals (spec 134, contracts/page-integrity.md)', () => {
  beforeEach(limpiarDocumento);
  afterEach(limpiarDocumento);

  describe('S1 · clase de traductor en <html>', () => {
    it('dispara con translated-ltr y con translated-rtl', () => {
      document.documentElement.classList.add('translated-ltr');
      expect(isHtmlClassAltered(document)).toBe(true);

      document.documentElement.className = '';
      document.documentElement.classList.add('translated-rtl');
      expect(isHtmlClassAltered(document)).toBe(true);
    });

    it('no dispara con cualquier otra clase (notranslate, dark, una extensión)', () => {
      document.documentElement.classList.add('notranslate', 'dark', 'ext-algo-nuevo');
      expect(isHtmlClassAltered(document)).toBe(false);
    });
  });

  describe('S2 · idioma declarado', () => {
    it('dispara con lang="en" y con cualquier idioma distinto de español', () => {
      for (const lang of ['en', 'en-US', 'fr', 'pt-BR']) {
        document.documentElement.lang = lang;
        expect(isHtmlLangAltered(document), lang).toBe(true);
      }
    });

    it('no dispara con es, es-CO ni ES', () => {
      for (const lang of ['es', 'es-CO', 'ES', 'es-419']) {
        document.documentElement.lang = lang;
        expect(isHtmlLangAltered(document), lang).toBe(false);
      }
    });

    it('un idioma que solo empieza por "es" (p. ej. "est") sí dispara', () => {
      document.documentElement.lang = 'est';
      expect(isHtmlLangAltered(document)).toBe(true);
    });

    it('sin idioma declarado no dispara: ningún traductor deja el atributo vacío', () => {
      document.documentElement.removeAttribute('lang');
      expect(isHtmlLangAltered(document)).toBe(false);
    });
  });

  describe('S3 · envoltorio <font>', () => {
    it('un <font> en cualquier parte del documento dispara', () => {
      expect(hasFontWrapper(document)).toBe(false);
      const font = document.createElement('font');
      const div = document.createElement('div');
      div.appendChild(font);
      document.body.appendChild(div);
      expect(hasFontWrapper(document)).toBe(true);
    });

    it('otros envoltorios (span, b) no disparan', () => {
      document.body.innerHTML = '<span><b>texto</b></span>';
      expect(hasFontWrapper(document)).toBe(false);
    });
  });

  describe('S4 · atributos de Microsoft Translator', () => {
    it('_msttexthash o _msthash disparan', () => {
      document.body.innerHTML = '<p _msttexthash="123">hola</p>';
      expect(hasMsTranslatorAttr(document)).toBe(true);

      document.body.innerHTML = '<p _msthash="456">hola</p>';
      expect(hasMsTranslatorAttr(document)).toBe(true);
    });

    it('atributos ajenos (data-*, aria-*, class) no disparan', () => {
      document.body.innerHTML = '<p data-msttexthash="1" aria-label="x" class="msthash">hola</p>';
      expect(hasMsTranslatorAttr(document)).toBe(false);
    });
  });

  describe('S5 · canario estructural', () => {
    it('sin canario registrado no dispara (todavía no hay nada que comparar)', () => {
      expect(isCanaryBroken(null)).toBe(false);
    });

    it('el canario íntegro no dispara', () => {
      expect(isCanaryBroken(montarCanario())).toBe(false);
    });

    it('un traductor que reemplaza el nodo de texto por un envoltorio lo rompe', () => {
      const canary = montarCanario();
      const envoltorio = document.createElement('span');
      envoltorio.textContent = canary.textNode.nodeValue;
      canary.el.replaceChild(envoltorio, canary.textNode);

      expect(canary.textNode.isConnected).toBe(false);
      expect(isCanaryBroken(canary)).toBe(true);
    });

    it('si cambia el texto del nodo, se rompe', () => {
      const canary = montarCanario();
      canary.textNode.nodeValue = 'Application content';
      expect(isCanaryBroken(canary)).toBe(true);
    });

    it('si el elemento se desconecta del documento, se rompe', () => {
      const canary = montarCanario();
      canary.el.remove();
      expect(isCanaryBroken(canary)).toBe(true);
    });

    it('findCanaryText devuelve el nodo con el texto del canario, o null si no está', () => {
      const canary = montarCanario();
      expect(findCanaryText(canary.el)).toBe(canary.textNode);

      const vacio = document.createElement('span');
      expect(findCanaryText(vacio)).toBeNull();
      const otro = document.createElement('span');
      otro.textContent = 'otro texto';
      expect(findCanaryText(otro)).toBeNull();
    });
  });

  describe('S6 · error de DOM atribuible', () => {
    it('NotFoundError de removeChild o insertBefore dispara', () => {
      expect(
        isDomErrorSignal(
          new DOMException("Failed to execute 'removeChild' on 'Node': not a child", 'NotFoundError'),
        ),
      ).toBe(true);
      expect(
        isDomErrorSignal(
          new DOMException("Failed to execute 'insertBefore' on 'Node': not a child", 'NotFoundError'),
        ),
      ).toBe(true);
    });

    it('un NotFoundError de otra operación no dispara', () => {
      expect(
        isDomErrorSignal(new DOMException("Failed to execute 'replaceChild' on 'Node'", 'NotFoundError')),
      ).toBe(false);
    });

    it('un DOMException de otro nombre no dispara aunque mencione removeChild', () => {
      expect(
        isDomErrorSignal(new DOMException("Failed to execute 'removeChild' on 'Node'", 'HierarchyRequestError')),
      ).toBe(false);
    });

    it('errores de red, validación y genéricos nunca disparan (FR-008)', () => {
      const errores: unknown[] = [
        new TypeError("Cannot read properties of undefined (reading 'removeChild')"),
        new HttpErrorResponse({ status: 0 }),
        new HttpErrorResponse({ status: 401 }),
        new HttpErrorResponse({ status: 404 }),
        new HttpErrorResponse({ status: 409 }),
        new HttpErrorResponse({ status: 500 }),
        new Error('network'),
        'removeChild',
        null,
        undefined,
      ];
      for (const err of errores) {
        expect(isDomErrorSignal(err), String(err)).toBe(false);
      }
    });
  });

  describe('evaluateSignals (S1–S5)', () => {
    it('documento limpio y canario íntegro: ninguna señal', () => {
      expect(evaluateSignals(document, montarCanario())).toEqual([]);
    });

    it('devuelve el id de cada señal activa', () => {
      document.documentElement.classList.add('translated-ltr');
      document.documentElement.lang = 'en';
      document.body.innerHTML = '<font>x</font><p _msttexthash="1">y</p>';
      const canary = montarCanario();
      canary.textNode.nodeValue = 'otro';

      expect(evaluateSignals(document, canary).sort()).toEqual(
        ['canary', 'font-wrapper', 'html-class', 'html-lang', 'ms-translator-attr'].sort(),
      );
    });

    it('nunca lanza: si una lectura del DOM falla, el resto se evalúa igual', () => {
      document.documentElement.classList.add('translated-ltr');
      const doc = {
        documentElement: document.documentElement,
        getElementsByTagName: () => {
          throw new Error('boom');
        },
        querySelector: () => null,
      } as unknown as Document;

      expect(evaluateSignals(doc, null)).toEqual(['html-class']);
    });
  });
});
