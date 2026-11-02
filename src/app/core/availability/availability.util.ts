import { AvailabilityChange, AvailabilitySnapshot, SoldOutConflict } from './availability.model';

/** Tipo estructural mínimo que necesitan estas funciones -- genérico sobre
 *  `MenuCategory[]` (menú del comensal/staff) y sobre cualquier otra forma que
 *  comparta esta estructura. */
export interface MinimalOption {
  id: string;
  available?: boolean;
}

export interface MinimalOptionGroup {
  options: MinimalOption[];
}

export interface MinimalVariant {
  id: string;
  available?: boolean;
  option_groups?: MinimalOptionGroup[];
}

export interface MinimalTopping {
  id: string;
  available?: boolean;
}

export interface MinimalProduct {
  id: string;
  sold_out?: boolean;
  available?: boolean;
  variants?: MinimalVariant[];
  option_groups?: MinimalOptionGroup[];
  toppings?: MinimalTopping[];
}

export interface MinimalCategory<P extends MinimalProduct = MinimalProduct> {
  products: P[];
}

/** «Agotado» en pantalla, igual para marca manual y para inventario (FR-012). */
export function isProductSoldOut(p: { sold_out?: boolean; available?: boolean }): boolean {
  return !!p.sold_out || p.available === false;
}

/** Clave estable para `lastV`/índices: `"kind:id"`. */
export function availabilityKey(kind: AvailabilityChange['kind'], id: string): string {
  return `${kind}:${id}`;
}

export function shouldApply(
  key: string,
  v: number,
  lastV: ReadonlyMap<string, number> | Record<string, number>,
  snapshotAsOf: number | null,
): boolean {
  const last = lastV instanceof Map ? lastV.get(key) ?? 0 : (lastV as Record<string, number>)[key] ?? 0;
  const asOf = snapshotAsOf ?? 0;
  return v > last && v > asOf;
}

function patchOptionGroups<G extends MinimalOptionGroup>(
  groups: G[] | undefined,
  byOptionId: Map<string, boolean>,
): { groups: G[] | undefined; changed: boolean } {
  if (!groups || groups.length === 0 || byOptionId.size === 0) {
    return { groups, changed: false };
  }
  let changed = false;
  const nextGroups = groups.map((g) => {
    let groupChanged = false;
    const nextOptions = g.options.map((o) => {
      if (byOptionId.has(o.id) && byOptionId.get(o.id) !== o.available) {
        groupChanged = true;
        return { ...o, available: byOptionId.get(o.id)! };
      }
      return o;
    });
    if (!groupChanged) return g;
    changed = true;
    return { ...g, options: nextOptions };
  });
  return { groups: changed ? nextGroups : groups, changed };
}

function patchVariants<V extends MinimalVariant>(
  variants: V[] | undefined,
  byVariantId: Map<string, boolean>,
  byOptionId: Map<string, boolean>,
): { variants: V[] | undefined; changed: boolean } {
  if (!variants || variants.length === 0) return { variants, changed: false };
  let changed = false;
  const next = variants.map((v) => {
    let vChanged = false;
    let patched = v;

    if (byVariantId.has(v.id) && byVariantId.get(v.id) !== v.available) {
      patched = { ...patched, available: byVariantId.get(v.id)! };
      vChanged = true;
    }
    const { groups, changed: groupsChanged } = patchOptionGroups(patched.option_groups, byOptionId);
    if (groupsChanged) {
      patched = { ...patched, option_groups: groups };
      vChanged = true;
    }
    if (!vChanged) return v;
    changed = true;
    return patched;
  });
  return { variants: changed ? next : variants, changed };
}

function patchToppings<T extends MinimalTopping>(
  toppings: T[] | undefined,
  byProductId: Map<string, boolean>,
): { toppings: T[] | undefined; changed: boolean } {
  if (!toppings || toppings.length === 0 || byProductId.size === 0) {
    return { toppings, changed: false };
  }
  let changed = false;
  const next = toppings.map((t) => {
    if (!byProductId.has(t.id)) return t;
    const nextAvailable = byProductId.get(t.id)!;
    if (t.available === nextAvailable) return t;
    changed = true;
    return { ...t, available: nextAvailable };
  });
  return { toppings: changed ? next : toppings, changed };
}

