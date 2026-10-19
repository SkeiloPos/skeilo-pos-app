import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { OptionGroup, OptionGroupForm } from '../../products/interfaces/product.interface';
import { OptionGroupService } from '../services/option-group.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

@Component({
  selector: 'app-option-group-form',
  standalone: true,
  imports: [ReactiveFormsModule, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">
            {{ group ? 'Editar grupo de opciones' : 'Nuevo grupo de opciones' }}
          </h2>
          <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <app-mi-icon name="close" ariaLabel="Cerrar" [size]="20" />
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="p-6 space-y-4">
          @if (!group) {
            <!-- spec 129 (FR-004): los grupos de opciones quedan reservados para sabores --
                 una adición (topping) nueva se marca como tal en el formulario del producto,
                 donde se asocia a nivel de producto y aplica a todas sus variantes. -->
            <p class="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Para sabores (ej. de helado). Para agregar un topping nuevo, márcalo como
              "adición" en el formulario de ese producto -- ahí se configura una sola vez
              para todas sus presentaciones.
            </p>
          }
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input formControlName="name" type="text" placeholder="Ej. Sabores"
              class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Modo de selección *</label>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-start gap-2 border rounded-xl p-3 cursor-pointer text-sm"
                [class]="form.value.selection_mode === 'conteo' ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200'">
                <input type="radio" formControlName="selection_mode" value="conteo" class="mt-0.5">
                <span>
                  <span class="block font-medium text-gray-800">Conteo</span>
                  <span class="block text-xs text-gray-500">El cliente marca hasta un máximo de opciones distintas (comportamiento actual).</span>
                </span>
              </label>
              <label class="flex items-start gap-2 border rounded-xl p-3 cursor-pointer text-sm"
                [class]="form.value.selection_mode === 'cantidad' ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200'">
                <input type="radio" formControlName="selection_mode" value="cantidad" class="mt-0.5">
                <span>
                  <span class="block font-medium text-gray-800">Cantidad</span>
                  <span class="block text-xs text-gray-500">El cliente elige libremente cuántas unidades de cada opción, nunca obligatorio.</span>
                </span>
              </label>
            </div>
          </div>

          @if (form.value.selection_mode === 'conteo') {
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Mínimo a elegir</label>
                <input formControlName="min_select" type="number" min="0" step="1"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Máximo a elegir</label>
                <input formControlName="max_select" type="number" min="1" step="1"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <p class="text-xs text-gray-400">Ej. Sabores 1–3. El mínimo obliga a elegir; el máximo limita.</p>
          } @else {
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tope por opción</label>
                <input formControlName="max_quantity_per_option" type="number" min="1" step="1" placeholder="Sin tope"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tope total del grupo</label>
                <input formControlName="max_total_quantity" type="number" min="1" step="1" placeholder="Sin tope"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              </div>
            </div>
            <p class="text-xs text-gray-400">Opcionales -- vacío significa sin tope. Nunca hay un mínimo obligatorio en modo "Cantidad".</p>
          }

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de precio *</label>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-start gap-2 border rounded-xl p-3 cursor-pointer text-sm"
                [class]="form.value.pricing_type === 'incluido' ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200'">
                <input type="radio" formControlName="pricing_type" value="incluido" class="mt-0.5">
                <span>
                  <span class="block font-medium text-gray-800">Incluido</span>
                  <span class="block text-xs text-gray-500">Ya cubierto por el precio de la presentación (un sabor de helado). Sus opciones no pueden cobrar recargo.</span>
                </span>
              </label>
              <label class="flex items-start gap-2 border rounded-xl p-3 cursor-pointer text-sm"
                [class]="form.value.pricing_type === 'con_recargo' ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-200'">
                <input type="radio" formControlName="pricing_type" value="con_recargo" class="mt-0.5">
                <span>
                  <span class="block font-medium text-gray-800">Con recargo</span>
                  <span class="block text-xs text-gray-500">Cada opción cobra su propio precio (ej. un sabor premium con costo extra).</span>
                </span>
              </label>
            </div>
          </div>

          @if (service.error()) {
            <p class="text-red-600 text-sm">{{ service.error() }}</p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="close.emit()"
              class="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" [disabled]="form.invalid || service.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {{ service.isSubmitting() ? 'Guardando...' : group ? 'Guardar cambios' : 'Crear grupo' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class OptionGroupFormComponent implements OnInit {
  /** Grupo a editar; `null` crea uno nuevo. */
  @Input() group: OptionGroup | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(OptionGroupService);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmService);

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    min_select: [0, [Validators.required, Validators.min(0)]],
    max_select: [1, [Validators.required, Validators.min(1)]],
    // Sin default (FR-001): el administrador debe elegir un tipo explícito antes de
    // poder guardar, tanto al crear como -- si el grupo se migró antes de esta
    // funcionalidad -- al editar uno existente.
    pricing_type: [null, Validators.required],
    // spec 065: "conteo" sí tiene default de negocio razonable (FR-001).
    selection_mode: ['conteo', Validators.required],
    max_quantity_per_option: [null as number | null],
    max_total_quantity: [null as number | null],
  });

  ngOnInit(): void {
    this.service.error.set(null);
    if (this.group) {
      this.form.setValue({
        name: this.group.name,
        min_select: this.group.min_select,
        max_select: this.group.max_select,
        pricing_type: this.group.pricing_type,
        selection_mode: this.group.selection_mode,
        max_quantity_per_option: this.group.max_quantity_per_option,
        max_total_quantity: this.group.max_total_quantity,
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const val = this.form.value;
    const formData: OptionGroupForm = {
      name: val.name.trim(),
      min_select: Number(val.min_select),
      max_select: Number(val.max_select),
      pricing_type: val.pricing_type,
      selection_mode: val.selection_mode,
      max_quantity_per_option:
        val.max_quantity_per_option === null || val.max_quantity_per_option === ''
          ? null
          : Number(val.max_quantity_per_option),
      max_total_quantity:
        val.max_total_quantity === null || val.max_total_quantity === ''
          ? null
          : Number(val.max_total_quantity),
    };

    // FR-004: reclasificar de "con_recargo" a "incluido" fuerza $0 en todas las
    // opciones del grupo -- pedir confirmación explícita si alguna ya tiene precio.
    if (
      this.group &&
      this.group.pricing_type === 'con_recargo' &&
      formData.pricing_type === 'incluido' &&
      this.group.options.some((o) => o.extra_price > 0)
    ) {
      const ok = await this.confirm.ask({
        title: 'Cambiar a "Incluido"',
        message:
          'Todas las opciones de este grupo quedarán en $0 -- ya no podrán cobrar recargo. ' +
          'Los demás datos (insumo, cantidad de consumo) no se ven afectados.',
        confirmText: 'Cambiar a Incluido',
        tone: 'danger',
      });
      if (!ok) {
        this.form.patchValue({ pricing_type: this.group.pricing_type });
        return;
      }
    }

    const ok = this.group
      ? await this.service.updateGroup(this.group.id, formData)
      : await this.service.createGroup(formData);
    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
