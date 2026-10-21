import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  PaymentMethodCatalogEntry,
  PaymentMethodFieldFormat,
} from '../interfaces/payment-method-catalog.interface';
import { PaymentMethodCatalogService } from '../services/payment-method-catalog.service';

type FieldFormGroup = FormGroup<{
  key: FormControl<string>;
  label: FormControl<string>;
  required: FormControl<boolean>;
  format: FormControl<PaymentMethodFieldFormat>;
  length: FormControl<number | null>;
}>;

function buildFieldGroup(initial?: {
  key?: string;
  label?: string;
  required?: boolean;
  format?: PaymentMethodFieldFormat;
  length?: number | null;
}): FieldFormGroup {
  return new FormGroup({
    key: new FormControl(initial?.key ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)],
    }),
    label: new FormControl(initial?.label ?? '', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    required: new FormControl(initial?.required ?? false, { nonNullable: true }),
    format: new FormControl<PaymentMethodFieldFormat>(initial?.format ?? 'text', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    length: new FormControl<number | null>(initial?.length ?? null),
  });
}

/** Alta/edición de un método del catálogo del Super Admin, incluyendo el
 * editor de campos de integración requeridos/opcionales (FR-001/FR-002/FR-004). */
@Component({
  selector: 'app-payment-method-catalog-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div
          class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white"
        >
          <h2 class="text-lg font-semibold text-gray-900">
            {{ entry ? 'Editar método de pago' : 'Nuevo método de pago' }}
          </h2>
          <button
            type="button"
            (click)="onCancel()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              formControlName="name"
              placeholder="Ej: Daviplata"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="invalid('name')"
              [class.border-gray-200]="!invalid('name')"
            />
            @if (invalid('name')) {
              <p class="text-red-500 text-xs mt-1">El nombre es obligatorio</p>
            }
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Tipo <span class="text-red-500">*</span>
            </label>
            <select
              formControlName="type"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="mixed">Pago mixto</option>
              <option value="other">Otro</option>
            </select>
          </div>

          <div class="space-y-3 pt-2 border-t border-gray-100">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Campos de integración
              </h3>
              <button
                type="button"
                (click)="addField()"
                class="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                + Agregar campo
              </button>
            </div>

            @if (fields.length === 0) {
              <p class="text-xs text-gray-400">
                Sin campos adicionales (ej. Efectivo no requiere ninguno).
              </p>
            }

            @for (field of fields.controls; track $index) {
              <div class="border border-gray-100 rounded-lg p-3 space-y-2" [formGroup]="field">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-medium text-gray-500">Campo {{ $index + 1 }}</span>
                  <button
                    type="button"
                    (click)="removeField($index)"
                    class="text-xs text-red-500 hover:text-red-600"
                  >
                    Quitar
                  </button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    formControlName="key"
                    placeholder="clave (ej: celular)"
                    class="px-2 py-1.5 border border-gray-200 rounded-md text-sm font-mono"
                  />
                  <input
                    type="text"
                    formControlName="label"
                    placeholder="Etiqueta visible"
                    class="px-2 py-1.5 border border-gray-200 rounded-md text-sm"
                  />
                  <select
                    formControlName="format"
                    class="px-2 py-1.5 border border-gray-200 rounded-md text-sm"
                  >
                    <option value="text">Texto</option>
                    <option value="numeric">Numérico</option>
                    <option value="image">Imagen</option>
                  </select>
                  <input
                    type="number"
                    formControlName="length"
                    placeholder="Longitud exacta (opcional)"
                    [disabled]="field.controls.format.value === 'image'"
                    class="px-2 py-1.5 border border-gray-200 rounded-md text-sm disabled:bg-gray-50"
                  />
                </div>
                <label class="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" formControlName="required" />
                  Obligatorio
                </label>
              </div>
            }
          </div>

          @if (catalogService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ catalogService.error() }}
            </p>
          }

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              (click)="onCancel()"
              class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="catalogService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ catalogService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class PaymentMethodCatalogFormComponent implements OnInit {
  @Input() entry: PaymentMethodCatalogEntry | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly catalogService = inject(PaymentMethodCatalogService);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl<'cash' | 'card' | 'transfer' | 'other' | 'mixed'>('other', { nonNullable: true }),
    fields: new FormArray<FieldFormGroup>([]),
  });

  get fields(): FormArray<FieldFormGroup> {
    return this.form.controls.fields;
  }

  ngOnInit(): void {
    if (this.entry) {
      this.form.patchValue({ name: this.entry.name, type: this.entry.type });
      for (const f of this.entry.fields) {
        this.fields.push(buildFieldGroup(f));
      }
    }
  }

  invalid(name: 'name'): boolean {
    const control: AbstractControl = this.form.controls[name];
    return control.invalid && control.touched;
  }

  addField(): void {
    this.fields.push(buildFieldGroup());
  }

  removeField(index: number): void {
    this.fields.removeAt(index);
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    const payload = {
      name: raw.name.trim(),
      type: raw.type,
      fields: raw.fields.map((f) => ({
        key: f.key.trim(),
        label: f.label.trim(),
        required: f.required,
        format: f.format,
        length: f.format === 'image' ? null : (f.length ?? null),
      })),
    };

    const ok = this.entry
      ? await this.catalogService.update(this.entry.id, payload)
      : await this.catalogService.create(payload);

    if (ok) this.saved.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
