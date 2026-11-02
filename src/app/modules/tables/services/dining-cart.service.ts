import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';
import { ChosenMenuOption, ChosenMenuTopping } from '../components/product-select.component';
import { AdjustedOption, CartResponse } from '../interfaces/diner.interface';
import { DinerService } from './diner.service';
import { effectivePrice } from '../../promotions/services/promotion-pricing.util';
import { formatQuantifiedLabel } from './menu-lookup';
import { AvailabilityChange, AvailabilitySnapshot, SoldOutConflict } from '../../../core/availability/availability.model';
import { AvailabilitySyncService, AvailabilityTarget } from '../../../core/availability/availability-sync.service';
import {
  AvailabilityIndex,
  affectedElement,
  applyChangesToIndex,
  applySnapshotToIndex,
  buildAvailabilityIndex,
  changesFromConflict,
} from '../../../core/availability/availability.util';

/** Una línea del carrito, ya resuelta contra el menú para poder pintarla. */
export interface CartLine {
  /** Id de la línea en el backend (`cart_items.id`). */
  id: string;
  productName: string;
  variantName: string;
  optionNames: string[];
  quantity: number;
  notes: string | null;
  /** Precio de UNA unidad de producto (desde la spec 089 no incluye los adicionales de las líneas nuevas). */
  unitPrice: number;
  /** spec 089 (A-94): adicionales cobrados UNA vez por línea; no cambian al cambiar la cantidad del producto. */
  addonsTotal: number;
  lineTotal: number;
  /**
   * spec 081 (data-model.md): derivados de `CartResponse.items[]`, ya presentes en
   * la respuesta del backend pero antes descartados al construir la línea. Sirven
   * para resolver el paso de cantidad de esta línea (`stepFor`) sin id de línea,
   * que solo se conoce después de que el backend responde al agregado.
   */
  productVariantId: string;
  /** Ids de opción elegidas, ordenados y unidos con coma — clave estable sin importar el orden de llegada. */
  optionKey: string;
  /**
   * spec 089 (Historia 3): opciones elegidas con su cantidad, tal como las devolvió el backend.
   * Sirven para precargar el selector al "Editar adicionales" (la cantidad de cada adicional es
   * independiente de la del producto).
   */
  optionSelections: { optionId: string; quantity: number }[];
  /** spec 129: adiciones (productos-topping) elegidas, ya resueltas a nombre.
   *  Opcional: no obliga a los fixtures de test ya existentes a declararlo --
   *  ausente se trata como `[]`. */
  toppingNames?: string[];
  /** Para precargar el selector al editar -- mismo criterio que `optionSelections`. */
  toppingSelections?: { toppingProductId: string; quantity: number }[];
}

/** Índice del menú para resolver ids → nombres al pintar el carrito. */
interface MenuIndex {
  variants: Map<string, { productName: string; variantName: string }>;
  options: Map<string, string>;
  /** spec 129: id de producto-adición → nombre, para resolver `toppingNames`. */
  toppings: Map<string, string>;
}

/**
 * Carrito borrador del comensal. **Vive en el backend**, no en el navegador:
 * cada cambio va a `/cart/items` y el estado local es la proyección de la
 * respuesta (el backend devuelve el carrito completo en cada mutación).
 *
 * Eso es lo que hace que el carrito sobreviva a una recarga y que el aviso de
 * stock insuficiente aparezca al añadir la línea, no al final.
 */
@Injectable({ providedIn: 'root' })
export class DiningCartService implements AvailabilityTarget {
  private readonly api = inject(DinerService);
  private readonly availabilitySync = inject(AvailabilitySyncService);

  readonly lines = signal<CartLine[]>([]);
  readonly total = signal(0);
  /**
   * spec 092 (research.md D5): total **de lista**, sin el descuento de promoción
   * — `CartResponse.total` tal como llega. Hasta esta spec `apply()` lo
   * descartaba, quedándose solo con el resultado de `effectivePrice(...)`.
   *
   * Existe para poder pintar la fila "Ahorro" (FR-012) **sin inventar ningún
   * cálculo en el front** (FR-014, RN-001): la diferencia entre este número y
   * `total()` ya la resolvió el backend.
   */
  readonly grossTotal = signal(0);
  /**
   * Nombre desambiguado del comensal, que viaja en la respuesta del carrito.
   *
   * Vive aquí y no en la pantalla porque `GET /cart` es lo único que se recarga al
   * reingresar: así el saludo sobrevive a un F5 sin guardar nada en el navegador.
   */
  readonly dinerName = signal('');
  /** Hay una operación en vuelo: la UI debe bloquear los botones de cantidad. */
  readonly busy = signal(false);

