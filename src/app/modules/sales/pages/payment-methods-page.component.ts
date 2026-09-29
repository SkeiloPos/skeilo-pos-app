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

/** Clasificaciones que entiende el arqueo de caja (solo para el ícono/label). */
const TYPES: { value: PaymentMethodType; label: string; icon: string }[] = [
  { value: 'cash', label: 'Efectivo', icon: '💵' },
  { value: 'card', label: 'Tarjeta', icon: '💳' },
  { value: 'transfer', label: 'Transferencia', icon: '📲' },
  { value: 'other', label: 'Otro', icon: '🧾' },
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
  imports: [FormsModule],
  template: `
    <div class="space-y-6 max-w-2xl">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Métodos de pago</h1>
          <p class="text-gray-500 text-sm mt-1">Formas de cobro disponibles en el checkout</p>
        </div>
        <button
          (click)="openCatalogPicker()"
          class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          + Activar método
        </button>
      </div>

      @if (svc.error() && !showFieldsForm()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ svc.error() }}
        </div>
      }

      @if (svc.loading() && svc.methods().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (svc.methods().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">💳</div>
              <p class="text-gray-600 font-medium">Aún no hay métodos de pago activados</p>
              <p class="text-gray-400 text-sm mt-1">Activa al menos uno (ej: Efectivo) para poder cobrar</p>
            </div>
          } @else {
            <ul class="divide-y divide-gray-50">
              @for (m of svc.methods(); track m.id) {
                <li class="flex items-center justify-between px-5 py-3 gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="text-xl">{{ icon(m.type) }}</span>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-900">{{ m.name }}</p>
                      <p class="text-xs text-gray-400">{{ label(m.type) }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    @if (!m.is_complete) {
                      <span
                        class="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700"
                        title="Faltan datos obligatorios por completar"
                      >
                        Incompleto
                      </span>
                      <button
                        (click)="openFieldsForm(m)"
                        class="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Completar
                      </button>
                    } @else {
                      <button
                        (click)="openFieldsForm(m)"
                        class="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Editar
                      </button>
                    }
                    <button
                      (click)="toggleActive(m)"
                      [disabled]="svc.isSubmitting()"
                      [title]="m.active ? 'Desactivar' : 'Activar'"
                      class="text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors disabled:opacity-40"
                      [class]="
                        m.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      "
                    >
                      {{ m.active ? 'Activo' : 'Inactivo' }}
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>

    <!-- Modal: elegir del catálogo -->
    @if (showCatalogPicker()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
            <h2 class="text-lg font-semibold text-gray-900">Activar método de pago</h2>
            <button type="button" (click)="closeCatalogPicker()" class="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
          </div>
          <div class="px-6 py-5 space-y-2">
            @if (catalogSvc.loading()) {
              <p class="text-sm text-gray-400 text-center py-6">Cargando catálogo…</p>
            } @else if (availableToActivate().length === 0) {
              <p class="text-sm text-gray-400 text-center py-6">
                Ya activaste todos los métodos disponibles en el catálogo de la plataforma.
              </p>
            } @else {
              @for (opt of availableToActivate(); track opt.id) {
                <button
                  type="button"
                  (click)="selectCatalogOption(opt)"
                  class="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {{ opt.name }}
                  <span class="text-xs text-gray-400">
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
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 class="text-lg font-semibold text-gray-900">{{ fieldsFormTitle() }}</h2>
            <button type="button" (click)="closeFieldsForm()" class="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
          </div>
          <div class="px-6 py-5 space-y-4">
            @if (activeFields().length === 0) {
              <p class="text-sm text-gray-400">Este método no requiere datos adicionales.</p>
            }
            @for (field of activeFields(); track field.key) {
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  {{ field.label }}
                  @if (field.required) {
                    <span class="text-red-500">*</span>
                  }
                </label>
                @if (field.format === 'image') {
                  @if (fieldValues()[field.key]) {
                    <div class="flex items-center gap-3">
                      <img
                        [src]="fieldValues()[field.key]"
                        alt=""
                        class="h-16 w-16 object-cover rounded-lg border border-gray-200"
                      />
                      <div class="flex flex-col gap-1">
                        <label
                          class="text-xs font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer"
                        >
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
                          class="text-xs text-red-500 hover:text-red-600 text-left"
                        >
                          Quitar imagen
                        </button>
                      </div>
                    </div>
                  } @else {
                    <label
                      class="flex items-center justify-center gap-2 w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors"
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
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                }
              </div>
            }
            @if (svc.error()) {
              <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{{ svc.error() }}</p>
            }
            <div class="flex gap-3 pt-1">
              <button (click)="closeFieldsForm()" class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                (click)="submitFields()"
                [disabled]="svc.isSubmitting()"
                class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
