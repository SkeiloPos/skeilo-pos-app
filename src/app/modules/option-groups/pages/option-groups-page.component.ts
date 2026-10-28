import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Option, OptionGroup } from '../../products/interfaces/product.interface';
import { InventoryService } from '../../inventory/services/inventory.service';
import { buildUnitLookup } from '../../inventory/services/unit-lookup';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { OptionGroupService } from '../services/option-group.service';
import { OptionGroupFormComponent } from '../components/option-group-form.component';
import { OptionFormComponent } from '../components/option-form.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

@Component({
  selector: 'app-option-groups-page',
  standalone: true,
  imports: [DecimalPipe, OptionGroupFormComponent, OptionFormComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ajustes-theme flex flex-col gap-5 pt-1">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1" style="flex-basis: 260px">
          <div class="font-semibold" style="font-family: var(--aj-font-display); font-size: 20px; letter-spacing: -0.02em">
            Grupos de opciones
          </div>
          <p class="aj-muted mt-1">Sabores, toppings y extras que se asignan a los productos.</p>
        </div>
        <button (click)="openCreateGroup()" class="aj-btn-primary inline-flex items-center gap-2 whitespace-nowrap">
          <app-mi-icon name="add" [size]="16" />
          Nuevo grupo
        </button>
      </div>

      @if (service.error()) {
        <p
          class="text-sm rounded-xl px-4 py-2"
          style="color: var(--aj-color-error); background-color: var(--aj-color-error-soft); border: 1px solid var(--aj-color-error)"
        >{{ service.error() }}</p>
      }

      @if (service.isLoading()) {
        <p class="aj-muted text-sm">Cargando grupos...</p>
      } @else if (service.groups().length === 0) {
        <div class="text-center py-12" style="color: var(--aj-color-text-muted)">
          <div class="aj-title font-medium" style="font-family: var(--aj-font-display); font-size: 18px">Sin grupos</div>
          Crea el primero con «Nuevo grupo».
        </div>
      } @else {
        <!-- Maestro-detalle (design/ajustes.html): lista de grupos a la izquierda, detalle a la derecha. -->
        <div class="grid gap-4" style="grid-template-columns: minmax(220px,300px) minmax(0,1fr); align-items: start">
          <nav aria-label="Grupos de opciones" class="flex flex-col gap-2">
            @for (g of service.groups(); track g.id) {
              <button
                type="button"
                (click)="selectedGroupId.set(g.id)"
                [attr.aria-current]="selectedGroupId() === g.id"
                class="text-left flex items-center gap-3 rounded-xl transition-colors"
                style="min-height: 64px; padding: 12px 14px"
                [style.border]="selectedGroupId() === g.id ? '1px solid var(--aj-color-primary)' : '1px solid var(--aj-color-border)'"
                [style.background-color]="selectedGroupId() === g.id ? 'var(--aj-color-primary-soft)' : 'var(--aj-color-surface)'"
                [class.opacity-60]="!g.active"
              >
                <span class="flex-1 min-w-0">
                  <span class="block font-semibold" style="color: var(--aj-color-text-primary)">{{ g.name }}</span>
                  <span class="block text-xs aj-muted mt-0.5">Elige {{ g.min_select }}–{{ g.max_select }} · {{ g.options.length }} opción(es)</span>
                </span>
                @if (!g.active) {
                  <span class="aj-badge aj-badge-neutral">Inactivo</span>
                }
              </button>
            }
          </nav>

          @if (detailGroup(); as gm) {
            <section [attr.aria-label]="'Detalle del grupo ' + gm.name" class="aj-card overflow-hidden">
              <div class="p-5 flex flex-col gap-4" style="border-bottom: 1px solid var(--aj-color-border)">
                <div class="flex justify-between gap-4 flex-wrap items-start">
                  <div class="min-w-0">
                    <h3 class="m-0 font-semibold" style="font-family: var(--aj-font-display); font-size: 20px">{{ gm.name }}</h3>
                    <div class="flex gap-2 flex-wrap mt-2.5">
                      <span class="aj-badge" [class]="gm.pricing_type === 'incluido' ? 'aj-badge-success' : 'aj-badge-warning'">
                        {{ gm.pricing_type === 'incluido' ? 'Incluido' : 'Con recargo' }}
                      </span>
                      <span class="aj-badge aj-badge-neutral">Elige {{ gm.min_select }}–{{ gm.max_select }}</span>
                      <span class="aj-badge" [class]="gm.active ? 'aj-badge-success' : 'aj-badge-neutral'">
                        {{ gm.active ? 'Activo' : 'Inactivo' }}
                      </span>
                    </div>
                    <!-- Se dice una vez por grupo, no en cada una de las opciones. -->
                    @if (hasOwnQuantities(gm)) {
                      <p class="text-xs mt-2" style="color: var(--aj-color-warning)">
                        Estas cantidades solo aplican si el tamaño del producto no define la suya.
                      </p>
                    }
                  </div>
                  <button (click)="openOptionForm(gm)" class="aj-btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap" style="min-width: 220px">
                    <app-mi-icon name="add" [size]="16" />
                    Agregar opción
                  </button>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <button (click)="openEditGroup(gm)" class="aj-btn-secondary inline-flex items-center gap-2 text-sm">
                    <app-mi-icon name="pencil" [size]="16" />
                    Editar grupo
                  </button>
                  <button (click)="toggleGroup(gm)" class="aj-btn-secondary inline-flex items-center gap-2 text-sm">
                    <app-mi-icon [name]="gm.active ? 'block' : 'autorenew'" [size]="16" />
                    {{ gm.active ? 'Desactivar' : 'Reactivar' }}
                  </button>
                </div>
              </div>

              @if (gm.options.length === 0) {
                <p class="aj-muted text-center py-8">Este grupo aún no tiene opciones.</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full" style="min-width: 520px; border-collapse: collapse">
                    <caption class="sr-only">Opciones de {{ gm.name }}</caption>
                    <thead>
                      <tr>
                        <th scope="col" class="aj-th">OPCIÓN</th>
                        <th scope="col" class="aj-th">INSUMO</th>
                        <th scope="col" class="aj-th" style="text-align: right">PRECIO EXTRA</th>
                        <th scope="col" class="aj-th" style="text-align: right">ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (o of gm.options; track o.id) {
                        <tr [class.opacity-50]="!o.active">
                          <th scope="row" class="aj-td text-left font-semibold">{{ o.name }}</th>
                          <td class="aj-td">
                            @if (consumeLabel(o); as label) {
                              <span class="text-sm" style="color: var(--aj-color-text-secondary)">{{ label }}</span>
                            } @else {
                              <span class="text-sm" style="color: var(--aj-color-warning)">Sin insumo</span>
                            }
                          </td>
                          <td class="aj-td text-right" style="color: var(--aj-color-text-secondary)">
                            @if (o.extra_price > 0) { {{ o.extra_price | number:'1.2-2' }} } @else { — }
                          </td>
                          <td class="aj-td text-right whitespace-nowrap">
                            <button (click)="openEditOption(gm, o)" class="aj-icon-btn" title="Editar opción {{ o.name }}" [attr.aria-label]="'Editar opción ' + o.name">
                              <app-mi-icon name="pencil" [size]="18" />
                            </button>
                            <button (click)="toggleOption(o)" class="aj-icon-btn" [title]="o.active ? 'Desactivar opción ' + o.name : 'Reactivar opción ' + o.name">
                              <app-mi-icon [name]="o.active ? 'block' : 'autorenew'" [size]="18" />
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </section>
          }
        </div>
      }
    </div>

    <!-- Modals -->
    @if (showGroupForm()) {
      <app-option-group-form [group]="editingGroup()" (close)="closeGroupForm()" (saved)="closeGroupForm()"></app-option-group-form>
    }
    @if (showOptionForm()) {
      <app-option-form
        [group]="selectedGroup()"
        [option]="editingOption()"
        [inventarioIncluido]="inventarioIncluido()"
        (close)="closeOptionForm()"
        (saved)="closeOptionForm()"></app-option-form>
    }
  `,
})
export class OptionGroupsPageComponent implements OnInit {
  readonly service = inject(OptionGroupService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly inventoryService = inject(InventoryService);
  private readonly unitMeasureService = inject(UnitMeasureService);
  private readonly planSummaryService = inject(PlanSummaryService);

  private readonly unitLookup = computed(() =>
    buildUnitLookup(this.inventoryService.allItems(), this.unitMeasureService.unitMeasures()),
  );

  /**
   * spec 064: gating por PLAN (no por producto -- un grupo de opciones es compartido
   * entre productos, research.md Decisión 5). Fail-closed mientras el plan no ha
   * cargado: mismo criterio que `inventory-page.component.ts::comprasIncluido`, para no
   * dejar editar insumo/cantidad y toparse con un 403 del backend un instante después.
   */
  readonly inventarioIncluido = computed(() => {
    const summary = this.planSummaryService.summary();
    return summary !== null && summary.modules.inventario && !summary.vencido;
  });

  readonly showGroupForm = signal(false);
  readonly showOptionForm = signal(false);
  readonly selectedGroup = signal<OptionGroup | null>(null);
  readonly editingGroup = signal<OptionGroup | null>(null);
  readonly editingOption = signal<Option | null>(null);

  /** Grupo elegido en el nav maestro-detalle (design/ajustes.html); no confundir con
   * `selectedGroup`, que es el grupo al que se le está agregando/editando una opción
   * desde el modal. */
  readonly selectedGroupId = signal<string | null>(null);
  readonly detailGroup = computed(
    () => this.service.groups().find((g) => g.id === this.selectedGroupId()) ?? null,
  );

  async ngOnInit(): Promise<void> {
    // Insumos y unidades para poder nombrar lo que descuenta cada opción; en paralelo
    // porque ninguna de las tres depende de las otras.
    await Promise.all([
      this.service.loadGroups(),
      this.inventoryService.allItems().length === 0 ? this.inventoryService.loadAllItems() : null,
      this.unitMeasureService.unitMeasures().length === 0
        ? this.unitMeasureService.loadUnitMeasures()
        : null,
    ]);
    if (!this.selectedGroupId() && this.service.groups().length > 0) {
      this.selectedGroupId.set(this.service.groups()[0].id);
    }
  }

  /** Alguna opción trae cantidad propia, que solo aplica como respaldo del tamaño. */
  hasOwnQuantities(group: OptionGroup): boolean {
    return group.options.some((o) => o.active && Number(o.item_quantity) > 0);
  }

  /**
   * '80 g de Helado chocolate', o cadena vacía si la opción no liga insumo (el template
   * lo pinta entonces como aviso). Con `item_quantity` en 0 solo se nombra el insumo:
   * la cantidad la pone el tamaño del producto que ofrezca el grupo.
   */
  consumeLabel(option: Option): string {
    if (!option.inventory_item_id) return '';
    const lookup = this.unitLookup();
    const qty = Number(option.item_quantity) || 0;
    return qty > 0
      ? lookup.describe(option.inventory_item_id, qty)
      : lookup.nameOf(option.inventory_item_id);
  }

  openCreateGroup(): void {
    this.editingGroup.set(null);
    this.showGroupForm.set(true);
  }

  openEditGroup(g: OptionGroup): void {
    this.editingGroup.set(g);
    this.showGroupForm.set(true);
  }

  closeGroupForm(): void {
    this.showGroupForm.set(false);
    this.editingGroup.set(null);
  }

  openOptionForm(g: OptionGroup): void {
    this.selectedGroup.set(g);
    this.editingOption.set(null);
    this.showOptionForm.set(true);
  }

  openEditOption(g: OptionGroup, o: Option): void {
    this.selectedGroup.set(g);
    this.editingOption.set(o);
    this.showOptionForm.set(true);
  }

  closeOptionForm(): void {
    this.showOptionForm.set(false);
    this.editingOption.set(null);
  }

  async toggleGroup(g: OptionGroup): Promise<void> {
    if (g.active) {
      const ok = await this.confirm.ask({
        title: `Desactivar "${g.name}"`,
        message:
          'El grupo y sus opciones dejarán de aparecer en el menú y en el POS. ' +
          'Las ventas anteriores no se ven afectadas y puedes reactivarlo cuando quieras.',
        confirmText: 'Desactivar',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const done = await this.service.toggleGroupActive(g.id, g.active);
    if (done) {
      this.toast.success(g.active ? 'Grupo desactivado' : 'Grupo reactivado');
    } else {
      this.toast.error(this.service.error() ?? 'No se pudo actualizar el grupo.');
    }
  }

  async toggleOption(o: Option): Promise<void> {
    if (o.active) {
      const ok = await this.confirm.ask({
        title: `Desactivar "${o.name}"`,
        message:
          'La opción dejará de aparecer en el menú y en el POS. ' +
          'Las ventas anteriores no se ven afectadas y puedes reactivarla cuando quieras.',
        confirmText: 'Desactivar',
        tone: 'danger',
      });
      if (!ok) return;
    }
    const done = await this.service.toggleOptionActive(o.id, o.active);
    if (done) {
      this.toast.success(o.active ? 'Opción desactivada' : 'Opción reactivada');
    } else {
      this.toast.error(this.service.error() ?? 'No se pudo actualizar la opción.');
    }
  }
}
