import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentMethodService } from '../services/payment-method.service';
import { TenantPaymentMethodCatalogService } from '../services/payment-method-catalog.service';
import {
  CatalogPaymentMethodField,
  CatalogPaymentMethodOption,
  PaymentMethod,
  PaymentMethodType,
} from '../interfaces/sales.interface';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/** Clasificaciones que entiende el arqueo de caja (solo para el ícono/label). */
const TYPES: { value: PaymentMethodType; label: string; icon: string }[] = [
  { value: 'cash', label: 'Efectivo', icon: 'banknote' },
  { value: 'card', label: 'Tarjeta', icon: 'credit_card' },
  { value: 'transfer', label: 'Transferencia', icon: 'smartphone' },
  { value: 'mixed', label: 'Pago mixto', icon: 'arrow-left-right' },
  { value: 'other', label: 'Otro', icon: 'receipt' },
];

/**
 * Configuración de métodos de pago del tenant (spec 032, Historia de Usuario
 * 2): activar desde el catálogo del Super Admin y completar los datos de
 * integración que ese método requiera. Ya no se puede crear un método libre
 * (FR-007/FR-011) — el "+ Nuevo método" abre el catálogo, no un formulario
 * de nombre en blanco.
 */
@Component({
  selector: 'app-payment-methods-page',
  standalone: true,
  imports: [FormsModule, IconMiComponent],
  template: `
    <div class="ajustes-theme flex flex-col gap-5 pt-2">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1" style="flex-basis: 280px">
          <div class="aj-row-title">Métodos de pago</div>
          <div class="aj-row-desc">Formas de cobro disponibles en el checkout.</div>
        </div>
        <button (click)="openCatalogPicker()" class="aj-btn-primary inline-flex items-center gap-2 whitespace-nowrap">
          <app-mi-icon name="add" [size]="16" />
          Activar método
        </button>
      </div>

      @if (svc.error() && !showFieldsForm()) {
        <div
          class="rounded-xl px-4 py-3 text-sm"
          style="background-color: var(--aj-color-error-soft); border: 1px solid var(--aj-color-error); color: var(--aj-color-error)"
        >
          {{ svc.error() }}
        </div>
      }

      @if (svc.loading() && svc.methods().length === 0) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
            style="border-color: var(--aj-color-primary); border-top-color: transparent"
          ></div>
        </div>
      } @else if (svc.methods().length === 0) {
        <div
          class="text-center py-8 px-4"
          style="border: 1px dashed var(--aj-color-border-strong); border-radius: 12px; color: var(--aj-color-text-muted)"
        >
          No hay métodos activos. Activa uno para cobrar.
        </div>
      } @else {
        <div class="aj-card overflow-hidden">
          @for (m of svc.methods(); track m.id) {
            <div class="aj-list-row">
              <span
                class="w-10 h-10 rounded-lg flex-none grid place-items-center"
                style="background-color: var(--aj-color-primary-soft); color: var(--aj-color-primary-text)"
              >
                <app-mi-icon [name]="icon(m.type)" [size]="20" />
              </span>
              <div class="flex-1 min-w-0" style="flex-basis: 140px">
                <div class="font-semibold" style="color: var(--aj-color-text-primary)">{{ m.name }}</div>
                <div class="text-xs aj-muted">{{ label(m.type) }}</div>
              </div>
              @if (!m.is_complete) {
                <span class="aj-badge aj-badge-warning" title="Faltan datos obligatorios por completar">
                  Incompleto
                </span>
              }
              <button
                (click)="openFieldsForm(m)"
                class="font-semibold text-sm"
                style="height: 44px; padding: 0 8px; background: none; border: 0; color: var(--aj-color-primary-text)"
              >
                {{ m.is_complete ? 'Editar' : 'Completar' }}
              </button>
              <button
                (click)="toggleActive(m)"
                [disabled]="svc.isSubmitting()"
                role="switch"
                [attr.aria-checked]="m.active"
                [attr.aria-label]="m.name + ': ' + (m.active ? 'Activo' : 'Inactivo')"
                class="aj-pill-toggle"
                [style]="
                  m.active
                    ? 'background-color: var(--aj-color-success-soft); color: var(--aj-color-success)'
                    : 'background-color: var(--aj-color-surface-soft); color: var(--aj-color-text-muted)'
                "
              >
                {{ m.active ? 'Activo' : 'Inactivo' }}
              </button>
            </div>
          }
        </div>
      }
    </div>

    <!-- Modal: elegir del catálogo -->
    @if (showCatalogPicker()) {
      <div class="ajustes-theme fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="aj-card shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto" style="background-color: var(--aj-color-surface)">
          <div
            class="flex items-center justify-between px-6 py-4 sticky top-0"
            style="border-bottom: 1px solid var(--aj-color-border); background-color: var(--aj-color-surface)"
          >
            <h2 class="aj-title text-lg font-semibold">Activar método de pago</h2>
            <button type="button" (click)="closeCatalogPicker()" class="aj-muted transition-colors">✕</button>
          </div>
          <div class="px-6 py-5 space-y-2">
            @if (catalogSvc.loading()) {
              <p class="aj-muted text-sm text-center py-6">Cargando catálogo…</p>
            } @else if (availableToActivate().length === 0) {
              <p class="aj-muted text-sm text-center py-6">
                Ya activaste todos los métodos disponibles en el catálogo de la plataforma.
              </p>
            } @else {
              @for (opt of availableToActivate(); track opt.id) {
                <button
                  type="button"
                  (click)="selectCatalogOption(opt)"
                  class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style="border: 1px solid var(--aj-color-border); color: var(--aj-color-text-secondary)"
                >
                  {{ opt.name }}
                  <span class="aj-muted text-xs">
                    {{ opt.fields.length === 0 ? 'Sin datos adicionales' : opt.fields.length + ' campo(s)' }}
                  </span>
                </button>
              }
            }
          </div>
        </div>
      </div>
    }

    <!-- Modal: completar/editar campos de integración -->
    @if (showFieldsForm()) {
      <div class="ajustes-theme fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="aj-card shadow-xl w-full max-w-sm" style="background-color: var(--aj-color-surface)">
          <div class="flex items-center justify-between px-6 py-4" style="border-bottom: 1px solid var(--aj-color-border)">
            <h2 class="aj-title text-lg font-semibold">{{ fieldsFormTitle() }}</h2>
            <button type="button" (click)="closeFieldsForm()" class="aj-muted transition-colors">✕</button>
          </div>
          <div class="px-6 py-5 space-y-4">
            @if (activeFields().length === 0) {
              <p class="aj-muted text-sm">Este método no requiere datos adicionales.</p>
            }
            @for (field of activeFields(); track field.key) {
              <div>
                <label class="block text-sm font-medium mb-1" style="color: var(--aj-color-text-secondary)">
                  {{ field.label }}
                  @if (field.required) {
                    <span style="color: var(--aj-color-error)">*</span>
                  }
                </label>
                @if (field.format === 'image') {
                  @if (fieldValues()[field.key]) {
                    <div class="flex items-center gap-3">
                      <img
                        [src]="fieldValues()[field.key]"
                        alt=""
                        class="h-16 w-16 object-cover rounded-lg"
                        style="border: 1px solid var(--aj-color-border)"
                      />
                      <div class="flex flex-col gap-1">
                        <label class="text-xs font-medium cursor-pointer" style="color: var(--aj-color-primary-text)">
                          {{ uploadingFieldKey() === field.key ? 'Subiendo…' : 'Cambiar imagen' }}
                          <input
                            type="file"
                            accept="image/*"
                            [disabled]="uploadingFieldKey() === field.key"
                            (change)="onImageSelected(field, $event)"
                            class="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          (click)="removeImage(field)"
                          class="text-xs text-left"
                          style="color: var(--aj-color-error)"
                        >
                          Quitar imagen
                        </button>
                      </div>
                    </div>
                  } @else {
                    <label
                      class="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                      style="border: 1px dashed var(--aj-color-border-strong); color: var(--aj-color-text-muted)"
                    >
                      {{ uploadingFieldKey() === field.key ? 'Subiendo…' : 'Subir imagen del código QR' }}
                      <input
                        type="file"
                        accept="image/*"
                        [disabled]="uploadingFieldKey() === field.key"
                        (change)="onImageSelected(field, $event)"
                        class="hidden"
                      />
                    </label>
                  }
                } @else {
                  <input
                    [type]="field.format === 'numeric' ? 'tel' : 'text'"
                    [ngModel]="fieldValues()[field.key]"
                    (ngModelChange)="setFieldValue(field.key, $event)"
                    [placeholder]="field.length ? 'Exactamente ' + field.length + ' caracteres' : ''"
                    class="aj-input w-full px-3 py-2 text-sm"
                  />
                }
              </div>
            }
            @if (svc.error()) {
              <p class="text-sm px-3 py-2 rounded-lg" style="color: var(--aj-color-error); background-color: var(--aj-color-error-soft)">{{ svc.error() }}</p>
            }
            <div class="flex gap-3 pt-1">
              <button (click)="closeFieldsForm()" class="aj-btn-secondary flex-1 px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                (click)="submitFields()"
                [disabled]="svc.isSubmitting()"
                class="aj-btn-primary flex-1 px-4 py-2 text-sm"
              >
                {{ svc.isSubmitting() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class PaymentMethodsPageComponent implements OnInit {
  readonly svc = inject(PaymentMethodService);
  readonly catalogSvc = inject(TenantPaymentMethodCatalogService);

  readonly showCatalogPicker = signal(false);
  readonly showFieldsForm = signal(false);

  /** Fila existente que se está editando/completando; `null` = activación nueva. */
  private editingMethod: PaymentMethod | null = null;
  /** spec 088: `payment_info` que el formulario de edición mostró al abrirse (`payment_info_base`). */
  private fieldsBase: Record<string, string> | null = null;
  /** Entrada de catálogo elegida (nueva activación) o resuelta desde `catalog_id` (edición). */
  private selectedCatalogOption: CatalogPaymentMethodOption | null = null;

  readonly activeFields = signal<CatalogPaymentMethodField[]>([]);
  readonly fieldValues = signal<Record<string, string>>({});
  /** `key` del campo `format: "image"` cuyo archivo se está subiendo ahora
   * mismo (soporta más de un campo imagen a la vez, aunque hoy solo hay uno
   * por método). */
  readonly uploadingFieldKey = signal<string | null>(null);

  readonly availableToActivate = computed(() =>
    this.catalogSvc.options().filter((o) => o.active && !o.already_activated),
  );

  readonly fieldsFormTitle = computed(() =>
    this.editingMethod ? `Editar ${this.editingMethod.name}` : (this.selectedCatalogOption?.name ?? ''),
  );

  ngOnInit(): void {
    this.svc.load();
    this.catalogSvc.load();
  }

  async toggleActive(method: PaymentMethod): Promise<void> {
    await this.svc.toggleActive(method);
  }

  label(type: PaymentMethodType): string {
    return TYPES.find((t) => t.value === type)?.label ?? 'Otro';
  }

  icon(type: PaymentMethodType): string {
    return TYPES.find((t) => t.value === type)?.icon ?? '💳';
  }

  openCatalogPicker(): void {
    this.svc.error.set(null);
    this.showCatalogPicker.set(true);
  }

  closeCatalogPicker(): void {
    this.showCatalogPicker.set(false);
  }

  selectCatalogOption(option: CatalogPaymentMethodOption): void {
    this.editingMethod = null;
    this.fieldsBase = null;
    this.selectedCatalogOption = option;
    this.activeFields.set(option.fields);
    this.fieldValues.set({});
    this.showCatalogPicker.set(false);
    this.showFieldsForm.set(true);
  }

  /** Completar (incompleto) o editar (ya completo) un método ya activado. */
  openFieldsForm(method: PaymentMethod): void {
    this.editingMethod = method;
    this.selectedCatalogOption =
      this.catalogSvc.options().find((o) => o.id === method.catalog_id) ?? null;
    this.activeFields.set(this.selectedCatalogOption?.fields ?? []);
    this.fieldValues.set({ ...(method.payment_info ?? {}) });
    // spec 088: copia de lo que el formulario vio al abrirse; se envía como `payment_info_base`.
    this.fieldsBase = { ...(method.payment_info ?? {}) };
    this.svc.error.set(null);
    this.showFieldsForm.set(true);
  }

  setFieldValue(key: string, value: string): void {
    this.fieldValues.update((values) => ({ ...values, [key]: value }));
  }

  /** Sube el archivo elegido para un campo `format: "image"` (ej. código QR)
   * y guarda la URL resultante en `fieldValues` — la persistencia real ocurre
   * al pulsar "Guardar" (`submitFields()`), como con cualquier otro campo. */
  async onImageSelected(field: CatalogPaymentMethodField, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingFieldKey.set(field.key);
    const url = await this.svc.uploadQrImage(file);
    input.value = ''; // permite volver a elegir el mismo archivo tras un error
    this.uploadingFieldKey.set(null);

    if (url) this.setFieldValue(field.key, url);
  }

  removeImage(field: CatalogPaymentMethodField): void {
    this.setFieldValue(field.key, '');
  }

  closeFieldsForm(): void {
    this.showFieldsForm.set(false);
    this.editingMethod = null;
    this.fieldsBase = null;
    this.selectedCatalogOption = null;
    this.activeFields.set([]);
    this.fieldValues.set({});
    this.svc.error.set(null);
  }

  private buildPaymentInfo(): Record<string, string> | null {
    const entries = Object.entries(this.fieldValues()).filter(([, v]) => v.trim() !== '');
    return entries.length ? Object.fromEntries(entries) : null;
  }

  async submitFields(): Promise<void> {
    const paymentInfo = this.buildPaymentInfo();
    // Al editar viaja `payment_info` completo (el QR sin tocar incluido: omitirlo lo eliminaría)
    // más `payment_info_base` (spec 088): lo que el formulario vio al abrirse.
    const ok = this.editingMethod
      ? await this.svc.update(this.editingMethod.id, {
          payment_info: paymentInfo,
          payment_info_base: this.fieldsBase ?? {},
        })
      : await this.svc.create(this.selectedCatalogOption!.id, paymentInfo);
    if (ok) {
      this.closeFieldsForm();
      this.catalogSvc.load();
    }
  }
}
