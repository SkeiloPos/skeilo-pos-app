import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UnitMeasure } from '../../../core/interfaces/unit-measure.interface';
import { UnitMeasureGroup, UnitInGroup } from '../../../core/interfaces/unit-measure-group.interface';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { UnitMeasureGroupService } from '../../../core/services/unit-measure-group.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { UnitMeasureFormComponent } from '../components/unit-measure-form.component';
import { UnitMeasureGroupFormComponent } from '../components/unit-measure-group-form.component';

/**
 * Unidades de medida agrupadas por `UnitMeasureGroup` (spec 137), siguiendo
 * `design/ajustes.html` (tarjeta "Conversión de unidades" + tarjeta por grupo con tabla
 * UNIDAD/EQUIVALENCIA/USO/ESTADO/ACCIÓN): la unidad base se muestra primero, marcada con
 * una insignia y sin acciones de editar/desactivar (FR-008). "Hacer base" solo aparece en
 * unidades no-base; "Eliminar grupo" siempre se muestra, pero si el backend responde 409
 * por unidades en uso se listan (`contracts/ajustes-ui-contract.md`). La columna USO no se
 * completa de forma proactiva (memoria "No proactive background fetches in selectors") --
 * el backend ya informa qué unidades bloquean una acción cuando esta se intenta.
 */
