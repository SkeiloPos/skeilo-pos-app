/**
 * Señales con las que se detecta que el navegador (o una extensión) alteró el
 * contenido de la página -- traducción automática, sobre todo (spec 134).
 *
 * Son funciones puras que leen el documento y devuelven un booleano. Ninguna es
 * "algo cambió en el DOM": cada una comprueba una marca o un mecanismo concreto,
 * porque un aviso con falsos positivos (gestores de contraseñas, correctores,
 * bloqueadores) haría que la gente deje de creerle (FR-008).
 *
 * Contrato: specs/134-bloqueo-traduccion-automatica/contracts/page-integrity.md.
 */

export type IntegritySignalId =
  | 'html-class' // S1
  | 'html-lang' // S2
  | 'font-wrapper' // S3
  | 'ms-translator-attr' // S4
  | 'canary' // S5
  | 'dom-error'; // S6

/**
 * Texto del canario: un nodo que la propia app escribe una sola vez en un
 * elemento oculto. Nadie más lo toca, así que si deja de estar donde lo puso
 * (o cambia), alguien reescribió el contenido de la página.
 */
export const CANARY_TEXT = 'Contenido de la aplicación';

export interface Canary {
  readonly el: HTMLElement;
  /** El nodo de texto que la app escribió, no una copia. */
  readonly textNode: Text;
}

/** S1 · Google Translate / Chrome marcan `<html>` con `translated-ltr` o `translated-rtl`. */
export function isHtmlClassAltered(doc: Document): boolean {
  const clases = doc.documentElement.classList;
  return clases.contains('translated-ltr') || clases.contains('translated-rtl');
}

/**
 * S2 · el idioma declarado dejó de ser español. Un `lang` ausente o vacío no
 * cuenta: ningún traductor deja el atributo vacío (escribe el idioma destino),
 * y un documento sin declarar -- como el de las pruebas -- no está "alterado".
 */
export function isHtmlLangAltered(doc: Document): boolean {
  const lang = doc.documentElement.lang;
  return lang !== '' && !/^es(-|$)/i.test(lang);
}

/** S3 · los traductores de Google envuelven cada texto en `<font>`; la app no usa `<font>`. */
export function hasFontWrapper(doc: Document): boolean {
  return doc.getElementsByTagName('font').length > 0;
}

/** S4 · Microsoft Translator (Edge) marca los nodos con `_msttexthash` / `_msthash`. */
export function hasMsTranslatorAttr(doc: Document): boolean {
  return doc.querySelector('[_msttexthash],[_msthash]') !== null;
}

/** El nodo de texto del canario dentro de `el`, o `null` si no está. */
export function findCanaryText(el: HTMLElement): Text | null {
  for (const hijo of Array.from(el.childNodes)) {
    if (hijo.nodeType === 3 && hijo.nodeValue === CANARY_TEXT) return hijo as Text;
  }
  return null;
}

/**
 * S5 · el canario ya no es lo que la app escribió: su nodo de texto se
 * desconectó o cambió, o el elemento salió del documento. Sin canario
 * registrado no hay nada que comparar (todavía).
 */
export function isCanaryBroken(canary: Canary | null): boolean {
  if (!canary) return false;
  const { el, textNode } = canary;
  if (!el.isConnected) return true;
  return !(
    textNode.isConnected &&
    textNode.parentNode === el &&
    textNode.nodeValue === CANARY_TEXT
  );
}

/**
 * S6 · error de DOM atribuible: Angular intentó quitar o insertar un nodo cuyo
 * padre cambió por fuera. Se acota por tipo y operación para que ningún error de
 * red, validación o `4xx/5xx` lo dispare (FR-008).
 */
export function isDomErrorSignal(err: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    err instanceof DOMException &&
    err.name === 'NotFoundError' &&
    /removeChild|insertBefore/.test(err.message)
  );
}

/**
 * Evalúa S1–S5 sobre el documento. S6 no entra: llega por el `ErrorHandler`, no
 * se lee del DOM. Nunca lanza: si una lectura falla, esa señal se da por apagada
 * y las demás se evalúan igual.
 */
export function evaluateSignals(doc: Document, canary: Canary | null): IntegritySignalId[] {
  const activas: IntegritySignalId[] = [];
  const comprobar = (id: IntegritySignalId, fn: () => boolean): void => {
    try {
      if (fn()) activas.push(id);
    } catch {
      // Lectura imposible: sin evidencia no hay aviso.
    }
  };
  comprobar('html-class', () => isHtmlClassAltered(doc));
  comprobar('html-lang', () => isHtmlLangAltered(doc));
  comprobar('font-wrapper', () => hasFontWrapper(doc));
  comprobar('ms-translator-attr', () => hasMsTranslatorAttr(doc));
  comprobar('canary', () => isCanaryBroken(canary));
  return activas;
}
