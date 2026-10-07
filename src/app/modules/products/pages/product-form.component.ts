import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CategoryService } from '../../categories/services/category.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { buildUnitLookup, formatQuantity } from '../../inventory/services/unit-lookup';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PresentationService } from '../../presentations/services/presentation.service';
import {
  normalizeVariantName,
  VARIANT_NAME_MESSAGE,
} from '../../../shared/validators/variant-name.validator';
import {
  DEFAULT_PRESENTATION_NAME,
  DeactivatedVariant,
  PreparationType,
  ProductDraft,
  RecipeLineDraft,
  VariantDraft,
  VariantOptionGroupDraft,
} from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/** Una fila del desglose: qué pasa si el cliente elige esta opción. */
interface SlotBreakdownRow {
  optionId: string;
  optionName: string;
  /** Vacío si la opción no tiene insumo ligado (no descontaría nada). */
  itemName: string;
  /** Cantidad total con unidad, ya resuelta: '80 g'. */
  amount: string;
  /** Desglose de la suma cuando la opción aporta consumo propio; vacío si no. */
  extra: string;
}

interface SlotBreakdown {
  rows: SlotBreakdownRow[];
  /** 'Helado chocolate, Helado fresa y 20 más'. */
  summary: string;
  /** Cuántas opciones activas no tienen insumo. */
  missing: number;
}

/**
 * Página unificada de crear/editar producto (rediseño del prototipo, adaptado al
 * backend real). Mantiene un draft en memoria — datos generales, toggle de
 * tamaños, receta por variante e grupos de opciones — y delega el guardado en
 * `ProductService.saveProduct`, que orquesta las llamadas planas del backend.
 */