  readonly count = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  readonly isEmpty = computed(() => this.lines().length === 0);
  /**
   * spec 092 (FR-012, research.md D5): descuento vigente del pedido. `0`
   * significa "sin promoción aplicada" y la fila "Ahorro" no se pinta — ni en
   * cero ni vacía.
   *
   * El `max(0, …)` no es desconfianza del backend: hace que la fila simplemente
   * no aparezca si algún día llegara un `discounted_total` igual o mayor que el
   * total, en vez de pintar un "Ahorro: -$500".
   */
  readonly savings = computed(() => Math.max(0, this.grossTotal() - this.total()));

  private index: MenuIndex = { variants: new Map(), options: new Map(), toppings: new Map() };
  /**
   * spec 081 (research.md D3): paso de cantidad por variante+opciones, solo en
   * memoria del navegador — nunca se lee ni se escribe desde `GET /cart`, así que
   * no sobrevive a una recarga de página (limitación aceptada, no un pendiente).
   */
  private stepByKey = new Map<string, number>();

  /**
   * spec 148 (US2, T051): índice de disponibilidad del menú, actualizado por
   * `AvailabilitySyncService` **aunque `PublicMenuComponent` no esté vivo**
   * (research.md H9) -- por eso vive aquí y no en el componente: el carrito
   * del comensal sigue marcando líneas afectadas en los pasos de pago.
   */
  readonly availability = signal<AvailabilityIndex>(buildAvailabilityIndex([]));

  /** Claves de `quantityConflicts`: id de línea de carrito marcada por un 409
   *  `motivo:'cantidad'` (spec 148, US3). Se limpia al quitar la línea o al
   *  cambiar su cantidad -- nunca por un evento en vivo (esa marca no sale del
   *  menú, sale del rechazo del servidor). */
  readonly quantityConflicts = signal<ReadonlySet<string>>(new Set());

  /** Líneas del carrito cuyo producto, presentación, opción o adición elegida
   *  ya no se puede pedir -- resuelto contra el menú VIVO (research.md H11),
   *  nunca contra las copias que guarda `CartLine`. */
  readonly affectedLines = computed<ReadonlyMap<string, string>>(() => {
    const index = this.availability();
    const conflicts = this.quantityConflicts();
    const out = new Map<string, string>();
    for (const line of this.lines()) {
      const label = affectedElement(
        {
          variantId: line.productVariantId,
          optionIds: line.optionKey ? line.optionKey.split(',') : [],
          toppingIds: (line.toppingSelections ?? []).map((t) => t.toppingProductId),
        },
        index,
        conflicts.has(line.id),
      );
      if (label) out.set(line.id, label);
    }
    return out;
  });

  readonly hasAffectedLines = computed(() => this.affectedLines().size > 0);

  /**
   * spec 148 (US2, research.md D14): total visto la última vez que se mostró
   * el resumen del checkout, para detectar "El total cambió a $X" al quitar
   * una línea afectada. En memoria, se limpia con `clear()` y al terminar el
   * checkout (`clearCheckoutTotalSeen()`).
   */
  readonly checkoutTotalSeen = signal<number | null>(null);

  /** `total()` si cambió desde la última vez que un paso del checkout lo vio
   *  (`seenCheckoutTotalOnce`), `null` en cualquier otro caso (incluida la
   *  primera visita, antes de fijar la línea base). */
  readonly totalChangedTo = computed<number | null>(() => {
    const seen = this.checkoutTotalSeen();
    const total = this.total();
    return seen !== null && seen !== total ? total : null;
  });

  /** Fija la línea base de `totalChangedTo` la primera vez que un paso del
   *  checkout la observa -- no hace nada en visitas posteriores, así que el
   *  aviso "El total cambió" permanece hasta que el carrito se limpia. */
  seenCheckoutTotalOnce(): void {
    if (this.checkoutTotalSeen() === null) this.checkoutTotalSeen.set(this.total());
  }

  private static lineKey(variantId: string, optionKey: string): string {
    return `${variantId}::${optionKey}`;
  }

  /** Indexa el menú resuelto para poder mostrar nombres en las líneas. */
  indexMenu(categories: { products: MenuProduct[] }[]): void {
    const variants = new Map<string, { productName: string; variantName: string }>();
    const options = new Map<string, string>();
    const toppings = new Map<string, string>();
    for (const cat of categories) {
      for (const product of cat.products) {
        for (const v of product.variants) {
          variants.set(v.id, { productName: product.name, variantName: v.name });
        }
        for (const g of product.option_groups) {
          for (const o of g.options) options.set(o.id, o.name);
        }
        for (const t of product.toppings ?? []) toppings.set(t.id, t.name);
      }
    }
    this.index = { variants, options, toppings };
    this.availability.set(buildAvailabilityIndex(categories));
  }

