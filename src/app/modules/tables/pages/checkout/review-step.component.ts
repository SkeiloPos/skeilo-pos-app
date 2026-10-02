import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DiningCartService } from '../../services/dining-cart.service';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { CheckoutStepIndicatorComponent } from './checkout-step-indicator.component';
import { CheckoutOrderSummaryComponent } from './checkout-order-summary.component';

/**
 * Paso 1 — resumen del pedido (spec 034, US2, FR-001). Sustituye al primer
 * medio del modal retirado (`reviewStep() === 'method'` en la versión vieja,
 * que mezclaba resumen y selección de método en la misma pantalla): aquí solo
 * se revisa el carrito; elegir método vive en su propio paso.
 */
@Component({
  selector: 'app-review-step',
  standalone: true,
  imports: [IconComponent, CheckoutStepIndicatorComponent, CheckoutOrderSummaryComponent],
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col">
      <div class="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div class="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <span class="w-7"></span>
          <app-checkout-step-indicator [step]="1" [total]="3" label="Revisa tu pedido" />
          <button (click)="exit()" aria-label="Salir sin enviar" class="p-1 -mr-1 text-gray-400 hover:text-red-600 transition-colors">
            <span class="w-5 h-5 block"><app-icon name="close" /></span>
          </button>
        </div>
      </div>

      <div class="flex-1 max-w-lg w-full mx-auto px-4 py-6">
        <h1 class="text-lg font-bold text-gray-900 mb-4">Tu pedido</h1>

        <!-- spec 092 (FR-021, FR-022) — el resumen que vivía embebido aquí es
             ahora el componente compartido que este paso y el de datos de pago
             consumen, para que los dos no puedan divergir (RN-004). NO se le
             pasa collapsible: su default es false, así que este paso lo muestra
             siempre expandido, sin chevron y sin control de colapso.
             La fila "Ahorro" aparece cuando hay promoción vigente — cambio
             visible autorizado por el negocio el 2026-10-02 (A-103, D6). -->
        <app-checkout-order-summary
          [lines]="cart.lines()"
          [total]="cart.total()"
          [count]="cart.count()"
          [savings]="cart.savings()"
        />

        <button
          (click)="continue()"
          [disabled]="cart.isEmpty()"
          class="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          Elegir método de pago
        </button>
      </div>
    </div>
  `,
})
export class ReviewStepComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly cart = inject(DiningCartService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  continue(): void {
    if (this.cart.isEmpty()) return;
    this.router.navigate(['/menu/t', this.token, 'checkout', 'method']);
  }

  /** Salir sin enviar (FR-004): no crea ningún pedido, el carrito no se toca. */
  exit(): void {
    this.router.navigate(['/menu/t', this.token]);
  }
}