@Component({
  selector: 'app-unit-measures-page',
  standalone: true,
  imports: [FormsModule, IconMiComponent, UnitMeasureFormComponent, UnitMeasureGroupFormComponent],
  template: `
    <div class="ajustes-theme flex flex-col gap-5 pt-2">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1" style="flex-basis: 320px">
          <div class="aj-row-title">Unidades de medida</div>
          <div class="aj-row-desc">
            Grupos de unidades y factores de conversión que usa Inventario para comprar en
            la presentación del proveedor.
          </div>
        </div>
        <button (click)="openCreateGroup()" class="aj-btn-primary inline-flex items-center gap-2 whitespace-nowrap">
          <app-mi-icon name="add" [size]="16" />
          Nuevo grupo
        </button>
      </div>

      @if (groupService.error() && !showGroupForm() && !showUnitForm()) {
        <div
          class="rounded-xl px-4 py-3 text-sm"
          style="background-color: var(--aj-color-error-soft); border: 1px solid var(--aj-color-error); color: var(--aj-color-error)"
        >
          {{ groupService.error() }}
          @if (groupService.blockingUnits(); as blocking) {
            @if (blocking.length > 0) {
              <ul class="list-disc list-inside mt-1">
                @for (u of blocking; track u.id) {
                  <li>{{ u.name }} @if (u.abbreviation) { ({{ u.abbreviation }}) }</li>
                }
              </ul>
            }
          }
        </div>
      }

      <!-- Conversión de unidades (spec 134): interruptor maestro, trasladado desde
           "Información básica" a esta pestaña para coincidir con design/ajustes.html. -->
      @if (isAdmin()) {
        <div class="aj-card p-5 flex flex-col gap-3">
          <div class="flex justify-between items-center gap-4 flex-wrap">
            <div class="flex-1" style="flex-basis: 340px; min-width: 0">
              <div class="font-semibold" style="font-family: var(--aj-font-display); font-size: 18px">
                Conversión de unidades
              </div>
              <p class="mt-1" style="color: var(--aj-color-text-secondary); line-height: 1.5">
                Compra en la presentación del proveedor; el stock se controla siempre en la
                unidad base del insumo.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="unitConversionEnabled()"
              aria-label="Conversión de unidades"
              (click)="onUnitConversionToggle(!unitConversionEnabled())"
              [disabled]="tenantInfo.isSubmitting()"
              class="aj-switch"
              [attr.aria-disabled]="tenantInfo.isSubmitting()"
            >
              <span class="aj-switch-knob"></span>
            </button>
          </div>
          <div class="flex gap-4 flex-wrap text-sm" style="color: var(--aj-color-text-muted)">
            <span class="inline-flex items-center gap-1.5">
              <app-mi-icon name="lock" [size]="14" />
              {{ unitConversionEnabled() ? 'Activo para todo el tenant.' : 'Desactivado: solo se compra en la unidad base.' }}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <app-mi-icon name="shield-check" [size]="14" />
              Solo administradores pueden modificar grupos y factores. Cada cambio queda en el historial.
            </span>
          </div>
        </div>
      }

      <!-- Filters -->
      <input
        type="text"
        [(ngModel)]="searchTermValue"
        (ngModelChange)="searchTerm.set($event)"
        placeholder="Buscar por nombre o abreviatura de unidad..."
        class="aj-input w-full max-w-sm text-sm"
      />

      @if (groupService.loading() && groupService.groups().length === 0) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
            style="border-color: var(--aj-color-primary); border-top-color: transparent"
          ></div>
        </div>
      } @else if (filteredGroups().length === 0) {
        <div class="aj-card flex flex-col items-center justify-center py-16 text-center px-4">
          @if (searchTerm()) {
            <p class="aj-title font-medium">No hay unidades que coincidan</p>
            <p class="aj-muted text-sm mt-1">Intenta cambiar la búsqueda</p>
          } @else {
            <p class="aj-title font-medium">Aún no hay grupos de unidades</p>
            <p class="aj-muted text-sm mt-1">Crea el primero con «Nuevo grupo».</p>
          }
        </div>
      } @else {
        <div class="flex flex-col gap-5">
          @for (group of filteredGroups(); track group.id) {
            <div class="aj-card p-5 flex flex-col gap-4">
              <div class="flex justify-between items-center gap-3 flex-wrap">
                <div class="flex items-center gap-3 flex-wrap">
                  <div class="font-semibold" style="font-family: var(--aj-font-display); font-size: 18px">
                    {{ group.name }}
                  </div>
                  <span class="aj-badge aj-badge-primary">Unidad base: {{ baseUnit(group)?.name }}</span>
                  <span class="aj-muted text-sm">{{ group.units.length }} unidad(es)</span>
                </div>
                <div class="flex items-center gap-1 flex-wrap">
                  <button (click)="onDeleteGroup(group)" class="aj-icon-btn aj-icon-btn-danger" title="Eliminar grupo" [attr.aria-label]="'Eliminar grupo ' + group.name">
                    <app-mi-icon name="trash-2" [size]="18" />
                  </button>
                  <button (click)="openAddUnit(group)" class="aj-btn-secondary inline-flex items-center gap-2 text-sm">
                    <app-mi-icon name="add" [size]="16" />
                    Agregar unidad
                  </button>
                </div>
              </div>

              <div class="aj-card overflow-x-auto">
                <table class="w-full" style="min-width: 640px; border-collapse: collapse">
                  <caption class="sr-only">Unidades del grupo {{ group.name }}</caption>
                  <thead>
                    <tr>
                      <th scope="col" class="aj-th">UNIDAD</th>
                      <th scope="col" class="aj-th">EQUIVALENCIA</th>
                      <th scope="col" class="aj-th">USO</th>
                      <th scope="col" class="aj-th">ESTADO</th>
                      <th scope="col" class="aj-th" style="text-align: right">ACCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (unit of sortedUnits(group); track unit.id) {
                      <tr>
                        <th scope="row" class="aj-td text-left font-semibold uppercase">{{ unit.name }}</th>
                        <td class="aj-td" style="color: var(--aj-color-text-secondary)">
                          @if (unit.is_base) {
                            Unidad base · factor 1
                          } @else {
                            1 {{ unit.abbreviation }} = {{ formatFactor(unit.factor_to_base) }} {{ baseUnit(group)?.abbreviation }}
                          }
                        </td>
                        <td class="aj-td" style="color: var(--aj-color-text-secondary)">—</td>
                        <td class="aj-td">
                          <span class="aj-badge" [class]="unit.is_base ? 'aj-badge-primary' : unit.active ? 'aj-badge-success' : 'aj-badge-neutral'">
                            {{ unit.is_base ? 'Base' : unit.active ? 'Activa' : 'Inactiva' }}
                          </span>
                        </td>
                        <td class="aj-td text-right whitespace-nowrap">
                          @if (unit.is_base) {
                            <span class="aj-muted text-sm">No editable</span>
                          } @else {
                            @if (group.units.length > 1) {
                              <button (click)="onReassignBase(group, unit)" class="text-sm font-medium" style="color: var(--aj-color-primary-text); background: none; border: 0; margin-right: 4px" title="Hacer que esta unidad sea la base del grupo">
                                Hacer base
                              </button>
                            }
                            <button (click)="openEdit(group, unit)" class="aj-icon-btn" title="Editar factor de {{ unit.name }}" [attr.aria-label]="'Editar factor de ' + unit.name">
                              <app-mi-icon name="pencil" [size]="18" />
                            </button>
                            <button (click)="onToggle(unit)" class="aj-icon-btn" [title]="unit.active ? 'Desactivar ' + unit.name : 'Activar ' + unit.name">
                              <app-mi-icon [name]="unit.active ? 'block' : 'autorenew'" [size]="18" />
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Modals -->
    @if (showGroupForm()) {
      <app-unit-measure-group-form (saved)="onGroupSaved()" (cancelled)="closeGroupForm()" />
    }
    @if (showUnitForm()) {
      <app-unit-measure-form
        [unitMeasure]="editingUnitMeasure()"
        [group]="selectedGroup()"
        (saved)="onUnitSaved()"
        (cancelled)="closeUnitForm()"
      />
    }
  `,
})
export class UnitMeasuresPageComponent implements OnInit {
  readonly unitMeasureService = inject(UnitMeasureService);
  readonly groupService = inject(UnitMeasureGroupService);
  readonly tenantInfo = inject(TenantInfoService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly searchTerm = signal('');
  searchTermValue = '';

  readonly showGroupForm = signal(false);
  readonly showUnitForm = signal(false);
  readonly selectedGroup = signal<UnitMeasureGroup | null>(null);
  readonly editingUnitMeasure = signal<UnitMeasure | null>(null);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === UserRole.ADMIN);
  readonly unitConversionEnabled = computed(
    () => this.tenantInfo.info()?.unit_conversion_enabled ?? true,
  );

