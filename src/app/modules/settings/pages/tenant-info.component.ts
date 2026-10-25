import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_RECEIPT_MESSAGE,
  TenantInfoService,
} from '../../../core/tenant/tenant-info.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { ToastService } from '../../../shared/feedback/toast.service';
import {
  PAPER_WIDTHS,
  PaperWidthMm,
  PrinterSettingsStore,
} from '../../../core/printing/printer-settings.store';
import {
  buildReceiptHtml,
  printReceiptHtml,
} from '../../tables/services/receipt.util';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/** Tope del campo en el backend (`TenantUpdate.receipt_message`). */
const MAX_MESSAGE = 255;

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.MESERO]: 'Mesero',
};

@Component({
  selector: 'app-tenant-info',
  standalone: true,
  imports: [FormsModule, IconMiComponent],
  template: `
    <div class="max-w-3xl space-y-6">
      @if (tenantInfo.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ tenantInfo.error() }}
        </div>
      }

      <!-- Logotipo -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <app-mi-icon name="palette" [size]="20" class="text-indigo-600" />
          </span>
          <div>
            <h2 class="text-base font-semibold text-gray-900">Logotipo</h2>
            <p class="text-xs text-gray-400">Se muestra en el menú de la app y en el menú del QR</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          @if (tenantInfo.logoUrl()) {
            <img
              [src]="tenantInfo.logoUrl()"
              alt="Logotipo del negocio"
              class="w-16 h-16 rounded-xl object-cover border border-gray-100"
            />
          } @else {
            <div class="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
              <app-mi-icon name="storefront" [size]="24" />
            </div>
          }

          <div class="min-w-0">
            <input
              type="file"
              accept="image/*"
              [disabled]="tenantInfo.isSubmitting()"
              (change)="onLogoSelected($event)"
              class="text-sm text-gray-500 disabled:opacity-50"
            />
            <p class="text-xs text-gray-400 mt-1">PNG, JPG o WEBP · máximo 2 MB</p>
            @if (tenantInfo.isSubmitting()) {
              <p class="text-xs text-gray-500 mt-1">Subiendo…</p>
            } @else if (saved()) {
              <p class="text-xs text-green-600 mt-1">Guardado ✓</p>
            }
          </div>
        </div>
      </div>

      <!-- Mensaje del recibo -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <app-mi-icon name="receipt" [size]="20" class="text-indigo-600" />
          </span>
          <div>
            <h2 class="text-base font-semibold text-gray-900">Mensaje del recibo</h2>
            <p class="text-xs text-gray-400">Cierra la factura que se imprime al cobrar una mesa</p>
          </div>
        </div>

        <textarea
          [(ngModel)]="message"
          [maxlength]="maxMessage"
          rows="2"
          placeholder="¡Gracias por su compra!"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
        ></textarea>

        <div class="flex items-center justify-between gap-3 mt-3">
          <p class="text-xs text-gray-400">
            {{ message().length }}/{{ maxMessage }} · si lo dejas vacío se imprime
            «{{ defaultMessage }}»
          </p>
          <button
            (click)="saveMessage()"
            [disabled]="tenantInfo.isSubmitting()"
            class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {{ tenantInfo.isSubmitting() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>

      <!-- Impresión (de este dispositivo) -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <app-mi-icon name="print" [size]="20" class="text-indigo-600" />
          </span>
          <div>
            <h2 class="text-base font-semibold text-gray-900">Impresión</h2>
            <p class="text-xs text-gray-400">
              Ajustes de <span class="font-medium">este dispositivo</span>: la impresora cuelga
              del equipo donde está la caja
            </p>
          </div>
        </div>

        <label class="block text-xs font-medium text-gray-600 mb-2">Ancho del rollo</label>
        <div class="grid grid-cols-3 gap-1.5 max-w-xs">
          @for (w of paperWidths; track w) {
            <button
              (click)="printer.setPaperWidth(w)"
              class="px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors"
              [class]="
                printer.paperWidthMm() === w
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              "
            >
              {{ w }} mm
            </button>
          }
        </div>

        <p class="text-xs text-gray-400 mt-2">
          Tiene que coincidir con el papel configurado en el driver. Si no coincide, el
          navegador reduce la factura para encajarla y el texto sale gris.
        </p>

        <div class="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
          <button
            (click)="printTest()"
            class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5"
          >
            <app-mi-icon name="receipt" [size]="16" />
            Imprimir prueba
          </button>
          <p class="text-xs text-gray-400">
            En el diálogo del navegador: escala <span class="font-medium">100 %</span> (no
            «ajustar al área»), márgenes <span class="font-medium">ninguno</span> y sin
            encabezados ni pies. Si sale claro, sube la densidad en el driver.
          </p>
        </div>
      </div>

      <!-- Conversión de unidades en compras (spec 134) -->
      @if (isAdmin()) {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div class="flex items-center gap-3 mb-4">
            <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <app-mi-icon name="units" [size]="20" class="text-indigo-600" />
            </span>
            <div>
              <h2 class="text-base font-semibold text-gray-900">Conversión de unidades en compras</h2>
              <p class="text-xs text-gray-400">
                Permite registrar una compra en una unidad distinta a la base del insumo (p.
                ej. comprar en KG un insumo cuya base es gramos)
              </p>
            </div>
          </div>

          <label class="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              [checked]="tenantInfo.info()?.unit_conversion_enabled ?? true"
              [disabled]="tenantInfo.isSubmitting()"
              (change)="onUnitConversionToggle($any($event.target).checked)"
              class="w-4 h-4"
            />
            Permitir elegir otra unidad al registrar una compra
          </label>
        </div>
      }

      <div class="grid gap-6 md:grid-cols-2">
        <!-- Negocio -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div class="flex items-center gap-3 mb-4">
            <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <app-mi-icon name="storefront" [size]="20" class="text-indigo-600" />
            </span>
            <h2 class="text-base font-semibold text-gray-900">Negocio</h2>
          </div>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Nombre</dt>
              <dd class="font-medium text-gray-900 text-right">{{ tenantInfo.businessName() }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Dominio</dt>
              <dd class="font-mono text-gray-700 text-right break-all">{{ host() }}</dd>
            </div>
          </dl>
        </div>

        <!-- Cuenta -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div class="flex items-center gap-3 mb-4">
            <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <app-mi-icon name="person" [size]="20" class="text-indigo-600" />
            </span>
            <h2 class="text-base font-semibold text-gray-900">Tu cuenta</h2>
          </div>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Correo</dt>
              <dd class="font-medium text-gray-900 text-right break-all">{{ email() || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-gray-500">Rol</dt>
              <dd class="text-right">
                <span class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {{ roleLabel() }}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p class="text-xs text-gray-400">
        El nombre y el dominio del negocio los gestiona el administrador de la plataforma.
      </p>
    </div>
  `,
})
export class TenantInfoComponent implements OnInit {
  readonly tenantInfo = inject(TenantInfoService);
  readonly printer = inject(PrinterSettingsStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly paperWidths: readonly PaperWidthMm[] = PAPER_WIDTHS;

  readonly saved = signal(false);

  readonly maxMessage = MAX_MESSAGE;
  readonly defaultMessage = DEFAULT_RECEIPT_MESSAGE;
  /** Borrador del mensaje; se rellena cuando llega la info del negocio. */
  readonly message = signal('');

  readonly host = computed(() => this.tenantInfo.info()?.host ?? '—');

  readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  readonly roleLabel = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role ? ROLE_LABEL[role] : '—';
  });
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === UserRole.ADMIN);

  async ngOnInit(): Promise<void> {
    await this.tenantInfo.load();
    this.message.set(this.tenantInfo.info()?.receipt_message ?? '');
  }

  /**
   * Ticket de ejemplo para calibrar la impresora.
   *
   * Calibrar una térmica es prueba y error (ancho, densidad, escala del
   * navegador); sin esto habría que hacer una venta real por cada intento.
   */
  printTest(): void {
    const now = new Date().toISOString();
    printReceiptHtml(
      buildReceiptHtml(
        [
          {
            businessName: this.tenantInfo.businessName(),
            logoUrl: this.tenantInfo.logoUrl(),
            tableLabel: 'Mesa 1 · Prueba',
            soldAt: now,
            cashier: this.auth.currentUser()?.email ?? null,
            customerName: 'Prueba de impresión',
            saleId: 'prueba-000000',
            // Con número, para que la prueba se vea igual que un ticket real.
            invoice: { prefix: '', number: 1 },
            lines: [
              { quantity: 2, description: 'Helado de vainilla con topping', lineTotal: 16000 },
              { quantity: 1, description: 'Malteada de fresa', lineTotal: 9000 },
            ],
            subtotal: 25000,
            discount: 0,
            tax: 0,
            tip: 0,
            total: 25000,
            payments: [{ name: 'Efectivo', amount: 30000 }],
            change: 5000,
            message: this.tenantInfo.receiptMessage(),
          },
        ],
        { paperWidthMm: this.printer.paperWidthMm() },
      ),
    );
  }

  /** Guarda el mensaje; vacío lo borra y vuelve al texto por defecto. */
  async saveMessage(): Promise<void> {
    const ok = await this.tenantInfo.update({ receipt_message: this.message().trim() });
    if (ok) this.toast.success('Mensaje del recibo guardado');
    else this.toast.error(this.tenantInfo.error() ?? 'No se pudo guardar el mensaje');
  }

  async onUnitConversionToggle(checked: boolean): Promise<void> {
    const ok = await this.tenantInfo.update({ unit_conversion_enabled: checked });
    if (ok) this.toast.success('Preferencia de conversión de unidades guardada');
    else this.toast.error(this.tenantInfo.error() ?? 'No se pudo guardar la preferencia');
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.saved.set(false);
    const ok = await this.tenantInfo.uploadLogo(file);
    // Permite volver a elegir el mismo archivo tras un fallo.
    input.value = '';
    if (ok) this.saved.set(true);
  }
}
