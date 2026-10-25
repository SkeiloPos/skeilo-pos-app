import { DOCUMENT, Injectable, inject } from '@angular/core';
import { PageIntegrityService } from '../integrity/page-integrity.service';

/** `<input>` cuyo `value` es texto escrito: un checkbox, un botón o un rango también traen `value`, pero no es lo que alguien está tecleando. */
const INPUT_NO_TEXTUAL = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
]);

interface Blocker {
  readonly name: string;
  readonly active: () => boolean;
}

/**
 * Decide si es un **momento seguro** para recargar la aplicación por una versión
 * nueva (spec 134, FR-019): recargar nunca debe perder un cobro en curso, un
 * modal abierto ni lo que alguien está escribiendo.
 *
 * Es seguro solo si se cumplen **todas** (M1–M6, research.md Decisión 6):
 *  - M1 la página no está alterada (el aviso tiene prioridad y se evita un bucle traducción↔recarga);
 *  - M2 ninguna escritura (POST/PUT/PATCH/DELETE) en vuelo;
 *  - M3 ningún overlay visible (`.fixed.inset-0`: modal, telón, cajón);
 *  - M4 ningún control Angular sucio (`.ng-dirty`);
 *  - M5 ningún campo de texto con foco y valor;
 *  - M6 ningún bloqueador registrado activo (lo que solo vive en memoria: el borrador de la Terminal).
 *
 * Es conservador: ante la duda (una lectura del DOM que falla, un predicado que
 * lanza) responde "no es seguro". Esperar siempre es barato; recargar a destiempo no.
 * Contrato: specs/134-bloqueo-traduccion-automatica/contracts/app-update.md.
 */
@Injectable({ providedIn: 'root' })
export class UpdateGateService {
  private readonly integrity = inject(PageIntegrityService);
  private readonly doc = inject(DOCUMENT);

  private inflightWrites = 0;
  /**
   * Clave interna única por registro: la Terminal y la orden manual usan instancias
   * distintas del mismo store y registran el mismo nombre; con el nombre como clave
   * una pisaría a la otra y retirar una liberaría a las dos.
   */
  private readonly blockers = new Map<symbol, Blocker>();

  beginRequest(): void {
    this.inflightWrites += 1;
  }

  endRequest(): void {
    this.inflightWrites = Math.max(0, this.inflightWrites - 1);
  }

  /** Registra un bloqueador; devuelve la función que lo retira (idempotente). */
  registerBlocker(name: string, active: () => boolean): () => void {
    const key = Symbol(name);
    this.blockers.set(key, { name, active });
    return () => {
      this.blockers.delete(key);
    };
  }

  isSafeMoment(): boolean {
    if (this.integrity.altered()) return false; // M1
    if (this.inflightWrites > 0) return false; // M2
    if (this.blockersActive()) return false; // M6
    return !this.domBlocks(); // M3–M5
  }

  private blockersActive(): boolean {
    for (const { active } of this.blockers.values()) {
      try {
        if (active()) return true;
      } catch {
        return true; // un predicado roto no puede dar luz verde
      }
    }
    return false;
  }

  /** M3–M5. Sin un documento utilizable no hay nada que leer; si leerlo falla, se espera. */
  private domBlocks(): boolean {
    const doc = this.doc;
    if (typeof doc?.querySelectorAll !== 'function') return false;
    try {
      const overlayVisible = Array.from(doc.querySelectorAll('.fixed.inset-0')).some(
        (el) => el.getClientRects().length > 0,
      ); // M3
      if (overlayVisible) return true;
      if (doc.querySelector('.ng-dirty') !== null) return true; // M4
      return this.hasFocusedTextWithValue(doc); // M5
    } catch {
      return true;
    }
  }

  private hasFocusedTextWithValue(doc: Document): boolean {
    const el = doc.activeElement;
    if (!el) return false;
    if (el instanceof HTMLInputElement) {
      return !INPUT_NO_TEXTUAL.has(el.type) && el.value !== '';
    }
    if (el instanceof HTMLTextAreaElement) return el.value !== '';
    if (el instanceof HTMLElement && this.isEditable(el)) return (el.textContent ?? '').trim() !== '';
    return false;
  }

  /** `isContentEditable` no existe en todos los entornos (jsdom no lo implementa): se mira también el atributo. */
  private isEditable(el: HTMLElement): boolean {
    if (el.isContentEditable === true) return true;
    const atributo = el.getAttribute('contenteditable');
    return atributo !== null && atributo !== 'false';
  }
}