/**
 * Aplica una lista de cambios `availability.changed` al menú, de forma
 * inmutable: devuelve la misma referencia de `categories` si nada cambió
 * (research.md D9/D10). Una adición (topping) comparte el id de su producto,
 * así que un cambio `product` también parcha `toppings[].available`.
 */
export function applyChanges<C extends MinimalCategory>(
  categories: C[],
  changes: readonly AvailabilityChange[],
): C[] {
  if (changes.length === 0) return categories;

  const productSoldOut = new Map<string, boolean>();
  const productAvailable = new Map<string, boolean>();
  const variantAvailable = new Map<string, boolean>();
  const optionAvailable = new Map<string, boolean>();

  for (const c of changes) {
    if (c.kind === 'product') {
      if (c.sold_out !== undefined) productSoldOut.set(c.id, c.sold_out);
      productAvailable.set(c.id, c.available);
    } else if (c.kind === 'variant') {
      variantAvailable.set(c.id, c.available);
    } else if (c.kind === 'option') {
      optionAvailable.set(c.id, c.available);
    }
  }

  let anyChanged = false;
  const nextCategories = categories.map((cat) => {
    let catChanged = false;
    const nextProducts = cat.products.map((p) => {
      let pChanged = false;
      let patched = p;

      if (productSoldOut.has(p.id) && productSoldOut.get(p.id) !== p.sold_out) {
        patched = { ...patched, sold_out: productSoldOut.get(p.id)! };
        pChanged = true;
      }
      if (productAvailable.has(p.id) && productAvailable.get(p.id) !== p.available) {
        patched = { ...patched, available: productAvailable.get(p.id)! };
        pChanged = true;
      }

      const { variants, changed: variantsChanged } = patchVariants(
        patched.variants,
        variantAvailable,
        optionAvailable,
      );
      if (variantsChanged) {
        patched = { ...patched, variants };
        pChanged = true;
      }

      const { groups: optionGroups, changed: groupsChanged } = patchOptionGroups(
        patched.option_groups,
        optionAvailable,
      );
      if (groupsChanged) {
        patched = { ...patched, option_groups: optionGroups };
        pChanged = true;
      }

      if (productAvailable.has(p.id) || productSoldOut.has(p.id)) {
        const nextSoldOut = productSoldOut.has(p.id) ? productSoldOut.get(p.id)! : !!patched.sold_out;
        const nextAvail = productAvailable.has(p.id) ? productAvailable.get(p.id)! : patched.available !== false;
        const toppingPatch = new Map<string, boolean>([[p.id, !nextSoldOut && nextAvail]]);
        const { toppings, changed: toppingsChanged } = patchToppings(patched.toppings, toppingPatch);
        if (toppingsChanged) {
          patched = { ...patched, toppings };
          pChanged = true;
        }
      }

      if (!pChanged) return p;
      catChanged = true;
      return patched;
    });

    if (!catChanged) return cat;
    anyChanged = true;
    return { ...cat, products: nextProducts };
  });

  return anyChanged ? nextCategories : categories;
}

/**
 * Aplica un snapshot completo: REEMPLAZA el estado de disponibilidad de todo
 * elemento presente en la respuesta. Un elemento ausente en el snapshot no se
 * toca (es alta/baja de catálogo, fuera de alcance aquí).
 */
