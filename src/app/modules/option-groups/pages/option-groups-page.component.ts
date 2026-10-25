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
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Grupos de opciones</h1>
          <p class="text-sm text-gray-500 mt-0.5">Sabores, toppings y extras que se asignan a los productos</p>
        </div>
        <button (click)="openCreateGroup()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
          <app-mi-icon name="add" [size]="16" />
          Nuevo grupo
        </button>
      </div>

      @if (service.error()) {
        <p class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2">{{ service.error() }}</p>
      }

      @if (service.isLoading()) {
        <p class="text-sm text-gray-400">Cargando grupos...</p>
      } @else if (service.groups().length === 0) {
        <div class="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-12">
          <p class="text-sm text-gray-400">Aún no hay grupos de opciones</p>
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2">
          @for (g of service.groups(); track g.id) {
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden" [class.opacity-60]="!g.active">
              <div class="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-semibold text-gray-900 flex items-center gap-2">
                    <span class="truncate">{{ g.name }}</span>
                    <span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      [class]="g.pricing_type === 'incluido' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">
                      {{ g.pricing_type === 'incluido' ? 'Incluido' : 'Con recargo' }}
                    </span>
                    @if (!g.active) {
                      <span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        Inactivo
                      </span>
                    }
                  </p>
                  <p class="text-xs text-gray-500">Elige {{ g.min_select }}–{{ g.max_select }}</p>
                  <!-- Se dice una vez por grupo, no en cada una de las 24 opciones. -->
                  @if (hasOwnQuantities(g)) {
                    <p class="text-xs text-amber-600 mt-0.5">
                      Estas cantidades solo aplican si el tamaño del producto no define la suya.
                    </p>
                  }
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button (click)="openOptionForm(g)"
                    class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                    + Opción
                  </button>
                  <button (click)="openEditGroup(g)" title="Editar grupo"
                    class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    ✏️
                  </button>
                  <button (click)="toggleGroup(g)" [title]="g.active ? 'Desactivar grupo' : 'Reactivar grupo'"
                    class="p-1.5 rounded-lg transition-colors"
                    [class]="g.active
                      ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                      : 'text-gray-400 hover:text-green-600 hover:bg-green-50'">
                    {{ g.active ? '🔴' : '🟢' }}
                  </button>
                </div>
              </div>
              @if (g.options.length === 0) {
                <p class="px-4 py-3 text-sm text-gray-400">Sin opciones todavía</p>
              } @else {
                <ul class="divide-y divide-gray-50">
                  @for (o of g.options; track o.id) {
                    <li class="px-4 py-2 flex items-center justify-between gap-2 text-sm" [class.opacity-50]="!o.active">
                      <span class="text-gray-800 min-w-0 truncate">
                        {{ o.name }}
                        <!-- El insumo concreto, no un "consume insumo" genérico: esta es la
                             pantalla donde se corrige, así que hay que ver qué descuenta. -->
                        @if (consumeLabel(o); as label) {
                          <span class="text-xs text-gray-400">· {{ label }}</span>
                        } @else {
                          <span class="text-xs text-amber-600">· sin insumo</span>
                        }
                      </span>
                      <span class="flex items-center gap-1 shrink-0">
                        <span class="text-gray-600">
                          @if (o.extra_price > 0) { <span> +{{ o.extra_price | number:'1.2-2' }} </span> } @else { <span> — </span> }
                        </span>
                        <button (click)="openEditOption(g, o)" title="Editar opción"
                          class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          ✏️
                        </button>
                        <button (click)="toggleOption(o)" [title]="o.active ? 'Desactivar opción' : 'Reactivar opción'"
                          class="p-1.5 rounded-lg transition-colors"
                          [class]="o.active
                            ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'">
                          {{ o.active ? '🔴' : '🟢' }}
                        </button>
                      </span>
                    </li>
                  }
                </ul>
              }
            </div>
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