@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    DecimalPipe,
    SearchableSelectComponent,
    MoneyInputComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    IconMiComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-3xl mx-auto space-y-5">
      <div>
        <a routerLink="/dashboard/products" class="text-xs text-gray-400 hover:text-gray-600">← Volver al catálogo</a>
        <div class="flex items-center justify-between mt-1">
          <h1 class="text-2xl font-bold text-gray-900">{{ draft().id ? 'Editar producto' : 'Nuevo producto' }}</h1>
          @if (draft().id) {
            <button (click)="toggleActive()"
              class="px-3 py-1.5 text-sm font-medium rounded-xl transition-colors"
              [class]="productActive() ? 'text-gray-600 bg-gray-100 hover:bg-gray-200' : 'text-green-700 bg-green-50 hover:bg-green-100'">
              {{ productActive() ? 'Desactivar' : 'Activar' }}
            </button>
          }
        </div>
      </div>

      @if (loading()) {
        <p class="text-sm text-gray-400">Cargando producto…</p>
      } @else {
        @if (service.error()) {
          <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ service.error() }}</div>
        }

        <!-- ===== Datos generales ===== -->
        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 class="text-sm font-semibold text-gray-900 mb-4">Datos generales</h3>
          <div class="flex flex-col sm:flex-row gap-5">
            <div class="shrink-0">
              @if (previewUrl() ?? draft().image_url; as img) {
                <img [src]="img" alt="" class="w-32 h-32 rounded-xl object-cover border border-gray-100" />
              } @else {
                <div class="w-32 h-32 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                  <app-mi-icon name="image-off" ariaLabel="Sin imagen" [size]="32" />
                </div>
              }
              <label class="mt-2 block text-xs text-indigo-600 hover:text-indigo-700 cursor-pointer">
                {{ uploading() ? 'Subiendo…' : 'Cambiar imagen' }}
                <input type="file" accept="image/*" (change)="onImageSelected($event)" class="hidden" [disabled]="uploading()" />
              </label>
              @if (pendingImage()) {
                <p class="mt-1 text-[11px] text-gray-400">Se subirá al guardar</p>
                <button type="button" (click)="clearPendingImage()" class="text-[11px] text-red-600 hover:text-red-700">Cancelar imagen</button>
              }
            </div>
            <div class="flex-1 space-y-3">
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre</label>
                <input [value]="draft().name" (input)="setField('name', $any($event.target).value)" placeholder="Ej. Copa de Helado"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Categoría</label>
                <select [ngModel]="draft().category_id" (ngModelChange)="setField('category_id', $event)"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Seleccionar categoría…</option>
                  @for (c of categoryService.allCategories(); track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de preparación</label>
                <select [ngModel]="draft().preparation_type" (ngModelChange)="setField('preparation_type', $event)"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="prepared">Preparado (al momento)</option>
                  <option value="packaged">Empacado</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descripción</label>
                <textarea [value]="draft().description" (input)="setField('description', $any($event.target).value)" rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"></textarea>
              </div>
            </div>
          </div>
        </section>

        <!-- ===== Tamaños del producto =====
             Todo lo de una presentación vive junto: precio, insumos fijos y sabores a
             elegir. Antes estaba repartido en tres secciones y obligaba a ir y venir
             entre ellas para configurar un solo tamaño. -->
        <section class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-sm font-semibold text-gray-900">Tamaños del producto</h3>
              <p class="text-xs text-gray-500 mt-1">Cada tamaño tiene su precio, sus insumos y cuántos sabores puede elegir el cliente.</p>
            </div>
            <button type="button" (click)="toggleHasSizes()" role="switch" [attr.aria-checked]="draft().hasSizes"
              class="relative w-11 h-6 rounded-full transition-colors shrink-0"
              [class]="draft().hasSizes ? 'bg-indigo-600' : 'bg-gray-300'"
              title="Actívalo si este producto se vende en más de un tamaño">
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" [class]="draft().hasSizes ? 'left-[22px]' : 'left-0.5'"></span>
            </button>
          </div>

          @if (draft().hasSizes) {
            <div class="mt-4 rounded-xl border border-gray-200 overflow-hidden">
              <div class="grid grid-cols-[28px_28px_1fr_1fr_140px_88px] gap-x-3 items-center px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <span></span>
                <span class="text-center">#</span>
                <span>Presentación</span>
                <span>Nombre (opcional)</span>
                <span>Precio</span>
                <span></span>
              </div>
              <div cdkDropList [cdkDropListData]="draft().variants" (cdkDropListDropped)="onVariantDrop($event)"
                class="divide-y divide-gray-100">
                @for (v of draft().variants; track v.localId; let i = $index) {
                  <div cdkDrag (click)="activeLocalId.set(v.localId)"
                    class="grid grid-cols-[28px_28px_1fr_1fr_140px_88px] gap-x-3 items-center px-3 py-2 cursor-pointer transition-colors"
                    [class]="v.localId === activeLocalId() ? 'bg-indigo-50' : 'hover:bg-gray-50'">
                    <span cdkDragHandle (click)="$event.stopPropagation()"
                      class="text-center text-gray-300 hover:text-gray-500 cursor-move">⠿</span>
                    <span class="text-center text-xs text-gray-400">{{ i + 1 }}</span>
                    <div class="min-w-0">
                      <select [ngModel]="v.presentationId ?? ''"
                        (ngModelChange)="setVariantPresentation(v.localId, $event || null)"
                        (click)="$event.stopPropagation()"
                        [attr.aria-invalid]="isPresentationMissing(v)"
                        class="w-full min-w-0 px-2 py-1.5 border rounded-lg text-sm font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        [class]="isPresentationMissing(v) ? 'border-red-300' : 'border-gray-200'">
                        <option value="" disabled>Elige una presentación</option>
                        @for (p of presentationOptionsFor(v); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                      @if (isPresentationMissing(v)) {
                        <p class="text-xs text-red-600 mt-1">
                          @if (hasFreePresentations()) { Elige una presentación } @else { No hay más presentaciones disponibles: créalas en Presentaciones }
                        </p>
                      }
                    </div>
                    <div class="min-w-0">
                      <input type="text" [ngModel]="v.name ?? ''"
                        (ngModelChange)="setVariantField(v.localId, 'name', $event)"
                        (click)="$event.stopPropagation()"
                        [placeholder]="variantNamePlaceholder(v)"
                        maxlength="200"
                        class="w-full min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400" />
                    </div>
                    <div class="flex items-center gap-1 border border-gray-200 rounded-lg px-2 py-1 bg-white">
                      <span class="text-gray-400 text-sm">$</span>
                      <app-money-input [ngModel]="v.price"
                        (ngModelChange)="setVariantField(v.localId, 'price', $event ?? 0)"
                        [bordered]="false" sizeClass="text-sm" />
                    </div>
                    @if (draft().variants.length > 1) {
                      <button type="button" (click)="removeVariant(v.localId); $event.stopPropagation()"
                        class="justify-self-end px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        Eliminar
                      </button>
                    }
                  </div>
                }
                @if (variantNameError()) {
                  <p class="text-xs text-red-600 px-3 py-2">{{ variantNameError() }}</p>
                }
              </div>
              <button type="button" (click)="addVariant()"
                class="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-indigo-600 transition-colors border-t border-dashed border-gray-200">
                + Agregar tamaño
              </button>
            </div>
          }

          <!-- Presentaciones retiradas: siguen ocupando su presentación, así que la salida es
               restaurarlas, no volver a crearlas. -->
          @if (draft().deactivated.length) {
            <div class="mt-4 border-t border-gray-100 pt-4">
              <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Presentaciones desactivadas</h4>
              <p class="text-xs text-gray-400 mt-0.5 mb-2">No se venden ni salen en la carta. Restaurar se aplica de inmediato.</p>
              <ul class="space-y-1.5">
                @for (dv of draft().deactivated; track dv.id) {
                  <li class="flex items-center gap-3 text-sm">
                    <span class="text-gray-700">{{ dv.presentationName }}</span>
                    <span class="text-gray-400">$ {{ dv.price | number: '1.0-0' }}</span>
                    <button type="button" (click)="restoreVariant(dv)" [disabled]="service.isSubmitting()"
                      class="px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50">
                      Restaurar
                    </button>
                  </li>
                }
              </ul>
            </div>
          }

          <!-- ===== Maneja inventario (spec 027) =====
               Apagado por defecto. Habilita/deshabilita "Insumos fijos" (siempre) y la
               parte de inventario de "Sabores a elegir" (cantidad de consumo, detalle de
               insumo -- el selector de grupo y min/max siguen editables sin importar este
               switch, spec 064 FR-006). Apagarlo NO borra los insumos ya guardados, solo
               deja de exigirlos y de aplicarlos al vender. Deshabilitado (no oculto) sin
               el módulo Inventario en el plan (spec 064, FR-011) -- un producto existente
               con el switch ya encendido debe seguir mostrando ese valor. -->
          <div class="flex items-start justify-between gap-4 mt-4 pt-4 border-t border-gray-100">
            <div>
              <h4 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Maneja inventario</h4>
              <p class="text-xs text-gray-500 mt-1">
                @if (inventarioIncluido()) {
                  Actívalo para asociar los insumos que este producto descuenta al venderse.
                } @else {
                  Tu plan actual no incluye el módulo de inventario.
                }
              </p>
            </div>
            <button type="button" (click)="toggleTracksInventory()" role="switch"
              [attr.aria-checked]="draft().tracks_inventory" [disabled]="!inventarioIncluido()"
              class="relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              [class]="draft().tracks_inventory ? 'bg-indigo-600' : 'bg-gray-300'"
              title="Actívalo si este producto descuenta insumos del inventario al venderse">
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" [class]="draft().tracks_inventory ? 'left-[22px]' : 'left-0.5'"></span>
            </button>
          </div>

          @if (showsInventoryWarning()) {
            <div class="mt-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-700">
              <app-mi-icon name="warning" [size]="16" class="inline-flex align-text-bottom" /> Este producto no podrá venderse hasta que se le configure al menos un insumo en alguna presentación.
            </div>
          }

          @if (activeVariant(); as av) {
            <div class="mt-4 space-y-5">
              @if (!draft().hasSizes) {
                <!-- Sin tamaños: una sola presentación; el nombre y el orden no aplican. -->
                <div class="flex flex-wrap items-end gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Precio</label>
                    <div class="flex items-center gap-1.5 border border-gray-300 rounded-xl px-3 py-2 w-36">
                      <span class="text-gray-400 text-sm">$</span>
                      <app-money-input [ngModel]="av.price"
                        (ngModelChange)="setVariantField(av.localId, 'price', $event ?? 0)"
                        [bordered]="false" sizeClass="text-sm" />
                    </div>
                  </div>
                </div>
              }

              @if (sectionsEnabled()) {
              <!-- Insumos fijos -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Insumos fijos</h4>
                <p class="text-xs text-gray-400 mt-0.5 mb-2">Se descuentan siempre que se venda este tamaño.</p>
                <div class="space-y-2">
                  @if (av.recipe.length === 0) {
                    <p class="text-sm text-gray-400">Ninguno todavía.</p>
                  }
                  @for (line of av.recipe; track $index) {
                    <div class="flex items-center gap-2">
                      <app-searchable-select [ngModel]="line.inventory_item_id"
                        (ngModelChange)="setRecipeField(av.localId, $index, 'inventory_item_id', $event)"
                        [options]="inventoryOptions()" [search]="searchInventoryItems" placeholder="Insumo…" class="flex-1" />
                      <input type="number" min="0" step="0.001" [value]="line.quantity"
                        (input)="setRecipeField(av.localId, $index, 'quantity', +$any($event.target).value)" placeholder="Cant."
                        class="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <span class="w-12 text-xs text-gray-400">{{ unitAbbr(line.inventory_item_id) }}</span>
                      <button type="button" (click)="removeRecipeLine(av.localId, $index)"
                        class="px-2 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg"><app-mi-icon name="close" ariaLabel="Quitar" [size]="14" /></button>
                    </div>
                  }
                  <button type="button" (click)="addRecipeLine(av.localId)"
                    class="text-sm font-medium text-indigo-600 hover:text-indigo-700">+ Agregar insumo</button>
                </div>
              </div>
              } @else {
              <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                Activa "Maneja inventario" arriba para configurar los insumos fijos que este tamaño descuenta.
              </div>
              }

              <!-- ===== Sabores a elegir (spec 064) =====
                   A diferencia de "Insumos fijos" (100% inventario), esta sección SIEMPRE
                   está disponible: qué grupo ofrece la variante y cuántas opciones elige el
                   cliente (min/max) son datos de menú/precio, no de inventario. Solo la
                   cantidad de consumo y el detalle de insumo (sectionsEnabled(), combina el
                   switch del producto con el acceso por plan) dependen de inventario. -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Sabores a elegir</h4>
                <p class="text-xs text-gray-400 mt-0.5 mb-2">
                  @if (sectionsEnabled()) {
                    El cliente elige, y se descuenta la cantidad indicada del insumo de <strong>cada</strong> opción que elija.
                  } @else {
                    El cliente elige entre las opciones del grupo (sin descuento de inventario).
                  }
                </p>
                <div class="space-y-3">
                  @if (av.optionGroups.length === 0) {
                    <p class="text-sm text-gray-400">Ninguno. Este tamaño no pide elegir nada.</p>
                  }
                  @for (g of av.optionGroups; track $index) {
                    @let bd = groupBreakdown(g);
                    <div class="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <app-searchable-select [ngModel]="g.option_group_id"
                          (ngModelChange)="setGroupField(av.localId, $index, 'option_group_id', $event)"
                          [options]="groupOptionsFor(av.localId, $index)" placeholder="Grupo…" class="flex-1 min-w-40" />
                        <button type="button" (click)="removeGroup(av.localId, $index)"
                          class="px-2 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg"><app-mi-icon name="close" ariaLabel="Quitar" [size]="14" /></button>
                      </div>

                      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2 text-sm">
                        <span class="text-gray-600">elige</span>
                        <input type="number" min="0" [value]="g.min_select"
                          (input)="setGroupField(av.localId, $index, 'min_select', +$any($event.target).value)"
                          class="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <span class="text-gray-600">a</span>
                        <input type="number" min="1" [value]="g.max_select"
                          (input)="setGroupField(av.localId, $index, 'max_select', +$any($event.target).value)"
                          class="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        @if (sectionsEnabled()) {
                          <span class="text-gray-600 ml-2">descuenta</span>
                          <input type="number" min="0" step="0.001" [value]="g.quantity_per_option"
                            (input)="setGroupField(av.localId, $index, 'quantity_per_option', +$any($event.target).value)"
                            class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          <span class="text-gray-500 text-xs">{{ groupUnit(g) }} por cada uno</span>
                          @if (groupTotalHint(g); as hint) {
                            <span class="text-xs font-semibold text-gray-700">{{ hint }}</span>
                          }
                        }
                      </div>

                      @if (groupError(g); as err) {
                        <p class="text-xs text-red-600 mt-1.5">{{ err }}</p>
                      }
                      @if (sectionsEnabled()) {
                        @for (w of groupWarnings(g); track w) {
                          <p class="text-xs text-amber-700 mt-1.5"><app-mi-icon name="warning" [size]="14" class="inline-flex align-text-bottom" /> {{ w }}</p>
                        }
                      }

                      @if (sectionsEnabled() && g.option_group_id) {
                        <div class="mt-2 pt-2 border-t border-amber-200/70">
                          <div class="flex items-start justify-between gap-3">
                            <p class="text-xs text-gray-500 min-w-0">
                              <span class="font-medium text-gray-600">Descuenta de:</span>
                              {{ bd.summary }}
                              @if (bd.missing > 0) {
                                <span class="text-amber-700 font-medium inline-flex items-center gap-0.5">· <app-mi-icon name="warning" [size]="14" /> {{ bd.missing }} sin insumo</span>
                              }
                            </p>
                            <a routerLink="/dashboard/ajustes/grupos-opciones" target="_blank" rel="noopener"
                              class="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                              title="Se abre en otra pestaña para no perder los cambios sin guardar">
                              Editar grupo ↗
                            </a>
                          </div>

                          @if (bd.rows.length > 0) {
                            <button type="button" (click)="toggleGroupDetail(av.localId, $index)"
                              class="mt-1 text-xs font-medium text-gray-500 hover:text-gray-700">
                              {{ isGroupOpen(av.localId, $index) ? 'Ocultar detalle ▴' : 'Ver detalle (' + bd.rows.length + ') ▾' }}
                            </button>

                            @if (isGroupOpen(av.localId, $index)) {
                              <div class="mt-2 rounded-lg bg-white border border-gray-100 overflow-hidden">
                                <table class="w-full text-xs">
                                  <thead class="bg-gray-50 text-gray-500">
                                    <tr>
                                      <th class="text-left font-medium px-3 py-1.5">Si elige…</th>
                                      <th class="text-left font-medium px-3 py-1.5">Descuenta de</th>
                                      <th class="text-right font-medium px-3 py-1.5">Cantidad</th>
                                    </tr>
                                  </thead>
                                  <tbody class="divide-y divide-gray-100">
                                    @for (r of bd.rows; track r.optionId) {
                                      <tr [class]="r.itemName ? '' : 'bg-amber-50'">
                                        <td class="px-3 py-1.5 text-gray-700">{{ r.optionName }}</td>
                                        <td class="px-3 py-1.5" [class]="r.itemName ? 'text-gray-600' : 'text-amber-700'">
                                          {{ r.itemName || 'Sin insumo asignado' }}
                                        </td>
                                        <td class="px-3 py-1.5 text-right whitespace-nowrap"
                                          [class]="r.itemName ? 'text-gray-900 font-medium' : 'text-amber-700'">
                                          {{ r.itemName ? r.amount : 'no descuenta' }}
                                          @if (r.itemName && r.extra) {
                                            <span class="block text-gray-400 font-normal">{{ r.extra }}</span>
                                          }
                                        </td>
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                              </div>
                            }
                          }
                        </div>
                      }
                    </div>
                  }
                  <button type="button" (click)="addGroup(av.localId)"
                    class="text-sm font-medium text-amber-600 hover:text-amber-700">+ Agregar sabores a elegir</button>
                </div>
              </div>

              @if (draft().hasSizes && draft().variants.length > 1) {
                <button type="button" (click)="copyConfigToOthers(av.localId)"
                  class="text-xs font-medium text-gray-500 hover:text-indigo-600 border border-dashed border-gray-300 hover:border-indigo-400 rounded-lg px-3 py-2 transition-colors">
                  Copiar insumos y sabores de «{{ variantLabel(av) }}» a los otros tamaños
                </button>
              }
            </div>
          }
        </section>

        <!-- ===== Acciones ===== -->
        <div class="flex justify-end gap-3 pb-2">
          <button type="button" (click)="cancel()"
            class="px-5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="button" (click)="save()" [disabled]="!canSave() || service.isSubmitting() || uploading()"
            class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {{ service.isSubmitting() ? 'Guardando…' : 'Guardar producto' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ProductFormComponent implements OnInit, OnDestroy {
  readonly service = inject(ProductService);
  readonly categoryService = inject(CategoryService);
  readonly inventoryService = inject(InventoryService);
  readonly presentationService = inject(PresentationService);
  private readonly optionGroupService = inject(OptionGroupService);
  private readonly unitMeasureService = inject(UnitMeasureService);
  private readonly confirm = inject(ConfirmService);
  private readonly planSummaryService = inject(PlanSummaryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * spec 064: si el plan del tenant incluye el módulo Inventario. Fail-closed mientras
   * `summary()` no ha cargado (mismo criterio que `inventory-page.component.ts::comprasIncluido`)
   * -- más seguro que dejar activar el switch y toparse con un 403 del backend después.
   */
  readonly inventarioIncluido = computed(() => {
    const summary = this.planSummaryService.summary();
    return summary !== null && summary.modules.inventario && !summary.vencido;
  });

  /**
   * Gobierna la parte de "Sabores a elegir" que sí es de inventario (cantidad de consumo,
   * detalle de insumo) -- el selector de grupo y min/max quedan siempre editables (spec
   * 064, FR-006: restructura el `@if` único que antes ocultaba también eso). Combina el
   * switch del producto (spec 027) con el acceso por plan (spec 064, US5): sin el módulo,
   * ni siquiera un producto con el switch encendido puede mostrar estos campos.
   */
  readonly sectionsEnabled = computed(
    () => this.draft().tracks_inventory && this.inventarioIncluido(),
  );

  private lidCounter = 0;

  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly productActive = signal(true);
  /** Imagen elegida pero aún NO subida (se sube al guardar para evitar huérfanos). */
  readonly pendingImage = signal<File | null>(null);
  /** Preview local (`URL.createObjectURL`) de la imagen pendiente. */
  readonly previewUrl = signal<string | null>(null);
  readonly activeLocalId = signal('');
  readonly draft = signal<ProductDraft>(this.emptyDraft());
  /**
   * Desgloses abiertos, por `${variantLocalId}:${índice}`. La clave lleva la variante
   * porque el mismo grupo puede estar en varios tamaños con cantidades distintas, y
   * son desgloses distintos.
   */
  private readonly openGroups = signal<ReadonlySet<string>>(new Set());

  readonly activeVariant = computed(
    () => this.draft().variants.find((v) => v.localId === this.activeLocalId()) ?? null,
  );

  private readonly unitLookup = computed(() =>
    buildUnitLookup(this.inventoryService.allItems(), this.unitMeasureService.unitMeasures()),
  );

  /** Opciones para el select con buscador de insumos de la receta. */
  readonly inventoryOptions = computed(() =>
    this.inventoryService.allItems().map((i) => ({ id: i.id, label: i.name })),
  );

  /**
   * Búsqueda remota del picker de "Insumos fijos" (spec 098): a diferencia de
   * `inventoryOptions` (acotado a `allItems()`, una sola página de 100), esto busca en
   * el servidor con el texto escrito, así que un insumo fuera de esa página sigue
   * siendo encontrable.
   */
  readonly searchInventoryItems = (query: string): Promise<{ id: string; label: string }[]> =>
    this.inventoryService
      .searchActiveItems(query)
      .then((items) => items.map((i) => ({ id: i.id, label: i.name })));

  /**
   * Grupos elegibles en una fila: los activos, menos los que ya usa **esta misma
   * presentación** (salvo el de la propia fila, que debe seguir seleccionable).
   */
  /**
   * Opciones del selector de presentación de una fila (spec 084, A-79): las activas que
   * ninguna **otra** fila del producto ya eligió (sin la columna «Nombre», el selector es la
   * única pista visual de un duplicado; el 409 del backend queda de respaldo), más la que esta
   * fila ya tenga aunque se haya desactivado después o aún no esté cargado el catálogo.
   */
  presentationOptionsFor(v: VariantDraft): { id: string; name: string }[] {
    const takenByOthers = new Set(
      this.draft()
        .variants.filter((o) => o.localId !== v.localId && o.presentationId)
        .map((o) => o.presentationId as string),
    );
    const options: { id: string; name: string }[] = this.presentationService
      .allPresentations()
      .filter((p) => (p.active && !takenByOthers.has(p.id)) || p.id === v.presentationId)
      .map((p) => ({ id: p.id, name: p.name }));
    if (v.presentationId && !options.some((o) => o.id === v.presentationId)) {
      options.push({ id: v.presentationId, name: v.presentationName });
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Cuántas presentaciones activas quedan sin usar en el producto (para el aviso de lista vacía). */
  readonly hasFreePresentations = computed(() => {
    const used = new Set(this.draft().variants.map((v) => v.presentationId));
    return this.presentationService.allPresentations().some((p) => p.active && !used.has(p.id));
  });

  /** Filas de tamaño que aún no eligieron presentación (bloquean el guardado). */
  isPresentationMissing(v: VariantDraft): boolean {
    return this.draft().hasSizes && !v.presentationId;
  }

  /**
   * Asocia la presentación de una fila (spec 084, A-79). La variante no tiene nombre propio:
   * solo se guarda el id (y el nombre, para pintar la fila sin esperar al catálogo).
   */
  setVariantPresentation(localId: string, presentationId: string | null): void {
    const chosen = presentationId
      ? this.presentationService.allPresentations().find((p) => p.id === presentationId)
      : null;
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? { ...v, presentationId, presentationName: chosen ? chosen.name : '' }
          : v,
      ),
    }));
  }

  /** spec 099 (FR-010): ayuda del campo "Nombre (opcional)" de una fila. */
  variantNamePlaceholder(v: VariantDraft): string {
    return v.presentationName
      ? `Se mostrará: ${v.presentationName}`
      : 'Se mostrará la presentación';
  }

  /**
   * spec 099 (FR-007/FR-008): mensaje de error del nombre propio -- longitud o nombre
   * duplicado dentro del producto (insensible a mayúsculas, sobre la etiqueta que
   * resultaría, no sobre el texto crudo) -- o `null` si todas las filas están bien.
   */
  readonly variantNameError = computed<string | null>(() => {
    const variants = this.draft().variants;
    const normalizados: string[] = [];
    for (const v of variants) {
      const resultado = normalizeVariantName(v.name ?? '');
      if ('error' in resultado) return resultado.error;
      normalizados.push(resultado.value);
    }
    const vistos = new Set<string>();
    for (let i = 0; i < variants.length; i++) {
      const etiqueta = (normalizados[i] || variants[i].presentationName || '').toLowerCase();
      if (!etiqueta) continue;
      if (vistos.has(etiqueta)) {
        return 'Ya existe un tamaño con ese nombre en este producto';
      }
      vistos.add(etiqueta);
    }
    return null;
  });

  groupOptionsFor(localId: string, index: number) {
    const variant = this.draft().variants.find((v) => v.localId === localId);
    const usados = new Set(
      (variant?.optionGroups ?? [])
        .filter((_, i) => i !== index)
        .map((g) => g.option_group_id),
    );
    return this.optionGroupService
      .groups()
      .filter((g) => g.active && !usados.has(g.id))
      .map((g) => ({ id: g.id, label: g.name }));
  }

  readonly canSave = computed(() => {
    const d = this.draft();
    return (
      d.name.trim().length > 0 &&
      !!d.category_id &&
      d.variants.length > 0 &&
      d.variants.every((v) => Number(v.price) >= 0) &&
      // Con tamaños, cada fila necesita presentación: es lo que la nombra (spec 084, A-79).
      // Sin tamaños, la única variante va con `null` y el backend usa «Presentación única».
      (!d.hasSizes || d.variants.every((v) => !!v.presentationId)) &&
      // Una fila sin grupo o con min/max incoherentes la rechaza el backend con 422;
      // mejor bloquear el botón que perder el guardado a medias.
      d.variants.every((v) => v.optionGroups.every((g) => !this.groupError(g))) &&
      // spec 099 (FR-007/FR-008): nombre propio dentro del límite y sin duplicados.
      !this.variantNameError()
    );
  });

  /** Mensaje de configuración inválida de una fila, o null si está bien. */
  groupError(g: VariantOptionGroupDraft): string | null {
    if (!g.option_group_id) return 'Elige un grupo.';
    if (Number(g.min_select) < 0) return 'El mínimo no puede ser negativo.';
    if (Number(g.max_select) < 1) return 'El máximo debe ser al menos 1.';
    if (Number(g.max_select) < Number(g.min_select)) {
      return 'El máximo no puede ser menor que el mínimo.';
    }
    const disponibles = this.groupOptions(g.option_group_id).filter((o) => o.active).length;
    if (Number(g.min_select) > disponibles) {
      return `Este grupo solo tiene ${disponibles} opción(es) activa(s): el cliente no podría elegir ${g.min_select}.`;
    }
    return null;
  }

  /** Unidad de lo que descuenta un grupo, si todas sus opciones la comparten. */
  groupUnit(g: VariantOptionGroupDraft): string {
    if (!g.option_group_id) return '';
    const units = new Set(
      this.groupOptions(g.option_group_id)
        .filter((o) => o.inventory_item_id)
        .map((o) => this.unitAbbr(o.inventory_item_id)),
    );
    return units.size === 1 ? [...units][0] : '';
  }

  /**
   * Lo que se descontará por venta, escrito entero: `2 sabores × 120 g = 240 g`.
   *
   * Es el guardarraíl contra el dedazo. Un 6000 tecleado en vez de 60 se ve raro en un
   * campo suelto, pero salta a la vista cuando el total dice "12000 g por venta".
   * Solo se muestra si el número es determinista (`min = max`).
   */
  groupTotalHint(g: VariantOptionGroupDraft): string | null {
    if (!g.option_group_id) return null;
    const n = Number(g.min_select) || 0;
    if (n <= 0 || n !== Number(g.max_select)) return null;

    const delTamano = Number(g.quantity_per_option) || 0;
    // Sin cantidad propia del tamaño manda la de la opción, que puede variar entre
    // opciones; entonces no hay un total único que mostrar.
    if (delTamano <= 0) return null;

    const unidad = this.groupUnit(g);
    const total = formatQuantity(delTamano * n);
    const cada = formatQuantity(delTamano);
    const u = unidad ? ` ${unidad}` : '';
    return n === 1
      ? `= ${total}${u} por venta`
      : `${n} × ${cada}${u} = ${total}${u} por venta`;
  }

  /**
   * Avisos que no impiden guardar pero casi siempre son un error de captura.
   * Se devuelven todos para no ir descubriéndolos de uno en uno.
   */
  groupWarnings(g: VariantOptionGroupDraft): string[] {
    if (!g.option_group_id) return [];
    const avisos: string[] = [];
    const options = this.groupOptions(g.option_group_id).filter((o) => o.active);
    const delTamano = Number(g.quantity_per_option) || 0;

    // (a) El fallo simétrico del doble descuento, y más silencioso: vender sin mover
    // stock. Ocurre si ni el tamaño ni las opciones ponen cantidad.
    if (delTamano <= 0) {
      const conPropia = options.filter(
        (o) => o.inventory_item_id && Number(o.item_quantity) > 0,
      );
      if (conPropia.length === 0) {
        avisos.push(
          'Nadie define cuánto descontar: elegir aquí no moverá el inventario. ' +
            'Pon una cantidad por sabor.',
        );
      } else if (conPropia.length < options.length) {
        avisos.push(
          `Solo ${conPropia.length} de ${options.length} opciones traen cantidad propia; ` +
            'el resto no descontará nada.',
        );
      }
    }

    // (b) Dedazo de magnitud: pedir más de lo que hay en la despensa entera.
    if (delTamano > 0) {
      const stocks = options
        .map((o) => this.inventoryService.allItems().find((i) => i.id === o.inventory_item_id))
        .filter((i): i is NonNullable<typeof i> => !!i)
        .map((i) => Number(i.current_stock));
      const mayor = stocks.length ? Math.max(...stocks) : 0;
      if (stocks.length > 0 && delTamano > mayor) {
        const u = this.groupUnit(g);
        avisos.push(
          `${formatQuantity(delTamano)}${u ? ` ${u}` : ''} supera el stock de todos los ` +
            `sabores (el mayor tiene ${formatQuantity(mayor)}${u ? ` ${u}` : ''}). ` +
            '¿Es la cantidad correcta?',
        );
      }
    }

    return avisos;
  }

  /**
   * Qué descontaría cada opción del grupo si el cliente la elige.
   *
   * Es la respuesta a "¿sobre qué insumo estoy aplicando este grupo?": el insumo vive
   * en cada opción (otro módulo) y la cantidad aquí, así que sin este cruce la fila no
   * dice de dónde sale el stock.
   *
   * La cantidad replica `plan_line_consumption` del backend:
   * `quantity_per_option` si el tamaño la define, y si no la de la opción. **Nunca se
   * suman**, y la tabla lo dice fila por fila: sin eso, ver un "80 g" configurado en el
   * sabor invita a pensar que se acumula con el del tamaño.
   */
  groupBreakdown(g: VariantOptionGroupDraft): SlotBreakdown {
    const empty: SlotBreakdown = { rows: [], summary: '', missing: 0 };
    if (!g.option_group_id) return empty;

    // Solo activas: una opción desactivada no se puede elegir, así que no descuenta.
    const options = this.groupOptions(g.option_group_id).filter((o) => o.active);
    if (options.length === 0) return { ...empty, summary: 'este grupo no tiene opciones activas.' };

    const lookup = this.unitLookup();
    const delTamano = Number(g.quantity_per_option) || 0;
    const mandaElTamano = delTamano > 0;

    const rows: SlotBreakdownRow[] = options.map((o) => {
      const propia = Number(o.item_quantity) || 0;
      // La misma regla que el backend: manda el tamaño y, si no la define, la opción.
      const efectiva = mandaElTamano ? delTamano : propia;
      const unit = lookup.abbrOf(o.inventory_item_id);
      return {
        optionId: o.id,
        optionName: o.name,
        itemName: lookup.nameOf(o.inventory_item_id),
        amount: efectiva > 0
          ? `${formatQuantity(efectiva)}${unit ? ` ${unit}` : ''}`
          : 'no descuenta',
        // Se explica solo cuando hay un valor propio en juego: o se está ignorando
        // (para que nadie lo cuente dos veces) o es el que manda.
        extra: propia > 0
          ? mandaElTamano
            ? `reemplaza los ${formatQuantity(propia)} del sabor`
            : 'viene del sabor, no del tamaño'
          : '',
      };
    });

    // Las problemáticas primero: son las que hay que ir a arreglar.
    rows.sort((a, b) => Number(!!a.itemName) - Number(!!b.itemName));

    const named = rows.filter((r) => r.itemName).map((r) => r.itemName);
    const shown = named.slice(0, 2).join(', ');
    const rest = named.length - 2;
    const summary = named.length
      ? rest > 0
        ? `${shown} y ${rest} más`
        : shown
      : 'ningún insumo — este grupo no descuenta nada.';

    return { rows, summary, missing: rows.length - named.length };
  }

  isGroupOpen(localId: string, index: number): boolean {
    return this.openGroups().has(`${localId}:${index}`);
  }

  toggleGroupDetail(localId: string, index: number): void {
    const key = `${localId}:${index}`;
    this.openGroups.update((open) => {
      const next = new Set(open);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  private groupOptions(groupId: string | null) {
    if (!groupId) return [];
    return this.optionGroupService.groups().find((g) => g.id === groupId)?.options ?? [];
  }

  /** Igual que `group_discounts` del backend: manda la cantidad del tamaño, y si no
   *  la define, alguna opción activa con insumo propio y cantidad mayor a cero. */
  private groupHasConsumption(g: VariantOptionGroupDraft): boolean {
    if (!g.option_group_id) return false;
    if (Number(g.quantity_per_option) > 0) return true;
    return this.groupOptions(g.option_group_id).some(
      (o) => o.active && o.inventory_item_id && Number(o.item_quantity) > 0,
    );
  }

  /**
   * FR-013: con el switch activado, si ninguna presentación tiene receta fija ni
   * grupo que realmente descuente, el producto no podrá venderse (spec 003,
   * RN-CAT-34) — se avisa de inmediato en el formulario en vez de esperar a que un
   * cajero lo descubra al intentar vender.
   */
  readonly showsInventoryWarning = computed(() => {
    const d = this.draft();
    if (!d.tracks_inventory) return false;
    return d.variants.every(
      (v) => v.recipe.length === 0 && v.optionGroups.every((g) => !this.groupHasConsumption(g)),
    );
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    // Se esperan los datos de referencia ANTES de armar el draft: los `<select>`
    // con valor preseleccionado (categoría, insumo de receta) necesitan que sus
    // `<option>` ya existan cuando se aplica `[value]`, o quedan en blanco.
    await Promise.all([
      this.categoryService.allCategories().length === 0 ? this.categoryService.loadAllCategories() : null,
      this.inventoryService.allItems().length === 0 ? this.inventoryService.loadAllItems() : null,
      this.unitMeasureService.unitMeasures().length === 0
        ? this.unitMeasureService.loadUnitMeasures()
        : null,
      this.optionGroupService.groups().length === 0 ? this.optionGroupService.loadGroups() : null,
      this.presentationService.allPresentations().length === 0
        ? this.presentationService.loadAllPresentations()
        : null,
    ]);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const draft = await this.service.getProductDraft(id);
      if (!draft) {
        this.loading.set(false);
        this.router.navigate(['/dashboard/products']);
        return;
      }
      this.draft.set(draft);
      this.productActive.set(draft.active);
      this.activeLocalId.set(draft.variants[0]?.localId ?? '');
    } else {
      const d = this.emptyDraft();
      this.draft.set(d);
      this.activeLocalId.set(d.variants[0].localId);
    }
    this.loading.set(false);
  }

  private emptyDraft(): ProductDraft {
    return {
      id: null,
      name: '',
      category_id: '',
      description: '',
      preparation_type: 'prepared',
      image_url: '',
      image_url_base: null,
      active: true,
      hasSizes: false,
      tracks_inventory: false,
      variants: [this.newVariant()],
      deactivated: [],
    };
  }

  private newVariant(price = 0, presentation?: { id: string; name: string } | null): VariantDraft {
    return {
      id: null,
      localId: this.nextLid(),
      price,
      presentationId: presentation?.id ?? null,
      presentationName: presentation?.name ?? '',
      name: '',
      recipe: [],
      optionGroups: [],
    };
  }

  private nextLid(): string {
    return 'l' + ++this.lidCounter;
  }

  setField<K extends keyof ProductDraft>(field: K, value: string): void {
    this.draft.update((d) => ({ ...d, [field]: value as ProductDraft[K] }));
  }

  /**
   * Sólo prepara la imagen (preview local); NO la sube. La subida ocurre en
   * `save()`, de modo que si el usuario cancela o se sale, no queda un objeto
   * huérfano en R2.
   */
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite reelegir el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.service.otherError.set('El archivo debe ser una imagen.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.service.otherError.set('La imagen supera el máximo de 5 MB.');
      return;
    }
    this.service.otherError.set(null);
    this.revokePreview();
    this.pendingImage.set(file);
    this.previewUrl.set(URL.createObjectURL(file));
  }

  clearPendingImage(): void {
    this.revokePreview();
    this.pendingImage.set(null);
    this.previewUrl.set(null);
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  // --- Variantes ---
  toggleHasSizes(): void {
    this.draft.update((d) => {
      if (!d.hasSizes) {
        const base = d.variants[0];
        // La variante única de un producto sin tamaños se llama «Presentación única»: al
        // pasar a tener tamaños esa presentación ya no aplica y hay que elegir una real.
        const baseKeeps = !!base.presentationId && base.presentationName !== DEFAULT_PRESENTATION_NAME;
        const taken = new Set<string>(baseKeeps ? [base.presentationId as string] : []);
        // Los tamaños nuevos heredan también los grupos, no solo los insumos: si no,
        // habría que volver a elegirlos uno por uno en cada tamaño. Se preseleccionan las
        // presentaciones típicas si el catálogo las tiene (antes se sembraban por nombre).
        const pick = (...names: string[]) => {
          const found = this.presentationService
            .allPresentations()
            .find((p) => p.active && !taken.has(p.id) && names.includes(p.name.trim().toLowerCase()));
          if (found) taken.add(found.id);
          return found ? { id: found.id, name: found.name } : null;
        };
        const copy = (presentation: { id: string; name: string } | null): VariantDraft => ({
          ...this.newVariant(base.price, presentation),
          recipe: base.recipe.map((r) => ({ ...r })),
          optionGroups: base.optionGroups.map((g) => ({ ...g })),
        });
        const first = baseKeeps
          ? base
          : { ...base, ...this.presentationFields(pick('grande')) };
        const variants = [
          first,
          copy(pick('mediana', 'mediano')),
          copy(pick('pequeña', 'pequeño', 'pequena', 'pequeno')),
        ];
        this.activeLocalId.set(variants[0].localId);
        return { ...d, hasSizes: true, variants };
      }
      // Sin tamaños: se conserva la primera fila y pasa a «Presentación única» (el backend
      // la resuelve cuando `presentation_id` va nulo).
      const only = { ...d.variants[0], presentationId: null, presentationName: DEFAULT_PRESENTATION_NAME };
      this.activeLocalId.set(only.localId);
      return { ...d, hasSizes: false, variants: [only] };
    });
  }

  /** Nombre a mostrar de una fila: el de su presentación, o «este tamaño» si aún no eligió. */
  variantLabel(v: VariantDraft): string {
    return v.presentationName || 'este tamaño';
  }

  private presentationFields(p: { id: string; name: string } | null) {
    return { presentationId: p?.id ?? null, presentationName: p?.name ?? '' };
  }

  /**
   * Prende/apaga si el producto maneja inventario (spec 027). Apagar NO borra los
   * insumos ya guardados en el draft — solo deja de mostrarlos como editables mientras
   * el switch esté apagado (FR-008); se conservan intactos si se reactiva después.
   *
   * Apagarlo cuando el producto ya tiene insumos configurados en alguna presentación
   * pide confirmación explícita primero (FR-014): es la única dirección arriesgada,
   * porque detiene el descuento de inventario de un producto que hoy sí lo hace.
   * Encenderlo, o apagarlo sobre un producto sin insumos, se aplica directo.
   */
  async toggleTracksInventory(): Promise<void> {
    const d = this.draft();
    if (d.tracks_inventory && this.hasAnyInventoryConfig(d)) {
      const ok = await this.confirm.ask({
        title: 'Desactivar "Maneja inventario"',
        message:
          'Este producto dejará de descontar inventario en cada venta. Los insumos ya ' +
          'configurados no se borran — si vuelves a activarlo, seguirán ahí.',
        confirmText: 'Desactivar',
        tone: 'danger',
      });
      if (!ok) return;
    }
    this.draft.update((cur) => ({ ...cur, tracks_inventory: !cur.tracks_inventory }));
  }

  private hasAnyInventoryConfig(d: ProductDraft): boolean {
    return d.variants.some(
      (v) => v.recipe.length > 0 || v.optionGroups.some((g) => this.groupHasConsumption(g)),
    );
  }

  addVariant(): void {
    // Parte de una copia del tamaño activo: casi siempre se ajusta el precio y las
    // cantidades, no se empieza de cero.
    const base = this.activeVariant();
    const nv: VariantDraft = {
      ...this.newVariant(base?.price ?? 0),
      recipe: (base?.recipe ?? []).map((r) => ({ ...r })),
      optionGroups: (base?.optionGroups ?? []).map((g) => ({ ...g })),
    };
    this.draft.update((d) => ({ ...d, variants: [...d.variants, nv] }));
    this.activeLocalId.set(nv.localId);
  }

  /** Propaga insumos y grupos del tamaño activo al resto (los precios no se tocan). */
  copyConfigToOthers(localId: string): void {
    const source = this.draft().variants.find((v) => v.localId === localId);
    if (!source) return;
    const otros = this.draft().variants.filter((v) => v.localId !== localId);
    if (otros.length === 0) return;
    const ok = confirm(
      `Se reemplazarán los insumos y los sabores de ${otros.map((v) => this.variantLabel(v)).join(', ')} ` +
        `por los de «${this.variantLabel(source)}». Los precios no cambian. ¿Continuar?`,
    );
    if (!ok) return;
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? v
          : {
              ...v,
              recipe: source.recipe.map((r) => ({ ...r })),
              optionGroups: source.optionGroups.map((g) => ({ ...g })),
            },
      ),
    }));
  }

  /**
   * Devuelve una presentación desactivada a la carta y la trae al draft con su id real, su
   * receta y sus grupos — así el guardado la actualiza (reactivándola) en vez de intentar
   * crearla otra vez, que es justo el choque que la constraint de nombre rechaza.
   *
   * Spec 043 (research.md Decisión 4): a diferencia de antes, esto ya NO dispara ninguna
   * petición de red por sí solo — solo mueve la presentación dentro del draft en memoria. La
   * reactivación se persiste recién en el siguiente guardado consolidado, junto con el resto de
   * los cambios (igual que agregar cualquier otra presentación nueva).
   */
  async restoreVariant(dv: DeactivatedVariant): Promise<void> {
    const enUso = this.draft().variants.some((v) => v.presentationId === dv.presentationId);
    if (enUso) {
      this.service.otherError.set(
        `Ya tienes un tamaño «${dv.presentationName}». Cámbiale la presentación o quítalo antes de restaurar este.`,
      );
      return;
    }

    const [recipe, optionGroups] = await Promise.all([
      this.service.getVariantRecipe(dv.id),
      this.service.getVariantOptionGroups(dv.id),
    ]);
    const restored: VariantDraft = {
      id: dv.id,
      localId: dv.id,
      price: dv.price,
      presentationId: dv.presentationId,
      presentationName: dv.presentationName,
      recipe,
      optionGroups,
    };
    this.draft.update((d) => {
      const variants = [...d.variants, restored];
      return {
        ...d,
        variants,
        hasSizes: d.hasSizes || variants.length > 1,
        deactivated: d.deactivated.filter((x) => x.id !== dv.id),
      };
    });
    this.activeLocalId.set(restored.localId);
  }

  /**
   * Reordena `draft().variants` al soltar (spec 042, FR-001/FR-003). Puramente local:
   * no dispara ninguna llamada al backend — el nuevo orden se persiste recién al
   * guardar el producto (`ProductService.saveExistingProduct`), igual que el resto de
   * los cambios en memoria de este formulario.
   */
  onVariantDrop(event: CdkDragDrop<VariantDraft[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.draft.update((d) => {
      const variants = [...d.variants];
      moveItemInArray(variants, event.previousIndex, event.currentIndex);
      return { ...d, variants };
    });
  }

  removeVariant(localId: string): void {
    this.draft.update((d) => {
      if (d.variants.length <= 1) return d;
      const variants = d.variants.filter((v) => v.localId !== localId);
      if (this.activeLocalId() === localId) this.activeLocalId.set(variants[0].localId);
      return { ...d, variants };
    });
  }

  setVariantField(
    localId: string,
    field: 'name' | 'price',
    value: string | number | null,
  ): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) => (v.localId === localId ? { ...v, [field]: value } : v)),
    }));
  }

  // --- Insumos fijos ---
  addRecipeLine(localId: string): void {
    const line: RecipeLineDraft = {
      inventory_item_id: this.inventoryService.allItems()[0]?.id ?? null,
      quantity: 1,
    };
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId ? { ...v, recipe: [...v.recipe, line] } : v,
      ),
    }));
  }

  removeRecipeLine(localId: string, index: number): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId ? { ...v, recipe: v.recipe.filter((_, i) => i !== index) } : v,
      ),
    }));
  }

  setRecipeField(
    localId: string,
    index: number,
    field: 'inventory_item_id' | 'quantity',
    value: string | number,
  ): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? {
              ...v,
              recipe: v.recipe.map((l, i) =>
                i === index
                  ? { ...l, [field]: field === 'quantity' ? value : (value as string) || null }
                  : l,
              ),
            }
          : v,
      ),
    }));
  }

  unitAbbr(itemId: string | null): string {
    return this.unitLookup().abbrOf(itemId);
  }

  // --- Sabores a elegir (grupos de la presentación) ---
  addGroup(localId: string): void {
    // Preselecciona el primer grupo activo que esta presentación no use ya.
    const variant = this.draft().variants.find((v) => v.localId === localId);
    const usados = new Set((variant?.optionGroups ?? []).map((g) => g.option_group_id));
    const candidato = this.optionGroupService
      .groups()
      .find((g) => g.active && !usados.has(g.id));
    const nuevo: VariantOptionGroupDraft = {
      option_group_id: candidato?.id ?? null,
      name: candidato?.name ?? '',
      // Arranca en "elige exactamente 1": es el caso normal y evita que un grupo
      // opcional pase inadvertido y no descuente nada.
      min_select: 1,
      max_select: 1,
      quantity_per_option: 0,
    };
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId ? { ...v, optionGroups: [...v.optionGroups, nuevo] } : v,
      ),
    }));
  }

  removeGroup(localId: string, index: number): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? { ...v, optionGroups: v.optionGroups.filter((_, i) => i !== index) }
          : v,
      ),
    }));
  }

  setGroupField(
    localId: string,
    index: number,
    field: 'option_group_id' | 'min_select' | 'max_select' | 'quantity_per_option',
    value: string | number,
  ): void {
    this.draft.update((d) => ({
      ...d,
      variants: d.variants.map((v) =>
        v.localId === localId
          ? {
              ...v,
              optionGroups: v.optionGroups.map((g, i) => {
                if (i !== index) return g;
                if (field !== 'option_group_id') return { ...g, [field]: value };
                const id = (value as string) || null;
                // El nombre se guarda resuelto para poder mostrarlo sin volver a buscar.
                const found = this.optionGroupService.groups().find((x) => x.id === id);
                return { ...g, option_group_id: id, name: found?.name ?? '' };
              }),
            }
          : v,
      ),
    }));
  }


  // --- Acciones ---
  async toggleActive(): Promise<void> {
    const id = this.draft().id;
    if (!id) return;
    const ok = await this.service.toggleActive(id, this.productActive());
    if (ok) this.productActive.update((a) => !a);
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.service.isSubmitting() || this.uploading()) return;

    // Sube la imagen pendiente ahora (una sola vez); si falla, aborta sin guardar.
    const file = this.pendingImage();
    if (file) {
      this.uploading.set(true);
      this.service.otherError.set(null);
      try {
        const url = await this.service.uploadProductImage(file);
        // spec 088: solo cambia `image_url`; `image_url_base` sigue siendo la imagen vigente al
        // abrir el formulario, para que el servicio sepa que la imagen cambió y el backend
        // detecte un formulario desactualizado.
        this.draft.update((d) => ({ ...d, image_url: url }));
        this.clearPendingImage();
      } catch {
        this.service.otherError.set('No se pudo subir la imagen.');
        return;
      } finally {
        this.uploading.set(false);
      }
    }

    const id = await this.service.saveProduct(this.draft());
    if (id) {
      this.router.navigate(['/dashboard/products']);
      return;
    }
    // Si el guardado chocó con una presentación desactivada, hay que ponerle el botón
    // «Restaurar» delante: puede no estar en pantalla si la desactivó otro usuario, o
    // en otra pestaña, después de que se cargara este formulario. Se refresca solo esa
    // lista, no el draft entero, para no perder lo que lleva escrito.
    const conflict = this.service.lastVariantConflict();
    const productId = this.draft().id;
    if (conflict && !conflict.active && productId) {
      const deactivated = await this.service.loadDeactivated(productId);
      this.draft.update((d) => ({ ...d, deactivated }));
    }
  }

  cancel(): void {
    this.router.navigate(['/dashboard/products']);
  }
}
