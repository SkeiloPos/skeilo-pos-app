import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { MoneyPipe } from '../../../shared/money.pipe';
import { formatMoney } from '../../../shared/money';
import { SuggestedPurchaseService } from '../services/suggested-purchase.service';
import { SupplierItemsService } from '../../supplier-items/services/supplier-items.service';
import { SupplierItem } from '../../supplier-items/interfaces/supplier-item.interface';
import {
  GenerateSuggestedPurchasesLinePayload,
  GenerateSuggestedPurchasesError,
  Purchase,
  SuggestedPurchaseLine,
} from '../interfaces/inventory.interface';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';

/** Estado local de una fila (spec 158, FR-020): vive por `inventory_item_id` en un `Map`
 *  separado del array de la página actual, para sobrevivir al cambiar de página. Nace con
 *  los valores de `SuggestedPurchaseLine` la primera vez que esa fila aparece en cualquier
 *  página; de ahí en más solo la toca el usuario (marcar, cantidad, proveedor, precio). */
interface LineState {
  code: string;
  name: string;
  baseUnitAbbreviation: string;
  /** El usuario la quitó de esta tanda (botón "Quitar") -- no se incluye al generar aunque
   *  esté completa. Reemplaza al viejo checkbox de selección: toda fila completa y no
   *  quitada se incluye sola, sin que haya que marcar nada. */
  removed: boolean;
  supplierItemId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  purchaseUnitLabel: string | null;
  conversionFactor: number | null;
  unitPrice: number | null;
  quantity: number;
  missingSupplierReason: string | null;
}

function lineStateFrom(line: SuggestedPurchaseLine): LineState {
  return {
    code: line.code,
    name: line.name,
    baseUnitAbbreviation: line.base_unit_abbreviation,
    removed: false,
    supplierItemId: line.supplier_item_id,
    supplierId: line.supplier_id,
    supplierName: line.supplier_name,
    purchaseUnitLabel: line.purchase_unit_label,
    conversionFactor: line.conversion_factor,
    unitPrice: line.unit_price,
    quantity: line.suggested_quantity,
    missingSupplierReason: line.missing_supplier_reason,
  };
}

/**
 * Pantalla "Compra Sugerida de Insumos" (spec 158): lista, en una sola vista paginada, los
 * insumos activos en o bajo su mínimo, precargados con su proveedor preferido, unidad de
 * compra y precio; permite ajustar cantidad/proveedor/precio por fila; y genera, en una
 * sola solicitud idempotente, una orden `draft` por cada proveedor distinto entre las filas
 * seleccionadas (research.md D5-D8). Mismo esqueleto que `purchase-view.component.ts`
 * (standalone, OnPush, signals, `FormsModule`) y mismos servicios ya existentes de
 * proveedor-insumo -- sin precarga en bloque de alternos por fila
 * ([[no-proactive-background-fetches-in-selectors]], solo al abrir el selector).
 */
