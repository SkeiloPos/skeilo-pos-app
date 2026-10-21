import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DinerService } from '../../services/diner.service';
import { DiningCartService } from '../../services/dining-cart.service';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { CheckoutStepIndicatorComponent } from './checkout-step-indicator.component';
import { CheckoutProgressStore } from './checkout-progress.store';

/**
 * Paso del monto en efectivo de un "Pago mixto" (spec 130, FR-005/FR-006),
 * entre "¿Cómo vas a pagar?" (`payment-method-step`) y los datos de
 * transferencia (`transfer-details-step`). Solo se llega aquí al elegir
 * "Pago mixto" — efectivo y transferencia puros no pasan por este paso.
 */
@Component({
  selector: 'app-cash-amount-step',
  standalone: true,
  imports: [IconComponent, MoneyPipe, CheckoutStepIndicatorComponent],
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col">
      <div class="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div class="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button (click)="back()" aria-label="Volver" class="p-1 -ml-1 text-gray-500 hover:text-violet-600 transition-colors">
            <span class="w-5 h-5 block"><app-icon name="back" /></span>
          </button>
          <app-checkout-step-indicator [step]="2" [total]="3" label="Pago mixto" />
          <button (click)="exit()" aria-label="Salir sin enviar" class="p-1 -mr-1 text-gray-400 hover:text-red-600 transition-colors">
            <span class="w-5 h-5 block"><app-icon name="close" /></span>
          </button>
        </div>
      </div>

      <div class="flex-1 max-w-lg w-full mx-auto px-4 py-6">
        <h1 class="text-lg font-bold text-gray-900 mb-1">¿Cuánto vas a pagar en efectivo?</h1>
        <p class="text-sm text-gray-500 mb-4">
          El resto lo transfieres. Total del pedido: <b>{{ cart.total() | money }}</b>
        </p>

        @if (error()) {
          <p class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{{ error() }}</p>
        }

        <label class="block mb-4">
          <span class="text-sm font-medium text-gray-700">Monto en efectivo</span>
          <input
            type="number"
            min="0"
            [max]="cart.total()"
            step="100"
            inputmode="decimal"
            [value]="rawAmount() ?? ''"
            (input)="onAmountInput($event)"
            placeholder="0"
            class="mt-1 h-12 w-full px-3 bg-white border border-gray-200 rounded-xl text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          />
        </label>

        @if (resto() !== null) {
          <p class="text-sm text-gray-600 mb-4">
            Resto a transferir: <b class="text-gray-900">{{ resto() | money }}</b>
          </p>
        }

        @if (transferOptions().length > 1) {
          <div class="mb-4">
            <p class="text-sm font-medium text-gray-700 mb-2">¿A cuál transferencia va el resto?</p>
            <div class="space-y-2">
              @for (m of transferOptions(); track m.id) {
                <button
                  type="button"
                  (click)="selectedTransferMethodId.set(m.id)"
                  class="w-full flex items-center gap-3 px-4 py-3 border rounded-xl text-sm font-medium text-left transition-colors"
                  [class.border-violet-400]="selectedTransferMethodId() === m.id"
                  [class.bg-violet-50]="selectedTransferMethodId() === m.id"
                  [class.border-gray-200]="selectedTransferMethodId() !== m.id"
                  [class.bg-white]="selectedTransferMethodId() !== m.id"
                >
                  <span class="w-5 h-5 shrink-0 text-emerald-600"><app-icon name="transfer" /></span>
                  {{ m.name }}
                </button>
              }
            </div>
          </div>
        }

        <button
          (click)="continue_()"
          [disabled]="submitting()"
          class="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          Continuar
        </button>
      </div>
    </div>
  `,
})
export class CashAmountStepComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DinerService);
  readonly cart = inject(DiningCartService);
  private readonly progress = inject(CheckoutProgressStore);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  /** `null` ⇔ el campo está vacío — distinto de `0`, que es un valor válido (edge case FR-006). */
  readonly rawAmount = signal<number | null>(null);
  readonly selectedTransferMethodId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  /** Métodos de transferencia activos del tenant — a elegir cuál recibe el resto (FR-005). */
  readonly transferOptions = computed(() =>
    this.progress.paymentMethods().filter((m) => m.type === 'transfer'),
  );

  readonly resto = computed(() => {
    const amount = this.rawAmount();
    if (amount === null || amount <= 0) return null;
    return Math.max(0, this.cart.total() - amount);
  });

  private mixedMethodId: string | null = null;

  async ngOnInit(): Promise<void> {
    const record = this.progress.read();
    this.mixedMethodId = record?.payment_method_id ?? null;
    if (!this.mixedMethodId) {
      this.router.navigate(['/menu/t', this.token, 'checkout', 'method']);
      return;
    }
    if (record?.cash_amount !== null && record?.cash_amount !== undefined) {
      this.rawAmount.set(record.cash_amount);
    }
    if (this.progress.paymentMethods().length === 0) {
      try {
        this.progress.paymentMethods.set(await this.api.getPaymentMethods());
      } catch (err) {
        this.error.set(this.api.extractError(err, 'No se pudieron cargar los métodos de pago.'));
      }
    }
    const transferMethods = this.transferOptions();
    if (transferMethods.length === 1) {
      this.selectedTransferMethodId.set(transferMethods[0].id);
    } else if (record?.transfer_method_id) {
      this.selectedTransferMethodId.set(record.transfer_method_id);
    }
  }

  onAmountInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.error.set(null);
    this.rawAmount.set(value === '' ? null : Number(value));
  }

  /**
   * FR-006: valida el monto antes de avanzar — igual/mayor al total bloquea
   * orientando a "Efectivo"; `0` se trata como si se hubiera elegido
   * transferencia directamente (no es un pago mixto). Más de un método de
   * transferencia activo exige elegir cuál recibe el resto (FR-005).
   */
  continue_(): void {
    const amount = this.rawAmount();
    const total = this.cart.total();
    if (amount === null || amount < 0) {
      this.error.set('Ingresa cuánto vas a pagar en efectivo.');
      return;
    }
    if (amount >= total) {
      this.error.set(
        "Ese monto cubre todo el pedido; elige 'Efectivo' en vez de 'Pago mixto'.",
      );
      return;
    }
    if (this.transferOptions().length > 1 && !this.selectedTransferMethodId()) {
      this.error.set('Elige a cuál transferencia va el resto.');
      return;
    }
    const transferMethodId =
      this.selectedTransferMethodId() ?? this.transferOptions()[0]?.id ?? null;

    if (amount === 0) {
      // Edge case FR-006: $0 en efectivo ⇔ elegir transferencia directamente
      // — ya no es un pago mixto.
      if (!transferMethodId) {
        this.error.set('No hay ningún método de transferencia disponible.');
        return;
      }
      this.progress.write({
        step: 'transfer', payment_method_id: transferMethodId,
        cash_amount: null, transfer_method_id: null,
      });
      this.router.navigate(['/menu/t', this.token, 'checkout', 'transfer']);
      return;
    }

    this.progress.write({
      step: 'transfer', payment_method_id: this.mixedMethodId!,
      cash_amount: amount, transfer_method_id: transferMethodId,
    });
    this.router.navigate(['/menu/t', this.token, 'checkout', 'transfer']);
  }

  back(): void {
    this.router.navigate(['/menu/t', this.token, 'checkout', 'method']);
  }

  /** Salir sin enviar (FR-004): no crea ningún pedido, el carrito no se toca. */
  exit(): void {
    this.router.navigate(['/menu/t', this.token]);
  }
}
