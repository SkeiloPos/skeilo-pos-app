import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DinerService } from '../../services/diner.service';
import { DiningCartService } from '../../services/dining-cart.service';
import { DiningOrder } from '../../interfaces/dining.interface';
import { orderStatusClass, orderStatusLabel } from '../../../orders/order-status.util';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { CheckoutProgressStore } from './checkout-progress.store';

/**
 * Paso 4 — confirmación del pedido ya creado (spec 034, FR-008). Solo se
 * llega aquí con un pedido que **ya existe**: `checkoutHydrationGuard` es
 * quien decide entrar acá en vez de a la revisión.
 *
 * `checkoutHydrationGuard` aterriza aquí en dos casos muy distintos que esta
 * vista debe distinguir (bug reportado: el segundo caso se veía idéntico al
 * primero, como si el pedido nuevo se hubiera enviado):
 * 1. El comensal de verdad acaba de enviar este pedido (o perdió la
 *    respuesta) — su carrito ya quedó vacío (`submit_cart` lo borra). Se
 *    muestra el "¡Pedido enviado!" de siempre.
 *  2. El comensal ya tenía un pedido sin confirmar y agregó productos nuevos
 *    al carrito antes de volver a "Enviar pedido" — el backend nunca llegó a
 *    intentar crear ese segundo pedido (`cart/service.py` rechaza una
 *    segunda orden activa por comensal, spec 024 FR-005); el carrito sigue
 *    con esos productos. Se muestra una advertencia en su lugar, sin tocar
 *    el carrito, para que el comensal entienda por qué no se envió.
 */