@Component({
  selector: 'app-suggested-purchase-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe, MoneyPipe, MoneyInputComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-5">
      <button type="button" (click)="back()"
        class="self-start flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors">
        <app-mi-icon name="arrow_back" [size]="16" />
        Volver al inventario
      </button>

      <div>
        <p class="text-xs font-bold tracking-widest text-indigo-600 uppercase">Compras</p>
        <h1 class="text-2xl font-semibold text-gray-900 mt-0.5">Compra sugerida</h1>
        <p class="text-sm text-gray-500 mt-1">
          Insumos en o bajo su mínimo, con su proveedor preferido ya precargado. Ajusta lo que
          necesites y genera una orden de compra por cada proveedor distinto.
        </p>
      </div>

      @if (generateError(); as err) {
        <div role="alert" class="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 text-red-700 font-semibold text-sm">
          <app-mi-icon name="warning" [size]="16" />
          <span>{{ err }}</span>
        </div>
      }

      @if (confirmation(); as purchases) {
        <div class="flex flex-col gap-2 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">
          <p class="font-semibold">
            Se {{ purchases.length === 1 ? 'generó' : 'generaron' }} {{ purchases.length }}
            {{ purchases.length === 1 ? 'orden de compra' : 'órdenes de compra' }}.
          </p>
          <div class="flex flex-wrap gap-3">
            @for (p of purchases; track p.id) {
              <button type="button" (click)="viewPurchase(p)"
                class="underline font-semibold hover:text-emerald-900">
                Ver orden {{ p.id.slice(0, 8) }}
              </button>
            }
          </div>
        </div>
      }

      <div class="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-5">
        @if (service.total() === 0 && !service.isLoading()) {
          <div class="p-8 text-center text-gray-400">No hay insumos bajo mínimo.</div>
        } @else {
          <div class="border border-gray-200 rounded-xl overflow-x-auto">
            <table class="w-full border-collapse" style="min-width: 1200px">
              <thead>
                <tr>
                  <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Código</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Nombre</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Proveedor / unidad</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Precio de compra</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Cantidad</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Subtotal</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold tracking-wide text-gray-400 uppercase bg-gray-50 border-b border-gray-200 whitespace-nowrap">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (line of service.lines(); track line.inventory_item_id) {
                  @if (rowState(line.inventory_item_id); as row) {
                    @if (!row.removed) {
                    <tr class="border-b border-gray-100 align-top"
                        [class.bg-red-50]="lineError(line.inventory_item_id)">
                      <td class="px-4 py-3.5 text-gray-400 tabular-nums whitespace-nowrap">{{ row.code }}</td>
                      <th scope="row" class="px-4 py-3.5 text-left font-semibold text-sm uppercase min-w-[180px]">
                        {{ row.name }}
                        <div class="text-xs font-normal text-gray-400 normal-case mt-0.5">
                          Déficit: {{ line.deficit | number:'1.0-3' }} {{ row.baseUnitAbbreviation }}
                        </div>
                      </th>
                      <td class="px-4 py-3 min-w-[260px] align-top">
                        @if (row.supplierItemId) {
                          <p class="text-sm font-semibold">{{ row.supplierName }}</p>
                          <p class="text-xs text-gray-400">{{ row.purchaseUnitLabel }}</p>
                          @if (row.missingSupplierReason) {
                            <p class="text-xs font-semibold text-amber-600 mt-0.5">{{ row.missingSupplierReason }}</p>
                          }
                        } @else {
                          <p class="text-xs font-semibold text-amber-600">{{ row.missingSupplierReason }}</p>
                        }
                        <button type="button" (click)="toggleSelector(line.inventory_item_id)"
                          class="mt-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline">
                          Cambiar proveedor
                        </button>
                        @if (lineError(line.inventory_item_id); as msg) {
                          <p class="text-xs font-semibold text-red-600 mt-1">{{ msg }}</p>
                        }
                        @if (openSelectorFor() === line.inventory_item_id) {
                          <div class="mt-2 border border-gray-200 rounded-lg p-2 bg-gray-50 max-h-48 overflow-y-auto">
                            @if (alternatesLoading()) {
                              <p class="text-xs text-gray-400 p-1">Cargando proveedores…</p>
                            } @else if (alternatesFor(line.inventory_item_id).length === 0) {
                              <p class="text-xs text-gray-400 p-1">Sin proveedores configurados para este insumo.</p>
                            } @else {
                              @for (alt of alternatesFor(line.inventory_item_id); track alt.id) {
                                <button type="button" (click)="chooseAlternate(line.inventory_item_id, alt)"
                                  class="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-white">
                                  <span class="font-semibold">{{ alt.supplier_name }}</span>
                                  — {{ alt.presentation }}
                                  @if (alt.last_cost != null) { · {{ alt.last_cost | money }} }
                                </button>
                              }
                            }
                          </div>
                        }
                      </td>
                      <td class="px-4 py-3 w-36">
                        <app-money-input [decimals]="2" sizeClass="h-11 px-3 rounded-lg text-sm text-right border border-gray-300"
                          [disabled]="!row.supplierItemId"
                          [ngModel]="row.unitPrice" (ngModelChange)="setPrice(line.inventory_item_id, $event ?? 0)" />
                      </td>
                      <td class="px-4 py-3 w-44">
                        <div class="flex items-center gap-1.5">
                          <button type="button" (click)="decrementQty(line.inventory_item_id)" [attr.aria-label]="'Disminuir cantidad de ' + row.name"
                            [disabled]="!row.supplierItemId"
                            class="w-10 h-10 shrink-0 border border-gray-300 rounded-lg grid place-items-center hover:bg-gray-50 disabled:opacity-40">
                            <app-mi-icon name="remove" [size]="16" />
                          </button>
                          <input type="number" min="1" step="1" [attr.aria-label]="'Cantidad de ' + row.name"
                            [disabled]="!row.supplierItemId"
                            [ngModel]="row.quantity" (ngModelChange)="setQuantity(line.inventory_item_id, $event)"
                            class="h-10 w-16 px-1.5 border border-gray-300 rounded-lg text-sm text-center font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-40" />
                          <button type="button" (click)="incrementQty(line.inventory_item_id)" [attr.aria-label]="'Aumentar cantidad de ' + row.name"
                            [disabled]="!row.supplierItemId"
                            class="w-10 h-10 shrink-0 border border-gray-300 rounded-lg grid place-items-center hover:bg-gray-50 disabled:opacity-40">
                            <app-mi-icon name="add" [size]="16" />
                          </button>
                        </div>
                        @if (equivalenceLabel(row); as eq) {
                          <p class="text-xs text-gray-400 mt-1.5">{{ eq }}</p>
                        }
                      </td>
                      <td class="px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap">
                        {{ subtotalFor(row) | money }}
                      </td>
                      <td class="px-2 py-2 text-right">
                        <button type="button" (click)="removeRow(line.inventory_item_id)" [attr.aria-label]="'Quitar ' + row.name" title="Quitar"
                          class="w-11 h-11 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 inline-grid place-items-center">
                          <app-mi-icon name="delete" [size]="18" />
                        </button>
                      </td>
                    </tr>
                    }
                  }
                }
              </tbody>
            </table>
          </div>

          <!-- Paginación -->
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-gray-500">
              Página {{ service.page() }} de {{ service.totalPages() || 1 }} · {{ service.total() }} insumos
            </p>
            <div class="flex gap-2">
              <button type="button" (click)="goToPage(service.page() - 1)" [disabled]="service.page() <= 1"
                class="h-10 px-4 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                Anterior
              </button>
              <button type="button" (click)="goToPage(service.page() + 1)" [disabled]="service.page() >= service.totalPages()"
                class="h-10 px-4 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                Siguiente
              </button>
            </div>
          </div>
        }

        <!-- Resumen + acción -->
        <div class="flex items-end justify-between gap-4 flex-wrap pt-1 border-t border-gray-100">
          <div class="flex gap-8 flex-wrap pt-4">
            <div>
              <p class="text-xs font-semibold tracking-wide text-gray-400 uppercase">Insumos seleccionados</p>
              <p class="text-2xl font-semibold tabular-nums mt-0.5">{{ selectedCount() }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold tracking-wide text-gray-400 uppercase">Órdenes a generar</p>
              <p class="text-2xl font-semibold tabular-nums mt-0.5">{{ ordersToGenerate() }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold tracking-wide text-gray-400 uppercase">Total estimado</p>
              <p class="text-2xl font-semibold tabular-nums mt-0.5">{{ totalEstimated() | money }}</p>
            </div>
          </div>
          <button type="button" (click)="generate()"
            [disabled]="service.total() === 0 || selectedCount() === 0 || service.isGenerating()"
            class="h-12 px-6 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {{ service.isGenerating() ? 'Generando…' : 'Generar órdenes de compra' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SuggestedPurchasePageComponent {
  readonly service = inject(SuggestedPurchaseService);
  private readonly supplierItemsService = inject(SupplierItemsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  /** FR-020: estado por `inventory_item_id`, independiente de qué página esté visible. */
  /** Campo plano, no una signal (NG0600: Angular prohíbe escribir signals durante el
   *  render de la plantilla, y `syncRows()` corre justo ahí, desde `rowState()`/
   *  `includedEntries()`). Las mutaciones por evento (click/ngModelChange) dentro de la
   *  propia plantilla de este componente siguen re-chequeando la vista aunque sea
   *  `OnPush` -- es la regla estándar de Angular para eventos originados en su propio
   *  template, con o sin signals de por medio. */
  private historyMap = new Map<string, LineState>();

  /** Fila cuyo selector de proveedor alternativo está abierto, o `null` si ninguna. */
  readonly openSelectorFor = signal<string | null>(null);
  private readonly alternatesByItem = signal(new Map<string, SupplierItem[]>());
  readonly alternatesLoading = signal(false);

  /** Resaltado de fila tras un 422 (FR-019): sobrevive mientras no se reintente. */
  private readonly lineErrors = signal(new Map<string, string>());
  readonly generateError = signal<string | null>(null);
  readonly confirmation = signal<Purchase[] | null>(null);

  /** Una sola clave por intento de envío (T025): se regenera solo tras éxito, para que un
   *  reintento sin recargar la pantalla (p. ej. tras un error de red) use la misma. */
  private idempotencyKey = this.newIdempotencyKey();

  private newIdempotencyKey(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idem-${Date.now()}-${Math.random()}`;
  }

  /** Incorpora al Map toda fila nueva de la página que acaba de llegar, sin tocar las que
   *  el usuario ya haya marcado/ajustado (FR-020). Se llama al leer cualquier estado
   *  derivado (fila puntual o agregados del resumen) en vez de reaccionar a un `effect()`
   *  -- la tabla ya lee `rowState()` por cada fila visible en cada ciclo de render, así
   *  que el Map queda al día antes de que el resumen (más abajo en la plantilla) lo lea. */
  private syncRows(): void {
    for (const line of this.service.lines()) {
      if (!this.historyMap.has(line.inventory_item_id)) {
        this.historyMap.set(line.inventory_item_id, lineStateFrom(line));
      }
    }
  }

  rowState(itemId: string): LineState | undefined {
    this.syncRows();
    return this.historyMap.get(itemId);
  }

  lineError(itemId: string): string | null {
    return this.lineErrors().get(itemId) ?? null;
  }

  isComplete(row: LineState): boolean {
    return !!row.supplierItemId && !!row.purchaseUnitLabel && !!row.unitPrice && row.unitPrice > 0;
  }

  /** Quita esta fila de la tanda (no se incluye al generar, aunque esté completa) -- el
   *  usuario no quiere comprar ese insumo ahora mismo. Reemplaza al viejo checkbox: toda
   *  fila completa y no quitada ya se incluye sola. */
  removeRow(itemId: string): void {
    this.updateRow(itemId, (row) => ({ ...row, removed: true }));
  }

  setQuantity(itemId: string, value: unknown): void {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
    this.updateRow(itemId, (row) => ({ ...row, quantity: safe }));
  }

  incrementQty(itemId: string): void {
    const row = this.historyMap.get(itemId);
    if (row) this.setQuantity(itemId, row.quantity + 1);
  }

  decrementQty(itemId: string): void {
    const row = this.historyMap.get(itemId);
    if (row) this.setQuantity(itemId, Math.max(1, row.quantity - 1));
  }

  setPrice(itemId: string, value: number): void {
    this.updateRow(itemId, (row) => ({ ...row, unitPrice: Number(value) || 0 }));
  }

  private updateRow(itemId: string, fn: (row: LineState) => LineState): void {
    const row = this.historyMap.get(itemId);
    if (!row) return;
    this.historyMap.set(itemId, fn(row));
  }

  /** Alternos de esta fila (research.md D4): se piden solo al abrir el selector, nunca
   *  precargados en bloque ([[no-proactive-background-fetches-in-selectors]]). */
  async toggleSelector(itemId: string): Promise<void> {
    if (this.openSelectorFor() === itemId) {
      this.openSelectorFor.set(null);
      return;
    }
    this.openSelectorFor.set(itemId);
    if (this.alternatesByItem().has(itemId)) return;
    this.alternatesLoading.set(true);
    try {
      const relations = await this.supplierItemsService.listForItem(itemId, false);
      this.alternatesByItem.update((map) => new Map(map).set(itemId, relations));
    } finally {
      this.alternatesLoading.set(false);
    }
  }

  alternatesFor(itemId: string): SupplierItem[] {
    return this.alternatesByItem().get(itemId) ?? [];
  }

  /** Elegir una alternativa carga su unidad de compra y precio, conserva la cantidad ya
   *  ingresada (FR-004). */
  chooseAlternate(itemId: string, alt: SupplierItem): void {
    this.updateRow(itemId, (row) => ({
      ...row,
      supplierItemId: alt.id,
      supplierId: alt.supplier_id,
      supplierName: alt.supplier_name,
      purchaseUnitLabel: alt.presentation,
      conversionFactor: alt.conversion_factor,
      unitPrice: alt.last_cost ?? row.unitPrice,
      missingSupplierReason: null,
    }));
    this.openSelectorFor.set(null);
  }

  subtotalFor(row: LineState): number {
    if (!row.unitPrice) return 0;
    return Math.round(row.quantity * row.unitPrice * 100) / 100;
  }

  equivalenceLabel(row: LineState): string | null {
    if (!row.conversionFactor || !row.purchaseUnitLabel) return null;
    const total = row.quantity * row.conversionFactor;
    return `= ${total} ${row.baseUnitAbbreviation}`;
  }

  /** Filas que se incluirán al generar: completas (proveedor/unidad/precio>0) y no quitadas
   *  -- ya no depende de ningún checkbox, toda fila que cumpla esto entra sola. */
  private includedEntries(): [string, LineState][] {
    this.syncRows();
    return [...this.historyMap.entries()].filter(([, row]) => !row.removed && this.isComplete(row));
  }

  // Métodos simples, no `computed()`: `includedEntries()` llama a `syncRows()`, que escribe
  // en una signal -- Angular prohíbe escribir signals dentro de la derivación de un
  // `computed()`. La plantilla los re-evalúa en cada ciclo de CD igual que un `computed`
  // (`service.lines()`/`rows()` siguen siendo las signals que realmente disparan el re-render).
  selectedCount(): number {
    return this.includedEntries().length;
  }

  ordersToGenerate(): number {
    return new Set(this.includedEntries().map(([, row]) => row.supplierId)).size;
  }

  totalEstimated(): number {
    return Math.round(
      this.includedEntries().reduce((sum, [, row]) => sum + row.quantity * (row.unitPrice ?? 0), 0) * 100,
    ) / 100;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.service.totalPages()) return;
    this.service.setPage(page);
  }

  back(): void {
    this.router.navigate(['/dashboard/inventario']);
  }

  viewPurchase(purchase: Purchase): void {
    this.router.navigate(['/dashboard/inventario/compras/nueva'], { state: { draft: purchase } });
  }

  /** Pide confirmación antes de crear nada (el usuario pidió una ventana de confirmación
   *  explícita, no solo deshabilitar el botón mientras está en curso) y, si confirma, recién
   *  ahí llama al backend. */
  async generate(): Promise<void> {
    const entries = this.includedEntries();
    if (entries.length === 0) return;

    const ok = await this.confirm.ask({
      title: 'Generar órdenes de compra',
      message: `Se ${this.ordersToGenerate() === 1 ? 'creará' : 'crearán'} ${this.ordersToGenerate()} `
        + `${this.ordersToGenerate() === 1 ? 'orden de compra' : 'órdenes de compra'} para ${this.selectedCount()} `
        + `${this.selectedCount() === 1 ? 'insumo' : 'insumos'}, por un total estimado de ${formatMoney(this.totalEstimated())}. `
        + '¿Confirmas?',
      confirmText: 'Generar',
      tone: 'primary',
    });
    if (!ok) return;

    await this.submitGeneration(entries);
  }

  private async submitGeneration(entries: [string, LineState][]): Promise<void> {
    this.generateError.set(null);
    this.lineErrors.set(new Map());
    this.confirmation.set(null);

    const lines: GenerateSuggestedPurchasesLinePayload[] = entries.map(([itemId, row]) => ({
      inventory_item_id: itemId,
      supplier_item_id: row.supplierItemId as string,
      presentation_quantity: row.quantity,
      presentation_unit_cost: row.unitPrice as number,
    }));

    try {
      const purchases = await this.service.generate(this.idempotencyKey, {
        idempotency_key: this.idempotencyKey,
        lines,
      });
      this.confirmation.set(purchases);
      this.toast.success('Órdenes de compra generadas.');
      this.idempotencyKey = this.newIdempotencyKey();
    } catch (err) {
      const generateErr = err as GenerateSuggestedPurchasesError;
      if (generateErr.lines?.length) {
        this.lineErrors.set(
          new Map(generateErr.lines.map((l) => [l.inventory_item_id, this.reasonLabel(l.reason)])),
        );
        this.generateError.set(generateErr.message || 'No se pudo generar la compra sugerida.');
      } else {
        this.toast.error(generateErr.message || 'No se pudo completar la operación.');
      }
    }
  }

  private reasonLabel(reason: string): string {
    switch (reason) {
      case 'unit_price_zero': return 'El precio debe ser mayor a 0.';
      case 'quantity_below_minimum': return 'La cantidad debe ser al menos 1.';
      case 'supplier_item_inactive': return 'Esa relación proveedor-insumo ya no está activa.';
      case 'supplier_item_not_found': return 'Esa relación proveedor-insumo ya no existe.';
      default: return 'Revisa esta línea.';
    }
  }
}
