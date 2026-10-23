import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DinerService, DinerSessionExpiredError } from '../../services/diner.service';
import { DinerTokenStore } from '../../services/diner-token.store';
import { DiningCartService } from '../../services/dining-cart.service';
import { DinerPaymentMethod, PaymentMethodField } from '../../interfaces/diner.interface';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { ToastService } from '../../../../shared/feedback/toast.service';
import { ToastContainerComponent } from '../../../../shared/feedback/toast-container.component';
import { CheckoutStepIndicatorComponent } from './checkout-step-indicator.component';
import { CheckoutProgressStore } from './checkout-progress.store';
import { CheckoutOrderSummaryComponent } from './checkout-order-summary.component';

/**
 * Paso 3 — datos de pago del método de transferencia (spec 034, US1/US3).
 * Muestra cada clave de `payment_info` según su `format` (FR-011/FR-012/FR-013)
 * en vez del texto plano que pintaba el modal retirado con `objectKeys(info)`.
 *
 * Spec 132 (A-144, FR-001/FR-002/FR-004/FR-008/FR-023): retira el paso de
 * subida de comprobante — el comensal confirma su pedido viendo el monto
 * exacto a transferir y la instrucción de referencia, y muestra el
 * comprobante desde la app de su banco al cajero en el momento de la
 * entrega; la verificación real queda enteramente a cargo del cajero, nunca
 * de un archivo subido.
 */
