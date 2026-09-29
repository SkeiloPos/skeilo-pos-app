import { MenuCategory } from '../../products/interfaces/product.interface';

/**
 * Resolves order-item ids to human labels and prices. Comanda items only carry
 * `product_variant_id` / `option_id`, so staff/kitchen/diner/checkout views
 * build this from the menu (`GET /menu`) to show names and estimate totals.
 */
export interface MenuLookup {
  variantLabel(variantId: string): string;
  optionLabel(optionId: string): string;
  /**
   * spec 087 (FR-012): `"Nombre xN"`, multiplicador siempre visible, incluso
   * x1 (reemplaza el formato "2x Nombre" que se omitía con `quantity === 1`,
   * spec 065/research.md Decisión 9) -- un único formateador compartido por
   * las superficies que muestran opciones elegidas, para que el formato
   * nunca diverja entre ellas.
   */
  optionLabelWithQuantity(optionId: string, quantity: number): string;
  /**
   * Nombre del grupo de opciones dueño de esta opción (p. ej. "Toppings",
   * "Sabores") -- para que el detalle del pedido pueda mostrar la selección
   * agrupada bajo el mismo nombre que el comensal/mesero vio al elegirla, en
   * vez de una lista plana sin distinguir de qué grupo viene cada una.
   * `null` si la opción no se encuentra (ítem histórico de un menú ya
   * cambiado).
   */
  optionGroupLabel(optionId: string): string | null;
  variantPrice(variantId: string): number;
  optionPrice(optionId: string): number;
  /** Producto dueño de la variante — para resolver a qué aplica una promoción. */
  productId(variantId: string): string | undefined;
  /** Categoría del producto dueño de la variante — ídem. */
  categoryId(variantId: string): string | undefined;
}

interface MenuLookupMaps {
  labels: Map<string, string>;
  optLabels: Map<string, string>;
  optGroupLabels: Map<string, string>;
  prices: Map<string, number>;
  optPrices: Map<string, number>;
  productIds: Map<string, string>;
  categoryIds: Map<string, string>;
}

function indexVariants(category: MenuCategory, product: MenuCategory['products'][number], maps: MenuLookupMaps): void {
  for (const variant of product.variants) {
    // Only qualify with the variant name when the product has more than one.
    maps.labels.set(
      variant.id,
      product.variants.length > 1 ? `${product.name} · ${variant.name}` : product.name,
    );
    maps.prices.set(variant.id, variant.price);
    maps.productIds.set(variant.id, product.id);
    maps.categoryIds.set(variant.id, category.id);
  }
}

function indexOptions(product: MenuCategory['products'][number], maps: MenuLookupMaps): void {
  for (const group of product.option_groups) {
    for (const option of group.options) {
      maps.optLabels.set(option.id, option.name);
      maps.optGroupLabels.set(option.id, group.name);
      maps.optPrices.set(option.id, option.extra_price);
    }
  }
}

/**
 * Separa una etiqueta de `variantLabel()` en producto + variante (p. ej.
 * "Canasta · Pequeña" → `{ product: 'Canasta', variant: 'Pequeña' }`) para
 * mostrar la variante como una pastilla aparte -- `" · "` es el mismo
 * separador que `indexVariants()` usa arriba, nunca uno que un nombre de
 * producto use por su cuenta. Sin ese separador (variante única), `variant`
 * sale `null`.
 */
/**
 * "Nombre xN" (spec 087, FR-012) -- el multiplicador SIEMPRE va, incluso x1
 * (antes se omitía con `quantity === 1`, contradiciendo FR-012 directamente).
 * Único formateador compartido por las tres implementaciones independientes
 * del mismo bug: `optionLabelWithQuantity` (abajo), `chosenNames()`
 * (`product-select.component.ts`) y `apply()` (`dining-cart.service.ts`).
 */
export function formatQuantifiedLabel(name: string, quantity: number): string {
  return `${name} x${quantity}`;
}

export function splitVariantLabel(name: string): { product: string; variant: string | null } {
  const sep = ' · ';
  const idx = name.indexOf(sep);
  if (idx === -1) return { product: name, variant: null };
  return { product: name.slice(0, idx), variant: name.slice(idx + sep.length) };
}

export function buildMenuLookup(categories: MenuCategory[]): MenuLookup {
  const maps: MenuLookupMaps = {
    labels: new Map(),
    optLabels: new Map(),
    optGroupLabels: new Map(),
    prices: new Map(),
    optPrices: new Map(),
    productIds: new Map(),
    categoryIds: new Map(),
  };

  for (const category of categories) {
    for (const product of category.products) {
      indexVariants(category, product, maps);
      indexOptions(product, maps);
    }
  }

  const optionLabel = (id: string) => maps.optLabels.get(id) ?? '';

  return {
    variantLabel: (id) => maps.labels.get(id) ?? 'Producto',
    optionLabel,
    optionLabelWithQuantity: (id, quantity) => formatQuantifiedLabel(optionLabel(id), quantity),
    optionGroupLabel: (id) => maps.optGroupLabels.get(id) ?? null,
    variantPrice: (id) => maps.prices.get(id) ?? 0,
    optionPrice: (id) => maps.optPrices.get(id) ?? 0,
    productId: (id) => maps.productIds.get(id),
    categoryId: (id) => maps.categoryIds.get(id),
  };
}
