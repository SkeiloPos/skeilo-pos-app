import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MenuProduct,
  MenuVariant,
} from '../../products/interfaces/product.interface';
import { ChosenMenuOption } from '../components/product-select.component';
import { CartResponse } from '../interfaces/diner.interface';
import { DinerService } from './diner.service';
import { effectivePrice } from '../../promotions/services/promotion-pricing.util';
import { formatQuantifiedLabel } from './menu-lookup';

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
}

/** Índice del menú para resolver ids → nombres al pintar el carrito. */
interface MenuIndex {
  variants: Map<string, { productName: string; variantName: string }>;
  options: Map<string, string>;
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
export class DiningCartService {
  private readonly api = inject(DinerService);

  readonly lines = signal<CartLine[]>([]);
  readonly total = signal(0);
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

  private index: MenuIndex = { variants: new Map(), options: new Map() };
  /**
   * spec 081 (research.md D3): paso de cantidad por variante+opciones, solo en
   * memoria del navegador — nunca se lee ni se escribe desde `GET /cart`, así que
   * no sobrevive a una recarga de página (limitación aceptada, no un pendiente).
   */
  private stepByKey = new Map<string, number>();

  private static lineKey(variantId: string, optionKey: string): string {
    return `${variantId}::${optionKey}`;
  }

  /** Indexa el menú resuelto para poder mostrar nombres en las líneas. */
  indexMenu(categories: { products: MenuProduct[] }[]): void {
    const variants = new Map<string, { productName: string; variantName: string }>();
    const options = new Map<string, string>();
    for (const cat of categories) {
      for (const product of cat.products) {
        for (const v of product.variants) {
          variants.set(v.id, { productName: product.name, variantName: v.name });
        }
        for (const g of product.option_groups) {
          for (const o of g.options) options.set(o.id, o.name);
        }
      }
    }
    this.index = { variants, options };
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
  ): Promise<void> {
    await this.mutate(() =>
      this.api.addItem({
        product_variant_id: variant.id,
        quantity,
        options: options.map((c) => ({ option_id: c.option.id, quantity: c.quantity })),
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
  ): Promise<void> {
    await this.mutate(() =>
      this.api.updateItem(itemId, {
        options: options.map((c) => ({ option_id: c.option.id, quantity: c.quantity })),
        notes: notes || null,
      }),
    );
  }

  async setQuantity(itemId: string, quantity: number): Promise<void> {
    if (quantity <= 0) return this.remove(itemId);
    await this.mutate(() => this.api.updateItem(itemId, { quantity }));
  }

  async remove(itemId: string): Promise<void> {
    await this.mutate(() => this.api.removeItem(itemId));
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
  }

  /** Olvida al comensal (sesión expirada o salida de la mesa). */
  clearDiner(): void {
    this.dinerName.set('');
  }

  private async mutate(fn: () => Promise<CartResponse>): Promise<void> {
    this.busy.set(true);
    try {
      this.apply(await fn());
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
        };
      }),
    );
    this.total.set(effectivePrice(cart.total, cart.discounted_total));
  }
}