export function applySnapshot<C extends MinimalCategory>(
  categories: C[],
  snapshot: AvailabilitySnapshot,
): C[] {
  const changes: AvailabilityChange[] = [
    ...snapshot.products.map((p) => ({
      kind: 'product' as const,
      id: p.id,
      sold_out: p.sold_out,
      available: p.available,
    })),
    ...snapshot.variants.map((v) => ({
      kind: 'variant' as const,
      id: v.id,
      product_id: v.product_id,
      available: v.available,
    })),
    ...snapshot.options.map((o) => ({
      kind: 'option' as const,
      id: o.id,
      available: o.available,
    })),
  ];
  // El snapshot trae el estado absoluto igual que un evento: reusar
  // `applyChanges` evita una segunda implementación que podría divergir.
  return applyChanges(categories, changes);
}

// --- Índice de disponibilidad para la "línea afectada" del carrito (US2, T045) ---

export interface NamedOption extends MinimalOption {
  name: string;
}

export interface NamedOptionGroup {
  options: NamedOption[];
}

export interface NamedVariant extends MinimalVariant {
  name: string;
  option_groups?: NamedOptionGroup[];
}

export interface NamedTopping extends MinimalTopping {
  name: string;
}

export interface NamedProduct extends MinimalProduct {
  name: string;
  variants?: NamedVariant[];
  toppings?: NamedTopping[];
}

export interface NamedCategory {
  products: NamedProduct[];
}

interface IndexedProduct {
  name: string;
  soldOut: boolean;
  available: boolean;
}

interface IndexedVariant {
  productId: string;
  productName: string;
  name: string;
  available: boolean;
}

interface IndexedLeaf {
  name: string;
  available: boolean;
}

/**
 * Índice por id de todo lo que una línea de carrito puede referenciar:
 * producto, presentación, opción y adición -- con su nombre y su estado
 * "pedible" actuales. Se construye a partir del menú **vivo**
 * (`MenuService.categories()`), nunca de las copias que guarda una línea de
 * carrito (research.md H11): así `affectedElement` siempre resuelve contra
 * el estado de ahora, no el de cuando se agregó la línea.
 */
export interface AvailabilityIndex {
  products: ReadonlyMap<string, IndexedProduct>;
  variants: ReadonlyMap<string, IndexedVariant>;
  options: ReadonlyMap<string, IndexedLeaf>;
  toppings: ReadonlyMap<string, IndexedLeaf>;
}

export function buildAvailabilityIndex(categories: readonly NamedCategory[]): AvailabilityIndex {
  const products = new Map<string, IndexedProduct>();
  const variants = new Map<string, IndexedVariant>();
  const options = new Map<string, IndexedLeaf>();
  const toppings = new Map<string, IndexedLeaf>();

  for (const cat of categories) {
    for (const p of cat.products) {
      products.set(p.id, {
        name: p.name,
        soldOut: !!p.sold_out,
        available: p.available !== false,
      });
      for (const v of p.variants ?? []) {
        variants.set(v.id, {
          productId: p.id,
          productName: p.name,
          name: v.name,
          available: v.available !== false,
        });
        for (const g of v.option_groups ?? []) {
          for (const o of g.options) {
            options.set(o.id, { name: o.name, available: o.available !== false });
          }
        }
      }
      for (const t of p.toppings ?? []) {
        toppings.set(t.id, { name: t.name, available: t.available !== false });
      }
    }
  }

  return { products, variants, options, toppings };
}

/** Parcha el índice de forma inmutable con una lista de `availability.changed`
 *  (misma semántica que `applyChanges`: solo copia los `Map` que de verdad
 *  cambiaron, devuelve la misma referencia si nada cambió). Un cambio sobre
 *  un elemento que el índice no conoce (p. ej. de otro producto) se ignora. */
