import { AvailabilitySnapshot, SoldOutConflict } from './availability.model';
import {
  MinimalCategory,
  NamedCategory,
  affectedElement,
  applyChanges,
  applyChangesToIndex,
  applySnapshot,
  applySnapshotToIndex,
  buildAvailabilityIndex,
  changesFromConflict,
  isProductSoldOut,
  parseSoldOutConflict,
  shouldApply,
  soldOutMessage,
} from './availability.util';

function baseCategories(): MinimalCategory[] {
  return [
    {
      products: [
        {
          id: 'p1',
          sold_out: false,
          available: true,
          variants: [
            {
              id: 'v1',
              available: true,
              option_groups: [{ options: [{ id: 'o1', available: true }] }],
            },
          ],
          option_groups: [{ options: [{ id: 'o1', available: true }] }],
          toppings: [{ id: 'p1', available: true }],
        },
        {
          id: 'p2',
          sold_out: false,
          available: true,
          variants: [{ id: 'v2', available: true }],
        },
      ],
    },
  ];
}

describe('isProductSoldOut', () => {
  it('agotado por marca manual', () => {
    expect(isProductSoldOut({ sold_out: true, available: true })).toBe(true);
  });
  it('agotado por inventario (available: false)', () => {
    expect(isProductSoldOut({ sold_out: false, available: false })).toBe(true);
  });
  it('disponible', () => {
    expect(isProductSoldOut({ sold_out: false, available: true })).toBe(false);
  });
});

describe('applyChanges', () => {
  it('parcha un producto (sold_out)', () => {
    const cats = baseCategories();
    const next = applyChanges(cats, [{ kind: 'product', id: 'p1', sold_out: true, available: true }]);
    expect(next).not.toBe(cats);
    expect(next[0].products[0].sold_out).toBe(true);
    // El resto del producto no cambia de referencia innecesariamente más allá del patch.
    expect(next[0].products[1]).toBe(cats[0].products[1]);
  });

  it('parcha un producto (available) y por lo tanto su adición homónima', () => {
    const cats = baseCategories();
    const next = applyChanges(cats, [{ kind: 'product', id: 'p1', sold_out: false, available: false }]);
    expect(next[0].products[0].available).toBe(false);
    expect(next[0].products[0].toppings![0].available).toBe(false);
  });

  it('parcha una presentación (variant)', () => {
    const cats = baseCategories();
    const next = applyChanges(cats, [{ kind: 'variant', id: 'v1', product_id: 'p1', available: false }]);
    expect(next[0].products[0].variants![0].available).toBe(false);
  });

  it('parcha una opción, incluida dentro de los option_groups de la variante y del producto', () => {
    const cats = baseCategories();
    const next = applyChanges(cats, [{ kind: 'option', id: 'o1', available: false }]);
    expect(next[0].products[0].variants![0].option_groups![0].options[0].available).toBe(false);
    expect(next[0].products[0].option_groups![0].options[0].available).toBe(false);
  });

  it('es inmutable: misma referencia si nada cambió', () => {
    const cats = baseCategories();
    const next = applyChanges(cats, [{ kind: 'product', id: 'p1', sold_out: false, available: true }]);
    expect(next).toBe(cats);
  });

  it('una ráfaga desordenada termina en el último v aplicado por el llamador (shouldApply)', () => {
    const lastV = new Map<string, number>();
    const applied: boolean[] = [];
    const events = [
      { key: 'product:p1', v: 10, available: true },
      { key: 'product:p1', v: 12, available: false },
      { key: 'product:p1', v: 11, available: true }, // llega tarde, v menor
    ];
    let finalAvailable: boolean | null = null;
    for (const ev of events) {
      const ok = shouldApply(ev.key, ev.v, lastV, null);
      applied.push(ok);
      if (ok) {
        lastV.set(ev.key, ev.v);
        finalAvailable = ev.available;
      }
    }
    expect(applied).toEqual([true, true, false]);
    expect(finalAvailable).toBe(false);
  });
});

