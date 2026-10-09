import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../shared/searchable-select/searchable-select.component';
import { SuppliersService } from '../../suppliers/services/suppliers.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { SupplierItemsService } from '../services/supplier-items.service';
import { SupplierItem, SupplierItemForm } from '../interfaces/supplier-item.interface';

/** Qué lado de la relación ya está fijo por el contexto de la página de detalle. */
export type SupplierItemFormMode = 'item' | 'supplier';

/**
 * Alta/edición de una relación proveedor-insumo (spec 106). Se usa desde las dos pestañas
 * simétricas (detalle de insumo y detalle de proveedor) -- `mode` decide cuál de los dos
 * lados ya está fijo por el contexto y cuál hay que buscar/elegir.
 */
@Component({
  selector: 'app-supplier-item-form',
  standalone: true,
  imports: [FormsModule, SearchableSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="close.emit()">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" (click)="$event.stopPropagation()">
        <h2 class="text-lg font-bold text-gray-900">
          {{ initial ? 'Editar relación' : (mode === 'item' ? 'Vincular proveedor' : 'Vincular insumo') }}
        </h2>

        @if (mode === 'item') {
          <div>
            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Insumo</label>
            <p class="text-sm text-gray-900 font-medium">{{ fixedLabel }}</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Proveedor</label>
            @if (initial) {
              <p class="text-sm text-gray-900 font-medium">{{ initial.supplier_name }}</p>
            } @else {
              <app-searchable-select [ngModel]="supplierId()" (ngModelChange)="supplierId.set($event)"
                (optionPicked)="onSupplierPicked($event)"
                [options]="supplierOptions()" [search]="searchSuppliers" placeholder="Buscar proveedor…" />
            }
          </div>
        } @else {
          <div>
            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Proveedor</label>
            <p class="text-sm text-gray-900 font-medium">{{ fixedLabel }}</p>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Insumo</label>
            @if (initial) {
              <p class="text-sm text-gray-900 font-medium">{{ initial.inventory_item_name }}</p>
            } @else {
              <app-searchable-select [ngModel]="itemId()" (ngModelChange)="itemId.set($event)"
                (optionPicked)="onItemPicked($event)"
                [options]="itemOptions()" [search]="searchItems" placeholder="Buscar insumo…" />
            }
          </div>
        }

        <div>
          <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Presentación</label>
          <input [ngModel]="presentation()" (ngModelChange)="presentation.set($event)"
            placeholder="Ej. Bolsa x 500 g"
            class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            ¿Cuántos{{ unitAbbr() ? ' ' + unitAbbr() : '' }} trae 1 presentación?
          </label>
          <input [ngModel]="conversionFactor()" (ngModelChange)="conversionFactor.set($event)"
            type="number" min="0" step="0.001" placeholder="Ej. 500"
            class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          @if (factorLocked) {
            <p class="mt-1 text-xs text-amber-600">
              Ya se usó en una compra; no se puede cambiar. Crea una presentación nueva en su lugar.
            </p>
          }
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Último costo (opcional)
          </label>
          <input [ngModel]="lastCost()" (ngModelChange)="lastCost.set($event)"
            type="number" min="0" step="0.01" placeholder="Ej. 8000"
            class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        @if (equivalencePreview()) {
          <p class="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{{ equivalencePreview() }}</p>
        }

        @if (service.error()) {
          <p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {{ service.error() }}
            @if (service.conflictExistingId()) {
              <button type="button" (click)="editExisting()" class="ml-1 underline font-medium">Editar la existente</button>
            }
          </p>
        }

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" (click)="close.emit()"
            class="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            Cancelar
          </button>
          <button type="button" (click)="submit()" [disabled]="service.isSubmitting() || !canSubmit()"
            class="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {{ service.isSubmitting() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SupplierItemFormComponent implements OnInit {
  @Input({ required: true }) mode!: SupplierItemFormMode;
  /** item_id (mode='item') o supplier_id (mode='supplier') ya fijo por el contexto. */
  @Input({ required: true }) fixedId!: string;
  /** Nombre del lado ya fijo, para mostrarlo sin otra consulta. */
  @Input({ required: true }) fixedLabel!: string;
  /** Unidad base del insumo, conocida de antemano cuando `mode === 'item'`. */
  @Input() knownUnitAbbr: string | null = null;
  /** Presente solo al editar una relación existente. */
  @Input() initial: SupplierItem | null = null;
  /** FR-014: si ya se usó en una compra, el factor no se puede tocar. */
  @Input() factorLocked = false;

  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<SupplierItem>();
  @Output() readonly editRequested = new EventEmitter<string>();

  readonly service = inject(SupplierItemsService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly inventoryService = inject(InventoryService);
  private readonly unitMeasureService = inject(UnitMeasureService);

  readonly supplierId = signal('');
  readonly itemId = signal('');
  readonly presentation = signal('');
  readonly conversionFactor = signal<number | null>(null);
  readonly lastCost = signal<number | null>(null);
  readonly unitAbbr = signal('');

  /**
   * `app-searchable-select` resuelve el texto que muestra el botón (`selectedLabel()`)
   * buscando el id elegido dentro de `[options]` -- con `search` provisto, los resultados
   * remotos no quedan ahí por defecto. Sin este "resguardo" (mismo patrón que
   * `ProductFormComponent.categoryOptions`, spec 102/105), el botón volvía al placeholder
   * justo después de elegir una opción, aunque `supplierId`/`itemId` sí quedaran fijados por
   * dentro -- parecía que el clic "no seleccionaba nada".
   */
  private readonly pickedSupplierLabel = signal('');
  private readonly pickedItemLabel = signal('');

  readonly supplierOptions = computed(() =>
    this.supplierId() ? [{ id: this.supplierId(), label: this.pickedSupplierLabel() }] : [],
  );
  readonly itemOptions = computed(() =>
    this.itemId() ? [{ id: this.itemId(), label: this.pickedItemLabel() }] : [],
  );

  ngOnInit(): void {
    if (this.initial) {
      this.presentation.set(this.initial.presentation);
      this.conversionFactor.set(this.initial.conversion_factor);
      this.lastCost.set(this.initial.last_cost);
    }
    if (this.mode === 'item') {
      this.unitAbbr.set(this.knownUnitAbbr ?? '');
    } else if (this.initial) {
      void this.resolveUnitAbbr(this.initial.inventory_item_id);
    }
  }

  readonly searchSuppliers = (query: string): Promise<SearchableSelectOption[]> =>
    this.suppliersService.searchLinkable(query).then((list) => list.map((s) => ({ id: s.id, label: s.name })));

  readonly searchItems = (query: string): Promise<SearchableSelectOption[]> =>
    this.inventoryService.searchActiveItems(query).then((list) => list.map((i) => ({ id: i.id, label: i.name })));

  onSupplierPicked(opt: SearchableSelectOption): void {
    this.pickedSupplierLabel.set(opt.label);
  }

  onItemPicked(opt: SearchableSelectOption): void {
    this.pickedItemLabel.set(opt.label);
    void this.resolveUnitAbbr(opt.id);
  }

  private async resolveUnitAbbr(itemId: string): Promise<void> {
    try {
      const item = await this.inventoryService.getItem(itemId);
      const unit = await this.unitMeasureService.getUnitMeasure(item.unit_measure_id);
      this.unitAbbr.set(unit.abbreviation);
    } catch {
      this.unitAbbr.set('');
    }
  }

  readonly equivalencePreview = () => {
    const factor = this.conversionFactor();
    const cost = this.lastCost();
    const presentation = this.presentation().trim();
    if (!presentation || !factor || factor <= 0) return null;
    const unit = this.unitAbbr();
    let text = `1 ${presentation} = ${factor}${unit ? ' ' + unit : ''}`;
    if (cost !== null && cost >= 0) {
      const perUnit = Math.round((cost / factor) * 100) / 100;
      text += ` · $${perUnit}${unit ? '/' + unit : ''}`;
    }
    return text;
  };

  canSubmit(): boolean {
    const factor = this.conversionFactor();
    if (!this.presentation().trim()) return false;
    if (factor === null || factor <= 0) return false;
    if (!this.initial) {
      return this.mode === 'item' ? !!this.supplierId() : !!this.itemId();
    }
    return true;
  }

  async submit(): Promise<void> {
    const form: SupplierItemForm = {
      presentation: this.presentation().trim(),
      conversion_factor: this.conversionFactor() ?? 0,
      last_cost: this.lastCost(),
    };

    let result: SupplierItem | null;
    if (this.initial) {
      result = await this.service.update(this.initial.id, {
        presentation: form.presentation,
        conversion_factor: this.factorLocked ? undefined : form.conversion_factor,
        last_cost: form.last_cost,
      });
    } else if (this.mode === 'item') {
      result = await this.service.createFromItem(this.fixedId, this.supplierId(), form);
    } else {
      result = await this.service.createFromSupplier(this.fixedId, this.itemId(), form);
    }

    if (result) this.saved.emit(result);
  }

  editExisting(): void {
    const id = this.service.conflictExistingId();
    if (id) this.editRequested.emit(id);
  }
}