export function applyChangesToIndex(
  index: AvailabilityIndex,
  changes: readonly AvailabilityChange[],
): AvailabilityIndex {
  if (changes.length === 0) return index;

  let products = index.products as Map<string, IndexedProduct>;
  let variants = index.variants as Map<string, IndexedVariant>;
  let options = index.options as Map<string, IndexedLeaf>;
  let toppings = index.toppings as Map<string, IndexedLeaf>;
  let productsCopied = false;
  let variantsCopied = false;
  let optionsCopied = false;
  let toppingsCopied = false;

  for (const c of changes) {
    if (c.kind === 'product') {
      const prevProduct = index.products.get(c.id);
      const nextSoldOut = c.sold_out !== undefined ? c.sold_out : (prevProduct?.soldOut ?? false);
      const nextAvailable = c.available;
      if (prevProduct && (prevProduct.soldOut !== nextSoldOut || prevProduct.available !== nextAvailable)) {
        if (!productsCopied) { products = new Map(products); productsCopied = true; }
        products.set(c.id, { ...prevProduct, soldOut: nextSoldOut, available: nextAvailable });
      }
      // Una adición comparte el id de su propio producto -- se parcha sin
      // importar si ese producto también aparece en `index.products` (no
      // siempre está indexado como producto propio en todas las vistas).
      const prevTopping = index.toppings.get(c.id);
      if (prevTopping) {
        const nextToppingAvailable = !nextSoldOut && nextAvailable;
        if (prevTopping.available !== nextToppingAvailable) {
          if (!toppingsCopied) { toppings = new Map(toppings); toppingsCopied = true; }
          toppings.set(c.id, { ...prevTopping, available: nextToppingAvailable });
        }
      }
    } else if (c.kind === 'variant') {
      const prev = index.variants.get(c.id);
      if (prev && prev.available !== c.available) {
        if (!variantsCopied) { variants = new Map(variants); variantsCopied = true; }
        variants.set(c.id, { ...prev, available: c.available });
      }
    } else if (c.kind === 'option') {
      const prev = index.options.get(c.id);
      if (prev && prev.available !== c.available) {
        if (!optionsCopied) { options = new Map(options); optionsCopied = true; }
        options.set(c.id, { ...prev, available: c.available });
      }
    }
  }

  if (!productsCopied && !variantsCopied && !optionsCopied && !toppingsCopied) return index;
  return { products, variants, options, toppings };
}

/** Snapshot completo sobre el índice: mismo criterio que `applySnapshot`
 *  (reemplaza el estado de lo que trae, vía `applyChangesToIndex`). */
export function applySnapshotToIndex(
  index: AvailabilityIndex,
  snapshot: AvailabilitySnapshot,
): AvailabilityIndex {
  const changes: AvailabilityChange[] = [
    ...snapshot.products.map((p) => ({
      kind: 'product' as const,
      id: p.id,
      sold_out: p.sold_out,
      available: p.available,
    })),
    ...snapshot.variants.map((v) => ({
      kind: 'variant' as const,
      id: v.id,
      product_id: v.product_id,
      available: v.available,
    })),
    ...snapshot.options.map((o) => ({
      kind: 'option' as const,
      id: o.id,
      available: o.available,
    })),
  ];
  return applyChangesToIndex(index, changes);
}

/** Lo que una línea de carrito necesita para resolverse contra el índice:
 *  ids crudos, nunca las copias que la línea guarda de cuando se agregó. */
export interface AffectedLineInput {
  variantId: string | null | undefined;
  optionIds: readonly string[];
  toppingIds: readonly string[];
}

/**
 * Resuelve por id, contra el índice VIVO, si la línea tiene algo que ya no
 * se puede pedir -- en el orden de prioridad de la spec (data-model.md
 * §Línea afectada): producto agotado → presentación agotada → opción/sabor/
 * salsa agotada → adición agotada → conflicto de cantidad. `null` si la línea
 * sigue totalmente pedible. Otra línea del mismo producto con una
 * presentación/opción distinta que SÍ sigue disponible nunca se marca, porque
 * esto nunca mira nada que esa otra línea no haya elegido.
 */
