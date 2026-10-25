import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  UnitMeasure,
  UnitMeasureForm,
} from '../../../core/interfaces/unit-measure.interface';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';

@Component({
  selector: 'app-unit-measure-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ unitMeasure ? 'Editar unidad de medida' : 'Nueva unidad de medida' }}
          </h2>
          <button
            type="button"
            (click)="onCancel()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              formControlName="name"
              placeholder="Ej: Gramo"
              maxlength="255"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="nameControl.invalid && nameControl.touched"
              [class.border-gray-200]="!(nameControl.invalid && nameControl.touched)"
            />
            @if (nameControl.touched && nameControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El nombre es requerido</p>
            }
            @if (nameControl.touched && nameControl.errors?.['duplicateName']) {
              <p class="text-red-500 text-xs mt-1">Ya existe una unidad con ese nombre</p>
            }
          </div>

          <!-- Abbreviation -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Abreviatura <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              formControlName="abbreviation"
              placeholder="Ej: g"
              maxlength="50"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="abbreviationControl.invalid && abbreviationControl.touched"
              [class.border-gray-200]="!(abbreviationControl.invalid && abbreviationControl.touched)"
            />
            @if (abbreviationControl.touched && abbreviationControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">La abreviatura es requerida</p>
            }
            @if (abbreviationControl.touched && abbreviationControl.errors?.['duplicateAbbreviation']) {
              <p class="text-red-500 text-xs mt-1">Ya existe una unidad con esa abreviatura</p>
            }
          </div>

          <!-- Dimension (grupo de medida) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Grupo de medida <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              formControlName="dimension"
              placeholder="Ej: Masa, Volumen"
              maxlength="100"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="dimensionControl.invalid && dimensionControl.touched"
              [class.border-gray-200]="!(dimensionControl.invalid && dimensionControl.touched)"
            />
            <p class="text-gray-400 text-xs mt-1">
              Dos unidades son convertibles entre sí solo si tienen el mismo grupo.
            </p>
            @if (dimensionControl.touched && dimensionControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El grupo de medida es requerido</p>
            }
          </div>

          <!-- Factor to base -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Factor hacia la unidad base del grupo <span class="text-red-500">*</span>
            </label>
            <input
              type="number"
              formControlName="factorToBase"
              placeholder="Ej: 1000"
              step="0.000001"
              min="0.000001"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="factorToBaseControl.invalid && factorToBaseControl.touched"
              [class.border-gray-200]="!(factorToBaseControl.invalid && factorToBaseControl.touched)"
            />
            @if (factorToBaseControl.touched && factorToBaseControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El factor es requerido</p>
            }
            @if (factorToBaseControl.touched && factorToBaseControl.errors?.['min']) {
              <p class="text-red-500 text-xs mt-1">El factor debe ser mayor que cero</p>
            }
          </div>

          <!-- Service error -->
          @if (unitMeasureService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ unitMeasureService.error() }}
            </p>
          }

          <!-- Actions -->
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
              [disabled]="unitMeasureService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ unitMeasureService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class UnitMeasureFormComponent implements OnChanges {
  @Input() unitMeasure: UnitMeasure | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly unitMeasureService = inject(UnitMeasureService);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    abbreviation: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50)],
    }),
    dimension: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    factorToBase: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.000001)],
    }),
  });

  get nameControl(): AbstractControl {
    return this.form.controls.name;
  }

  get abbreviationControl(): AbstractControl {
    return this.form.controls.abbreviation;
  }

  get dimensionControl(): AbstractControl {
    return this.form.controls.dimension;
  }

  get factorToBaseControl(): AbstractControl {
    return this.form.controls.factorToBase;
  }

  ngOnChanges(): void {
    this.unitMeasureService.error.set(null);
    if (this.unitMeasure) {
      this.form.setValue({
        name: this.unitMeasure.name,
        abbreviation: this.unitMeasure.abbreviation,
        dimension: this.unitMeasure.dimension,
        factorToBase: this.unitMeasure.factor_to_base,
      });
    } else {
      this.form.reset({ name: '', abbreviation: '', dimension: '', factorToBase: 1 });
    }
    this.nameControl.setValidators([
      Validators.required,
      Validators.maxLength(255),
      this.uniqueNameValidator(),
    ]);
    this.abbreviationControl.setValidators([
      Validators.required,
      Validators.maxLength(50),
      this.uniqueAbbreviationValidator(),
    ]);
    this.nameControl.updateValueAndValidity();
    this.abbreviationControl.updateValueAndValidity();
  }

  private uniqueNameValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value as string).trim().toLowerCase();
      const exists = this.unitMeasureService
        .unitMeasures()
        .some((u) => u.name.toLowerCase() === value && u.id !== this.unitMeasure?.id);
      return exists ? { duplicateName: true } : null;
    };
  }

  private uniqueAbbreviationValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value as string).trim().toLowerCase();
      const exists = this.unitMeasureService
        .unitMeasures()
        .some((u) => u.abbreviation.toLowerCase() === value && u.id !== this.unitMeasure?.id);
      return exists ? { duplicateAbbreviation: true } : null;
    };
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const data: UnitMeasureForm = {
      name: this.form.controls.name.value.trim(),
      abbreviation: this.form.controls.abbreviation.value.trim(),
      dimension: this.form.controls.dimension.value.trim(),
      factor_to_base: this.form.controls.factorToBase.value,
    };

    if (this.unitMeasure) {
      await this.unitMeasureService.updateUnitMeasure(this.unitMeasure.id, data);
    } else {
      await this.unitMeasureService.createUnitMeasure(data);
    }

    if (!this.unitMeasureService.error()) {
      this.saved.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