describe('applySnapshot', () => {
  it('reemplaza el estado de lo que trae', () => {
    const cats = baseCategories();
    const snapshot: AvailabilitySnapshot = {
      as_of: 5,
      products: [{ id: 'p1', sold_out: true, available: true }],
      variants: [],
      options: [],
    };
    const next = applySnapshot(cats, snapshot);
    expect(next[0].products[0].sold_out).toBe(true);
  });

  it('un elemento ausente en el snapshot no se toca', () => {
    const cats = baseCategories();
    const snapshot: AvailabilitySnapshot = {
      as_of: 5,
      products: [{ id: 'p1', sold_out: true, available: true }],
      variants: [],
      options: [],
    };
    const next = applySnapshot(cats, snapshot);
    expect(next[0].products[1]).toBe(cats[0].products[1]);
  });
});

describe('shouldApply (as_of)', () => {
  it('descarta un evento con v <= as_of', () => {
    expect(shouldApply('product:p1', 5, new Map(), 5)).toBe(false);
    expect(shouldApply('product:p1', 4, new Map(), 5)).toBe(false);
    expect(shouldApply('product:p1', 6, new Map(), 5)).toBe(true);
  });

  it('descarta un evento con v <= lastV[elemento]', () => {
    const lastV = new Map([['product:p1', 10]]);
    expect(shouldApply('product:p1', 10, lastV, null)).toBe(false);
    expect(shouldApply('product:p1', 11, lastV, null)).toBe(true);
  });
});

// --- T046: índice de disponibilidad (línea afectada, US2) ---

function indexedCategories(): NamedCategory[] {
  return [
    {
      products: [
        {
          id: 'granizado',
          name: 'Granizado de mora',
          sold_out: false,
          available: true,
          variants: [
            {
              id: 'v-16oz',
              name: '16 oz',
              available: true,
              option_groups: [
                { options: [{ id: 'o-mora', name: 'Mora', available: true }] },
              ],
            },
            { id: 'v-24oz', name: '24 oz', available: true },
          ],
          toppings: [{ id: 'tp-crema', name: 'Crema', available: true }],
        },
        {
          id: 'paleta',
          name: 'Paleta de coco',
          sold_out: false,
          available: true,
          variants: [{ id: 'v-paleta', name: 'Única', available: true }],
        },
      ],
    },
  ];
}

describe('buildAvailabilityIndex / applyChangesToIndex / applySnapshotToIndex', () => {
  it('indexa productos, presentaciones, opciones y adiciones por id', () => {
    const index = buildAvailabilityIndex(indexedCategories());
    expect(index.products.get('granizado')?.name).toBe('Granizado de mora');
    expect(index.variants.get('v-16oz')?.productName).toBe('Granizado de mora');
    expect(index.options.get('o-mora')?.name).toBe('Mora');
    expect(index.toppings.get('tp-crema')?.name).toBe('Crema');
  });

  it('applyChangesToIndex solo copia el índice (nunca el llamador debe mutar categories())', () => {
    const index = buildAvailabilityIndex(indexedCategories());
    const next = applyChangesToIndex(index, [
      { kind: 'product', id: 'granizado', sold_out: true, available: true },
    ]);
    expect(next).not.toBe(index);
    expect(next.products.get('granizado')?.soldOut).toBe(true);
    expect(index.products.get('granizado')?.soldOut).toBe(false);
  });

  it('es inmutable: misma referencia si nada cambió', () => {
    const index = buildAvailabilityIndex(indexedCategories());
    const next = applyChangesToIndex(index, [
      { kind: 'product', id: 'granizado', sold_out: false, available: true },
    ]);
    expect(next).toBe(index);
  });

  it('un cambio de producto agotado también agota su adición homónima (comparte id con su propio producto-adición)', () => {
    const index = buildAvailabilityIndex(indexedCategories());
    const next = applyChangesToIndex(index, [
      { kind: 'product', id: 'tp-crema', sold_out: false, available: false },
    ]);
    expect(next.toppings.get('tp-crema')?.available).toBe(false);
  });

  it('applySnapshotToIndex reemplaza el estado de lo que trae', () => {
    const index = buildAvailabilityIndex(indexedCategories());
    const snapshot: AvailabilitySnapshot = {
      as_of: 1,
      products: [],
      variants: [{ id: 'v-16oz', product_id: 'granizado', available: false }],
      options: [],
    };
    const next = applySnapshotToIndex(index, snapshot);
    expect(next.variants.get('v-16oz')?.available).toBe(false);
    expect(next.variants.get('v-24oz')?.available).toBe(true);
  });
});

