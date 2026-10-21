import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { DinerService, DinerSessionExpiredError } from '../../services/diner.service';
import { DinerTokenStore } from '../../services/diner-token.store';
import { DiningCartService } from '../../services/dining-cart.service';
import { CheckoutProgressStore } from './checkout-progress.store';

/** Pedidos que todavía no llegaron a un estado final (mismo criterio que
 *  `_NON_TERMINAL_ORDER_STATUSES` en `cart/service.py:63`). */
const NON_TERMINAL_STATUSES = new Set(['recibida', 'abierta', 'bloqueada']);

/**
 * Se ejecuta una sola vez por entrada a `menu/t/:token/checkout/**` (Angular
 * reutiliza la ruta padre entre pasos hermanos, así que no se repite al
 * navegar de un paso a otro) — resuelve **dónde** debe aterrizar el comensal
 * (FR-005 a FR-010):
 *
 * 1. Sin sesión o QR inválido → de vuelta al menú.
 * 2. Ya existe un pedido no terminal (creado por un envío ya confirmado por
 *    el comensal, aunque la respuesta se perdiera) → confirmación (FR-008).
 * 3. Método (y, si aplica, comprobante) ya elegidos, sin pedido todavía →
 *    aterriza en su paso — el propio paso de transferencia hidrata la vista
 *    previa del comprobante ya subido sin pedirlo de nuevo (FR-006), pero el
 *    envío en sí solo ocurre si el comensal presiona "Enviar pedido" ahí; el
 *    método se valida contra el catálogo vigente (FR-005/FR-010).
 * 4. Nada guardado → revisión, desde cero.
 */
export const checkoutHydrationGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const api = inject(DinerService);
  const tokenStore = inject(DinerTokenStore);
  const cart = inject(DiningCartService);
  const progress = inject(CheckoutProgressStore);

  const token = route.paramMap.get('token') ?? '';
  const toMenu = () => router.createUrlTree(['/menu/t', token]);
  const toStep = (step: 'review' | 'method' | 'cash' | 'transfer' | 'confirmation') =>
    router.createUrlTree(['/menu/t', token, 'checkout', step]);

  if (!token) return toMenu();

  try {
    const { categories } = await api.resolveByToken(token);
    cart.indexMenu(categories);
  } catch {
    return toMenu();
  }

  if (!tokenStore.token()) return toMenu();

  try {
    await cart.load();
  } catch (err) {
    if (err instanceof DinerSessionExpiredError) {
      cart.clear();
      cart.clearDiner();
    }
    return toMenu();
  }

  const orders = await api.myOrders().catch(() => []);
  const activeOrder = orders.find((o) => NON_TERMINAL_STATUSES.has(o.status));
  if (activeOrder) {
    progress.activeOrder.set(activeOrder);
    progress.clear();
    return requestedStep(state) === 'confirmation' ? true : toStep('confirmation');
  }

  if (cart.isEmpty()) return toMenu();

  const record = progress.read();
  let canonical: 'review' | 'method' | 'cash' | 'transfer' = 'review';

  if (record?.payment_method_id) {
    try {
      progress.paymentMethods.set(await api.getPaymentMethods());
    } catch {
      /* el paso correspondiente reintenta la carga */
    }
    const stillActive = progress.paymentMethods().some((m) => m.id === record.payment_method_id);
    if (!stillActive) {
      progress.clearMethod();
      canonical = 'method';
    } else if (record.step === 'transfer') {
      canonical = 'transfer';
    } else if (record.step === 'cash') {
      // Spec 130: el paso del monto en efectivo de "Pago mixto" se recupera
      // igual que el de transferencia — no vuelve a "method".
      canonical = 'cash';
    } else {
      canonical = 'method';
    }
  }

  return requestedStep(state) === canonical ? true : toStep(canonical);
};

/** Último segmento de la URL destino (sin query ni fragmento). */
function requestedStep(state: { url: string }): string {
  return state.url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
}
