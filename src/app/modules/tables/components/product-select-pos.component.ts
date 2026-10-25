import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
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
  MenuTopping,
  MenuVariant,
  OptionGroupSelectionMode,
} from '../../products/interfaces/product.interface';
import { normalizeText } from '../../../shared/normalize-text';
import { DiscountInfo, discountInfo, effectivePrice, packagePrice } from '../../promotions/services/promotion-pricing.util';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

/** Una opción elegida junto con cuántas unidades de ella (spec 065). Siempre
 *  `quantity: 1` para una opción de un grupo "conteo". */
export interface ChosenMenuOption {
  option: MenuOption;
  quantity: number;
  groupName: string;
  selectionMode: OptionGroupSelectionMode;
}

export interface ChosenMenuTopping {
  topping: MenuTopping;
  quantity: number;
}

/** Emitted when the cashier confirms their selection for a product. */
export interface ProductSelection {
  product: MenuProduct;
  variant: MenuVariant;
  options: ChosenMenuOption[];
  toppings?: ChosenMenuTopping[];
  quantity: number;
  notes: string | null;
  stepQuantity?: number;
}

/**
 * Rediseño del selector de producto para el pedido manual del cajero
 * (design/nueva-orden.html, modal `optOn`): encabezado con ícono genérico
 * (sin foto), presentación en cuadrícula de tarjetas en vez de lista con
 * radio, y sin "Instrucciones especiales" -- el cajero no las usa en este
 * flujo. Conserva el stepper de cantidad.
 *
 * Es un componente nuevo y no un reskin de `ProductSelectComponent`
 * (`app-product-select`) a propósito: ese sigue sirviendo sin cambios al
 * menú QR, que SÍ necesita foto de producto, notas del comensal y la
 * presentación en lista.
 */