describe('affectedElement', () => {
  it('producto agotado (manual o inventario) -> su nombre', () => {
    let index = buildAvailabilityIndex(indexedCategories());
    index = applyChangesToIndex(index, [
      { kind: 'product', id: 'granizado', sold_out: true, available: true },
    ]);
    const label = affectedElement(
      { variantId: 'v-16oz', optionIds: [], toppingIds: [] },
      index,
      false,
    );
    expect(label).toBe('Granizado de mora');
  });

  it('presentación agotada -> "Producto · presentación"', () => {
    let index = buildAvailabilityIndex(indexedCategories());
    index = applyChangesToIndex(index, [
      { kind: 'variant', id: 'v-16oz', product_id: 'granizado', available: false },
    ]);
    const label = affectedElement(
      { variantId: 'v-16oz', optionIds: [], toppingIds: [] },
      index,
      false,
    );
    expect(label).toBe('Granizado de mora · 16 oz');
  });

  it('opción elegida agotada (sabor) -> su nombre', () => {
    let index = buildAvailabilityIndex(indexedCategories());
    index = applyChangesToIndex(index, [{ kind: 'option', id: 'o-mora', available: false }]);
    const label = affectedElement(
      { variantId: 'v-16oz', optionIds: ['o-mora'], toppingIds: [] },
      index,
      false,
    );
    expect(label).toBe('Mora');
  });

  it('adición elegida agotada -> su nombre', () => {
    let index = buildAvailabilityIndex(indexedCategories());
    index = applyChangesToIndex(index, [
      { kind: 'product', id: 'tp-crema', sold_out: true, available: true },
    ]);
    const label = affectedElement(
      { variantId: 'v-16oz', optionIds: [], toppingIds: ['tp-crema'] },
      index,
      false,
    );
    expect(label).toBe('Crema');
  });

  it('conflicto de cantidad -> mensaje fijo', () => {
    const index = buildAvailabilityIndex(indexedCategories());
    const label = affectedElement(
      { variantId: 'v-16oz', optionIds: [], toppingIds: [] },
      index,
      true,
    );
    expect(label).toBe('No alcanza para esa cantidad');
  });

  it('la marca se retira sola al volver el elemento disponible', () => {
    let index = buildAvailabilityIndex(indexedCategories());
    index = applyChangesToIndex(index, [
      { kind: 'variant', id: 'v-16oz', product_id: 'granizado', available: false },
    ]);
    index = applyChangesToIndex(index, [
      { kind: 'variant', id: 'v-16oz', product_id: 'granizado', available: true },
    ]);
    const label = affectedElement(
      { variantId: 'v-16oz', optionIds: [], toppingIds: [] },
      index,
      false,
    );
    expect(label).toBeNull();
  });

  it('otra presentación del mismo producto que sigue disponible no se marca', () => {
    let index = buildAvailabilityIndex(indexedCategories());
    index = applyChangesToIndex(index, [
      { kind: 'variant', id: 'v-16oz', product_id: 'granizado', available: false },
    ]);
    const label = affectedElement(
      { variantId: 'v-24oz', optionIds: [], toppingIds: [] },
      index,
      false,
    );
    expect(label).toBeNull();
  });
});

describe('soldOutMessage', () => {
  it('singular', () => {
    expect(soldOutMessage(['Granizado de mora · 16 oz'])).toBe(
      'Se agotó: Granizado de mora · 16 oz. Quítalo para continuar',
    );
  });

  it('plural', () => {
    expect(soldOutMessage(['Granizado de mora', 'Paleta de coco'])).toBe(
      'Se agotaron: Granizado de mora, Paleta de coco. Quítalos para continuar',
    );
  });
});

// --- T077: 409 unificado por agotado (US3) ---

