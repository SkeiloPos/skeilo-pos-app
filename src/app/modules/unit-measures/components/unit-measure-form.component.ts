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
import { UnitMeasure, UnitMeasureForm } from '../../../core/interfaces/unit-measure.interface';
import { UnitMeasureGroup } from '../../../core/interfaces/unit-measure-group.interface';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { UnitMeasureGroupService } from '../../../core/services/unit-measure-group.service';

/**
 * Agregar unidad a un grupo existente (FR-006) o editar una unidad ya creada (spec 137):
 * ya no incluye "Grupo de medida" como texto libre -- toda unidad nace dentro de un grupo
 * (`group`, obligatorio al crear) y el grupo mismo se renombra desde
 * `unit-measure-group-form.component.ts`, no aquí.
 */
@Component({
  selector: 'app-unit-measure-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ajustes-theme fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="aj-card shadow-xl w-full max-w-md" style="background-color: var(--aj-color-surface)">
        <div class="flex items-center justify-between px-6 py-4" style="border-bottom: 1px solid var(--aj-color-border)">
          <h2 class="aj-title text-lg font-semibold">
            {{ unitMeasure ? 'Editar unidad de medida' : 'Nueva unidad' }}
            @if (group) { <span class="aj-muted text-sm font-normal"> · {{ group.name }} </span> }
          </h2>
          <button type="button" (click)="onCancel()" class="aj-muted transition-colors">✕</button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
          @if (isBase) {
            <p
              class="text-xs rounded-lg px-3 py-2"
              style="background-color: var(--aj-color-primary-soft); color: var(--aj-color-primary-text)"
            >
              Esta es la unidad base del grupo: su factor no se puede editar ni desactivarse.
              Para cambiarla, reasigna la base desde la lista de grupos.
            </p>
          }

          <!-- Name -->
          <div>
            <label class="block text-sm font-medium mb-1" style="color: var(--aj-color-text-secondary)">
              Nombre <span style="color: var(--aj-color-error)">*</span>
            </label>
            <input
              type="text"
              formControlName="name"
              placeholder="Ej: Gramo"
              maxlength="255"
              class="aj-input w-full px-3 py-2 text-sm"
            />
            @if (nameControl.touched && nameControl.errors?.['required']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">El nombre es requerido</p>
            }
            @if (nameControl.touched && nameControl.errors?.['duplicateName']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">Ya existe una unidad con ese nombre</p>
            }
          </div>

          <!-- Abbreviation -->
          <div>
            <label class="block text-sm font-medium mb-1" style="color: var(--aj-color-text-secondary)">
              Abreviatura <span style="color: var(--aj-color-error)">*</span>
            </label>
            <input
              type="text"
              formControlName="abbreviation"
              placeholder="Ej: g"
              maxlength="50"
              class="aj-input w-full px-3 py-2 text-sm"
            />
            @if (abbreviationControl.touched && abbreviationControl.errors?.['required']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">La abreviatura es requerida</p>
            }
          </div>

          <!-- Factor to base -->
          <div>
            <label class="block text-sm font-medium mb-1" style="color: var(--aj-color-text-secondary)">
              Factor hacia la unidad base del grupo <span style="color: var(--aj-color-error)">*</span>
            </label>
            <input
              type="number"
              formControlName="factorToBase"
              placeholder="Ej: 1000"
              step="0.000001"
              min="0.000001"
              [title]="isBase ? 'La unidad base siempre tiene factor 1' : ''"
              class="aj-input w-full px-3 py-2 text-sm"
            />
            @if (factorToBaseControl.touched && factorToBaseControl.errors?.['required']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">El factor es requerido</p>
            }
            @if (factorToBaseControl.touched && factorToBaseControl.errors?.['min']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">El factor debe ser mayor que cero</p>
            }
          </div>

          <!-- Service error -->
          @if (currentError()) {
            <p class="text-sm px-3 py-2 rounded-lg" style="color: var(--aj-color-error); background-color: var(--aj-color-error-soft)">
              {{ currentError() }}
            </p>
          }

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <button type="button" (click)="onCancel()" class="aj-btn-secondary flex-1 px-4 py-2 text-sm">
              Cancelar
            </button>
            <button type="submit" [disabled]="isSubmitting() || (form.touched && form.invalid)"
              class="aj-btn-primary flex-1 px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {{ isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class UnitMeasureFormComponent implements OnChanges {
  /** Unidad a editar; `null` agrega una unidad nueva a `group`. */
  @Input() unitMeasure: UnitMeasure | null = null;
  /** Grupo al que pertenece (siempre presente al crear; opcional al editar). */
  @Input() group: UnitMeasureGroup | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly unitMeasureService = inject(UnitMeasureService);
  readonly groupService = inject(UnitMeasureGroupService);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    abbreviation: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50)],
    }),
    factorToBase: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.000001)],
    }),
  });

  get isBase(): boolean {
    return this.unitMeasure?.is_base ?? false;
  }

  get nameControl(): AbstractControl {
    return this.form.controls.name;
  }

  get abbreviationControl(): AbstractControl {
    return this.form.controls.abbreviation;
  }

  get factorToBaseControl(): AbstractControl {
    return this.form.controls.factorToBase;
  }

  /** Editar usa `UnitMeasureService`; crear dentro de un grupo usa `UnitMeasureGroupService`. */
  isSubmitting() {
    return this.unitMeasure
      ? this.unitMeasureService.isSubmitting()
      : this.groupService.isSubmitting();
  }

  currentError() {
    return this.unitMeasure ? this.unitMeasureService.error() : this.groupService.error();
  }

  ngOnChanges(): void {
    this.unitMeasureService.error.set(null);
    if (this.unitMeasure) {
      this.form.setValue({
        name: this.unitMeasure.name,
        abbreviation: this.unitMeasure.abbreviation,
        factorToBase: this.unitMeasure.factor_to_base,
      });
      if (this.isBase) {
        this.factorToBaseControl.disable();
      } else {
        this.factorToBaseControl.enable();
      }
    } else {
      this.form.reset({ name: '', abbreviation: '', factorToBase: 1 });
      this.factorToBaseControl.enable();
    }
    this.nameControl.setValidators([
      Validators.required,
      Validators.maxLength(255),
      this.uniqueNameValidator(),
    ]);
    this.abbreviationControl.setValidators([
      Validators.required,
      Validators.maxLength(50),
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

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const data: UnitMeasureForm = {
      name: this.form.controls.name.value.trim(),
      abbreviation: this.form.controls.abbreviation.value.trim(),
      factor_to_base: this.form.controls.factorToBase.value,
    };

    let ok: boolean;
    if (this.unitMeasure) {
      await this.unitMeasureService.updateUnitMeasure(this.unitMeasure.id, data);
      ok = !this.unitMeasureService.error();
    } else {
      ok = await this.groupService.addUnit(this.group!.id, {
        name: data.name,
        abbreviation: data.abbreviation,
        factor_to_base: data.factor_to_base,
      });
      if (ok) await this.unitMeasureService.loadUnitMeasures();
    }

    if (ok) this.saved.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