@Component({
  selector: 'app-product-select-pos',
  standalone: true,
  imports: [MoneyPipe, IconMiComponent, IconLucideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div class="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[94vh] flex flex-col overflow-hidden">
        <!-- Header: caja con ícono + título + cerrar (sin foto de producto, sin precio). -->
        <header class="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0">
          <span class="w-11 h-11 shrink-0 rounded-[10px] bg-[var(--terminal-color-primary-soft,#f5f3ff)] text-[var(--terminal-color-primary-active,#6d28d9)] flex items-center justify-center">
            <app-mi-icon name="image-off" [size]="24" />
          </span>
          <span class="flex-1 min-w-0">
            <h1 class="text-xl font-bold text-gray-900 tracking-tight truncate">{{ product.name }}</h1>
            @if (hasPromotion()) {
              <span class="mt-1 inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--terminal-color-primary-soft,#ede9fe)] text-[var(--terminal-color-primary-active,#6d28d9)]">
                <app-lucide-icon name="percent" [size]="10" />
                Promoción
              </span>
            }
          </span>
          <button type="button" (click)="cancelled.emit()" aria-label="Cerrar ventana"
            class="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <app-mi-icon name="close" [size]="18" />
          </button>
        </header>

        <main class="flex-1 overflow-y-auto px-5 py-1 space-y-5">
          @if (unavailableChosen().length > 0) {
            <div data-testid="no-disponibles" class="space-y-2">
              @for (c of unavailableChosen(); track c.option.id) {
                <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
                  <span class="text-sm text-red-700 min-w-0">
                    <span class="line-through">{{ c.option.name }}</span> · No disponible
                  </span>
                  <button type="button" (click)="removeChosen(c.option)"
                    class="shrink-0 min-h-11 px-3 text-xs font-semibold text-red-700 underline"
                  >Quitar</button>
                </div>
              }
            </div>
          }
          @if (staleOptionNames.length > 0) {
            <p data-testid="adicionales-retirados" role="status"
              class="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              {{ staleOptionNames.join(', ') }}
              {{ staleOptionNames.length === 1 ? 'ya no está disponible y se quitará' : 'ya no están disponibles y se quitarán' }}
              al guardar.
            </p>
          }

          <!-- Presentación: cuadrícula de tarjetas en vez de lista con radio. -->
          @if (product.variants.length > 0) {
            <section>
              <div class="text-xs font-semibold tracking-wide uppercase text-gray-500 mb-2.5">Presentación</div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Presentación">
                @for (v of product.variants; track v.id) {
                  <button type="button" role="radio" [attr.aria-checked]="variantId() === v.id"
                    [disabled]="v.available === false"
                    (click)="selectVariant(v)"
                    class="flex flex-col items-center justify-center gap-1 min-h-[80px] p-2.5 rounded-xl border-2 text-center transition-colors"
                    [class]="v.available === false
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : variantId() === v.id
                        ? 'border-[var(--terminal-color-primary-active,#6d28d9)] bg-[var(--terminal-color-primary,#7c3aed)] text-white cursor-pointer'
                        : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 cursor-pointer'"
                  >
                    <span data-testid="variant-name" class="text-sm font-bold break-words">{{ v.name }}</span>
                    @if (v.available === false) {
                      <span class="text-xs font-semibold" [class]="variantId() === v.id ? 'text-white/80' : 'text-gray-400'">Agotado</span>
                    } @else if (discountFor(v); as disc) {
                      <span class="flex items-baseline gap-1 whitespace-nowrap">
                        <span class="text-[10px] line-through opacity-70">{{ disc.original | money }}</span>
                        <span class="font-sora text-base font-extrabold tabular-nums">{{ disc.discounted | money }}</span>
                      </span>
                    } @else if (v.promotion) {
                      <!-- Solo el precio por unidad tachado -- el precio de la promoción ya
                           lo dice la insignia de abajo ("2 x $15.000"), repetirlo aquí como
                           precio por unidad era redundante. SIN importar si la cantidad
                           elegida ya alcanza promo.min_qty: antes esta tarjeta esperaba eso
                           para mostrar cualquier cosa de la promoción, y con la cantidad
                           inicial en 1 nunca se cumplía, así que la presentación parecía no
                           tener promoción. -->
                      <span class="text-xs line-through opacity-70">{{ variantPrice(v) | money }}</span>
                    } @else {
                      <span class="font-sora text-sm font-bold tabular-nums">{{ variantPrice(v) | money }}</span>
                    }
                    @if (v.available !== false && v.promotion; as promo) {
                      <span class="text-[11px] font-bold px-2 py-1 rounded-lg text-white"
                        [style]="variantId() === v.id ? 'background:rgba(255,255,255,.18)' : 'background:var(--terminal-color-primary,#7c3aed)'"
                        >{{ promo.short_condition }}</span>
                    }
                  </button>
                }
              </div>
              @if (selectedVariant()?.promotion; as promo) {
                <p class="mt-2 text-sm font-bold text-white bg-[var(--terminal-color-primary-active,#6d28d9)] px-2.5 py-1 rounded-lg w-fit">{{ promo.condition_text }}</p>
              }
            </section>
          }

          <!-- Grupos de opciones de la presentación elegida (p. ej. sabores). -->
          @for (group of activeGroups(); track group.id) {
            <section>
              <div class="rounded-2xl border border-gray-100 overflow-hidden">
                <button type="button" (click)="toggleGroup(group.id)"
                  class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <span class="min-w-0">
                    <span class="block text-sm font-bold text-gray-900 truncate">{{ group.name }}</span>
                    @if (!isExpanded(group.id) && chosenCount(group) > 0) {
                      <span class="block text-xs text-[var(--terminal-color-primary,#7c3aed)] truncate">{{ chosenNames(group) }}</span>
                    }
                  </span>
                  <span class="flex items-center gap-2 shrink-0">
                    <span class="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded"
                      [class]="requiredCount(group) > 0 ? 'bg-gray-200 text-gray-700' : 'bg-[var(--terminal-color-primary-soft,#ede9fe)] text-[var(--terminal-color-primary-active,#6d28d9)]'">
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
                  <div class="px-4 pb-4 space-y-3 bg-gradient-to-br from-violet-50/40 via-white to-white">
                    @if (showSearch(group)) {
                      <input type="search" [value]="filterValue(group.id)"
                        (input)="setFilter(group.id, $any($event.target).value)"
                        [placeholder]="'Buscar en ' + group.name + '…'"
                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
                    }

                    @if (group.selection_mode === 'cantidad') {
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
                                class="w-7 h-7 rounded-full bg-[var(--terminal-color-primary,#7c3aed)] text-white shadow-sm hover:bg-[var(--terminal-color-primary-active,#6d28d9)] active:scale-95 text-base font-bold leading-none flex items-center justify-center transition disabled:opacity-40"
                              >+</button>
                            </div>
                          </div>
                        }
                      </div>
                    } @else {
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        @for (opt of visibleOptions(group); track opt.id) {
                          <label data-testid="conteo-option"
                            class="flex items-center justify-between gap-2 p-3 bg-white rounded-xl border-2 shadow-sm cursor-pointer transition-colors"
                            [class]="isSelected(opt.id) ? 'border-[var(--terminal-color-primary-active,#8b5cf6)]' : 'border-gray-100 hover:border-gray-300'"
                          >
                            <span class="flex items-center gap-2.5 min-w-0">
                              <input type="checkbox" class="w-4 h-4 rounded text-[var(--terminal-color-primary,#7c3aed)] border-gray-300 focus:ring-violet-500 shrink-0"
                                [checked]="isSelected(opt.id)"
                                [disabled]="!isSelected(opt.id) && group.max_select > 0 && chosenCount(group) >= group.max_select"
                                (change)="toggleOption(group, opt)" />
                              <span class="text-xs font-semibold text-gray-800 truncate">{{ opt.name }}</span>
                              @if (isSelected(opt.id) && group.max_select > 1) {
                                <span class="shrink-0 w-4 h-4 rounded-full bg-[var(--terminal-color-primary-soft,#ede9fe)] text-[var(--terminal-color-primary-active,#6d28d9)] text-[10px] font-bold flex items-center justify-center">
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

          <!-- Adiciones (adiciones de producto, independientes de la presentación). -->
          @if ((product.toppings ?? []).length > 0) {
            <section class="pb-2">
              <div class="text-xs font-semibold tracking-wide uppercase text-gray-500 mb-2.5">Adiciones</div>
              <div class="space-y-2">
                @for (topping of product.toppings; track topping.id) {
                  <div data-testid="topping-row" class="flex items-center justify-between gap-2 px-3 py-2.5 bg-white rounded-xl border border-gray-200"
                    [class.opacity-50]="!topping.available">
                    <span class="min-w-0">
                      <span class="block text-sm font-medium text-gray-800 truncate">{{ topping.name }}</span>
                      <span class="block text-xs text-gray-500">
                        + {{ topping.unit_price | money }} / unidad
                        @if (!topping.available) { <span> · Agotado </span> }
                      </span>
                    </span>
                    <div class="flex items-center gap-2 shrink-0 bg-gray-100 rounded-full p-1 border border-gray-200">
                      <button type="button" data-testid="topping-minus" (click)="decrementTopping(topping)"
                        [disabled]="toppingQuantity(topping.id) === 0"
                        aria-label="Quitar una unidad"
                        class="w-7 h-7 rounded-full bg-white text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 text-base font-bold leading-none flex items-center justify-center transition disabled:opacity-40"
                      >−</button>
                      <span data-testid="topping-qty-value" class="w-5 text-center text-sm font-semibold text-gray-800">{{ toppingQuantity(topping.id) }}</span>
                      <button type="button" data-testid="topping-plus" (click)="incrementTopping(topping)"
                        [disabled]="!topping.available"
                        aria-label="Añadir una unidad"
                        class="w-7 h-7 rounded-full bg-[var(--terminal-color-primary,#7c3aed)] text-white shadow-sm hover:bg-[var(--terminal-color-primary-active,#6d28d9)] active:scale-95 text-base font-bold leading-none flex items-center justify-center transition disabled:opacity-40"
                      >+</button>
                    </div>
                  </div>
                }
              </div>
            </section>
          }
        </main>

        <!-- Footer: cantidad + Agregar (sin instrucciones especiales en este flujo). -->
        <footer class="p-4 bg-white border-t border-gray-100 shrink-0 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-gray-900">Cantidad</span>
            @if (quantityLocked) {
              <span data-testid="cantidad-fija" class="text-lg font-semibold text-gray-800">{{ quantity() }}</span>
            } @else {
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
                class="w-11 h-11 rounded-full bg-[var(--terminal-color-primary,#7c3aed)] text-white shadow-sm hover:bg-[var(--terminal-color-primary-active,#6d28d9)] active:scale-95 text-xl font-bold leading-none flex items-center justify-center transition"
              >+</button>
            </div>
            }
          </div>
          @if (externalError) {
            <p data-testid="error-externo" role="alert" class="text-red-600 text-xs">{{ externalError }}</p>
          }
          <button
            type="button"
            (click)="confirm()"
            [disabled]="!canConfirm()"
            class="w-full h-14 bg-[var(--terminal-color-primary,#7c3aed)] hover:bg-[var(--terminal-color-primary-active,#6d28d9)] active:scale-[0.99] text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
          >
            <!-- Spec 134 (FR-021, nivel B): [textContent] reemplaza todos los hijos del <span> en
                 cada cambio, así la etiqueta y el total siguen al estado real aunque un traductor
                 haya envuelto su texto. -->
            @if (blockingLabel(); as falta) {
              <span [textContent]="falta"></span>
            } @else {
              <span [textContent]="initialSelection ? 'Guardar cambios' : 'Agregar'"></span>
              <span class="w-1.5 h-1.5 rounded-full bg-white/40"></span>
              <span [textContent]="lineTotal() | money"></span>
            }
          </button>
        </footer>
      </div>
    </div>
  `,
})
export class ProductSelectPosComponent implements OnChanges {
  @Input() product!: MenuProduct;
  @Input() initialSelection: ProductSelection | null = null;
  /**
   * Bugfix: número que `pos-terminal.store.ts` sube en CADA `openConfig`/
   * `openConfigForEdit`, incluso al reabrir para el mismo producto. Reiniciar
   * la selección desde `ngOnInit` (que solo corre una vez por instancia) deja
   * el reinicio a merced de que Angular destruya y recree la instancia entre
   * una apertura y otra -- un reclic rápido puede coalescer el cierre y la
   * reapertura en el mismo ciclo de detección de cambios, sin pasar por el
   * `@if` en falso de por medio, y la instancia se reutiliza con las
   * adiciones/sabores de la sesión anterior todavía marcados. Un valor que
   * SIEMPRE cambia en cada apertura, leído desde `ngOnChanges` (que sí corre
   * en cada cambio de `@Input`, exista o no una instancia nueva), es la única
   * garantía real.
   */
  @Input() openToken = 0;
  @Input() fromPromotions = false;
  @Input() addonsPerLine = false;
  @Input() quantityLocked = false;
  @Input() staleOptionNames: string[] = [];
  @Input() externalError: string | null = null;
  @Input() existingQtyFor: (variantId: string, optionKey: string) => number = () => 0;
  @Output() added = new EventEmitter<ProductSelection>();
  @Output() cancelled = new EventEmitter<void>();

  readonly variantId = signal<string | null>(null);
  readonly selected = signal<Record<string, Record<string, number>>>({});
  readonly selectedToppings = signal<Record<string, number>>({});
  readonly quantity = signal(1);
  /** Sin UI en este rediseño (sin "Instrucciones especiales"): queda siempre
   *  vacío, así `confirm()` emite `notes: null` igual que antes de elegir. */
  private readonly notes = signal('');
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  private readonly filters = signal<Record<string, string>>({});
  private readonly SEARCH_THRESHOLD = 10;

  ngOnChanges(changes: SimpleChanges): void {
    // Solo reinicia cuando efectivamente se (re)abrió -- `openToken` sube en
    // cada `openConfig`/`openConfigForEdit` (ver doc del `@Input` arriba);
    // ignora cambios de otros `@Input`s sueltos (p. ej. `externalError`) que
    // no deben perder la selección en curso.
    if (!changes['openToken']) return;
    const initial = this.initialSelection;
    if (initial) {
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
      this.selectedToppings.set(
        Object.fromEntries((initial.toppings ?? []).map((c) => [c.topping.id, c.quantity])),
      );
      this.quantity.set(initial.quantity);
    } else {
      // Arranque "agregar" limpio.
      this.selected.set({});
      this.selectedToppings.set({});
      const first =
        this.product.variants.find((v) => v.available !== false) ?? this.product.variants[0];
      if (first) this.variantId.set(first.id);
      // Si la presentación preseleccionada trae promoción de paquete (min_qty > 1),
      // arranca con esa cantidad en vez de 1 -- si no, el cajero tendría que darse
      // cuenta solo de que debe subir la cantidad para que aplique el precio.
      this.quantity.set(first?.promotion?.min_qty ?? 1);
    }
    this.syncExpanded();
  }

  readonly selectedVariant = computed<MenuVariant | null>(
    () => this.product.variants.find((v) => v.id === this.variantId()) ?? null,
  );

  readonly activeGroups = computed<MenuOptionGroup[]>(
    () => this.selectedVariant()?.option_groups ?? [],
  );

  /** Insignia en el encabezado: visible mientras el producto tenga alguna
   *  promoción vigente en cualquier presentación, sin importar cuál esté
   *  elegida -- igual que la insignia de la tarjeta del catálogo
   *  (`pos-catalog-drawer.component.ts`, `store.cardPromotionText`). */
  readonly hasPromotion = computed(() =>
    this.product.variants.some((v) => v.promotion != null || v.discounted_price != null),
  );

  selectVariant(v: MenuVariant): void {
    if (v.available === false || v.id === this.variantId()) return;
    this.variantId.set(v.id);
    // Misma razón que en ngOnChanges: si esta presentación trae promoción de
    // paquete (min_qty > 1), que la cantidad la refleje de una vez.
    this.quantity.set(v.promotion?.min_qty ?? 1);
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
    this.syncExpanded();
  }

  private readonly selectedOptions = computed<ChosenMenuOption[]>(() => {
    const map = this.selected();
    const chosen: ChosenMenuOption[] = [];
    for (const group of this.activeGroups()) {
      const entry = map[group.id] ?? {};
      for (const opt of group.options) {
        const quantity = entry[opt.id] ?? 0;
        if (quantity > 0) {
          chosen.push({
            option: opt, quantity, groupName: group.name, selectionMode: group.selection_mode,
          });
        }
      }
    }
    return chosen;
  });

  private readonly currentOptionKey = computed(() =>
    this.selectedOptions().map((c) => c.option.id).sort().join(','),
  );

  readonly selectedToppingsList = computed<ChosenMenuTopping[]>(() => {
    const map = this.selectedToppings();
    return (this.product.toppings ?? [])
      .map((topping) => ({ topping, quantity: map[topping.id] ?? 0 }))
      .filter((c) => c.quantity > 0);
  });

  toppingQuantity(toppingId: string): number {
    return this.selectedToppings()[toppingId] ?? 0;
  }

  incrementTopping(topping: MenuTopping): void {
    if (!topping.available) return;
    this.selectedToppings.update((map) => ({ ...map, [topping.id]: (map[topping.id] ?? 0) + 1 }));
  }

  decrementTopping(topping: MenuTopping): void {
    this.selectedToppings.update((map) => {
      const next = (map[topping.id] ?? 0) - 1;
      const { [topping.id]: _removed, ...rest } = map;
      return next > 0 ? { ...rest, [topping.id]: next } : rest;
    });
  }

  readonly minQty = computed(() =>
    this.fromPromotions && !this.initialSelection
      ? (this.selectedVariant()?.promotion?.min_qty ?? 1)
      : 1,
  );

  private readonly existingQty = computed(() =>
    this.existingQtyFor(this.selectedVariant()?.id ?? '', this.currentOptionKey()),
  );

  private readonly resyncQuantityForPromotions = effect(() => {
    if (!this.fromPromotions || this.initialSelection) return;
    const minQty = this.minQty();
    const existingQty = this.existingQty();
    this.quantity.set(
      minQty === 1 ? 1 : existingQty % minQty === 0 ? minQty : minQty - (existingQty % minQty),
    );
  });

  readonly lineTotal = computed(() => {
    const variant = this.selectedVariant();
    if (!variant) return 0;
    const promo = variant.promotion;
    const quantity = this.quantity();
    const base = promo
      ? packagePrice(variant.price, promo, quantity)
      : effectivePrice(variant.price, variant.discounted_price) * quantity;
    const extra = this.selectedOptions().reduce((sum, c) => {
      const addon = c.option.extra_price * c.quantity;
      const multiplier = c.selectionMode === 'cantidad' ? 1 : (this.addonsPerLine ? 1 : quantity);
      return sum + addon * multiplier;
    }, 0);
    const toppingsExtra = this.selectedToppingsList().reduce(
      (sum, c) => sum + c.topping.unit_price * c.quantity, 0,
    );
    return base + extra + toppingsExtra;
  });

  variantPrice(v: MenuVariant): number {
    return effectivePrice(v.price, v.discounted_price);
  }

  readonly packageDealActive = computed<boolean>(() => {
    const promo = this.selectedVariant()?.promotion;
    return !!promo && this.quantity() >= promo.min_qty;
  });

  discountFor(v: MenuVariant): DiscountInfo | null {
    return discountInfo(v.price, v.discounted_price, v.discount_kind);
  }

  optionQuantity(groupId: string, optId: string): number {
    return this.selected()[groupId]?.[optId] ?? 0;
  }

  isSelected(optId: string): boolean {
    return Object.values(this.selected()).some((entry) => (entry[optId] ?? 0) > 0);
  }

  selectionOrder(group: MenuOptionGroup, optId: string): number {
    const ids = Object.keys(this.selected()[group.id] ?? {});
    return ids.indexOf(optId) + 1;
  }

  chosenCount(group: MenuOptionGroup): number {
    return Object.keys(this.selected()[group.id] ?? {}).length;
  }

  chosenTotal(group: MenuOptionGroup): number {
    const entry = this.selected()[group.id] ?? {};
    return Object.values(entry).reduce((s, q) => s + q, 0);
  }

  isComplete(group: MenuOptionGroup): boolean {
    if (group.selection_mode === 'cantidad') return true;
    const n = this.chosenCount(group);
    return n >= group.min_select && n >= group.max_select;
  }

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

  private syncExpanded(): void {
    this.expanded.set(
      new Set(this.activeGroups().filter((g) => !this.isComplete(g)).map((g) => g.id)),
    );
  }

  visibleOptions(group: MenuOptionGroup): MenuOption[] {
    const q = normalizeText(this.filters()[group.id] ?? '');
    return group.options.filter(
      (o) => o.available && (!q || normalizeText(o.name).includes(q) || this.isSelected(o.id)),
    );
  }

  soldOutOptions(group: MenuOptionGroup): MenuOption[] {
    const q = normalizeText(this.filters()[group.id] ?? '');
    return group.options.filter(
      (o) => !o.available && !this.isSelected(o.id) && (!q || normalizeText(o.name).includes(q)),
    );
  }

  removeChosen(opt: MenuOption): void {
    const group = this.activeGroups().find((g) => g.options.some((o) => o.id === opt.id));
    if (group) this.removeOption(group, opt);
  }

  removeOption(group: MenuOptionGroup, opt: MenuOption): void {
    this.selected.update((map) => {
      const next = { ...(map[group.id] ?? {}) };
      delete next[opt.id];
      return { ...map, [group.id]: next };
    });
  }

  readonly unavailableChosen = computed(() =>
    this.selectedOptions().filter((c) => !c.option.available),
  );

  showSearch(group: MenuOptionGroup): boolean {
    return group.options.length > this.SEARCH_THRESHOLD;
  }

  filterValue(groupId: string): string {
    return this.filters()[groupId] ?? '';
  }

  setFilter(groupId: string, value: string): void {
    this.filters.update((f) => ({ ...f, [groupId]: value }));
  }

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
    if (requeridas === group.max_select) return `${n} de ${group.max_select}`;
    if (requeridas > 0) return `${n} · elige ${requeridas}–${group.max_select}`;
    if (group.max_select > 0) return `${n} · hasta ${group.max_select}`;
    return 'Opcional';
  }

  blockingLabel(): string | null {
    const variant = this.selectedVariant();
    if (!variant) return 'Elige una presentación';
    if (variant.available === false) return 'Presentación agotada';
    const noDisponible = this.unavailableChosen()[0];
    if (noDisponible) return `Quita «${noDisponible.option.name}» (no disponible)`;
    for (const g of this.activeGroups()) {
      if (g.selection_mode === 'cantidad') continue;
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
    if (group.selection_mode === 'cantidad') return null;
    const n = this.chosenCount(group);
    const requeridas = this.requiredCount(group);
    if (n < requeridas) {
      const disponibles = group.options.filter((o) => o.available).length;
      if (disponibles < requeridas) {
        return 'No hay suficientes opciones disponibles ahora mismo.';
      }
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
        next = { [opt.id]: 1 };
      } else if (group.max_select > 0 && Object.keys(current).length >= group.max_select) {
        return map;
      } else {
        next = { ...current, [opt.id]: 1 };
      }
      return { ...map, [group.id]: next };
    });

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

  canIncrement(group: MenuOptionGroup, opt: MenuOption): boolean {
    if (!opt.available) return false;
    const qty = this.quantity();
    const current = this.optionQuantity(group.id, opt.id);
    if (group.max_quantity_per_option !== null && current >= group.max_quantity_per_option * qty) {
      return false;
    }
    if (group.max_total_quantity !== null && this.chosenTotal(group) >= group.max_total_quantity * qty) {
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
    if (this.unavailableChosen().length > 0) return false;
    return this.activeGroups().every((g) => {
      if (g.selection_mode === 'cantidad') return true;
      const chosen = Object.keys(this.selected()[g.id] ?? {});
      if (chosen.length < this.requiredCount(g) || chosen.length > g.max_select) return false;
      return chosen.every((id) => g.options.find((o) => o.id === id)?.available !== false);
    });
  }

  inc(): void {
    this.quantity.update((q) => q + this.minQty());
  }

  dec(): void {
    this.quantity.update((q) => Math.max(this.minQty(), q - this.minQty()));
    this.autoAdjustCantidadOptions();
  }

  private autoAdjustCantidadOptions(): void {
    const qty = this.quantity();
    for (const group of this.activeGroups()) {
      if (group.selection_mode !== 'cantidad') continue;
      const entry = this.selected()[group.id];
      if (!entry) continue;
      const next = { ...entry };

      if (group.max_quantity_per_option !== null) {
        const tope = group.max_quantity_per_option * qty;
        for (const optId of Object.keys(next)) {
          if (next[optId] > tope) next[optId] = tope;
        }
      }

      if (group.max_total_quantity !== null) {
        const topeTotal = group.max_total_quantity * qty;
        let total = Object.values(next).reduce((s, q) => s + q, 0);
        if (total > topeTotal) {
          const ordered = group.options
            .filter((o) => (next[o.id] ?? 0) > 0)
            .sort((a, b) => {
              const an = a.name.toLocaleLowerCase('es-CO');
              const bn = b.name.toLocaleLowerCase('es-CO');
              if (an !== bn) return an < bn ? 1 : -1;
              return a.id < b.id ? 1 : -1;
            });
          let pos = 0;
          while (total > topeTotal && pos < ordered.length) {
            const optId = ordered[pos].id;
            if ((next[optId] ?? 0) <= 0) {
              pos++;
              continue;
            }
            next[optId] -= 1;
            total -= 1;
            if (next[optId] <= 0) pos++;
          }
        }
      }

      for (const optId of Object.keys(next)) {
        if (next[optId] <= 0) delete next[optId];
      }
      this.selected.update((map) => ({ ...map, [group.id]: next }));
    }
  }

  confirm(): void {
    const variant = this.selectedVariant();
    if (!variant || !this.canConfirm()) return;
    const minQty = this.minQty();
    this.added.emit({
      product: this.product,
      variant,
      options: this.selectedOptions(),
      toppings: this.selectedToppingsList(),
      quantity: this.quantity(),
      notes: this.notes().trim() || null,
      stepQuantity: this.fromPromotions && minQty > 1 ? minQty : undefined,
    });
  }
}