@Component({
  selector: 'app-transfer-details-step',
  standalone: true,
  imports: [
    IconComponent,
    MoneyPipe,
    CheckoutStepIndicatorComponent,
    ToastContainerComponent,
    CheckoutOrderSummaryComponent,
  ],
  template: `
    <app-toast-container />
    <div class="min-h-screen bg-gray-50 flex flex-col">
      <div class="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div class="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            (click)="back()"
            [disabled]="submitting()"
            aria-label="Volver"
            class="p-1 -ml-1 text-gray-500 hover:text-violet-600 disabled:opacity-40 transition-colors"
          >
            <span class="w-5 h-5 block"><app-icon name="back" /></span>
          </button>
          <app-checkout-step-indicator [step]="3" [total]="3" label="Datos de transferencia" />
          <button
            (click)="exit()"
            [disabled]="submitting()"
            aria-label="Salir sin enviar"
            class="p-1 -mr-1 text-gray-400 hover:text-red-600 disabled:opacity-40 transition-colors"
          >
            <span class="w-5 h-5 block"><app-icon name="close" /></span>
          </button>
        </div>
      </div>

      <div class="flex-1 max-w-lg w-full mx-auto px-4 py-6">
        @if (error()) {
          <p class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{{ error() }}</p>
        }

        <!-- spec 092 (FR-001, FR-002) / spec 130 (rediseño) / spec 132 (FR-004) —
             el monto a pagar por este medio, el dato sin el cual esta pantalla
             no cumple su función. Va FUERA de la rama que espera el método a
             propósito: no depende de que el método haya cargado, así que está
             visible sin ninguna interacción ni ninguna espera de red (SC-001). -->
        <div
          data-testid="payment-total"
          class="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4 text-center"
        >
          <p class="text-sm text-gray-500">{{ totalLabel() }}</p>
          <p class="text-3xl font-bold text-gray-900 leading-tight mt-1">
            {{ transferAmount() | money }}
          </p>
          @if (mixedCashAmount() !== null) {
            <p class="text-sm text-gray-600 mt-1">
              Más {{ mixedCashAmount() | money }} en efectivo al recibir el pedido
            </p>
          }
          <!-- spec 132 (FR-003/FR-004): instrucción de referencia para incluir
               en el mensaje de la transferencia -- mesa y número de pedido,
               cuando ya se conocen (número de pedido solo tras confirmar). -->
          <p class="text-xs text-gray-400 mt-2">Incluye tu mesa como referencia al transferir.</p>
        </div>

        @if (!method()) {
          <p class="text-sm text-gray-400 text-center py-8">Cargando datos de pago…</p>
        } @else {
          <!-- spec 092 (FR-001, FR-016, research.md D9) — el nombre del método
               queda DEBAJO del bloque de total y ENCIMA del bloque de datos
               bancarios.
               spec 130: en un pago mixto, este es el método de transferencia
               REAL elegido para el resto ('transfer_method_id'), no "Pago
               mixto" en sí (data-model.md: ese no tiene cuenta propia). -->
          <h1 class="text-lg font-bold text-gray-900 mb-1">{{ method()!.name }}</h1>
          <p class="text-sm text-gray-500 mb-4">Transfiere el valor exacto para enviar el pedido.</p>

          <div
            data-testid="bank-info"
            class="bg-white rounded-2xl border border-gray-100 p-4 space-y-4"
          >
            @for (f of textFields(); track f.key) {
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {{ f.label ?? f.key }}
                  </p>
                  <p class="text-xl font-bold text-gray-900 tabular-nums">
                    {{ method()!.payment_info?.[f.key] }}
                  </p>
                </div>
                <button
                  type="button"
                  (click)="copyField(f.key, method()!.payment_info?.[f.key] ?? '')"
                  title="Copiar"
                  aria-label="Copiar"
                  class="h-11 px-3.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 shrink-0"
                >
                  <span class="w-4 h-4 block"><app-icon name="copy" /></span>
                  {{ copiedKey() === f.key ? 'Copiado' : 'Copiar' }}
                </button>
              </div>
            }
            @for (f of imageFields(); track f.key) {
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    O escanea el código QR
                  </p>
                  <button
                    type="button"
                    (click)="downloadImage(method()!.payment_info?.[f.key] ?? '', qrFilename(f))"
                    title="Descargar"
                    aria-label="Descargar"
                    class="text-violet-600 hover:text-violet-700 transition-colors shrink-0"
                  >
                    <span class="w-4 h-4 block"><app-icon name="download" /></span>
                  </button>
                </div>
                <img
                  [src]="method()!.payment_info?.[f.key]"
                  [alt]="f.label ?? f.key"
                  class="w-full max-w-[240px] rounded-xl border border-gray-200 mx-auto"
                />
              </div>
            }
          </div>

          <!-- spec 092 (FR-005, FR-016) — el resumen va ENTRE los datos
               bancarios y el aviso del comprobante. En modo colapsable: con más
               de UMBRAL_EXPANDIDO_POR_DEFECTO líneas llega contraído, que es lo
               que evita que la lista entierre el botón de enviar (RN-002,
               FR-017). El total NO es parte de este componente: vive arriba,
               fuera de toda zona colapsable (FR-002). -->
          <div class="mt-4">
            <app-checkout-order-summary
              [lines]="cart.lines()"
              [total]="cart.total()"
              [count]="cart.count()"
              [savings]="cart.savings()"
              [collapsible]="true"
            />
          </div>

          <!-- spec 132 (FR-008/FR-023): aviso de mostrar el comprobante al
               cajero en la entrega, en vez del paso de subida retirado. -->
          <div
            class="mt-4 flex items-start gap-2.5 p-3.5 bg-violet-50 border border-violet-100 rounded-xl"
          >
            <span class="w-5 h-5 text-violet-600 shrink-0 mt-0.5"><app-icon name="check-circle" /></span>
            <p class="text-sm text-violet-900">
              Al recibir tu pedido, muestra el comprobante desde la app de tu banco al cajero.
              No necesitas subir ningún archivo ahora.
            </p>
          </div>

          <div class="mt-4 space-y-2">
            <button
              (click)="confirmSend()"
              [disabled]="submitting()"
              class="w-full py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors disabled:bg-gray-200 disabled:text-gray-400"
            >
              @if (submitting()) {
                Enviando pedido…
              } @else {
                Enviar pedido
              }
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class TransferDetailsStepComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DinerService);
  private readonly tokenStore = inject(DinerTokenStore);
  /** spec 092: público para que la plantilla lea el total, el conteo y las
   *  líneas, siguiendo la convención de `review-step.component.ts`. */
  readonly cart = inject(DiningCartService);
  private readonly progress = inject(CheckoutProgressStore);
  private readonly toast = inject(ToastService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly method = signal<DinerPaymentMethod | null>(null);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  /** Spec 130 (FR-007): monto en efectivo del pago mixto — `null` ⇔ no es mixto. */
  readonly mixedCashAmount = signal<number | null>(null);
  /** `key` del campo cuyo botón "Copiar" muestra "Copiado" ahora mismo — `null`
   *  fuera de esa ventana de ~2 s (rediseño, imita el estado del botón en
   *  `design/Bienvenida QR.dc.html`). Puramente visual: el toast (abajo) sigue
   *  siendo la notificación accesible de verdad. */
  readonly copiedKey = signal<string | null>(null);
  /** `payment_method_id` real a mandar a `submitCart` — "Pago mixto" en un
   *  pago mixto, el método de transferencia elegido en los demás casos (son
   *  el mismo valor salvo en el mixto, donde `method()` muestra otra cosa). */
  private submitPaymentMethodId: string | null = null;
  /** `transfer_method_id` a mandar a `submitCart` — solo con valor en un pago mixto. */
  private submitTransferMethodId: string | null = null;

  /** Solo los campos con valor en `payment_info`: un `field` sin valor capturado no se pinta. */
  readonly textFields = computed(() =>
    (this.method()?.fields ?? []).filter(
      (f) => f.format !== 'image' && this.method()?.payment_info?.[f.key],
    ),
  );
  /** FR-013: sin ningún `field` `format: 'image'` con valor, no se intenta ningún `<img>`. */
  readonly imageFields = computed(() =>
    (this.method()?.fields ?? []).filter(
      (f) => f.format === 'image' && this.method()?.payment_info?.[f.key],
    ),
  );

  /**
   * spec 130 (rediseño): la cifra destacada del bloque de total.
   *
   * En un pago mixto es SOLO la porción a transferir (`cart.total() -
   * mixedCashAmount()`), no el total del pedido — el total completo con
   * desglose sigue disponible en el resumen colapsable de abajo. Fuera de un
   * pago mixto, sigue siendo el total completo, igual que antes.
   */
  readonly transferAmount = computed(() => {
    const cash = this.mixedCashAmount();
    return cash !== null ? this.cart.total() - cash : this.cart.total();
  });
  /** Rótulo del bloque de total: "Transfiere por <método>" en un pago mixto
   *  (una vez el método de transferencia real ya cargó), "Total a pagar" en
   *  cualquier otro caso — incluido el instante en que `method()` aún es `null`. */
  readonly totalLabel = computed(() => {
    const method = this.method();
    return this.mixedCashAmount() !== null && method ? `Transfiere por ${method.name}` : 'Total a pagar';
  });

  async ngOnInit(): Promise<void> {
    const record = this.progress.read();
    const methodId = record?.payment_method_id;
    if (!methodId) {
      this.router.navigate(['/menu/t', this.token, 'checkout', 'method']);
      return;
    }

    let methods = this.progress.paymentMethods();
    if (methods.length === 0) {
      try {
        methods = await this.api.getPaymentMethods();
        this.progress.paymentMethods.set(methods);
      } catch (err) {
        this.error.set(this.api.extractError(err, 'No se pudieron cargar los métodos de pago.'));
        return;
      }
    }

    const found = methods.find((m) => m.id === methodId) ?? null;
    if (!found) {
      // Se desactivó entre el guard y este punto (carrera improbable, pero
      // FR-010 aplica igual): se limpia y se vuelve a elegir.
      this.progress.clearMethod();
      this.router.navigate(['/menu/t', this.token, 'checkout', 'method']);
      return;
    }

    // Spec 130: en un pago mixto, los datos bancarios a mostrar (FR-007) son
    // los del método de transferencia REAL elegido (`transfer_method_id`),
    // no los de "Pago mixto" en sí — ese no tiene cuenta propia
    // (data-model.md § OrderPaymentAttempt).
    this.mixedCashAmount.set(record?.cash_amount ?? null);
    this.submitPaymentMethodId = methodId;
    this.submitTransferMethodId = record?.transfer_method_id ?? null;
    const displayMethod = this.submitTransferMethodId
      ? methods.find((m) => m.id === this.submitTransferMethodId) ?? found
      : found;
    this.method.set(displayMethod);
  }

  /** Único disparador de red de este paso: envía el pedido directamente — spec
   *  132 (FR-023) retira la subida de comprobante que antes ocurría aquí. */
  async confirmSend(): Promise<void> {
    const method = this.method();
    if (!method) return;
    this.error.set(null);
    this.submitting.set(true);
    try {
      // spec 130: el `payment_method_id` a enviar es "Pago mixto" en un pago
      // mixto (`submitPaymentMethodId`), no el método de transferencia que
      // `method()` muestra para los datos bancarios.
      await this.submit(this.submitPaymentMethodId ?? method.id);
    } finally {
      this.submitting.set(false);
    }
  }

  private async submit(methodId: string): Promise<void> {
    try {
      const order = await this.api.submitCart(
        methodId, null, this.mixedCashAmount(), this.submitTransferMethodId,
      );
      this.progress.clear();
      this.progress.activeOrder.set(order);
      this.cart.clear();
      this.router.navigate(['/menu/t', this.token, 'checkout', 'confirmation']);
    } catch (err) {
      if (err instanceof DinerSessionExpiredError) {
        this.expireSession();
        return;
      }
      this.error.set(this.api.extractError(err, 'No se pudo enviar el pedido.'));
      // spec 128 (FR-007): mismo motivo que payment-method-step -- sincroniza
      // el carrito local con lo que el servidor ya quitó.
      await this.cart.load().catch(() => undefined);
    }
  }

  /** Copia un valor de texto ya mostrado (p. ej. número de cuenta/celular) al
   *  portapapeles del dispositivo (spec 060, FR-001/FR-003, research.md D1).
   *  `key` identifica el campo solo para el estado visual del botón ("Copiar"
   *  → "Copiado" por 2 s, rediseño) — el toast sigue siendo independiente de
   *  ese estado y es lo único que verifican los tests de accesibilidad. */
  async copyField(key: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.toast.success('Copiado al portapapeles', 5000);
      this.copiedKey.set(key);
      setTimeout(() => {
        if (this.copiedKey() === key) this.copiedKey.set(null);
      }, 2000);
    } catch {
      this.toast.error('No se pudo copiar', 5000);
    }
  }

  /** Descarga una imagen ya mostrada (p. ej. el QR) como archivo local, sin
   *  requerir captura de pantalla (spec 060, FR-004/FR-006, research.md D2-D3).
   *  Trae el archivo con `fetch` + `Blob` en vez de un `<a href>` directo
   *  porque la imagen es una URL remota de otro origen (Cloudflare R2), no
   *  una data URL local.
   *
   *  `cache: 'no-store'` es obligatorio, no cosmético: este mismo QR ya se pintó
   *  arriba con `<img [src]>` sin `crossorigin`, es decir como petición no-CORS,
   *  y Cloudflare la deja cacheada ~4 h (`Cache-Control: max-age=14400`) sin
   *  cabeceras CORS. Revalidar esa entrada para un `fetch` `mode: 'cors'` hace
   *  que Cloudflare devuelva un `504` vacío que el navegador reporta como error
   *  de CORS. `no-store` salta esa entrada envenenada y va directo a la red
   *  (el CORS de lectura del bucket R2 sí está habilitado — research.md D2,
   *  Resolución post-implementación). */
  async downloadImage(url: string, filename: string): Promise<void> {
    try {
      const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
      if (!response.ok) throw new Error('Respuesta no exitosa');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
      this.toast.success('Imagen descargada', 5000);
    } catch {
      this.toast.error('No se pudo descargar la imagen', 5000);
    }
  }

  /** Nombre de archivo para la descarga de un campo de imagen (research.md D3):
   *  `qr-<slug-del-método>.png`, agregando el campo solo si hay más de uno. */
  qrFilename(f: PaymentMethodField): string {
    const slug = (value: string) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    const base = `qr-${slug(this.method()?.name ?? '')}`;
    return this.imageFields().length > 1 ? `${base}-${slug(f.label ?? f.key)}.png` : `${base}.png`;
  }

  /** Volver a elegir método (FR-003, T013) — sin restricción: no existe pedido todavía. */
  back(): void {
    this.router.navigate(['/menu/t', this.token, 'checkout', 'method']);
  }

  /** Salir sin enviar (FR-004): no crea ningún pedido, el carrito no se toca. */
  exit(): void {
    this.router.navigate(['/menu/t', this.token]);
  }

  private expireSession(): void {
    this.tokenStore.clear();
    this.cart.clear();
    this.cart.clearDiner();
    this.router.navigate(['/menu/t', this.token]);
  }
}
