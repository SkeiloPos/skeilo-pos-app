import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  effect,
  signal,
} from '@angular/core';
import { MoneyPipe } from '../../../shared/money.pipe';
import { formatQuantifiedLabel } from '../services/menu-lookup';
import {
  MenuOption,
  MenuOptionGroup,
  MenuProduct,
  MenuVariant,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';
import { normalizeText } from '../../../shared/normalize-text';
import { DiscountInfo, discountInfo, effectivePrice } from '../../promotions/services/promotion-pricing.util';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/** Una opción elegida junto con cuántas unidades de ella (spec 065). Siempre
 *  `quantity: 1` para una opción de un grupo "conteo". */
export interface ChosenMenuOption {
  option: MenuOption;
  quantity: number;
  /** Nombre del grupo dueño de la opción (p. ej. "Toppings", "Sabores") --
   *  para que el detalle del pedido pueda mostrar la selección agrupada por
   *  su nombre real en vez de una lista plana sin distinguir el grupo. */
  groupName: string;
}

/** Emitted when the diner confirms their selection for a product. */
export interface ProductSelection {
  product: MenuProduct;
  variant: MenuVariant;
  options: ChosenMenuOption[];
  quantity: number;
  notes: string | null;
  /**
   * spec 081: paso de cantidad a registrar en el carrito (`min_qty` de la regla
   * vigente), solo cuando el modal se abrió desde "Promociones" y esa regla exige
   * más de una unidad. `undefined` en cualquier otro caso (comportamiento actual).
   */
  stepQuantity?: number;
}

@Component({
  selector: 'app-product-select',
  standalone: true,
  imports: [MoneyPipe, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div class="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[94vh] flex flex-col overflow-hidden">
        <!-- Header -->
        <header class="relative shrink-0 bg-white">
          <!-- Sin foto no se reserva alto: un emoji gigante solo restaría sitio a los sabores. -->
          @if (product.image_url) {
            <div class="relative h-52 w-full overflow-hidden bg-indigo-50">
              <img [src]="product.image_url" [alt]="product.name" class="w-full h-full object-cover object-center" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
              <button type="button" (click)="cancelled.emit()" aria-label="Cerrar ventana"
                class="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 transition-colors">
                <app-mi-icon name="close" [size]="18" />
              </button>
            </div>
          } @else {
            <div class="flex items-center justify-end px-4 pt-4">
              <button type="button" (click)="cancelled.emit()" aria-label="Cerrar ventana"
                class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <app-mi-icon name="close" [size]="16" />
              </button>
            </div>
          }

          <div class="px-5 pt-3 pb-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h1 class="text-xl font-bold text-gray-900 tracking-tight truncate">{{ product.name }}</h1>
                @if (product.description) {
                  <p class="text-sm text-gray-500 mt-0.5">{{ product.description }}</p>
                }
              </div>
              <div class="text-right shrink-0">
                <!-- spec 081 (FR-015, corregido tras probar en un entorno real): en cuanto la
                     cantidad configurada satisface el mínimo de la regla vigente, deja de ser un
                     precio "desde" por unidad -- es el total exacto que se va a cobrar, el mismo
                     que muestra el botón "Agregar" más abajo. No depende de si el modal se abrió
                     desde "Promociones" -- solo de si la cantidad ya califica. -->
                @if (product.variants.length > 1 && !packageDealActive()) {
                  <span class="block text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Desde</span>
                }
                <p data-testid="header-price" class="text-lg font-extrabold text-indigo-600 mt-0.5">
                  {{ (packageDealActive() ? lineTotal() : startingPrice()) | money }}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main class="flex-1 overflow-y-auto px-5 py-2 space-y-6">
          <!-- Presentación -->
          @if (product.variants.length > 0) {
            <section class="pt-2">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold">1</span>
                  <h2 class="text-base font-bold text-gray-900">Elige tu presentación</h2>
                </div>
                <span class="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-gray-200 text-gray-700">Obligatorio</span>
              </div>

              <div class="space-y-2.5" role="radiogroup" aria-label="Presentación">
                @for (v of product.variants; track v.id) {
                  <label
                    class="relative flex items-start justify-between gap-3 p-3.5 rounded-2xl border-2 transition-colors"
                    [class]="v.available === false
                      ? 'border-gray-100 bg-gray-50 cursor-not-allowed'
                      : variantId() === v.id
                        ? 'border-indigo-600 bg-indigo-50/50 cursor-pointer'
                        : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'"
                  >
                    <span class="flex items-start gap-3 min-w-0">
                      <input type="radio" name="variant" class="w-4 h-4 mt-0.5 text-indigo-600 border-gray-300 focus:ring-indigo-500 shrink-0"
                        [checked]="variantId() === v.id" [disabled]="v.available === false"
                        (change)="selectVariant(v)" />
                      <span class="min-w-0">
                        <!-- spec 087 (FR-014): el nombre de la presentación se ajusta en varias
                             líneas, nunca se trunca con "…" — la promoción es una etiqueta
                             secundaria en su propia línea. -->
                        <span data-testid="variant-name" class="block text-sm font-semibold text-gray-900 break-words">{{ v.name }}</span>
                        <!-- spec 066 (FR-008): condición corta + equivalente por unidad, en
                             tono discreto para no competir con el precio. Texto ya compuesto
                             por el backend. spec 081 (FR-016, corregido): en cuanto la cantidad
                             configurada ya satisface el mínimo, se omite el equivalente por
                             unidad -- el precio de la fila lo reemplaza con el tachado + total
                             del paquete, justo al lado. No depende de si se llegó desde
                             "Promociones". -->
                        @if (v.promotion) {
                          <span data-testid="variant-promo" class="block w-fit max-w-full whitespace-normal break-words text-[11px] font-medium text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded mt-0.5">
                            {{ rowPackagePromo(v) ? v.promotion.short_condition : v.promotion.display_text }}
                          </span>
                        }
                      </span>
                    </span>
                    <span class="shrink-0">
                      @if (v.available === false) {
                        <span class="text-xs font-semibold text-gray-400">Agotado</span>
                      } @else if (discountFor(v); as disc) {
                        <span class="flex items-center gap-1.5">
                          <!-- spec 066 (research.md D-13): la insignia de porcentaje se
                               acota al tipo 'percent'. Con un precio de paquete de
                               cantidad mínima 1 ($8.000 -> $6.000) el frontend fabricaría
                               un -25% que la regla nunca enuncia, y FR-007 lo prohíbe.
                               La guarda mira el campo crudo de la presentación, no
                               disc.kind: discountInfo colapsa a 'percent' todo lo que no
                               sea 'fixed', así que ahí el tipo real ya se perdió. -->
                          @if (disc.kind === 'fixed' || v.discount_kind === 'percent') {
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                              @if (disc.kind === 'fixed') {
                                -{{ disc.amountOff | money }}
                              } @else {
                                -{{ disc.percent }}%
                              }
                            </span>
                          }
                          <span class="text-gray-400 text-xs line-through">{{ disc.original | money }}</span>
                          <span class="text-sm font-bold text-indigo-600">{{ disc.discounted | money }}</span>
                        </span>
                      } @else if (rowPackagePromo(v); as promo) {
                        <!-- spec 081 (FR-016, corregido): min_qty > 1 nunca puebla
                             discounted_price (discountFor arriba da null); en cuanto la cantidad
                             configurada para ESTA variante ya satisface min_qty, se tacha el
                             precio de lista y se muestra el total de un paquete completo. -->
                        <span class="flex items-center gap-1.5">
                          <span class="text-gray-400 text-xs line-through">{{ v.price | money }}</span>
                          <span class="text-sm font-bold text-indigo-600">{{ packageTotal(v, promo) | money }}</span>
                        </span>
                      } @else {
                        <span class="text-sm font-bold text-gray-700">{{ variantPrice(v) | money }}</span>
                      }
                    </span>
                  </label>
                }
              </div>
              <!-- spec 066 (FR-016): la condición completa de la presentación elegida.
                   Este componente lo comparten el menú QR y las dos superficies del
                   cajero, así que el comensal y el cajero leen la misma cadena sin
                   ninguna rama por superficie (SC-005 por construcción). -->
              @if (selectedVariant()?.promotion; as promo) {
                <p class="mt-2 text-xs text-gray-500">{{ promo.condition_text }}</p>
              }
            </section>
          }

          <!-- Grupos de opciones: los de la PRESENTACIÓN elegida, no los del producto.
               Cuántos sabores se eligen cambia con el tamaño. Rediseñados con una
               franja degradada para diferenciarlos a simple vista de las presentaciones. -->
          @for (group of activeGroups(); track group.id; let i = $index) {
            <section class="pt-2">
              <div class="rounded-2xl border border-gray-100 overflow-hidden">
                <button type="button" (click)="toggleGroup(group.id)"
                  class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <span class="flex items-center gap-2 min-w-0">
                    <span class="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold shrink-0">{{ i + 2 }}</span>
                    <span class="min-w-0">
                      <span class="block text-sm font-bold text-gray-900 truncate">{{ group.name }}</span>
                      @if (!isExpanded(group.id) && chosenCount(group) > 0) {
                        <span class="block text-xs text-indigo-600 truncate">{{ chosenNames(group) }}</span>
                      }
                    </span>
                  </span>
                  <span class="flex items-center gap-2 shrink-0">
                    <span class="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded"
                      [class]="requiredCount(group) > 0 ? 'bg-gray-200 text-gray-700' : 'bg-indigo-100 text-indigo-700'">
                      {{ requiredCount(group) > 0 ? 'Obligatorio' : 'Opcional' }}
                    </span>
                    <span class="text-xs font-medium"
                      [class]="isComplete(group) ? 'text-emerald-600' : 'text-gray-400'">
                      {{ groupHint(group) }}
                    </span>
                    <span class="text-gray-400 text-xs">{{ isExpanded(group.id) ? '▲' : '▼' }}</span>
                  </span>
                </button>

                @if (isExpanded(group.id)) {
                  <div class="px-4 pb-4 space-y-3 bg-gradient-to-br from-indigo-50/40 via-white to-white">
                    @if (showSearch(group)) {
                      <input type="search" [value]="filterValue(group.id)"
                        (input)="setFilter(group.id, $any($event.target).value)"
                        [placeholder]="'Buscar en ' + group.name + '…'"
                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    }

                    @if (group.selection_mode === 'cantidad') {
                      <!-- Modo "cantidad": stepper +/- por opción, nunca obligatorio. -->
                      <div class="space-y-2">
                        @for (opt of visibleOptions(group); track opt.id) {
                          <div data-testid="cantidad-row" class="flex items-center justify-between gap-2 px-3 py-2.5 bg-white rounded-xl border border-gray-200">
                            <span class="min-w-0">
                              <span class="block text-sm font-medium text-gray-800 truncate">{{ opt.name }}</span>
                              @if (opt.extra_price > 0) {
                                <span class="block text-xs text-gray-500">+ {{ opt.extra_price | money }}</span>
                              }
                            </span>
                            <div class="flex items-center gap-2 shrink-0 bg-gray-100 rounded-full p-1 border border-gray-200">
                              <button type="button" data-testid="qty-minus" (click)="decrementOption(group, opt)"
                                [disabled]="optionQuantity(group.id, opt.id) === 0"
                                aria-label="Quitar una unidad"
                                class="w-7 h-7 rounded-full bg-white text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 text-base font-bold leading-none flex items-center justify-center transition disabled:opacity-40"
                              >−</button>
                              <span data-testid="qty-value" class="w-5 text-center text-sm font-semibold text-gray-800">{{ optionQuantity(group.id, opt.id) }}</span>
                              <button type="button" data-testid="qty-plus" (click)="incrementOption(group, opt)"
                                [disabled]="!canIncrement(group, opt)"
                                aria-label="Añadir una unidad"
                                class="w-7 h-7 rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:scale-95 text-base font-bold leading-none flex items-center justify-center transition disabled:opacity-40"
                              >+</button>
                            </div>
                          </div>
                        }
                      </div>
                    } @else {
                      <!-- Cuadrícula tipo checklist: distingue a simple vista un topping
                           de una presentación (que usa radio-cards, arriba). -->
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        @for (opt of visibleOptions(group); track opt.id) {
                          <label data-testid="conteo-option"
                            class="flex items-center justify-between gap-2 p-3 bg-white rounded-xl border-2 shadow-sm cursor-pointer transition-colors"
                            [class]="isSelected(opt.id) ? 'border-indigo-500' : 'border-gray-100 hover:border-gray-300'"
                          >
                            <span class="flex items-center gap-2.5 min-w-0">
                              <input type="checkbox" class="w-4 h-4 rounded text-indigo-600 border-gray-300 focus:ring-indigo-500 shrink-0"
                                [checked]="isSelected(opt.id)"
                                [disabled]="!isSelected(opt.id) && group.max_select > 0 && chosenCount(group) >= group.max_select"
                                (change)="toggleOption(group, opt)" />
                              <span class="text-xs font-semibold text-gray-800 truncate">{{ opt.name }}</span>
                              @if (isSelected(opt.id) && group.max_select > 1) {
                                <span class="shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center">
                                  {{ selectionOrder(group, opt.id) }}
                                </span>
                              }
                            </span>
                            @if (opt.extra_price > 0) {
                              <span class="text-xs font-semibold text-gray-500 shrink-0">+ {{ opt.extra_price | money }}</span>
                            }
                          </label>
                        }
                      </div>
                    }

                    @if (visibleOptions(group).length === 0) {
                      <p class="text-sm text-gray-400 text-center py-2">Ningún sabor coincide.</p>
                    }

                    <!-- Agotados aparte y al final: que existan se informa, pero no estorban. -->
                    @if (soldOutOptions(group).length > 0) {
                      <div>
                        <p class="text-xs font-medium text-gray-400 mb-1.5">Agotados</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          @for (opt of soldOutOptions(group); track opt.id) {
                            <span class="px-3 py-2 rounded-xl bg-gray-50 text-sm text-gray-400 line-through">
                              {{ opt.name }}
                            </span>
                          }
                        </div>
                      </div>
                    }

                    @if (groupError(group)) {
                      <p class="text-red-500 text-xs">{{ groupError(group) }}</p>
                    }
                  </div>
                }
              </div>
            </section>
          }

          <!-- Notas -->
          <section class="pt-2 pb-2">
            <div class="flex items-center gap-2 mb-2">
              <span class="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold">{{ activeGroups().length + 2 }}</span>
              <h2 class="text-base font-bold text-gray-900">Instrucciones especiales</h2>
            </div>
            <div class="ml-8">
              <textarea
                [value]="notes()"
                (input)="notes.set($any($event.target).value)"
                placeholder="Ej: sin azúcar, poco hielo…"
                maxlength="500"
                rows="2"
                class="w-full text-sm rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 placeholder:text-gray-400 p-3 transition"
              ></textarea>
            </div>
          </section>
        </main>

        <!-- Footer -->
        <footer class="p-4 bg-white border-t border-gray-100 shrink-0 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-gray-900">Cantidad</span>
            <!-- 44 px: el objetivo táctil mínimo cómodo con el pulgar. -->
            <div class="flex items-center gap-3 bg-gray-100 p-1 rounded-full border border-gray-200">
              <button
                type="button"
                (click)="dec()"
                [disabled]="quantity() === minQty()"
                aria-label="Quitar uno"
                class="w-11 h-11 rounded-full bg-white text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 text-xl font-bold leading-none flex items-center justify-center transition disabled:opacity-40"
              >−</button>
              <span class="w-8 text-center text-lg font-semibold text-gray-800">{{ quantity() }}</span>
              <button
                type="button"
                (click)="inc()"
                aria-label="Añadir uno"
                class="w-11 h-11 rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:scale-95 text-xl font-bold leading-none flex items-center justify-center transition"
              >+</button>
            </div>
          </div>
          <!-- Con el grupo plegado, un botón atenuado sin más no dice qué falta. -->
          <button
            type="button"
            (click)="confirm()"
            [disabled]="!canConfirm()"
            class="w-full h-12 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
          >
            @if (blockingLabel(); as falta) {
              {{ falta }}
            } @else {
              <span>{{ initialSelection ? 'Guardar cambios' : 'Agregar' }}</span>
              <span class="w-1.5 h-1.5 rounded-full bg-white/40"></span>
              <span>{{ lineTotal() | money }}</span>
            }
          </button>
        </footer>
      </div>
    </div>
  `,
})
export class ProductSelectComponent implements OnInit {
  @Input() product!: MenuProduct;
  /** Cuando viene con valor, precarga variante/opciones/cantidad/notas de una
   *  línea de carrito ya agregada en vez de arrancar desde cero -- modo
   *  edición del rediseño de `create-order/code.html` (`store.editingSelection()`
   *  en `pos-terminal.store.ts`). `null`/ausente = modo "agregar" de siempre. */
  @Input() initialSelection: ProductSelection | null = null;
  /** spec 081: `true` cuando el modal se abrió desde la pestaña "Promociones". */
  @Input() fromPromotions = false;
  /**
   * spec 081 (research.md D5): closure hacia `cart.lines()` provisto por
   * `public-menu.component.ts`, para poder recalcular la cantidad existente de
   * CUALQUIER variante que el comensal seleccione dentro del modal, no solo la
   * inicial (hallazgo C1 de `/speckit-analyze`).
   */
  @Input() existingQtyFor: (variantId: string, optionKey: string) => number = () => 0;
  @Output() added = new EventEmitter<ProductSelection>();
  @Output() cancelled = new EventEmitter<void>();

  readonly variantId = signal<string | null>(null);
  /**
   * group.id → option.id → cantidad elegida (spec 065). Para un grupo "conteo"
   * el valor sigue siendo efectivamente `0` o `1` por opción -- ninguna lógica de
   * "conteo" cambia de forma, solo de representación interna (research.md
   * Decisión 8). El orden de inserción de las claves es lo que alimenta el
   * badge numerado (1, 2, 3…) de un grupo "conteo" con `max_select > 1`.
   */
  readonly selected = signal<Record<string, Record<string, number>>>({});
  readonly quantity = signal(1);
  readonly notes = signal('');
  /** Grupos desplegados. Ver `syncExpanded`: se abre lo que falta, se cierra lo completo. */
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** group.id → texto del buscador. */
  private readonly filters = signal<Record<string, string>>({});
  /** A partir de cuántas opciones el buscador compensa su propio espacio. */
  private readonly SEARCH_THRESHOLD = 10;

  ngOnInit(): void {
    const initial = this.initialSelection;
    if (initial) {
      // Modo edición: precarga la variante/opciones/cantidad/notas de la
      // línea que se está editando en vez del arranque "primera variante
      // disponible + todo vacío". `MenuOption` no lleva su `group.id` propio
      // (interfaz `product.interface.ts`), así que el grupo de cada opción
      // elegida se resuelve buscándola dentro de `initial.variant.option_groups`.
      this.variantId.set(initial.variant.id);
      const selected: Record<string, Record<string, number>> = {};
      for (const chosen of initial.options) {
        const group = initial.variant.option_groups.find((g) =>
          g.options.some((o) => o.id === chosen.option.id),
        );
        if (!group) continue;
        selected[group.id] = { ...(selected[group.id] ?? {}), [chosen.option.id]: chosen.quantity };
      }
      this.selected.set(selected);
      this.quantity.set(initial.quantity);
      this.notes.set(initial.notes ?? '');
    } else {
      // Preselecciona la primera presentación pedible (a menudo la única).
      const first =
        this.product.variants.find((v) => v.available !== false) ?? this.product.variants[0];
      if (first) this.variantId.set(first.id);
    }
    this.syncExpanded();
  }

  readonly selectedVariant = computed<MenuVariant | null>(
    () => this.product.variants.find((v) => v.id === this.variantId()) ?? null,
  );

  /** Grupos que ofrece la presentación elegida; son los que gobiernan la selección. */
  readonly activeGroups = computed<MenuOptionGroup[]>(
    () => this.selectedVariant()?.option_groups ?? [],
  );

  /**
   * Cambiar de tamaño reconcilia lo ya elegido en vez de dejarlo obsoleto: se conserva
   * lo que el tamaño nuevo sigue ofreciendo y se recorta a su `max_select` (grupos
   * "conteo" -- un grupo "cantidad" no tiene ese tope de opciones distintas). Sin
   * esto, pasar de "Mediana" (2 sabores) a "Pequeña" (1) dejaría dos elegidos y el
   * backend respondería 422 al añadir al carrito.
   */
  selectVariant(v: MenuVariant): void {
    if (v.available === false || v.id === this.variantId()) return;
    this.variantId.set(v.id);
    this.selected.update((map) => {
      const next: Record<string, Record<string, number>> = {};
      for (const group of v.option_groups) {
        const previo = map[group.id] ?? {};
        const validIds = Object.keys(previo).filter((id) =>
          group.options.some((o) => o.id === id && o.available) && previo[id] > 0,
        );
        if (validIds.length === 0) continue;
        if (group.selection_mode === 'cantidad') {
          const entry: Record<string, number> = {};
          for (const id of validIds) entry[id] = previo[id];
          next[group.id] = entry;
        } else {
          const entry: Record<string, number> = {};
          for (const id of validIds.slice(0, group.max_select)) entry[id] = 1;
          next[group.id] = entry;
        }
      }
      return next;
    });
    // Los grupos del tamaño nuevo son otros: hay que recalcular qué queda abierto.
    this.syncExpanded();
  }

  private readonly selectedOptions = computed<ChosenMenuOption[]>(() => {
    const map = this.selected();
    const chosen: ChosenMenuOption[] = [];
    for (const group of this.activeGroups()) {
      const entry = map[group.id] ?? {};
      for (const opt of group.options) {
        const quantity = entry[opt.id] ?? 0;
        if (quantity > 0) chosen.push({ option: opt, quantity, groupName: group.name });
      }
    }
    return chosen;
  });

  /** Ids de opción elegidas, ordenados y unidos — misma forma de clave que `CartLine.optionKey`. */
  private readonly currentOptionKey = computed(() =>
    this.selectedOptions().map((c) => c.option.id).sort().join(','),
  );

  /**
   * spec 081 (contrato §2): `1` fuera de "Promociones", o cuando la variante
   * elegida no tiene ninguna regla vigente con cantidad mínima mayor a 1.
   * No es `private`: la plantilla lo usa para deshabilitar "−" en el mínimo.
   */
  readonly minQty = computed(() =>
    this.fromPromotions ? (this.selectedVariant()?.promotion?.min_qty ?? 1) : 1,
  );

  /** Unidades ya en el carrito para la variante+opciones actualmente elegidas. */
  private readonly existingQty = computed(() =>
    this.existingQtyFor(this.selectedVariant()?.id ?? '', this.currentOptionKey()),
  );

  /**
   * spec 081 (research.md D4/D5, hallazgo C1 de `/speckit-analyze`): resincroniza
   * `quantity` cada vez que `minQty()`/`existingQty()` cambian — lo que incluye un
   * cambio de variante u opciones dentro del modal, no solo el instante en que se
   * abrió. Fuera de "Promociones" (`fromPromotions == false`) no toca `quantity`
   * en absoluto, para no pisar el modo edición (`initialSelection`) ni el arranque
   * libre en 1 de siempre.
   */
  private readonly resyncQuantityForPromotions = effect(() => {
    if (!this.fromPromotions) return;
    const minQty = this.minQty();
    const existingQty = this.existingQty();
    this.quantity.set(
      minQty === 1 ? 1 : existingQty % minQty === 0 ? minQty : minQty - (existingQty % minQty),
    );
  });

  /**
   * Precio de línea a cobrar por la cantidad realmente configurada.
   *
   * `variant.discounted_price` solo llega poblado cuando la regla tiene
   * `min_qty == 1` (`menu_unit_discount` en el backend): al navegar el menú
   * sin carrito, una regla "2 x $12.000" no puede prometer un precio que
   * depende de una cantidad que el comensal todavía no eligió, así que ese
   * campo se queda en `null` aunque `promotion` sí venga poblado. Por eso al
   * calificar se usa `promotion.unit_equivalent`/`value` -- lo que el backend
   * ya calculó y ya muestra en el texto de la insignia -- y no
   * `discounted_price`.
   *
   * Con `min_qty > 1` la promoción no cubre TODA la cantidad sin más:
   * `evaluate_variant_sets` (motor real del cobro, `_greedy_units` en
   * `promotions/service.py`) agrupa las unidades en bloques completos de
   * `min_qty` y cobra el paquete solo por esos bloques -- el remanente que no
   * completa otro bloque va a precio normal. "2 x $7.000" con Cantidad en 3
   * cobra un paquete (2 unidades) más 1 unidad normal, no 3 unidades al
   * precio de paquete.
   */
  readonly lineTotal = computed(() => {
    const variant = this.selectedVariant();
    if (!variant) return 0;
    const promo = variant.promotion;
    const quantity = this.quantity();
    const base = promo
      ? this.packagePrice(variant.price, promo, quantity)
      : effectivePrice(variant.price, variant.discounted_price) * quantity;
    const extra = this.selectedOptions().reduce(
      (s, c) => s + c.option.extra_price * c.quantity, 0,
    ) * quantity;
    return base + extra;
  });

  /** Precio total de `quantity` unidades de una presentación con promoción vigente. */
  private packagePrice(normalPrice: number, promo: MenuVariantPromotion, quantity: number): number {
    const fullSets = Math.floor(quantity / promo.min_qty);
    const remainder = quantity - fullSets * promo.min_qty;
    // El precio de paquete es el importe exacto de la regla (`value`), no
    // `min_qty * unit_equivalent`: ese es un redondeo por unidad para
    // mostrar (research.md D-4/FR-009) y podría no sumar el mismo total.
    const setsTotal = promo.type === 'package_price'
      ? fullSets * promo.value
      : fullSets * promo.min_qty * promo.unit_equivalent;
    return setsTotal + remainder * normalPrice;
  }

  /**
   * Precio "desde" del encabezado: el más bajo entre las presentaciones
   * pedibles (o entre todas si ninguna tiene stock), con su descuento vigente.
   */
  readonly startingPrice = computed<number>(() => {
    const variants = this.product.variants;
    const disponibles = variants.filter((v) => v.available !== false);
    const pool = disponibles.length > 0 ? disponibles : variants;
    const prices = pool.map((v) => effectivePrice(v.price, v.discounted_price));
    return prices.length > 0 ? Math.min(...prices) : 0;
  });

  /** Precio efectivo de una presentación (con descuento si el backend lo trajo). */
  variantPrice(v: MenuVariant): number {
    return effectivePrice(v.price, v.discounted_price);
  }

  /**
   * spec 081 (FR-016): total exacto de UN paquete completo (`promo.min_qty` unidades) para esta
   * presentación, sin importar la cantidad que esté configurada en el modal — reusa
   * `packagePrice()` (el mismo cálculo de `lineTotal()`) para no duplicar la regla de redondeo
   * de `package_price` vs. `percent` (research.md D-4, `packagePrice()` más abajo).
   */
  packageTotal(v: MenuVariant, promo: MenuVariantPromotion): number {
    return this.packagePrice(v.price, promo, promo.min_qty);
  }

  /**
   * spec 081 (FR-015/FR-016, corregido tras probar en un entorno real): ¿la variante
   * ACTUALMENTE elegida tiene una regla vigente que la cantidad ya configurada satisface?
   * Deliberadamente independiente de `fromPromotions` — un comensal que encuentra el
   * producto por el buscador y sube la cantidad a mano hasta el mínimo también debe ver el
   * precio con descuento, no solo quien llegó desde la pestaña "Promociones". `fromPromotions`
   * sigue gobernando únicamente el paso forzado de `inc()`/`dec()` (minQty arriba), nunca qué
   * precio se muestra.
   */
  readonly packageDealActive = computed<boolean>(() => {
    const promo = this.selectedVariant()?.promotion;
    return !!promo && this.quantity() >= promo.min_qty;
  });

  /**
   * Regla vigente de `v` si es la variante elegida Y la cantidad configurada ya la satisface —
   * `null` en cualquier otro caso (otra fila, o la elegida pero sin alcanzar min_qty todavía).
   */
  rowPackagePromo(v: MenuVariant): MenuVariantPromotion | null {
    if (v.id !== this.variantId()) return null;
    const promo = v.promotion;
    return promo && this.quantity() >= promo.min_qty ? promo : null;
  }

  discountFor(v: MenuVariant): DiscountInfo | null {
    return discountInfo(v.price, v.discounted_price, v.discount_kind);
  }

  optionQuantity(groupId: string, optId: string): number {
    return this.selected()[groupId]?.[optId] ?? 0;
  }

  isSelected(optId: string): boolean {
    return Object.values(this.selected()).some((entry) => (entry[optId] ?? 0) > 0);
  }

  /** Posición de la opción dentro del grupo (1, 2, 3…), o 0 si no está elegida. */
  selectionOrder(group: MenuOptionGroup, optId: string): number {
    const ids = Object.keys(this.selected()[group.id] ?? {});
    return ids.indexOf(optId) + 1;
  }

  /** Distintas opciones elegidas (grupo "conteo") -- ver `chosenTotal` para "cantidad". */
  chosenCount(group: MenuOptionGroup): number {
    return Object.keys(this.selected()[group.id] ?? {}).length;
  }

  /** Unidades totales elegidas en un grupo "cantidad" (research.md Decisión 8). */
  chosenTotal(group: MenuOptionGroup): number {
    const entry = this.selected()[group.id] ?? {};
    return Object.values(entry).reduce((s, q) => s + q, 0);
  }

  isComplete(group: MenuOptionGroup): boolean {
    // spec 065, FR-003: un grupo "cantidad" nunca bloquea -- no hay mínimo posible.
    if (group.selection_mode === 'cantidad') return true;
    const n = this.chosenCount(group);
    return n >= group.min_select && n >= group.max_select;
  }

  // --- Acordeón ---

  isExpanded(groupId: string): boolean {
    return this.expanded().has(groupId);
  }

  toggleGroup(groupId: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  /**
   * Deja abierto lo que falta por elegir y cerrado lo que ya está completo.
   *
   * Se llama al abrir el modal, al cambiar de presentación y tras cada elección: así el
   * grupo se pliega solo al completarse y el siguiente queda a la vista, sin que el
   * comensal tenga que buscar el botón de agregar al final de 24 sabores.
   */
  private syncExpanded(): void {
    this.expanded.set(
      new Set(this.activeGroups().filter((g) => !this.isComplete(g)).map((g) => g.id)),
    );
  }

  // --- Opciones ---

  /**
   * Elegibles: disponibles y que casen con el buscador, en el orden del catálogo.
   *
   * Lo ya elegido se muestra aunque no case con el filtro: si al buscar "ore"
   * desaparecieran los dos sabores que llevas marcados, parecería que se perdieron.
   */
  visibleOptions(group: MenuOptionGroup): MenuOption[] {
    const q = normalizeText(this.filters()[group.id] ?? '');
    return group.options.filter(
      (o) => o.available && (!q || normalizeText(o.name).includes(q) || this.isSelected(o.id)),
    );
  }

  /** Agotados, aparte y al final: que existan se informa, pero no estorban al elegir. */
  soldOutOptions(group: MenuOptionGroup): MenuOption[] {
    const q = normalizeText(this.filters()[group.id] ?? '');
    return group.options.filter(
      (o) => !o.available && (!q || normalizeText(o.name).includes(q)),
    );
  }

  showSearch(group: MenuOptionGroup): boolean {
    return group.options.length > this.SEARCH_THRESHOLD;
  }

  filterValue(groupId: string): string {
    return this.filters()[groupId] ?? '';
  }

  setFilter(groupId: string, value: string): void {
    this.filters.update((f) => ({ ...f, [groupId]: value }));
  }

  /** Nombres elegidos, para el resumen de la cabecera cuando el grupo está plegado. */
  chosenNames(group: MenuOptionGroup): string {
    const entry = this.selected()[group.id] ?? {};
    return Object.keys(entry)
      .filter((id) => entry[id] > 0)
      .map((id) => {
        const name = group.options.find((o) => o.id === id)?.name;
        if (!name) return null;
        return formatQuantifiedLabel(name, entry[id]);
      })
      .filter(Boolean)
      .join(', ');
  }

  /**
   * Cuántas opciones hay que elegir en este grupo para poder agregar.
   *
   * Un grupo que descuenta inventario reparte una cantidad física fija entre las
   * opciones elegidas: los sabores de un helado de tres bolas. Elegir uno solo
   * le sirve al cliente las tres bolas y descuenta una, así que ahí el mínimo
   * real es el máximo configurado. El backend aplica la misma regla.
   *
   * Un grupo que descuenta pero es opcional (`min_select = 0`) se queda como
   * está: no elegir es una respuesta válida y el consumo cuadra con lo servido.
   *
   * Un grupo "cantidad" nunca exige nada (spec 065, FR-003, research.md
   * Decisión 3): no hay equivalente de `min_select` para ese modo.
   */
  requiredCount(group: MenuOptionGroup): number {
    if (group.selection_mode === 'cantidad') return 0;
    return group.consume && group.min_select > 0 ? group.max_select : group.min_select;
  }

  groupHint(group: MenuOptionGroup): string {
    if (group.selection_mode === 'cantidad') {
      const total = this.chosenTotal(group);
      return total === 0 ? 'Opcional' : `${total} unidad(es)`;
    }
    const disponibles = group.options.filter((o) => o.available).length;
    if (disponibles === 0) return 'Sin existencias';
    const requeridas = this.requiredCount(group);
    if (disponibles < requeridas) return `Solo quedan ${disponibles}`;
    const n = this.chosenCount(group);
    // Con un tope fijo el progreso es lo único que importa; si el rango es abierto hay
    // que recordar además cuál es.
    if (requeridas === group.max_select) return `${n} de ${group.max_select}`;
    if (requeridas > 0) return `${n} · elige ${requeridas}–${group.max_select}`;
    if (group.max_select > 0) return `${n} · hasta ${group.max_select}`;
    return 'Opcional';
  }

  /**
   * Qué falta para poder agregar, en el propio botón. Antes solo se atenuaba, y con el
   * grupo plegado no había forma de saber por qué.
   */
  blockingLabel(): string | null {
    const variant = this.selectedVariant();
    if (!variant) return 'Elige una presentación';
    if (variant.available === false) return 'Presentación agotada';
    for (const g of this.activeGroups()) {
      if (g.selection_mode === 'cantidad') continue; // FR-003: nunca bloquea.
      const faltan = this.requiredCount(g) - this.chosenCount(g);
      if (faltan > 0) {
        return faltan === 1
          ? `Elige 1 más de ${g.name}`
          : `Elige ${faltan} más de ${g.name}`;
      }
    }
    return null;
  }

  groupError(group: MenuOptionGroup): string | null {
    if (group.selection_mode === 'cantidad') return null; // FR-003: nunca bloquea.
    const n = this.chosenCount(group);
    const requeridas = this.requiredCount(group);
    if (n < requeridas) {
      const disponibles = group.options.filter((o) => o.available).length;
      if (disponibles < requeridas) {
        return 'No hay suficientes opciones disponibles ahora mismo.';
      }
      // Con un número exacto "al menos" confunde: no es un mínimo, es la cuenta.
      return requeridas === group.max_select
        ? `Elige ${requeridas}`
        : `Selecciona al menos ${requeridas}`;
    }
    return null;
  }

  toggleOption(group: MenuOptionGroup, opt: MenuOption): void {
    if (!opt.available) return;
    this.selected.update((map) => {
      const current = map[group.id] ?? {};
      const has = (current[opt.id] ?? 0) > 0;
      let next: Record<string, number>;
      if (has) {
        next = { ...current };
        delete next[opt.id];
      } else if (group.max_select === 1) {
        next = { [opt.id]: 1 }; // single-select replaces
      } else if (group.max_select > 0 && Object.keys(current).length >= group.max_select) {
        return map; // at limit, ignore
      } else {
        next = { ...current, [opt.id]: 1 };
      }
      return { ...map, [group.id]: next };
    });

    // Se pliega al completar y se reabre si se deshace una elección. El buscador se
    // limpia al cerrar para que reabrirlo no muestre una lista filtrada a medias.
    if (this.isComplete(group)) {
      this.expanded.update((open) => {
        const nextOpen = new Set(open);
        nextOpen.delete(group.id);
        return nextOpen;
      });
      this.setFilter(group.id, '');
    } else {
      this.expanded.update((open) => new Set(open).add(group.id));
    }
  }

  // --- Cantidad libre por opción (spec 065, US2/US4) ---

  /** `true` si el botón `+` de esta opción debe estar habilitado (US4, FR-008/FR-009). */
  canIncrement(group: MenuOptionGroup, opt: MenuOption): boolean {
    if (!opt.available) return false;
    const current = this.optionQuantity(group.id, opt.id);
    if (group.max_quantity_per_option !== null && current >= group.max_quantity_per_option) {
      return false;
    }
    if (group.max_total_quantity !== null && this.chosenTotal(group) >= group.max_total_quantity) {
      return false;
    }
    return true;
  }

  incrementOption(group: MenuOptionGroup, opt: MenuOption): void {
    if (!this.canIncrement(group, opt)) return;
    this.selected.update((map) => {
      const current = map[group.id] ?? {};
      return { ...map, [group.id]: { ...current, [opt.id]: (current[opt.id] ?? 0) + 1 } };
    });
  }

  decrementOption(group: MenuOptionGroup, opt: MenuOption): void {
    this.selected.update((map) => {
      const current = map[group.id] ?? {};
      const qty = current[opt.id] ?? 0;
      if (qty <= 0) return map;
      const next = { ...current };
      if (qty <= 1) delete next[opt.id];
      else next[opt.id] = qty - 1;
      return { ...map, [group.id]: next };
    });
  }

  canConfirm(): boolean {
    const variant = this.selectedVariant();
    if (!variant || variant.available === false) return false;
    return this.activeGroups().every((g) => {
      if (g.selection_mode === 'cantidad') return true; // FR-003: nunca bloquea.
      const chosen = Object.keys(this.selected()[g.id] ?? {});
      if (chosen.length < this.requiredCount(g) || chosen.length > g.max_select) return false;
      // El menú pudo refrescarse con el modal abierto y dejar agotado algo ya elegido.
      return chosen.every((id) => g.options.find((o) => o.id === id)?.available !== false);
    });
  }

  inc(): void {
    this.quantity.update((q) => q + this.minQty());
  }

  dec(): void {
    this.quantity.update((q) => Math.max(this.minQty(), q - this.minQty()));
  }

  confirm(): void {
    const variant = this.selectedVariant();
    if (!variant || !this.canConfirm()) return;
    const minQty = this.minQty();
    this.added.emit({
      product: this.product,
      variant,
      options: this.selectedOptions(),
      quantity: this.quantity(),
      notes: this.notes().trim() || null,
      stepQuantity: this.fromPromotions && minQty > 1 ? minQty : undefined,
    });
  }
}