  /** `AvailabilityTarget`: parcha el índice con los cambios del evento en vivo. */
  applyAvailability(changes: readonly AvailabilityChange[]): void {
    this.availability.update((index) => applyChangesToIndex(index, changes));
  }

  /** `AvailabilityTarget`: reemplaza el estado de disponibilidad con un snapshot. */
  applyAvailabilitySnapshot(snapshot: AvailabilitySnapshot): void {
    this.availability.update((index) => applySnapshotToIndex(index, snapshot));
  }

  /** Quita `itemId` de `quantityConflicts` (lo usa `remove`/`setQuantity`). */
  private clearQuantityConflict(itemId: string): void {
    if (!this.quantityConflicts().has(itemId)) return;
    this.quantityConflicts.update((s) => {
      const next = new Set(s);
      next.delete(itemId);
      return next;
    });
  }

  /** Marca estas líneas como en conflicto de cantidad (lo usa el manejo del 409, US3). */
  markQuantityConflicts(itemIds: readonly string[]): void {
    if (itemIds.length === 0) return;
    this.quantityConflicts.update((s) => new Set([...s, ...itemIds]));
  }

  /** Spec 148 (US3, T079): un 409 unificado llegó al agregar/actualizar/
   *  enviar el carrito del comensal. Marca el índice en vivo con los
   *  elementos `manual`/`inventario` (sin esperar al evento), marca por
   *  cantidad las líneas cuyo `productVariantId` coincide con un `motivo:
   *  'cantidad'`, y dispara una reconciliación. Nunca toca `lines()` (el
   *  carrito del servidor no se vacía por esto). */
  applyConflict(conflict: SoldOutConflict): void {
    this.availabilitySync.applyLocal(changesFromConflict(conflict, this.availability()));

    const cantidadIds = new Set(
      conflict.agotados.filter((a) => a.motivo === 'cantidad').map((a) => a.id),
    );
    if (cantidadIds.size > 0) {
      const affectedLineIds = this.lines()
        .filter((l) => cantidadIds.has(l.productVariantId))
        .map((l) => l.id);
      this.markQuantityConflicts(affectedLineIds);
    }

    void this.availabilitySync.reconcile();
  }

  /** Se llama al terminar el checkout (enviado o cancelado) -- limpia el aviso
   *  de "El total cambió" para el próximo carrito. */
  clearCheckoutTotalSeen(): void {
    this.checkoutTotalSeen.set(null);
  }

  /** Carga el carrito vigente del backend (al abrir o al reingresar). */
  async load(): Promise<void> {
    this.apply(await this.api.getCart());
  }

  /**
   * Añade una línea. Propaga el error para que la pantalla muestre qué insumo
   * falta cuando el backend responde el `409` estructurado.
   *
   * `stepQuantity` (spec 081, contrato §2) solo lo pasa el flujo que abre el
   * modal desde la pestaña "Promociones" — cuando viene definido, se registra
   * como el paso de +/- de la línea resultante **después** de que el backend
   * confirme el agregado (nunca sobre un intento rechazado, p. ej. por stock).
   */
  async add(
    _product: MenuProduct,
    variant: MenuVariant,
    options: ChosenMenuOption[],
    quantity: number,
    notes: string | null,
    stepQuantity?: number,
    toppings: ChosenMenuTopping[] = [],
  ): Promise<void> {
    await this.mutate(() =>
      this.api.addItem({
        product_variant_id: variant.id,
        quantity,
        options: options.map((c) => ({ option_id: c.option.id, quantity: c.quantity })),
        // spec 129: omitido cuando no hay adiciones -- conserva el payload exacto de
        // siempre para toda línea sin adiciones (sin cambio visible de contrato).
        ...(toppings.length > 0
          ? { toppings: toppings.map((c) => ({ topping_product_id: c.topping.id, quantity: c.quantity })) }
          : {}),
        notes: notes || null,
      }),
    );
    if (stepQuantity != null) {
      const optionKey = options.map((c) => c.option.id).sort().join(',');
      this.stepByKey.set(DiningCartService.lineKey(variant.id, optionKey), stepQuantity);
    }
  }

  /** Paso de +/- para esta línea — `1` (libre) si nunca se agregó desde "Promociones". */
  stepFor(line: CartLine): number {
    return this.stepByKey.get(DiningCartService.lineKey(line.productVariantId, line.optionKey)) ?? 1;
  }

