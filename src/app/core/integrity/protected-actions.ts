import { environment } from '../../../environments/environment';

/**
 * Acción que no debe ejecutarse mientras la página esté alterada por el
 * navegador (spec 134, FR-012): crea un pedido, cobra, confirma o aprueba un
 * pago, o registra un movimiento de dinero de caja.
 *
 * Se enumera **por endpoint, no por botón**, para que ninguna superficie se quede
 * sin proteger -- en particular "Pagos por confirmar" del cajero, la que las specs
 * de cobro suelen olvidar. Lista y razones de lo que quedó fuera:
 * specs/134-bloqueo-traduccion-automatica/contracts/protected-actions.md.
 */
export interface ProtectedAction {
  /** Identificador estable (`QR-1`, `P-3`…): lo usan las pruebas y el contrato. */
  readonly id: string;
  readonly method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Ruta **relativa a `environment.apiBaseUrl`**, sin query y anclada (`^…$`). */
  readonly path: RegExp;
  /** Frase corta en infinitivo para el aviso: "No se pudo {label}…". */
  readonly label: string;
}

export const PROTECTED_ACTIONS: readonly ProtectedAction[] = [
  // ── Menú QR del comensal ───────────────────────────────────────────────
  { id: 'QR-1', method: 'POST', path: /^\/cart\/submit$/, label: 'enviar el pedido' },
  {
    id: 'QR-2',
    method: 'POST',
    path: /^\/cart\/orders\/[^/]+\/payment-attempts$/,
    label: 'pagar el pedido',
  },

  // ── Panel del personal ─────────────────────────────────────────────────
  // Cada ruta se cotejó con su llamador real (dining-session.service,
  // table-session.service, sales.service, cash.service).
  { id: 'P-1', method: 'POST', path: /^\/orders$/, label: 'crear el pedido' },
  {
    id: 'P-2',
    method: 'POST',
    path: /^\/orders\/[^/]+\/items$/,
    label: 'agregar productos al pedido',
  },
  {
    id: 'P-3',
    method: 'POST',
    path: /^\/orders\/[^/]+\/checkout-and-send$/,
    label: 'cobrar el pedido',
  },
  {
    id: 'P-4',
    method: 'POST',
    path: /^\/orders\/[^/]+\/complementary-payment$/,
    label: 'cobrar el saldo pendiente',
  },
  // "Pagos por confirmar" (revisión del pago QR por el cajero): P-5 a P-7.
  {
    id: 'P-5',
    method: 'POST',
    path: /^\/orders\/payment-attempts\/[^/]+\/approve$/,
    label: 'aprobar el pago',
  },
  {
    id: 'P-6',
    method: 'POST',
    path: /^\/orders\/payment-attempts\/[^/]+\/confirm-cash$/,
    label: 'confirmar el pago en efectivo',
  },
  {
    id: 'P-7',
    method: 'POST',
    path: /^\/orders\/payment-attempts\/[^/]+\/adjust-split$/,
    label: 'reajustar el pago',
  },
  {
    id: 'P-8',
    method: 'POST',
    path: /^\/table-sessions\/[^/]+\/close$/,
    label: 'cobrar y cerrar la cuenta de la mesa',
  },
  { id: 'P-9', method: 'POST', path: /^\/sales$/, label: 'cobrar la venta' },
  { id: 'P-10', method: 'POST', path: /^\/cash\/shifts\/open$/, label: 'abrir el turno de caja' },
  {
    id: 'P-11',
    method: 'POST',
    path: /^\/cash\/shifts\/[^/]+\/movements$/,
    label: 'registrar el movimiento de caja',
  },
  {
    id: 'P-12',
    method: 'POST',
    path: /^\/cash\/shifts\/[^/]+\/close$/,
    label: 'cerrar el turno de caja',
  },
];

/**
 * La acción protegida que corresponde a una petición, o `undefined`. Compara el
 * método y la ruta **sin query ni fragmento**, relativa a `environment.apiBaseUrl`;
 * una URL ajena al backend propio nunca coincide.
 */
export function findProtectedAction(method: string, url: string): ProtectedAction | undefined {
  if (!url.startsWith(environment.apiBaseUrl)) return undefined;
  const ruta = url.slice(environment.apiBaseUrl.length).split(/[?#]/, 1)[0];
  const metodo = method.toUpperCase();
  return PROTECTED_ACTIONS.find((a) => a.method === metodo && a.path.test(ruta));
}
