import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UnitMeasureGroupService } from '../../../core/services/unit-measure-group.service';

/** Crear un grupo nuevo con su unidad base en un solo paso (FR-005). */
@Component({
  selector: 'app-unit-measure-group-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ajustes-theme fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="aj-card shadow-xl w-full max-w-md" style="background-color: var(--aj-color-surface)">
        <div class="flex items-center justify-between px-6 py-4" style="border-bottom: 1px solid var(--aj-color-border)">
          <h2 class="aj-title text-lg font-semibold">Nuevo grupo de unidades</h2>
          <button type="button" (click)="cancelled.emit()" class="aj-muted transition-colors">✕</button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1" style="color: var(--aj-color-text-secondary)">
              Nombre del grupo <span style="color: var(--aj-color-error)">*</span>
            </label>
            <input type="text" formControlName="name" placeholder="Ej: Volumen" maxlength="255" class="aj-input w-full px-3 py-2 text-sm" />
            <p class="aj-muted text-xs mt-1">
              Dos unidades son convertibles entre sí solo si pertenecen al mismo grupo.
            </p>
            @if (nameControl.touched && nameControl.errors?.['required']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">El nombre del grupo es requerido</p>
            }
          </div>

          <p class="aj-muted text-xs font-medium uppercase tracking-wide">Unidad base</p>

          <div>
            <label class="block text-sm font-medium mb-1" style="color: var(--aj-color-text-secondary)">
              Nombre de la unidad <span style="color: var(--aj-color-error)">*</span>
            </label>
            <input type="text" formControlName="baseName" placeholder="Ej: Mililitro" maxlength="255" class="aj-input w-full px-3 py-2 text-sm" />
            @if (baseNameControl.touched && baseNameControl.errors?.['required']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">El nombre de la unidad es requerido</p>
            }
          </div>

          <div>
            <label class="block text-sm font-medium mb-1" style="color: var(--aj-color-text-secondary)">
              Abreviatura <span style="color: var(--aj-color-error)">*</span>
            </label>
            <input type="text" formControlName="baseAbbreviation" placeholder="Ej: ml" maxlength="50" class="aj-input w-full px-3 py-2 text-sm" />
            @if (baseAbbreviationControl.touched && baseAbbreviationControl.errors?.['required']) {
              <p class="text-xs mt-1" style="color: var(--aj-color-error)">La abreviatura es requerida</p>
            }
          </div>

          @if (groupService.error()) {
            <p class="text-sm px-3 py-2 rounded-lg" style="color: var(--aj-color-error); background-color: var(--aj-color-error-soft)">
              {{ groupService.error() }}
            </p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="cancelled.emit()" class="aj-btn-secondary flex-1 px-4 py-2 text-sm">
              Cancelar
            </button>
            <button type="submit" [disabled]="groupService.isSubmitting()" class="aj-btn-primary flex-1 px-4 py-2 text-sm">
              {{ groupService.isSubmitting() ? 'Guardando...' : 'Crear grupo' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class UnitMeasureGroupFormComponent {
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly groupService = inject(UnitMeasureGroupService);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    baseName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    baseAbbreviation: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(50)] }),
  });

  get nameControl() {
    return this.form.controls.name;
  }
  get baseNameControl() {
    return this.form.controls.baseName;
  }
  get baseAbbreviationControl() {
    return this.form.controls.baseAbbreviation;
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const ok = await this.groupService.createGroup({
      name: this.form.controls.name.value.trim(),
      base_unit: {
        name: this.form.controls.baseName.value.trim(),
        abbreviation: this.form.controls.baseAbbreviation.value.trim(),
      },
    });
    if (ok) this.saved.emit();
  }
}
