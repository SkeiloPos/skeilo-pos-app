import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SuppliersService } from '../../suppliers/services/suppliers.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { Purchase, PurchaseForm, PurchaseLineForm } from '../interfaces/inventory.interface';
import { InventoryService } from '../services/inventory.service';
import { SupplierItemsService } from '../../supplier-items/services/supplier-items.service';
import { SupplierItem } from '../../supplier-items/interfaces/supplier-item.interface';
import { ToastService } from '../../../shared/feedback/toast.service';
import { normalizeText } from '../../../shared/normalize-text';

/** Una línea en construcción: igual a `PurchaseLineForm` más el nombre/código/unidad del
 *  insumo ya resuelto (del catálogo del proveedor elegido), para no tener que ir a
 *  buscarlo de nuevo en cada render de la tabla (spec 140). */
interface PurchaseViewRow extends PurchaseLineForm {
  code: string;
  name: string;
  baseUnitAbbr: string;
}

/** Un insumo del catálogo del proveedor elegido, listo para mostrarse en el buscador
 *  (deduplicado: un insumo puede tener varias presentaciones -- varias `SupplierItem` --
 *  con el mismo proveedor, pero aparece una sola vez en los resultados). */
interface SearchableProduct {
  id: string;
  code: string;
  name: string;
  baseUnitAbbr: string;
}

/**
 * Vista dedicada para registrar una compra (spec 140): reemplaza el modal
 * `PurchaseFormComponent`, reproduciendo el mockup `design/SkeiloPOS App - Nueva compra.dc.html`
 * (bloque `buyPage`). Elegir el proveedor es el primer paso obligatorio: el buscador de
 * insumos queda deshabilitado hasta entonces y, una vez elegido, solo ofrece lo que ese
 * proveedor específico suministra (`SupplierItemsService.listForSupplier`) -- sin volver a
 * buscar en todo el inventario. Reutiliza en su totalidad `InventoryService`,
 * `SuppliersService`, `SupplierItemsService` y `UnitMeasureService` -- sin endpoints nuevos
 * para "Registrar compra"/"Crear orden de compra" (FR-014).
 */
