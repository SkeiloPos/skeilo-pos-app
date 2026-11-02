import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DiningCartService } from '../../services/dining-cart.service';
import { soldOutMessage } from '../../../../core/availability/availability.util';

/**
 * spec 148 (US2, FR-018/FR-019): alerta compartida por los cuatro pasos de
 * pago del comensal (`payment-method`, `cash`, `transfer`, `review`) cuando
 * el carrito tiene alguna línea agotada. No cambia de paso por su cuenta
 * (FR-019): solo informa y ofrece volver al carrito a corregirlo — el bloqueo
 * de la acción de confirmar/enviar lo decide cada paso con
 * `cart.hasAffectedLines()`.
 *
 * Separada de `CheckoutOrderSummaryComponent` porque `payment-method-step` y
 * `cash-amount-step` no muestran el resumen del pedido (tasks.md, Notes #2).
 */
@Component({
  selector: 'app-sold-out-cart-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cart.hasAffectedLines()) {
      <div class="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4" role="alert">
        <p class="text-sm text-red-700 font-semibold">{{ message() }}</p>
        <button
          type="button"
          (click)="backToCart()"
          class="text-sm text-red-700 underline mt-1"
        >
          Volver al carrito
        </button>
      </div>
    }
  `,
})
export class SoldOutCartAlertComponent {
  readonly cart = inject(DiningCartService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  message(): string {
    return soldOutMessage([...this.cart.affectedLines().values()]);
  }

  backToCart(): void {
    this.router.navigate(['/menu/t', this.token], {
      queryParams: { carrito: 'abierto' },
    });
  }
}