  /**
   * spec 089 (Historia 3): reemplaza los adicionales (y la nota) de una línea ya agregada sin
   * eliminarla — `PATCH /cart/items/{id}` con `{options, notes}`; la cantidad de producto no
   * cambia. Propaga el error (422 de la selección, 409 de stock) para que la pantalla lo muestre
   * sin cerrar el selector; solo actualiza el estado local si el backend acepta.
   */
  async updateItem(
    itemId: string,
    options: ChosenMenuOption[],
    notes: string | null,
    toppings: ChosenMenuTopping[] = [],
  ): Promise<void> {
    await this.mutate(() =>
      this.api.updateItem(itemId, {
        options: options.map((c) => ({ option_id: c.option.id, quantity: c.quantity })),
        toppings: toppings.map((c) => ({ topping_product_id: c.topping.id, quantity: c.quantity })),
        notes: notes || null,
      }),
    );
  }

  /** Spec 117 (A-126, D5): devuelve las adiciones "cantidad" que el backend redujo
   *  automáticamente al reducir la cantidad de producto, si las hubo (`[]` en el
   *  caso normal, sin ajuste) -- para que la pantalla pueda avisar. */
  async setQuantity(itemId: string, quantity: number): Promise<AdjustedOption[]> {
    if (quantity <= 0) {
      await this.remove(itemId);
      return [];
    }
    const cart = await this.mutate(() => this.api.updateItem(itemId, { quantity }));
    this.clearQuantityConflict(itemId);
    return cart.items.find((it) => it.id === itemId)?.adjusted_options ?? [];
  }

  async remove(itemId: string): Promise<void> {
    await this.mutate(() => this.api.removeItem(itemId));
    this.clearQuantityConflict(itemId);
  }

  /**
   * Limpia las líneas (tras enviar el pedido o cerrar la sesión).
   *
   * **No toca `dinerName`**: al enviar un pedido el comensal sigue en la mesa y
   * borrarlo dejaría el saludo en blanco. Para eso está `clearDiner()`.
   */
  clear(): void {
    this.lines.set([]);
    this.total.set(0);
    this.grossTotal.set(0);
    this.quantityConflicts.set(new Set());
    this.checkoutTotalSeen.set(null);
  }

  /** Olvida al comensal (sesión expirada o salida de la mesa). */
  clearDiner(): void {
    this.dinerName.set('');
  }

  private async mutate(fn: () => Promise<CartResponse>): Promise<CartResponse> {
    this.busy.set(true);
    try {
      const cart = await fn();
      this.apply(cart);
      return cart;
    } finally {
      this.busy.set(false);
    }
  }

  /** Proyecta la respuesta del backend al estado local. */
  private apply(cart: CartResponse): void {
    this.dinerName.set(cart.display_label || cart.display_name);
    this.lines.set(
      cart.items.map((it) => {
        const variant = this.index.variants.get(it.product_variant_id);
        return {
          id: it.id,
          productName: variant?.productName ?? 'Producto',
          variantName: variant?.variantName ?? '',
          optionNames: it.options
            .map((o) => {
              const name = this.index.options.get(o.option_id);
              if (!name) return null;
              return formatQuantifiedLabel(name, o.quantity);
            })
            .filter((n): n is string => !!n),
          quantity: it.quantity,
          notes: it.notes,
          unitPrice: effectivePrice(it.unit_price, it.discounted_unit_price),
          addonsTotal: Number(it.addons_total ?? 0),
          // `line_total` ya es `unit_price × quantity + addons_total`; con un backend sin ese
          // campo se reconstruye igual (spec 089), nunca como `unit_price × quantity` suelto.
          lineTotal: effectivePrice(
            it.line_total ?? String(Number(it.unit_price) * it.quantity + Number(it.addons_total ?? 0)),
            it.discounted_line_total,
          ),
          productVariantId: it.product_variant_id,
          optionKey: it.options.map((o) => o.option_id).sort().join(','),
          optionSelections: it.options.map((o) => ({ optionId: o.option_id, quantity: o.quantity })),
          toppingNames: (it.toppings ?? [])
            .map((t) => {
              const name = this.index.toppings.get(t.id);
              return name ? formatQuantifiedLabel(name, t.quantity) : null;
            })
            .filter((n): n is string => !!n),
          toppingSelections: (it.toppings ?? []).map((t) => ({
            toppingProductId: t.id, quantity: t.quantity,
          })),
        };
      }),
    );
    this.total.set(effectivePrice(cart.total, cart.discounted_total));
    // spec 092: el total de lista se conserva en vez de descartarse. `total` NO
    // cambia de semántica —sigue siendo el vigente, con descuento— porque lo
    // consumen tres pantallas fuera del alcance de esta spec (Principio V).
    this.grossTotal.set(Number(cart.total));
  }
}