  readonly filteredGroups = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.groupService.groups();
    return this.groupService.groups().filter((g) =>
      g.name.toLowerCase().includes(term) ||
      g.units.some(
        (u) => u.name.toLowerCase().includes(term) || u.abbreviation.toLowerCase().includes(term),
      ),
    );
  });

  baseUnit(group: UnitMeasureGroup): UnitInGroup | undefined {
    return group.units.find((u) => u.is_base);
  }

  sortedUnits(group: UnitMeasureGroup): UnitInGroup[] {
    return [...group.units].sort((a, b) => (a.is_base === b.is_base ? 0 : a.is_base ? -1 : 1));
  }

  /** `factor_to_base` llega del backend como texto con 6 decimales fijos (p. ej.
   * "1000.000000") porque Pydantic serializa `Decimal` como string -- se muestra sin
   * ceros de relleno (1000, no 1000.000000), pero conserva los decimales reales
   * (453.592). */
  formatFactor(value: number): string {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : String(value);
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.groupService.loadGroups(),
      this.unitMeasureService.loadUnitMeasures(),
      this.tenantInfo.load(),
    ]);
  }

  async onUnitConversionToggle(checked: boolean): Promise<void> {
    const ok = await this.tenantInfo.update({ unit_conversion_enabled: checked });
    if (ok) this.toast.success('Preferencia de conversión de unidades guardada');
    else this.toast.error(this.tenantInfo.error() ?? 'No se pudo guardar la preferencia');
  }

  openCreateGroup(): void {
    this.groupService.error.set(null);
    this.showGroupForm.set(true);
  }

  closeGroupForm(): void {
    this.showGroupForm.set(false);
  }

  onGroupSaved(): void {
    this.showGroupForm.set(false);
    this.unitMeasureService.loadUnitMeasures();
    this.toast.success('Grupo creado');
  }

  openAddUnit(group: UnitMeasureGroup): void {
    this.selectedGroup.set(group);
    this.editingUnitMeasure.set(null);
    this.groupService.error.set(null);
    this.showUnitForm.set(true);
  }

  openEdit(group: UnitMeasureGroup, unit: UnitInGroup): void {
    const full = this.unitMeasureService.unitMeasures().find((u) => u.id === unit.id) ?? null;
    this.selectedGroup.set(group);
    this.editingUnitMeasure.set(full);
    this.showUnitForm.set(true);
  }

  closeUnitForm(): void {
    this.showUnitForm.set(false);
    this.editingUnitMeasure.set(null);
    this.selectedGroup.set(null);
  }

  async onUnitSaved(): Promise<void> {
    this.showUnitForm.set(false);
    this.editingUnitMeasure.set(null);
    this.selectedGroup.set(null);
    await this.groupService.loadGroups();
  }

  async onToggle(unit: UnitInGroup): Promise<void> {
    await this.unitMeasureService.toggleActive(unit.id, unit.active);
    await this.groupService.loadGroups();
  }

  async onReassignBase(group: UnitMeasureGroup, unit: UnitInGroup): Promise<void> {
    const ok = await this.groupService.reassignBase(group.id, { unit_measure_id: unit.id });
    if (ok) {
      this.toast.success(`"${unit.name}" es ahora la unidad base`);
      await this.unitMeasureService.loadUnitMeasures();
    } else {
      this.toast.error(this.groupService.error() ?? 'No se pudo reasignar la unidad base.');
    }
  }

  async onDeleteGroup(group: UnitMeasureGroup): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Eliminar "${group.name}"`,
      message:
        'Se eliminará el grupo y todas sus unidades. Solo es posible si ninguna está en uso ' +
        'en insumos o compras.',
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;

    const done = await this.groupService.deleteGroup(group.id);
    if (done) {
      this.toast.success('Grupo eliminado');
      await this.unitMeasureService.loadUnitMeasures();
    } else {
      this.toast.error(this.groupService.error() ?? 'No se pudo eliminar el grupo.');
    }
  }
}
