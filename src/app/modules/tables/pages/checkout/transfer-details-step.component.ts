import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
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
import { formatProductCount } from './checkout-product-count';
import { CheckoutOrderSummaryComponent } from './checkout-order-summary.component';

/**
 * Paso 3 — datos de pago del método de transferencia + carga del comprobante
 * (spec 034, US1/US3). Muestra cada clave de `payment_info` según su
 * `format` (FR-011/FR-012/FR-013) en vez del texto plano que pintaba el modal
 * retirado con `objectKeys(info)`.
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
            [disabled]="uploading() || submitting()"
            aria-label="Volver"
            class="p-1 -ml-1 text-gray-500 hover:text-indigo-600 disabled:opacity-40 transition-colors"
          >
            <span class="w-5 h-5 block"><app-icon name="back" /></span>
          </button>
          <app-checkout-step-indicator [step]="3" [total]="3" label="Datos de transferencia" />
          <button
            (click)="exit()"
            [disabled]="uploading() || submitting()"
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

        <!-- spec 092 (FR-001, FR-002, FR-003) — el total a pagar, el dato sin el
             cual esta pantalla no cumple su función. Va FUERA de la rama que
             espera el método a propósito: no depende de que el método haya
             cargado, así que está visible sin ninguna interacción ni ninguna
             espera de red (SC-001). Y fuera de toda zona colapsable, para que
             contraer el resumen nunca lo esconda (FR-002). La cifra es text-3xl
             y el h1 del método es text-lg: eso la deja siendo el texto más
             grande de la vista (FR-001). -->
        <div
          data-testid="payment-total"
          class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 text-center"
        >
          <p class="text-xs font-medium text-gray-500">Total a pagar</p>
          <p class="text-3xl font-bold text-gray-900 leading-tight">{{ cart.total() | money }}</p>
          <p class="text-xs text-gray-400">{{ productCountLabel() }}</p>
        </div>

        @if (!method()) {
          <p class="text-sm text-gray-400 text-center py-8">Cargando datos de pago…</p>
        } @else {
          <!-- spec 092 (FR-001, FR-016, research.md D9) — el nombre del método
               queda DEBAJO del bloque de total y ENCIMA del bloque de datos
               bancarios. Hasta esta spec era lo primero bajo el encabezado;
               moverlo no es una libertad de diseño, lo exige FR-001. -->
          <h1 class="text-lg font-bold text-gray-900 mb-1">{{ method()!.name }}</h1>
          <p class="text-sm text-gray-500 mb-4">
            Transfiere y sube tu comprobante para enviar el pedido.
          </p>

          <div class="bg-indigo-50 rounded-xl p-4 space-y-3">
            @for (f of textFields(); track f.key) {
              <p class="text-sm text-indigo-900 flex items-center gap-2">
                <span>
                  <span class="font-medium">{{ f.label ?? f.key }}:</span>
                  {{ method()!.payment_info?.[f.key] }}
                </span>
                <button
                  type="button"
                  (click)="copyField(method()!.payment_info?.[f.key] ?? '')"
                  title="Copiar"
                  aria-label="Copiar"
                  class="text-indigo-500 hover:text-indigo-700 transition-colors shrink-0"
                >
                  <span class="w-4 h-4 block"><app-icon name="copy" /></span>
                </button>
              </p>
            }
            @for (f of imageFields(); track f.key) {
              <div>
                <p class="text-xs font-medium text-indigo-900 mb-1 flex items-center gap-2">
                  {{ f.label ?? f.key }}
                  <button
                    type="button"
                    (click)="downloadImage(method()!.payment_info?.[f.key] ?? '', qrFilename(f))"
                    title="Descargar"
                    aria-label="Descargar"
                    class="text-indigo-500 hover:text-indigo-700 transition-colors shrink-0"
                  >
                    <span class="w-4 h-4 block"><app-icon name="download" /></span>
                  </button>
                </p>
                <img
                  [src]="method()!.payment_info?.[f.key]"
                  [alt]="f.label ?? f.key"
                  class="w-full max-w-[220px] rounded-lg border border-indigo-100 mx-auto"
                />
              </div>
            }
          </div>

          <!-- spec 092 (FR-005, FR-016) — el resumen va ENTRE los datos
               bancarios y la zona de comprobante. En modo colapsable: con más
               de UMBRAL_EXPANDIDO_POR_DEFECTO líneas llega contraído, que es lo
               que evita que la suma de QR + lista entierre el botón de enviar
               (RN-002, FR-017). El total NO es parte de este componente: vive
               arriba, fuera de toda zona colapsable (FR-002). -->
          <div class="mt-4">
            <app-checkout-order-summary
              [lines]="cart.lines()"
              [total]="cart.total()"
              [count]="cart.count()"
              [savings]="cart.savings()"
              [collapsible]="true"
            />
          </div>

          <div class="mt-4">
            @if (previewUrl(); as preview) {
              <div class="space-y-2 text-center">
                <p class="text-xs font-medium text-gray-700 text-left">Tu comprobante</p>
                <img
                  [src]="preview"
                  alt="Comprobante de pago"
                  class="w-full max-w-[220px] rounded-lg border border-gray-200 mx-auto"
                />
                <div class="flex items-center justify-center gap-4 text-xs">
                  <label class="text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">
                    {{ uploading() ? 'Subiendo…' : 'Cambiar imagen' }}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      (change)="onFileSelected($event)"
                      [disabled]="uploading() || submitting()"
                      class="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    (click)="removeReceipt()"
                    [disabled]="uploading() || submitting()"
                    class="text-red-600 hover:text-red-700 font-medium disabled:opacity-40 flex items-center gap-1"
                  >
                    <span class="w-3.5 h-3.5"><app-icon name="close" /></span> Quitar
                  </button>
                </div>
              </div>
            } @else {
              <label class="block cursor-pointer">
                <span class="text-xs font-medium text-gray-700">Sube tu comprobante</span>
                <div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
                  <span class="w-4 h-4 text-emerald-600 shrink-0"><app-icon name="upload" /></span>
                  Elige una imagen del comprobante
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  (change)="onFileSelected($event)"
                  class="hidden"
                />
              </label>
            }
          </div>

          <button
            (click)="confirmSend()"
            [disabled]="!previewUrl() || uploading() || submitting()"
            class="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            @if (uploading()) {
              Subiendo comprobante…
            } @else if (submitting()) {
              Enviando pedido…
            } @else {
              Enviar pedido
            }
          </button>
        }
      </div>
    </div>
  `,
})
export class TransferDetailsStepComponent implements OnInit, OnDestroy {
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
  /** Archivo elegido, todavía no subido — `null` si la vista previa viene de
   *  una URL ya hidratada del store (nada que subir de nuevo). */
  readonly pendingImage = signal<File | null>(null);
  /** Lo que pinta el `<img>`: un blob local recién elegido, o la URL pública
   *  ya subida (hidratada o resultado de un intento de envío previo). */
  readonly previewUrl = signal<string | null>(null);
  /** URL pública ya subida — lo único que se manda a `submitCart`. */
  readonly uploadedReceiptUrl = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

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
   * spec 092 (FR-003, FR-006): conteo en **unidades** que acompaña al total.
   *
   * Sale de `formatProductCount`, la misma composición que lee el `<summary>`
   * del resumen. Que los dos salgan de ahí es lo que garantiza que el comensal
   * no vea dos conteos distintos del mismo pedido en esta pantalla (RN-004).
   */
  readonly productCountLabel = computed(() => formatProductCount(this.cart.count()));

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
    this.method.set(found);

    // Comprobante ya subido antes de esta entrada (recarga, o volver del
    // paso anterior sin haber enviado) — se hidrata la vista previa; nunca se
    // pide seleccionar el archivo de nuevo (FR-006).
    if (record?.receipt_file_url) {
      this.uploadedReceiptUrl.set(record.receipt_file_url);
      this.previewUrl.set(record.receipt_file_url);
    }
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  /**
   * Solo prepara la vista previa (`URL.createObjectURL`); NO sube nada
   * todavía — la subida ocurre recién al presionar "Enviar pedido"
   * (`confirmSend`), para que el comensal pueda revisar o cambiar la imagen
   * antes de que se cree cualquier pedido.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite reelegir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('El archivo debe ser una imagen.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('La imagen supera el máximo de 5 MB.');
      return;
    }
    this.error.set(null);
    this.revokePreview();
    this.pendingImage.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
    this.uploadedReceiptUrl.set(null);
    this.progress.write({ receipt_file_url: null }); // el reemplazo invalida lo ya subido
  }

  /** Quita el comprobante elegido (o ya subido) — vuelve al estado vacío. */
  removeReceipt(): void {
    this.revokePreview();
    this.pendingImage.set(null);
    this.previewUrl.set(null);
    this.uploadedReceiptUrl.set(null);
    this.progress.write({ receipt_file_url: null });
    this.error.set(null);
  }

  /**
   * Único disparador de red de este paso: sube el comprobante si todavía no
   * se había subido, y envía el pedido. Si ya había una URL subida (un
   * intento anterior falló solo en `submitCart`, o se hidrató del store), no
   * vuelve a subir el archivo — solo reintenta el envío.
   */
  async confirmSend(): Promise<void> {
    const method = this.method();
    if (!method) return;
    this.error.set(null);

    let receiptUrl = this.uploadedReceiptUrl();
    if (!receiptUrl) {
      const file = this.pendingImage();
      if (!file) return;
      this.uploading.set(true);
      try {
        const presign = await this.api.presignPaymentReceipt(file.type);
        await this.api.uploadReceiptFile(presign.upload_url, file);
        receiptUrl = presign.public_url;
        this.uploadedReceiptUrl.set(receiptUrl);
        // FR-006: se guarda antes de enviar el pedido — una recarga desde
        // aquí ya hidrata la vista previa sin pedir el archivo de nuevo.
        this.progress.write({ receipt_file_url: receiptUrl });
      } catch (err) {
        this.uploading.set(false);
        if (err instanceof DinerSessionExpiredError) {
          this.expireSession();
          return;
        }
        this.error.set(this.api.extractError(err, 'No se pudo subir el comprobante.'));
        return;
      }
      this.uploading.set(false);
    }

    this.submitting.set(true);
    try {
      await this.submit(method.id, receiptUrl);
    } finally {
      this.submitting.set(false);
    }
  }

  private async submit(methodId: string, receiptFileUrl: string): Promise<void> {
    try {
      const order = await this.api.submitCart(methodId, receiptFileUrl);
      this.progress.clear();
      this.progress.activeOrder.set(order);
      this.cart.clear();
      this.router.navigate(['/menu/t', this.token, 'checkout', 'confirmation']);
    } catch (err) {
      if (err instanceof DinerSessionExpiredError) {
        this.expireSession();
        return;
      }
      // El comprobante ya subido se conserva a propósito: un segundo click en
      // "Enviar pedido" no debe volver a subir el archivo.
      this.error.set(this.api.extractError(err, 'No se pudo enviar el pedido.'));
    }
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  /** Copia un valor de texto ya mostrado (p. ej. número de cuenta/celular) al
   *  portapapeles del dispositivo (spec 060, FR-001/FR-003, research.md D1). */
  async copyField(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.toast.success('Copiado al portapapeles', 5000);
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
