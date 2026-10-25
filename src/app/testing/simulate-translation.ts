/**
 * Traductor simulado para pruebas (spec 134, FR-021). **Solo para specs**: no se
 * importa desde código de producción.
 *
 * Reproduce el mecanismo medido en la reproducción del fallo, el mismo de
 * `specs/134-bloqueo-traduccion-automatica/tools/simulate-translation.js` pero para
 * jsdom: cada nodo de texto se envuelve en `<font><font>` y el original **queda
 * desconectado** de la página. Angular sigue escribiendo en ese nodo huérfano, así
 * que lo que se ve queda desfasado sin ningún error.
 *
 * Un traductor real sigue activo mientras la página vive y también traduce lo que se
 * agrega después. Una sola pasada no basta para reproducirlo: las ramas que Angular
 * crea tras cambiar de estado quedarían sin envolver y la prueba pasaría sin probar
 * nada. Por eso hay que llamar a `refresh()` después de cada `fixture.detectChanges()`:
 *
 *   const traduccion = simulateTranslation(fixture.nativeElement);
 *   componente.estado.set(...);
 *   fixture.detectChanges();
 *   traduccion.refresh();            // el traductor "ve" lo recién pintado
 *   expect(...).toBe(...);
 *   traduccion.revert();
 */
export interface SimulatedTranslation {
  /** Envuelve los nodos de texto que aún no lo están (lo recién pintado por Angular). */
  refresh(): void;
  /** Restaura los nodos originales (la traducción "revertida"). */
  revert(): void;
}

export function simulateTranslation(root: HTMLElement, tag = 'font'): SimulatedTranslation {
  const doc = root.ownerDocument;
  const swaps: Array<[HTMLElement, Text]> = [];
  /** Los envoltorios propios: sus textos ya están "traducidos" y no se envuelven otra vez. */
  const envoltorios = new WeakSet<Node>();

  function refresh(): void {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodos: Text[] = [];
    while (walker.nextNode()) nodos.push(walker.currentNode as Text);

    for (const nodo of nodos) {
      const padre = nodo.parentNode;
      if (!nodo.nodeValue?.trim() || !padre) continue;
      if (envoltorios.has(padre)) continue;
      if ((padre as Element).closest?.('script,style,noscript')) continue;

      const externo = doc.createElement(tag);
      const interno = doc.createElement(tag);
      envoltorios.add(externo);
      envoltorios.add(interno);
      interno.textContent = nodo.nodeValue;
      externo.appendChild(interno);
      nodo.replaceWith(externo);
      swaps.push([externo, nodo]);
    }
  }

  refresh();

  return {
    refresh,
    revert(): void {
      const deshacer = [...swaps];
      deshacer.reverse();
      for (const [envoltorio, original] of deshacer) {
        envoltorio.replaceWith(original);
      }
      swaps.length = 0;
    },
  };
}