@Component({
  selector: 'app-purchase-view',
  standalone: true,
  imports: [FormsModule, DecimalPipe, MoneyInputComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-5">
      <button type="button" (click)="cancel()"
        class="self-start flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors">
        <app-mi-icon name="arrow_back" [size]="16" />
        Volver al inventario
      </button>

      <div>
        <p class="text-xs font-bold tracking-widest text-indigo-600 uppercase">Compras</p>
        <h1 class="text-2xl font-semibold text-gray-900 mt-0.5">Nueva compra</h1>
        <p class="text-sm text-gray-500 mt-1">
          La compra queda en borrador. Al confirmarla entra a stock; después solo se puede anular.
        </p>
      </div>

      @if (mErrOn()) {
        <div role="alert" class="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 font-semibold text-sm">
          <app-mi-icon name="warning" [size]="16" />
          <span>{{ mErr() }}</span>
        </div>
      }

      @if (service.error()) {
        <div role="alert" class="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 font-semibold text-sm">
          <app-mi-icon name="warning" [size]="16" />
          <span>{{ service.error() }}</span>
        </div>
      }

      <div class="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-5">
        <div class="grid gap-4" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))">
          <!-- Proveedor: paso obligatorio inicial -- habilita el buscador una vez elegido. -->
          <div class="flex flex-col gap-1.5">
            <label for="b-p" class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Proveedor</label>
            <select id="b-p" required [ngModel]="supplierId()" (ngModelChange)="onSupplierChange($event)"
              class="h-11 w-full px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="" disabled>Selecciona un proveedor…</option>
              @for (s of suppliersService.suppliers(); track s.id) {
                <option [value]="s.id">{{ s.name }}</option>
              }
            </select>
          </div>

          <!-- Buscador de insumos: deshabilitado hasta elegir proveedor; solo ofrece lo que
               ese proveedor suministra (SupplierItemsService.listForSupplier). -->
          <div class="flex flex-col gap-1.5 relative">
            <label for="b-q" class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Buscar producto</label>
            <div class="relative flex items-center">
              <app-mi-icon name="search" [size]="16" class="absolute left-3 text-gray-400 pointer-events-none" />
              <input id="b-q" type="search" autocomplete="off" [disabled]="!supplierId()"
                [placeholder]="supplierId() ? 'Nombre o código del insumo…' : 'Selecciona un proveedor para buscar insumos'"
                [ngModel]="query()" (ngModelChange)="onQueryInput($event)" (keydown)="onSearchKeydown($event)"
                class="h-11 w-full pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400" />
            </div>
            @if (showResults()) {
              <div role="listbox" aria-label="Resultados"
                class="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 max-h-72 overflow-y-auto">
                @for (r of filteredResults(); track r.id) {
                  <button type="button" role="option" (click)="addItem(r.id)"
                    class="w-full min-h-11 flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-left hover:bg-gray-50">
                    <span class="text-gray-400 tabular-nums shrink-0">{{ r.code }}</span>
                    <span class="flex-1 font-semibold text-sm uppercase truncate">{{ r.name }}</span>
                    <span class="text-xs text-gray-400 shrink-0">{{ r.baseUnitAbbr }}</span>
                    <app-mi-icon name="add" [size]="16" />
                  </button>
                } @empty {
                  <div class="p-3 text-gray-400 text-sm">Ningún insumo disponible coincide.</div>
                }
              </div>
            }
          </div>

          <!-- N° de factura -->
          <div class="flex flex-col gap-1.5">
            <label for="b-inv" class="text-xs font-semibold tracking-wide text-gray-500 uppercase">N° de factura</label>
            <input id="b-inv" type="text" [ngModel]="invoiceNumber()" (ngModelChange)="invoiceNumber.set($event)"
              class="h-11 w-full px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <!-- Líneas -->
        <div class="border border-gray-200 rounded-xl overflow-x-auto">
          <table class="w-full border-collapse" style="min-width: 1100px">
            <thead>
              <tr>
                <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Código</th>
                <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Nombre</th>
                <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Unidad de compra</th>
                <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Precio</th>
                <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Cantidad</th>
                <th class="text-right px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Subtotal</th>
                <th class="text-right px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Acción</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track $index) {
                <tr class="border-b border-gray-100 align-top">
                  <td class="px-4 py-3.5 text-gray-400 tabular-nums whitespace-nowrap">{{ row.code }}</td>
                  <th scope="row" class="px-4 py-3.5 text-left font-semibold text-sm uppercase min-w-[200px]">
                    {{ row.name }}
                    @if (lowStockFor(row.inventory_item_id); as warn) {
                      <div class="text-xs font-semibold text-amber-600 normal-case mt-0.5">{{ warn }}</div>
                    }
                  </th>
                  <td class="px-4 py-3 min-w-[240px] align-top">
                    @if (presentationsFor($index).length > 0) {
                      <select [ngModel]="row.supplier_item_id || ''" (ngModelChange)="onPresentationChange($index, $event)"
                        class="h-10 w-full px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">Unidad base ({{ row.baseUnitAbbr }})</option>
                        @for (p of presentationsFor($index); track p.id) {
                          <option [value]="p.id">{{ p.presentation }}</option>
                        }
                      </select>
                    } @else if (unitsForRow($index).length > 0) {
                      <select [ngModel]="row.unit_measure_id || ''" (ngModelChange)="onUnitMeasureChange($index, $event)"
                        class="h-10 w-full px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">Unidad base ({{ row.baseUnitAbbr }})</option>
                        @for (u of unitsForRow($index); track u.id) {
                          <option [value]="u.id">{{ u.abbreviation }}</option>
                        }
                      </select>
                    } @else {
                      <span class="text-sm text-gray-500">Unidad base ({{ row.baseUnitAbbr }})</span>
                    }
                    @if (equivalenceLabel($index); as eq) {
                      <p class="text-xs text-gray-400 mt-1.5 truncate" [title]="eq">{{ eq }}</p>
                    }
                  </td>
                  <td class="px-4 py-3 w-40">
                    <app-money-input [decimals]="2" sizeClass="h-11 px-3 rounded-lg text-sm text-right border border-gray-300"
                      [ngModel]="row.unit_cost" (ngModelChange)="updateRow($index, 'unit_cost', $event ?? 0)" />
                  </td>
                  <td class="px-4 py-3 w-48">
                    <div class="flex items-center gap-1.5">
                      <button type="button" (click)="decrementQty($index)" [attr.aria-label]="'Disminuir cantidad de ' + row.name"
                        class="w-11 h-11 shrink-0 border border-gray-300 rounded-lg grid place-items-center hover:bg-gray-50">
                        <app-mi-icon name="remove" [size]="16" />
                      </button>
                      <input type="number" min="0" step="0.001" [attr.aria-label]="'Cantidad de ' + row.name"
                        [ngModel]="row.quantity" (ngModelChange)="updateRow($index, 'quantity', $event)"
                        class="h-11 w-16 px-1.5 border border-gray-300 rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <button type="button" (click)="incrementQty($index)" [attr.aria-label]="'Aumentar cantidad de ' + row.name"
                        class="w-11 h-11 shrink-0 border border-gray-300 rounded-lg grid place-items-center hover:bg-gray-50">
                        <app-mi-icon name="add" [size]="16" />
                      </button>
                    </div>
                  </td>
                  <td class="px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap">
                    {{ (row.quantity * row.unit_cost) | number:'1.2-2' }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    <button type="button" (click)="removeRow($index)" [attr.aria-label]="'Quitar ' + row.name" title="Quitar"
                      class="w-11 h-11 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 inline-grid place-items-center">
                      <app-mi-icon name="delete" [size]="18" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (rows().length === 0) {
            <div class="p-8 text-center text-gray-400">
              {{ supplierId() ? 'Busca un producto arriba para agregarlo a la compra.' : 'Elige un proveedor para empezar a buscar insumos.' }}
            </div>
          }
        </div>

        <!-- Totales + acciones -->
        <div class="flex items-end justify-between gap-4 flex-wrap pt-1">
          <div class="flex gap-8 flex-wrap">
            <div>
              <p class="text-xs font-semibold tracking-wide text-gray-400 uppercase">Total de líneas</p>
              <p class="text-2xl font-semibold tabular-nums mt-0.5">{{ rows().length }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold tracking-wide text-gray-400 uppercase">Total</p>
              <p class="text-2xl font-semibold tabular-nums mt-0.5">{{ total() | number:'1.2-2' }}</p>
            </div>
          </div>
          <div class="flex gap-2.5 flex-wrap justify-end">
            <button type="button" (click)="cancel()"
              class="h-12 px-5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="button" (click)="saveDraft()" [disabled]="service.isSubmitting()"
              class="h-12 px-5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {{ service.isSubmitting() ? 'Guardando…' : 'Guardar borrador' }}
            </button>
            <button type="button" (click)="createOrder()" [disabled]="service.isSubmitting()"
              class="h-12 px-5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {{ service.isSubmitting() ? 'Guardando…' : 'Crear orden de compra' }}
            </button>
            <button type="button" (click)="registerPurchase()" [disabled]="service.isSubmitting()"
              class="h-12 px-6 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {{ service.isSubmitting() ? 'Registrando…' : 'Registrar compra' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PurchaseViewComponent implements OnInit {
  readonly service = inject(InventoryService);
  readonly suppliersService = inject(SuppliersService);
  private readonly unitMeasureService = inject(UnitMeasureService);
  private readonly supplierItemsService = inject(SupplierItemsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly supplierId = signal('');
  readonly invoiceNumber = signal(this.generateInvoiceNumber());
  readonly rows = signal<PurchaseViewRow[]>([]);

  /** Id del borrador/orden que se está reabriendo (spec 140, FR-017): si no es `null`,
   *  guardar actualiza ESE registro en vez de crear uno nuevo -- de lo contrario el usuario
   *  terminaría con un duplicado que tendría que borrar a mano. */
  readonly editingPurchaseId = signal<string | null>(null);

  readonly mErrOn = signal(false);
  readonly mErr = signal('');

  // --- buscador de insumos: filtra en cliente sobre el catálogo del proveedor ya elegido
  //     (spec 140) -- no hay HTTP por tecleo, así que no hace falta debounce/searchSeq. ---
  readonly query = signal('');
  readonly showResults = computed(() => this.query().trim().length > 0);

  /** Catálogo del proveedor elegido (`SupplierItemsService.listForSupplier`): el buscador
   *  de insumos solo ofrece lo que ESE proveedor suministra, nunca todo el inventario. */
  readonly supplierCatalog = signal<SupplierItem[]>([]);

  private readonly unitAbbr = computed(
    () => new Map(this.unitMeasureService.unitMeasures().map((u) => [u.id, u.abbreviation])),
  );
  private readonly unitById = computed(
    () => new Map(this.unitMeasureService.unitMeasures().map((u) => [u.id, u])),
  );
  private readonly itemById = computed(
    () => new Map([...this.service.allItems(), ...this.service.resolvedExtraItems()].map((i) => [i.id, i])),
  );
  private readonly lowStockIds = computed(() => new Set(this.service.lowStockItems().map((i) => i.id)));

  readonly filteredResults = computed<SearchableProduct[]>(() => {
    const q = normalizeText(this.query());
    if (!q) return [];
    const alreadyAdded = new Set(this.rows().map((r) => r.inventory_item_id));
    const itemsMap = this.itemById();
    const seen = new Set<string>();
    const results: SearchableProduct[] = [];
    for (const rel of this.supplierCatalog()) {
      if (seen.has(rel.inventory_item_id) || alreadyAdded.has(rel.inventory_item_id)) continue;
      const item = itemsMap.get(rel.inventory_item_id);
      const name = item?.name ?? rel.inventory_item_name;
      const code = item?.code ?? '';
      if (!normalizeText(name).includes(q) && !normalizeText(code).includes(q)) continue;
      seen.add(rel.inventory_item_id);
      results.push({
        id: rel.inventory_item_id,
        code,
        name,
        baseUnitAbbr: item ? this.unitAbbr().get(item.unit_measure_id) ?? '' : '',
      });
    }
    return results;
  });

  readonly total = computed(() =>
    this.rows().reduce((sum, r) => sum + Number(r.quantity) * Number(r.unit_cost), 0),
  );

  ngOnInit(): void {
    if (this.suppliersService.suppliers().length === 0) this.suppliersService.loadSuppliers(true);
    if (this.unitMeasureService.unitMeasures().length === 0) this.unitMeasureService.loadUnitMeasures();
    if (this.service.lowStockItems().length === 0) void this.service.loadLowStock();

    // spec 140, FR-017: reabrir un borrador pasado por estado de navegación (sin endpoint
    // de detalle nuevo -- `GET /purchases` ya trae `items`, contracts/purchases-api.md).
    const draft = (history.state as { draft?: Purchase } | null)?.draft;
    if (draft) void this.preloadDraft(draft);
  }

  private async preloadDraft(draft: Purchase): Promise<void> {
    this.editingPurchaseId.set(draft.id);
    this.supplierId.set(draft.supplier_id ?? '');
    this.invoiceNumber.set(draft.invoice_number ?? '');
    if (draft.supplier_id) await this.loadSupplierCatalog(draft.supplier_id);
    const rows = await Promise.all(
      draft.items.map(async (it): Promise<PurchaseViewRow> => {
        const item = await this.service.getItem(it.inventory_item_id);
        return {
          inventory_item_id: it.inventory_item_id,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
          supplier_item_id: it.supplier_item_id,
          unit_measure_id: it.unit_measure_id,
          code: item.code,
          name: item.name,
          baseUnitAbbr: this.unitAbbr().get(item.unit_measure_id) ?? '',
        };
      }),
    );
    this.rows.set(rows);
  }

  private generateInvoiceNumber(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `FC-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  lowStockFor(itemId: string): string | null {
    return this.lowStockIds().has(itemId) ? 'Bajo mínimo' : null;
  }

  onQueryInput(value: string): void {
    if (!this.supplierId()) return;
    this.query.set(value);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = this.filteredResults()[0];
      if (first) this.addItem(first.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.query.set('');
    }
  }

  /** Agrega una fila para `itemId` (del catálogo del proveedor ya elegido), precargando la
   *  "unidad de compra" predeterminada y el precio sugerido (último costo registrado con
   *  ESE proveedor, FR-007): la presentación preferida del insumo-proveedor si tiene una
   *  usable (con factor de conversión resuelto, spec 138), o la primera disponible. */
  addItem(itemId: string): void {
    const item = this.itemById().get(itemId);
    if (!item) return;
    const usable = this.supplierCatalog().filter(
      (r) => r.inventory_item_id === itemId && r.conversion_factor > 0 && !!r.presentation,
    );
    const preferred = usable.find((r) => r.preferred) ?? usable[0] ?? null;
    this.rows.update((rows) => [
      ...rows,
      {
        inventory_item_id: item.id,
        quantity: 1,
        unit_cost: preferred?.last_cost ?? 0,
        supplier_item_id: preferred?.id ?? null,
        unit_measure_id: null,
        code: item.code,
        name: item.name,
        baseUnitAbbr: this.unitAbbr().get(item.unit_measure_id) ?? '',
      },
    ]);
    this.query.set('');
  }

  removeRow(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  updateRow(index: number, key: 'quantity' | 'unit_cost' | 'supplier_item_id' | 'unit_measure_id', value: unknown): void {
    const isTextField = key === 'supplier_item_id' || key === 'unit_measure_id';
    this.rows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, [key]: isTextField ? (value ? String(value) : null) : Number(value) } : r)),
    );
  }

  incrementQty(index: number): void {
    const row = this.rows()[index];
    if (row) this.updateRow(index, 'quantity', Number(row.quantity || 0) + 1);
  }

  decrementQty(index: number): void {
    const row = this.rows()[index];
    if (row) this.updateRow(index, 'quantity', Math.max(1, Number(row.quantity || 0) - 1));
  }

  /** Presentaciones usables (con factor de conversión resuelto, spec 138) del proveedor ya
   *  elegido para el insumo de esta fila -- todas del `supplierCatalog()` ya cargado, sin
   *  HTTP por fila (spec 140). */
  presentationsFor(index: number): SupplierItem[] {
    const row = this.rows()[index];
    if (!row) return [];
    return this.supplierCatalog().filter(
      (r) => r.inventory_item_id === row.inventory_item_id && r.conversion_factor > 0 && !!r.presentation,
    );
  }

  private baseUnitFor(itemId: string) {
    const item = this.itemById().get(itemId);
    return item ? this.unitById().get(item.unit_measure_id) ?? null : null;
  }

  /** Unidades activas del mismo grupo de medida, excluyendo la base (FR, spec 134). */
  unitsForRow(index: number) {
    const row = this.rows()[index];
    const base = row ? this.baseUnitFor(row.inventory_item_id) : null;
    if (!base) return [];
    return this.unitMeasureService
      .unitMeasures()
      .filter((u) => u.active && u.group_id === base.group_id && u.id !== base.id);
  }

  equivalenceLabel(index: number): string | null {
    const row = this.rows()[index];
    if (!row) return null;
    if (row.supplier_item_id) {
      const sp = this.presentationsFor(index).find((p) => p.id === row.supplier_item_id);
      if (!sp) return null;
      const total = Number(row.quantity || 0) * sp.conversion_factor;
      return `${row.quantity || 0} ${sp.presentation} = ${total.toFixed(3)} ${row.baseUnitAbbr}`;
    }
    if (row.unit_measure_id) {
      const base = this.baseUnitFor(row.inventory_item_id);
      const chosen = this.unitById().get(row.unit_measure_id);
      if (!base || !chosen) return null;
      const eq = Number(row.quantity || 0) * (chosen.factor_to_base / base.factor_to_base);
      return `= ${eq.toFixed(3)} ${row.baseUnitAbbr}`;
    }
    return null;
  }

  /** Cambiar de proveedor vacía la tabla (spec 140): las líneas ya agregadas pertenecen al
   *  catálogo del proveedor anterior, así que mezclarlas con el nuevo no tendría sentido. */
  onSupplierChange(value: string): void {
    this.supplierId.set(value);
    this.rows.set([]);
    this.query.set('');
    this.supplierCatalog.set([]);
    if (value) void this.loadSupplierCatalog(value);
  }

  private async loadSupplierCatalog(supplierId: string): Promise<void> {
    const relations = await this.supplierItemsService.listForSupplier(supplierId, false);
    this.supplierCatalog.set(relations);
    await this.service.resolveMissingItems(relations.map((r) => r.inventory_item_id));
  }

  onPresentationChange(index: number, supplierItemId: string): void {
    this.updateRow(index, 'supplier_item_id', supplierItemId || null);
    if (supplierItemId) this.updateRow(index, 'unit_measure_id', null);
    const sp = this.presentationsFor(index).find((p) => p.id === supplierItemId);
    if (sp?.last_cost != null) this.updateRow(index, 'unit_cost', sp.last_cost);
  }

  onUnitMeasureChange(index: number, unitMeasureId: string): void {
    this.updateRow(index, 'unit_measure_id', unitMeasureId || null);
    if (unitMeasureId) this.updateRow(index, 'supplier_item_id', null);
  }

  cancel(): void {
    this.router.navigate(['/dashboard/inventario']);
  }

  /** Una línea "completa" (FR-012) necesita insumo, cantidad > 0 y precio > 0: el backend
   *  exige `unit_cost > 0` para una línea capturada en otra unidad de medida (spec 134) y,
   *  aunque no lo exige igual en los otros dos modos, un precio en 0 nunca es un dato real
   *  de "Registrar compra"/"Crear orden de compra" -- solo "Guardar borrador" admite esto
   *  (al reabrir un borrador incompleto, FR-017). */
  private isCompleteLine(r: PurchaseViewRow): boolean {
    return !!r.inventory_item_id && Number(r.quantity) > 0 && Number(r.unit_cost) > 0;
  }

  /** `null` si todas las líneas están completas; si no, el mensaje a mostrar sin llegar a
   *  llamar al backend. */
  private incompleteLinesError(): string | null {
    if (this.rows().length === 0) return 'Agrega al menos un insumo con cantidad mayor a 0.';
    if (this.rows().some((r) => !this.isCompleteLine(r))) {
      return 'Completa la cantidad y el precio de todas las líneas antes de continuar.';
    }
    return null;
  }

  private buildForm(items: PurchaseViewRow[]): PurchaseForm {
    return {
      supplier_id: this.supplierId() || null,
      invoice_number: this.invoiceNumber().trim() || null,
      items: items.map((r) => ({
        inventory_item_id: r.inventory_item_id,
        quantity: Number(r.quantity),
        unit_cost: Number(r.unit_cost),
        supplier_item_id: r.supplier_item_id ?? null,
        unit_measure_id: r.unit_measure_id ?? null,
      })),
    };
  }

  async registerPurchase(): Promise<void> {
    const error = this.incompleteLinesError();
    if (error) {
      this.mErr.set(error);
      this.mErrOn.set(true);
      return;
    }
    this.mErrOn.set(false);
    const form = this.buildForm(this.rows());
    const editingId = this.editingPurchaseId();
    const ok = editingId
      ? await this.service.updatePurchase(editingId, form)
      : await this.service.createPurchase(form);
    if (ok) {
      this.toast.success('Compra registrada.');
      this.router.navigate(['/dashboard/inventario']);
    }
  }

  /** "Guardar borrador" (spec 140, User Story 3, FR-013/FR-017): sin las validaciones de
   *  FR-012 -- se guarda tal cual, aunque no haya ninguna línea o les falte cantidad/costo --
   *  y, a diferencia de "Registrar compra"/"Crear orden de compra" (FR-016), se queda en la
   *  vista en vez de navegar a Inventario. Reabrir un borrador y guardar de nuevo actualiza
   *  ESE registro (`editingPurchaseId`), no crea uno nuevo que haya que borrar a mano. */
  async saveDraft(): Promise<void> {
    this.mErrOn.set(false);
    const form = this.buildForm(this.rows());
    const editingId = this.editingPurchaseId();
    const ok = editingId
      ? await this.service.updateDraft(editingId, form)
      : await this.service.saveDraft(form);
    if (ok) {
      this.toast.success('Borrador guardado.');
    }
  }

  async createOrder(): Promise<void> {
    const error = this.incompleteLinesError();
    if (error) {
      this.mErr.set(error);
      this.mErrOn.set(true);
      return;
    }
    this.mErrOn.set(false);
    const form = this.buildForm(this.rows());
    const editingId = this.editingPurchaseId();
    const ok = editingId
      ? await this.service.updatePurchaseOrder(editingId, form)
      : await this.service.createPurchaseOrder(form);
    if (ok) {
      this.toast.success('Orden de compra creada.');
      this.router.navigate(['/dashboard/inventario']);
    }
  }
}