export function affectedElement(
  line: AffectedLineInput,
  index: AvailabilityIndex,
  quantityConflict: boolean,
): string | null {
  const variant = line.variantId ? index.variants.get(line.variantId) : undefined;
  const product = variant ? index.products.get(variant.productId) : undefined;

  if (product && (product.soldOut || !product.available)) {
    return product.name;
  }
  if (variant && !variant.available) {
    return `${variant.productName} · ${variant.name}`;
  }
  for (const optionId of line.optionIds) {
    const option = index.options.get(optionId);
    if (option && !option.available) return option.name;
  }
  for (const toppingId of line.toppingIds) {
    const topping = index.toppings.get(toppingId);
    if (topping && !topping.available) return topping.name;
  }
  if (quantityConflict) return 'No alcanza para esa cantidad';
  return null;
}

/** Texto exacto de FR-024 para una o varias líneas afectadas a la vez. */
export function soldOutMessage(labels: readonly string[]): string {
  const unique = [...new Set(labels)].filter((l) => l.length > 0);
  if (unique.length <= 1) {
    return `Se agotó: ${unique[0] ?? ''}. Quítalo para continuar`;
  }
  return `Se agotaron: ${unique.join(', ')}. Quítalos para continuar`;
}

// --- 409 unificado por agotado (US3, T077; contracts/sold-out-conflict.md) ---

/**
 * Lee el `detail` de un 409 unificado. `null` si el error no trae `agotados[]`
 * -- esto incluye, a propósito, el 409 `productos_no_disponibles` de la spec
 * 128 (categoría oculta/desactivada, que además limpia el carrito): ese sigue
 * su propio camino de manejo, nunca el de esta spec.
 */
export function parseSoldOutConflict(err: unknown): SoldOutConflict | null {
  const anyErr = err as { status?: number; error?: { detail?: unknown } } | null;
  if (!anyErr || anyErr.status !== 409) return null;
  const detail = anyErr.error?.detail;
  if (
    detail &&
    typeof detail === 'object' &&
    Array.isArray((detail as { agotados?: unknown }).agotados)
  ) {
    return detail as SoldOutConflict;
  }
  return null;
}

/**
 * Los elementos `manual`/`inventario` del conflicto se convierten en cambios
 * de disponibilidad (el motivo "ya no se puede pedir"). Los de `motivo:
 * 'cantidad'` NO se convierten: el producto sigue pedible en cantidad 1, así
 * que marcarlo agotado en el catálogo sería falso -- ese caso se trata solo
 * como conflicto de línea (`quantityConflicts`), no de catálogo.
 */
export function changesFromConflict(
  conflict: SoldOutConflict,
  index: AvailabilityIndex,
): AvailabilityChange[] {
  const changes: AvailabilityChange[] = [];
  // motivo por producto tocado directamente (tipo: 'producto'): 'manual' solo
  // marca el interruptor (no cambia lo pedible por stock); 'inventario' deja
  // el producto no pedible sin tocar el interruptor manual (FR-011).
  const productsTouched = new Map<string, 'manual' | 'inventario'>();

  for (const item of conflict.agotados) {
    if (item.motivo === 'cantidad') continue;

    if (item.tipo === 'producto') {
      productsTouched.set(item.id, item.motivo);
    } else if (item.tipo === 'presentacion') {
      changes.push({ kind: 'variant', id: item.id, product_id: item.producto_id, available: false });
      // La presentación agotada por stock deja su producto sin ninguna
      // presentación pedible solo si era la única -- no lo asumimos aquí (el
      // índice vivo no alcanza a recalcular "pedible global"); el servidor
      // sigue siendo la verdad y `reconcile()` corrige cualquier diferencia.
    } else if (item.tipo === 'opcion') {
      changes.push({ kind: 'option', id: item.id, available: false });
    }
  }

  for (const [productId, motivo] of productsTouched) {
    const prev = index.products.get(productId);
    if (motivo === 'manual') {
      changes.push({
        kind: 'product',
        id: productId,
        sold_out: true,
        available: prev?.available ?? true,
      });
    } else {
      changes.push({
        kind: 'product',
        id: productId,
        sold_out: prev?.soldOut ?? false,
        available: false,
      });
    }
  }

  return changes;
}
