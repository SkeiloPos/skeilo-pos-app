import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DinerService, DinerSessionExpiredError } from '../../services/diner.service';
import { DinerTokenStore } from '../../services/diner-token.store';
import { DiningCartService } from '../../services/dining-cart.service';
import { DinerPaymentMethod } from '../../interfaces/diner.interface';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { CheckoutStepIndicatorComponent } from './checkout-step-indicator.component';
import { CheckoutProgressStore } from './checkout-progress.store';

/**
 * Paso 2 — elegir método de pago (spec 034, US2). Efectivo no tiene paso
 * siguiente: confirmar el método ya envía el pedido, igual que hacía
 * `reviewSelectMethod` en el modal retirado. Transferencia pasa al paso de
 * datos de pago + comprobante (`transfer-details-step`).
 */
@Component({
  selector: 'app-payment-method-step',
  standalone: true,
  imports: [IconComponent, CheckoutStepIndicatorComponent],
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col">
      <div class="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div class="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button (click)="back()" aria-label="Volver" class="p-1 -ml-1 text-gray-500 hover:text-indigo-600 transition-colors">
            <span class="w-5 h-5 block"><app-icon name="back" /></span>
          </button>
          <app-checkout-step-indicator [step]="2" [total]="3" label="Método de pago" />
          <button (click)="exit()" aria-label="Salir sin enviar" class="p-1 -mr-1 text-gray-400 hover:text-red-600 transition-colors">
            <span class="w-5 h-5 block"><app-icon name="close" /></span>
          </button>
        </div>
      </div>

      <div class="flex-1 max-w-lg w-full mx-auto px-4 py-6">
        <h1 class="text-lg font-bold text-gray-900 mb-4">¿Cómo vas a pagar?</h1>

        @if (error()) {
          <p class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{{ error() }}</p>
        }

        @if (methods().length === 0 && !error()) {
          <p class="text-sm text-gray-400 text-center py-8">Cargando métodos de pago…</p>
        } @else {
          <div class="space-y-2">
            @for (m of methods(); track m.id) {
              <button
                (click)="choose(m)"
                [disabled]="submitting()"
                class="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-40 transition-colors text-left"
              >
                <span class="w-5 h-5 shrink-0 text-emerald-600">
                  <app-icon [name]="m.is_cash ? 'cash' : 'transfer'" />
                </span>
                {{ m.name }}
              </button>
            }
          </div>
        }

        @if (submitting()) {
          <p class="text-xs text-gray-400 text-center mt-3">Enviando pedido…</p>
        }
      </div>
    </div>
  `,
})
export class PaymentMethodStepComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DinerService);
  private readonly tokenStore = inject(DinerTokenStore);
  private readonly cart = inject(DiningCartService);
  private readonly progress = inject(CheckoutProgressStore);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly methods = this.progress.paymentMethods;
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  async ngOnInit(): Promise<void> {
    if (this.methods().length > 0) return;
    try {
      this.progress.paymentMethods.set(await this.api.getPaymentMethods());
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudieron cargar los métodos de pago.'));
    }
  }

  /**
   * Elige el método. Se guarda **antes** de decidir el siguiente paso (T006):
   * `receipt_file_url` siempre se resetea aquí, así que volver y elegir un
   * método distinto nunca arrastra el comprobante del anterior (T015).
   */
  async choose(method: DinerPaymentMethod): Promise<void> {
    this.error.set(null);
    this.progress.write({
      step: method.is_cash ? 'method' : 'transfer',
      payment_method_id: method.id,
      receipt_file_url: null,
    });

    if (!method.is_cash) {
      this.router.navigate(['/menu/t', this.token, 'checkout', 'transfer']);
      return;
    }

    // Efectivo: nada más que hacer del lado del comensal — se envía ya mismo.
    this.submitting.set(true);
    try {
      const order = await this.api.submitCart(method.id);
      this.progress.clear();
      this.progress.activeOrder.set(order);
      this.cart.clear();
      this.router.navigate(['/menu/t', this.token, 'checkout', 'confirmation']);
    } catch (err) {
      if (err instanceof DinerSessionExpiredError) {
        this.tokenStore.clear();
        this.cart.clear();
        this.cart.clearDiner();
        this.router.navigate(['/menu/t', this.token]);
        return;
      }
      this.error.set(this.api.extractError(err, 'No se pudo enviar el pedido.'));
      // spec 128 (FR-007): si el rechazo quitó productos del carrito en el
      // servidor (categoría ya no visible en QR), se recarga para que la
      // pantalla de revisión ya los muestre fuera antes de reintentar --
      // `extractError` ya traduce el mensaje exacto del 409 ("Algunos
      // productos ya no están disponibles y se quitaron de tu carrito");
      // esto solo sincroniza el estado local con lo que el servidor hizo.
      await this.cart.load().catch(() => undefined);
    } finally {
      this.submitting.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/menu/t', this.token, 'checkout', 'review']);
  }

  /** Salir sin enviar (FR-004): no crea ningún pedido, el carrito no se toca. */
  exit(): void {
    this.router.navigate(['/menu/t', this.token]);
  }
}
