import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuppliersService } from '../../suppliers/services/suppliers.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { PurchaseForm, PurchaseLineForm } from '../interfaces/inventory.interface';
import { InventoryService } from '../services/inventory.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

@Component({
  selector: 'app-purchase-form',
  standalone: true,
  imports: [FormsModule, DecimalPipe, SearchableSelectComponent, MoneyInputComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">Nueva compra</h2>
          <button type="button" (click)="close.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <app-mi-icon name="close" ariaLabel="Cerrar" [size]="20" />
          </button>
        </div>

        <div class="p-6 space-y-4 overflow-y-auto">
          <div class="grid grid-cols-2 gap-4">
            <!-- Proveedor -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
              <select [ngModel]="supplierId()" (ngModelChange)="supplierId.set($event)"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Sin proveedor</option>
                @for (s of suppliersService.suppliers(); track s.id) {
                  <option [value]="s.id">{{ s.name }}</option>
                }
              </select>
            </div>
            <!-- Factura -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">N° de factura</label>
              <input [ngModel]="invoiceNumber()" (ngModelChange)="invoiceNumber.set($event)" type="text"
                placeholder="Opcional"
                class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
          </div>

          <!-- Líneas -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium text-gray-700">Insumos comprados *</label>
              <button type="button" (click)="addRow()"
                class="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Agregar línea</button>
            </div>

            <div class="space-y-2">
              <!-- header -->
              <div class="grid grid-cols-12 gap-2 px-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <span class="col-span-5">Insumo</span>
                <span class="col-span-2 text-right">Cantidad</span>
                <span class="col-span-2 text-right">Costo unit.</span>
                <span class="col-span-2 text-right">Subtotal</span>
                <span class="col-span-1"></span>
              </div>

              @for (row of rows(); track $index) {
                <div class="grid grid-cols-12 gap-2 items-center">
                  <app-searchable-select class="col-span-5"
                    [ngModel]="row.inventory_item_id" (ngModelChange)="updateRow($index, 'inventory_item_id', $event)"
                    [options]="itemOptions()" [search]="searchInventoryItems" placeholder="Buscar insumo…" />
                  <input type="number" min="0" step="0.001"
                    class="col-span-2 px-2 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    [ngModel]="row.quantity" (ngModelChange)="updateRow($index, 'quantity', $event)">
                  <app-money-input class="col-span-2" [decimals]="2"
                    sizeClass="px-2 py-2 rounded-lg text-sm text-right"
                    [ngModel]="row.unit_cost" (ngModelChange)="updateRow($index, 'unit_cost', $event ?? 0)" />
                  <span class="col-span-2 text-right text-sm text-gray-700">
                    {{ (row.quantity * row.unit_cost) | number:'1.2-2' }}
                  </span>
                  <button type="button" (click)="removeRow($index)"
                    class="col-span-1 text-gray-400 hover:text-red-500 transition-colors flex justify-center">
                    <app-mi-icon name="close" ariaLabel="Quitar renglón" [size]="16" />
                  </button>
                </div>
              }
            </div>
          </div>

          <label class="flex items-start gap-2 text-sm text-gray-700 bg-indigo-50/60 rounded-lg px-3 py-2">
            <input type="checkbox" [checked]="asOrder()" (change)="asOrder.set($any($event.target).checked)" class="mt-0.5" />
            <span>
              Crear como <b>orden de compra</b> (no suma stock aún; se recibe luego, parcial o total).
              <span class="block text-xs text-gray-500">Desmárcalo para una compra directa que da alta total del stock.</span>
            </span>
          </label>

          <div class="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
            <span class="text-sm text-gray-500">Total</span>
            <span class="text-lg font-bold text-gray-900">{{ total() | number:'1.2-2' }}</span>
          </div>

          @if (service.error()) {
            <p class="text-red-600 text-sm">{{ service.error() }}</p>
          }
        </div>

        <div class="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" (click)="close.emit()"
            class="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="button" (click)="onSubmit()" [disabled]="!canSubmit() || service.isSubmitting()"
            class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {{ service.isSubmitting() ? 'Registrando...' : (asOrder() ? 'Crear orden' : 'Registrar compra') }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class PurchaseFormComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  readonly service = inject(InventoryService);
  readonly inventoryService = this.service;
  readonly suppliersService = inject(SuppliersService);
  private readonly unitMeasureService = inject(UnitMeasureService);

  /** Abreviatura por id de unidad, igual que `unitAbbr()` en la página de inventario. */
  private readonly unitAbbr = computed(
    () => new Map(this.unitMeasureService.unitMeasures().map((u) => [u.id, u.abbreviation])),
  );

  /**
   * La unidad va en la etiqueta porque la cantidad se teclea en la celda de al
   * lado: sin ella no se sabe si son 2 kg o 2 g, que es el error más fácil de
   * cometer registrando una compra. Si las unidades aún no llegaron, la opción
   * cae al nombre solo en vez de mostrar un « · » suelto.
   */
  readonly itemOptions = computed(() => {
    const abbr = this.unitAbbr();
    return this.service.allItems().map((i) => {
      const unidad = abbr.get(i.unit_measure_id);
      return { id: i.id, label: unidad ? `${i.name} · ${unidad}` : i.name };
    });
  });

  /** Búsqueda remota del picker de insumo (spec 098): mismo formato de etiqueta que `itemOptions`. */
  readonly searchInventoryItems = (query: string): Promise<{ id: string; label: string }[]> => {
    const abbr = this.unitAbbr();
    return this.service.searchActiveItems(query).then((items) =>
      items.map((i) => {
        const unidad = abbr.get(i.unit_measure_id);
        return { id: i.id, label: unidad ? `${i.name} · ${unidad}` : i.name };
      }),
    );
  };

  readonly supplierId = signal('');
  readonly invoiceNumber = signal('');
  readonly asOrder = signal(false);
  readonly rows = signal<PurchaseLineForm[]>([{ inventory_item_id: '', quantity: 1, unit_cost: 0 }]);

  readonly total = computed(() =>
    this.rows().reduce((sum, r) => sum + Number(r.quantity) * Number(r.unit_cost), 0)
  );

  readonly canSubmit = computed(() =>
    this.rows().some(r => r.inventory_item_id && Number(r.quantity) > 0)
  );

  ngOnInit(): void {
    if (this.inventoryService.allItems().length === 0) this.inventoryService.loadAllItems();
    if (this.suppliersService.suppliers().length === 0) this.suppliersService.loadSuppliers(true);
    if (this.unitMeasureService.unitMeasures().length === 0) {
      this.unitMeasureService.loadUnitMeasures();
    }
  }

  addRow(): void {
    this.rows.update(rows => [...rows, { inventory_item_id: '', quantity: 1, unit_cost: 0 }]);
  }

  removeRow(index: number): void {
    this.rows.update(rows => rows.filter((_, i) => i !== index));
  }

  updateRow(index: number, key: keyof PurchaseLineForm, value: unknown): void {
    this.rows.update(rows =>
      rows.map((r, i) =>
        i === index
          ? { ...r, [key]: key === 'inventory_item_id' ? String(value) : Number(value) }
          : r,
      ),
    );
  }

  async onSubmit(): Promise<void> {
    const items = this.rows().filter(
      r => r.inventory_item_id && Number(r.quantity) > 0
    );
    if (items.length === 0) return;

    const formData: PurchaseForm = {
      supplier_id: this.supplierId() || null,
      invoice_number: this.invoiceNumber().trim() || null,
      items: items.map(r => ({
        inventory_item_id: r.inventory_item_id,
        quantity: Number(r.quantity),
        unit_cost: Number(r.unit_cost),
      })),
    };

    const ok = this.asOrder()
      ? await this.service.createPurchaseOrder(formData)
      : await this.service.createPurchase(formData);
    if (ok) {
      this.saved.emit();
      this.close.emit();
    }
  }
}
