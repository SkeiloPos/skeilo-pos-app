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
    <div class="ajustes-theme flex flex-col pt-2">
      @if (tenantInfo.error()) {
        <div
          class="rounded-xl px-4 py-3 text-sm mb-4"
          style="background-color: var(--aj-color-error-soft); border: 1px solid var(--aj-color-error); color: var(--aj-color-error)"
        >
          {{ tenantInfo.error() }}
        </div>
      }

      <!-- Logotipo -->
      <div class="aj-row">
        <div>
          <div class="aj-row-title">Logotipo</div>
          <div class="aj-row-desc">Se muestra en el menú de la app y en el menú del QR.</div>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-4">
            @if (tenantInfo.logoUrl()) {
              <img
                [src]="tenantInfo.logoUrl()"
                alt="Logotipo del negocio"
                class="w-[72px] h-[72px] rounded-xl object-cover flex-none"
                style="border: 1px solid var(--aj-color-border)"
              />
            } @else {
              <div
                class="w-[72px] h-[72px] rounded-xl flex items-center justify-center flex-none"
                style="border: 1px dashed var(--aj-color-border-strong); background-color: var(--aj-color-surface-soft); color: var(--aj-color-text-muted)"
              >
                <app-mi-icon name="store" [size]="28" />
              </div>
            }
            <div class="flex flex-col gap-2 items-start">
              <label class="aj-btn-secondary inline-flex items-center gap-2 text-sm cursor-pointer" style="height:36px; padding: 0 14px">
                <app-mi-icon name="upload" [size]="16" />
                Subir imagen
                <input
                  type="file"
                  accept="image/*"
                  [disabled]="tenantInfo.isSubmitting()"
                  (change)="onLogoSelected($event)"
                  class="hidden"
                />
              </label>
              <span class="aj-muted text-xs">PNG, JPG o WEBP · máximo 2 MB</span>
              @if (tenantInfo.isSubmitting()) {
                <span class="aj-muted text-xs">Subiendo…</span>
              } @else if (saved()) {
                <span class="text-xs" style="color: var(--aj-color-success)">Guardado ✓</span>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Mensaje del recibo -->
      <div class="aj-row">
        <div>
          <div class="aj-row-title">Mensaje del recibo</div>
          <div class="aj-row-desc">Cierra la factura que se imprime al cobrar una mesa.</div>
        </div>
        <div class="min-w-0 flex flex-col gap-2.5">
          <label class="text-sm font-medium" style="color: var(--aj-color-text-secondary)" for="rcpt">Mensaje</label>
          <textarea
            id="rcpt"
            [(ngModel)]="message"
            [maxlength]="maxMessage"
            rows="3"
            placeholder="¡Gracias por su compra!"
            class="aj-input w-full text-sm resize-y"
          ></textarea>
          <div class="flex justify-between items-center gap-3 flex-wrap">
            <span class="aj-muted text-xs">
              {{ message().length }}/{{ maxMessage }} · si lo dejas vacío se imprime
              «{{ defaultMessage }}»
            </span>
            <button (click)="saveMessage()" [disabled]="tenantInfo.isSubmitting()" class="aj-btn-primary text-sm" style="height:36px; padding: 0 14px">
              {{ tenantInfo.isSubmitting() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Impresión (de este dispositivo) -->
      <div class="aj-row">
        <div>
          <div class="aj-row-title">Impresión</div>
          <div class="aj-row-desc">
            Ajustes de este dispositivo: la impresora cuelga del equipo donde está la caja.
          </div>
        </div>
        <div class="min-w-0 flex flex-col gap-3.5">
          <span class="text-sm font-medium" style="color: var(--aj-color-text-secondary)">Ancho del rollo</span>
          <div class="flex gap-1 self-start p-1 rounded-lg" style="background-color: var(--aj-color-surface-soft)">
            @for (w of paperWidths; track w) {
              <button
                (click)="printer.setPaperWidth(w)"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                [style]="
                  printer.paperWidthMm() === w
                    ? 'background-color: var(--aj-color-surface); color: var(--aj-color-text-primary); box-shadow: 0 1px 2px rgba(15,23,42,.08)'
                    : 'background: none; color: var(--aj-color-text-muted)'
                "
              >
                {{ w }} mm
              </button>
            }
          </div>
          <p class="aj-muted text-sm" style="line-height:1.5">
            Tiene que coincidir con el papel configurado en el driver. Si no coincide, el
            navegador reduce la factura para encajarla y el texto sale gris.
          </p>
          <div>
            <button (click)="printTest()" class="aj-btn-secondary inline-flex items-center gap-2 text-sm">
              <app-mi-icon name="printer" [size]="16" />
              Imprimir prueba
            </button>
          </div>
        </div>
      </div>

      <!-- Negocio -->
      <div class="aj-row">
        <div>
          <div class="aj-row-title">Negocio</div>
          <div class="aj-row-desc">El nombre y el dominio los gestiona el administrador de la plataforma.</div>
        </div>
        <div class="min-w-0">
          <div class="aj-kv">
            <span class="aj-muted">Nombre</span>
            <span style="color: var(--aj-color-text-primary)"><b>{{ tenantInfo.businessName() }}</b></span>
          </div>
          <div class="aj-kv">
            <span class="aj-muted">Dominio</span>
            <span><code style="font-family: ui-monospace, monospace">{{ host() }}</code></span>
          </div>
        </div>
      </div>

      <!-- Tu cuenta -->
      <div class="aj-row">
        <div>
          <div class="aj-row-title">Tu cuenta</div>
          <div class="aj-row-desc">Datos con los que inicias sesión.</div>
        </div>
        <div class="min-w-0">
          <div class="aj-kv">
            <span class="aj-muted">Correo</span>
            <span style="color: var(--aj-color-text-primary)">{{ email() || '—' }}</span>
          </div>
          <div class="aj-kv">
            <span class="aj-muted">Rol</span>
            <span class="aj-badge aj-badge-primary">{{ roleLabel() }}</span>
          </div>
        </div>
      </div>
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
        { paperWidthMm: this.printer.paperWidthMm(), timezone: this.tenantInfo.timezone() },
      ),
    );
  }

  /** Guarda el mensaje; vacío lo borra y vuelve al texto por defecto. */
  async saveMessage(): Promise<void> {
    const ok = await this.tenantInfo.update({ receipt_message: this.message().trim() });
    if (ok) this.toast.success('Mensaje del recibo guardado');
    else this.toast.error(this.tenantInfo.error() ?? 'No se pudo guardar el mensaje');
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
