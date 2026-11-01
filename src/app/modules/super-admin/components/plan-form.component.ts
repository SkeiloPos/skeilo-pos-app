import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Plan, PlanCreatePayload } from '../interfaces/plan.interface';
import { PlanService } from '../services/plan.service';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { ConfirmService } from '../../../shared/feedback/confirm.service';

interface LimitGroup {
  value: FormControl<number>;
  unlimited: FormControl<boolean>;
}

const LIMIT_FIELDS = [
  { key: 'mesas_limit', label: 'Mesas' },
  { key: 'cajas_limit', label: 'Cajas' },
  { key: 'usuarios_limit', label: 'Usuarios' },
  { key: 'productos_limit', label: 'Productos' },
  { key: 'metodos_pago_activos_limit', label: 'Métodos de pago activos' },
] as const;

function buildLimitGroup(value: number | null): FormGroup<LimitGroup> {
  return new FormGroup<LimitGroup>({
    value: new FormControl(value ?? 0, { nonNullable: true, validators: [Validators.min(0)] }),
    unlimited: new FormControl(value === null, { nonNullable: true }),
  });
}

/** Texto fijo de la confirmación al quitar «Inventario» de un plan existente (spec 141, FR-019). */
const QUITAR_INVENTARIO_MENSAJE =
  'Los negocios con este plan perderán Inventario, Proveedores y Compras de inmediato';

/** Alta/edición de un plan del Super Admin: siete características (cinco
 * límites numéricos con toggle "ilimitado", dos accesos de módulo) y dos
 * precios de referencia (spec 033, Historia de Usuario 1). Mismo patrón que
 * `payment-method-catalog-form.component.ts`.
 *
 * Spec 141: «Inventario» es un solo interruptor que incluye Proveedores y Compras;
 * «Compras» ya no es un módulo configurable. */
@Component({
  selector: 'app-plan-form',
  standalone: true,
  imports: [ReactiveFormsModule, MoneyInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ plan ? 'Editar plan' : 'Nuevo plan' }}
          </h2>
          <button type="button" (click)="onCancel()" class="text-gray-400 hover:text-gray-600 transition-colors">
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
              placeholder="Ej: Pro"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="invalid('name')"
              [class.border-gray-200]="!invalid('name')"
            />
            @if (invalid('name')) {
              <p class="text-red-500 text-xs mt-1">El nombre es obligatorio</p>
            }
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              formControlName="description"
              rows="2"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            ></textarea>
          </div>

          <div class="space-y-3">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Límites</h3>
            @for (field of limitFields; track field.key) {
              <div class="flex items-center gap-3">
                <label class="flex-1 text-sm text-gray-700">{{ field.label }}</label>
                <input
                  type="number"
                  min="0"
                  [formControl]="limitGroup(field.key).controls.value"
                  [disabled]="limitGroup(field.key).controls.unlimited.value"
                  class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400"
                />
                <label class="flex items-center gap-1.5 text-xs text-gray-500">
                  <input type="checkbox" [formControl]="limitGroup(field.key).controls.unlimited" />
                  Ilimitado
                </label>
              </div>
            }
          </div>

          <div class="space-y-2">
            <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Accesos de módulo</h3>
            <div>
              <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" formControlName="inventario_access" /> Inventario
              </label>
              <p class="text-xs text-gray-400 ml-6">Incluye Proveedores y Compras</p>
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" formControlName="promociones_access" /> Promociones
            </label>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Precio mensual</label>
              <app-money-input
                formControlName="precio_mensual"
                [decimals]="2"
                placeholder="Sin precio"
                sizeClass="px-3 py-2 rounded-lg text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Precio anual</label>
              <app-money-input
                formControlName="precio_anual"
                [decimals]="2"
                placeholder="Sin precio"
                sizeClass="px-3 py-2 rounded-lg text-sm"
              />
            </div>
          </div>

          @if (planService.error()) {
            <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-700">
              {{ planService.error() }}
            </div>
          }

          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              (click)="onCancel()"
              class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="planService.isSubmitting()"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {{ planService.isSubmitting() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class PlanFormComponent implements OnInit {
  @Input() plan: Plan | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly planService = inject(PlanService);
  private readonly confirm = inject(ConfirmService);
  readonly limitFields = LIMIT_FIELDS;

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl<string | null>(null),
    mesas_limit: buildLimitGroup(null),
    cajas_limit: buildLimitGroup(null),
    usuarios_limit: buildLimitGroup(null),
    productos_limit: buildLimitGroup(null),
    metodos_pago_activos_limit: buildLimitGroup(null),
    inventario_access: new FormControl(false, { nonNullable: true }),
    promociones_access: new FormControl(false, { nonNullable: true }),
    precio_mensual: new FormControl<number | null>(null),
    precio_anual: new FormControl<number | null>(null),
  });

  ngOnInit(): void {
    if (!this.plan) return;
    this.form.patchValue({
      name: this.plan.name,
      description: this.plan.description ?? null,
      inventario_access: this.plan.inventario_access,
      promociones_access: this.plan.promociones_access,
      precio_mensual: this.plan.precio_mensual !== null ? Number(this.plan.precio_mensual) : null,
      precio_anual: this.plan.precio_anual !== null ? Number(this.plan.precio_anual) : null,
    });
    for (const field of LIMIT_FIELDS) {
      const current = this.plan[field.key];
      this.limitGroup(field.key).setValue({ value: current ?? 0, unlimited: current === null });
    }
  }

  limitGroup(key: (typeof LIMIT_FIELDS)[number]['key']): FormGroup<LimitGroup> {
    return this.form.controls[key];
  }

  invalid(controlName: 'name'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: PlanCreatePayload = {
      name: raw.name,
      description: raw.description,
      inventario_access: raw.inventario_access,
      promociones_access: raw.promociones_access,
      precio_mensual: raw.precio_mensual,
      precio_anual: raw.precio_anual,
      mesas_limit: raw.mesas_limit.unlimited ? null : raw.mesas_limit.value,
      cajas_limit: raw.cajas_limit.unlimited ? null : raw.cajas_limit.value,
      usuarios_limit: raw.usuarios_limit.unlimited ? null : raw.usuarios_limit.value,
      productos_limit: raw.productos_limit.unlimited ? null : raw.productos_limit.value,
      metodos_pago_activos_limit: raw.metodos_pago_activos_limit.unlimited
        ? null
        : raw.metodos_pago_activos_limit.value,
    };

    // Solo al EDITAR un plan que hoy incluye Inventario y se está quitando (US1.8). No al crear, no al
    // reasignar el plan de un negocio y no al quitar solo «Promociones» (US1.9).
    if (this.plan?.inventario_access === true && payload.inventario_access === false) {
      const confirmado = await this.confirm.ask({
        title: 'Quitar Inventario del plan',
        message: QUITAR_INVENTARIO_MENSAJE,
        tone: 'danger',
      });
      if (!confirmado) return;
    }

    const ok = this.plan
      ? await this.planService.update(this.plan.id, payload)
      : await this.planService.create(payload);
    if (ok) this.saved.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