describe('parseSoldOutConflict', () => {
  it('lee el detail de un 409 con agotados[]', () => {
    const conflict: SoldOutConflict = {
      error: 'Se agotó: Granizado de mora. Quítalo para continuar',
      productos_agotados: ['Granizado de mora'],
      agotados: [
        { id: 'granizado', tipo: 'producto', nombre: 'Granizado de mora', producto_id: 'granizado', motivo: 'manual' },
      ],
    };
    const err = { status: 409, error: { detail: conflict } };
    expect(parseSoldOutConflict(err)).toEqual(conflict);
  });

  it('devuelve null si no es 409', () => {
    expect(parseSoldOutConflict({ status: 400, error: { detail: { agotados: [] } } })).toBeNull();
  });

  it('devuelve null para el 409 productos_no_disponibles de la spec 128 (sin agotados[])', () => {
    const err = { status: 409, error: { detail: { error: 'x', productos_no_disponibles: ['y'] } } };
    expect(parseSoldOutConflict(err)).toBeNull();
  });

  it('devuelve null para cualquier otro valor', () => {
    expect(parseSoldOutConflict(null)).toBeNull();
    expect(parseSoldOutConflict(undefined)).toBeNull();
    expect(parseSoldOutConflict('boom')).toBeNull();
  });
});

describe('changesFromConflict', () => {
  it('motivo manual en un producto -> sold_out:true, available sin tocar', () => {
    const conflict: SoldOutConflict = {
      error: 'x', productos_agotados: ['Paleta de coco'],
      agotados: [
        { id: 'paleta', tipo: 'producto', nombre: 'Paleta de coco', producto_id: 'paleta', motivo: 'manual' },
      ],
    };
    const changes = changesFromConflict(conflict, buildAvailabilityIndex(indexedCategories()));
    expect(changes).toEqual([{ kind: 'product', id: 'paleta', sold_out: true, available: true }]);
  });

  it('motivo inventario en un producto -> available:false, sold_out sin tocar', () => {
    const conflict: SoldOutConflict = {
      error: 'x', productos_agotados: ['Paleta de coco'],
      agotados: [
        { id: 'paleta', tipo: 'producto', nombre: 'Paleta de coco', producto_id: 'paleta', motivo: 'inventario' },
      ],
    };
    const changes = changesFromConflict(conflict, buildAvailabilityIndex(indexedCategories()));
    expect(changes).toEqual([{ kind: 'product', id: 'paleta', sold_out: false, available: false }]);
  });

  it('motivo inventario en una presentación -> cambio de variant', () => {
    const conflict: SoldOutConflict = {
      error: 'x', productos_agotados: ['Granizado de mora · 16 oz'],
      agotados: [
        { id: 'v-16oz', tipo: 'presentacion', nombre: 'Granizado de mora · 16 oz', producto_id: 'granizado', motivo: 'inventario' },
      ],
    };
    const changes = changesFromConflict(conflict, buildAvailabilityIndex(indexedCategories()));
    expect(changes).toEqual([
      { kind: 'variant', id: 'v-16oz', product_id: 'granizado', available: false },
    ]);
  });

  it('motivo inventario en una opción -> cambio de option', () => {
    const conflict: SoldOutConflict = {
      error: 'x', productos_agotados: ['Mora'],
      agotados: [
        { id: 'o-mora', tipo: 'opcion', nombre: 'Mora', producto_id: 'granizado', motivo: 'inventario' },
      ],
    };
    const changes = changesFromConflict(conflict, buildAvailabilityIndex(indexedCategories()));
    expect(changes).toEqual([{ kind: 'option', id: 'o-mora', available: false }]);
  });

  it('motivo cantidad no genera ningún cambio de catálogo', () => {
    const conflict: SoldOutConflict = {
      error: 'x', productos_agotados: ['Granizado de mora · 16 oz'],
      agotados: [
        { id: 'v-16oz', tipo: 'presentacion', nombre: 'Granizado de mora · 16 oz', producto_id: 'granizado', motivo: 'cantidad' },
      ],
    };
    expect(changesFromConflict(conflict, buildAvailabilityIndex(indexedCategories()))).toEqual([]);
  });

  it('mezcla manual + cantidad: solo el manual se convierte en cambio', () => {
    const conflict: SoldOutConflict = {
      error: 'x', productos_agotados: ['Paleta de coco', 'Granizado de mora · 16 oz'],
      agotados: [
        { id: 'paleta', tipo: 'producto', nombre: 'Paleta de coco', producto_id: 'paleta', motivo: 'manual' },
        { id: 'v-16oz', tipo: 'presentacion', nombre: 'Granizado de mora · 16 oz', producto_id: 'granizado', motivo: 'cantidad' },
      ],
    };
    const changes = changesFromConflict(conflict, buildAvailabilityIndex(indexedCategories()));
    expect(changes).toEqual([{ kind: 'product', id: 'paleta', sold_out: true, available: true }]);
  });
});