@Component({
  selector: 'app-confirmation-step',
  standalone: true,
  imports: [IconComponent, MoneyPipe],
  template: `
    <div class="min-h-screen flex flex-col items-center justify-center px-4 py-10 text-center" style="background:#F4F6F9">
      @if (order(); as o) {
        <div class="w-full max-w-sm flex flex-col items-center gap-5">
          @if (cart.isEmpty()) {
            <!-- spec 130 (rediseño) — un pago mixto siempre llega aquí con la
                 porción por transferencia todavía por verificar, así que el
                 pedido NO está "enviado" sin más: está "recibido" y pendiente
                 de verificación. spec 132 (A-144, FR-023): la verificación es
                 en persona del cajero al entregar el pedido, no de un archivo
                 subido -- el copy ya no habla de "comprobante recibido". -->
            @if (o.current_payment_attempt?.cash_amount != null) {
              <span class="w-16 h-16 rounded-full bg-amber-50 text-amber-500 grid place-items-center"><span class="w-8 h-8 block"><app-icon name="clock" /></span></span>
              <div class="flex flex-col gap-1.5">
                <h1 class="font-sora text-2xl font-semibold text-gray-900 tracking-tight">Pedido recibido.</h1>
                <p class="text-gray-500">Muestra tu comprobante de transferencia al cajero cuando recibas tu pedido.</p>
              </div>
            } @else {
              <span class="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center"><span class="w-8 h-8 block"><app-icon name="check-circle" /></span></span>
              <div class="flex flex-col gap-1.5">
                <h1 class="font-sora text-2xl font-semibold text-gray-900 tracking-tight">¡Pedido enviado!</h1>
                <p class="text-gray-500">El personal lo atenderá pronto.</p>
              </div>
            }
          } @else {
            <span class="w-16 h-16 rounded-full bg-amber-50 text-amber-500 grid place-items-center"><span class="w-8 h-8 block"><app-icon name="alert-circle" /></span></span>
            <div class="flex flex-col gap-1.5">
              <h1 class="font-sora text-2xl font-semibold text-gray-900 tracking-tight">Todavía no se pudo enviar</h1>
              <p class="text-gray-500">
                Tienes una cuenta pendiente por verificar — no se puede completar el pedido nuevo hasta
                que el personal confirme el pago de este. Lo que agregaste sigue guardado en tu
                carrito.
              </p>
            </div>
          }

          <section aria-label="Estado del pedido" class="w-full bg-white rounded-2xl border border-gray-200 p-5 text-left flex flex-col gap-3">
            @if (o.current_payment_attempt?.cash_amount != null) {
              <!-- spec 130 (rediseño) — pago mixto: una sola tarjeta con el
                   desglose completo, en vez de dos avisos sueltos. Mismo
                   patrón que design/Bienvenida QR.dc.html (doneTrBadge /
                   doneMethod / doneTrCopy / doneCash / doneNequi / doneTotal). -->
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  Pago en verificación
                </span>
                <span class="text-sm text-gray-400">Efectivo + Transferencia</span>
              </div>
              <p class="text-sm text-gray-600 leading-relaxed">
                Al recibir tu pedido, muestra el comprobante de la transferencia al cajero. El
                efectivo lo pagas al recibirlo.
              </p>
              <div class="border-t border-gray-200 pt-3 flex flex-col gap-1.5 text-sm">
                <div class="flex justify-between items-baseline">
                  <span class="text-gray-500">Efectivo al recibir</span>
                  <span class="font-semibold text-gray-900 tabular-nums">{{
                    o.current_payment_attempt!.cash_amount! | money
                  }}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-gray-500">Transferencia</span>
                  <span class="font-semibold text-gray-900 tabular-nums">{{
                    o.current_payment_attempt!.transfer_amount! | money
                  }}</span>
                </div>
              </div>
              <div class="border-t border-gray-200 pt-3 flex justify-between items-baseline">
                <span class="text-gray-500">Total</span>
                <span class="font-sora text-lg font-bold text-gray-900 tabular-nums">{{
                  mixedTotal(o) | money
                }}</span>
              </div>
            } @else {
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs font-semibold px-2.5 py-1 rounded-full" [class]="orderStatusClass(o.status)">
                  {{ orderStatusLabel(o.status) }}
                </span>
                @if (o.current_payment_attempt?.payment_method_name) {
                  <span class="text-sm text-gray-400">{{ o.current_payment_attempt!.payment_method_name }}</span>
                }
              </div>
              @if (o.current_payment_attempt?.is_cash) {
                <p class="flex items-center gap-2 text-sm text-amber-700">
                  <span class="w-4 h-4 block shrink-0"><app-icon name="wallet" /></span>
                  Te llevaremos tu pedido a la mesa. Paga al recibirlo.
                </p>
              } @else if (o.current_payment_attempt) {
                <!-- spec 132 (A-144, FR-023): ya no depende de
                     receipt_file_url -- ese campo ahora solo lo adjunta el
                     cajero (opcional, al aprobar), nunca el comensal, así que
                     para su propia vista casi siempre llega en null. -->
                <p class="flex items-center gap-2 text-sm text-amber-700">
                  <span class="w-4 h-4 block shrink-0"><app-icon name="clock" /></span>
                  Muestra el comprobante de tu banco al cajero cuando recibas tu pedido.
                </p>
              }
            }
          </section>

          <button
            (click)="goToMenu()"
            class="w-full h-14 bg-violet-700 hover:bg-violet-800 text-white font-semibold rounded-2xl transition-colors"
          >
            Volver al menú
          </button>
        </div>
      } @else {
        <p class="text-gray-400">Buscando tu pedido…</p>
      }
    </div>
  `,
})
export class ConfirmationStepComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DinerService);
  private readonly progress = inject(CheckoutProgressStore);
  readonly cart = inject(DiningCartService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly order = signal<DiningOrder | null>(null);

  async ngOnInit(): Promise<void> {
    const fromGuard = this.progress.activeOrder();
    if (fromGuard) {
      this.order.set(fromGuard);
      return;
    }
    // Entrada directa a esta ruta sin pasar por el guard (recarga exacta en
    // esta URL): se resuelve el mismo pedido por su cuenta.
    try {
      const orders = await this.api.myOrders();
      const latest = orders.find((o) => o.status !== 'cancelada') ?? orders[0] ?? null;
      this.order.set(latest);
      if (!latest) this.router.navigate(['/menu/t', this.token]);
    } catch {
      this.router.navigate(['/menu/t', this.token]);
    }
  }

  goToMenu(): void {
    this.progress.activeOrder.set(null);
    this.router.navigate(['/menu/t', this.token]);
  }

  orderStatusLabel(status: string): string {
    return orderStatusLabel(status as DiningOrder['status']);
  }

  orderStatusClass(status: string): string {
    return orderStatusClass(status as DiningOrder['status']);
  }

  /** Total de un pago mixto — la suma que el comensal ya vio en el paso de
   *  transferencia (spec 130), reconstruida aquí a partir del desglose que
   *  trae `current_payment_attempt` porque esta vista no tiene el carrito. */
  mixedTotal(order: DiningOrder): number {
    const pa = order.current_payment_attempt;
    return (pa?.cash_amount ?? 0) + (pa?.transfer_amount ?? 0);
  }
}
