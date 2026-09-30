import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductSelectComponent, ProductSelection } from './product-select.component';
import {
  MenuOption,
  MenuOptionGroup,
  MenuProduct,
  MenuVariant,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';

function makeOption(partial: Partial<MenuOption> = {}): MenuOption {
  return { id: 'o1', name: 'Opción', extra_price: 0, available: true, ...partial };
}

function makeGroup(partial: Partial<MenuOptionGroup> = {}): MenuOptionGroup {
  return {
    id: 'g1', name: 'Grupo', min_select: 0, max_select: 1, consume: false,
    selection_mode: 'conteo', max_quantity_per_option: null, max_total_quantity: null,
    options: [],
    ...partial,
  };
}

function makeVariant(partial: Partial<MenuVariant> = {}): MenuVariant {
  return {
    id: 'v1', name: 'Única', price: 15000, available: true, option_groups: [],
    ...partial,
  };
}

function makeProduct(partial: Partial<MenuProduct> = {}): MenuProduct {
  return {
    id: 'p1', name: 'Producto', description: null, image_url: null,
    variants: [makeVariant()], option_groups: [], available: true,
    ...partial,
  };
}

describe('ProductSelectComponent', () => {
  let fixture: ComponentFixture<ProductSelectComponent>;
  let component: ProductSelectComponent;

  function create(product: MenuProduct): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductSelectComponent] });
    fixture = TestBed.createComponent(ProductSelectComponent);
    component = fixture.componentInstance;
    component.product = product;
    fixture.detectChanges(); // ngOnInit
  }

  function stepperButtons(optionName: string): { minus: HTMLButtonElement; plus: HTMLButtonElement; qty: string } {
    const rows = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="cantidad-row"]')) as HTMLElement[];
    const row = rows.find((r) => r.textContent?.includes(optionName));
    if (!row) throw new Error(`No se encontró la fila de "${optionName}"`);
    return {
      minus: row.querySelector('[data-testid="qty-minus"]') as HTMLButtonElement,
      plus: row.querySelector('[data-testid="qty-plus"]') as HTMLButtonElement,
      qty: (row.querySelector('[data-testid="qty-value"]') as HTMLElement).textContent!.trim(),
    };
  }

  // ── Grupo "conteo" (comportamiento existente, sin regresión) ───────────────

  it('un grupo "conteo" muestra el toggle de siempre, no el stepper', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'conteo', max_select: 2, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    const toggleButtons = fixture.nativeElement.querySelectorAll('[data-testid="conteo-option"]');
    expect(toggleButtons.length).toBeGreaterThan(0);
  });

  it('confirmar un grupo "conteo" emite quantity: 1 por opción elegida', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'conteo', min_select: 1, max_select: 1, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.toggleOption(group, bobombun);
    fixture.detectChanges();

    let emitted: ProductSelection | undefined;
    component.added.subscribe((sel) => (emitted = sel));
    component.confirm();

    expect(emitted?.options).toEqual([{ option: bobombun, quantity: 1, groupName: group.name }]);
  });

  // ── Grupo "cantidad" (spec 065, US2) ────────────────────────────────────────

  it('un grupo "cantidad" muestra el stepper +/- por opción, no el toggle', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));
    component.toggleGroup(group.id); // "cantidad" arranca plegado: isComplete() siempre true
    fixture.detectChanges();

    const { minus, plus, qty } = stepperButtons('Bobombún');
    expect(minus).toBeTruthy();
    expect(plus).toBeTruthy();
    expect(qty).toBe('0');
  });

  it('incrementar dos opciones distintas de un grupo "cantidad" queda reflejado en ProductSelection.options', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const gomitas = makeOption({ id: 'g1o', name: 'Gomitas' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun, gomitas] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.incrementOption(group, bobombun);
    component.incrementOption(group, gomitas);
    fixture.detectChanges();

    let emitted: ProductSelection | undefined;
    component.added.subscribe((sel) => (emitted = sel));
    component.confirm();

    expect(emitted?.options.length).toBe(2);
    expect(emitted?.options.find((c) => c.option.id === bobombun.id)?.quantity).toBe(2);
    expect(emitted?.options.find((c) => c.option.id === gomitas.id)?.quantity).toBe(1);
  });

  it('bajar una opción a 0 la retira de la selección', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.decrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.optionQuantity(group.id, bobombun.id)).toBe(0);
  });

  it('canConfirm() nunca se bloquea por un grupo "cantidad" en 0, incluso con min_select heredado', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    // min_select=1 no debería importar en modo "cantidad" (regresión del backend, FR-003).
    const group = makeGroup({ selection_mode: 'cantidad', min_select: 1, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    expect(component.canConfirm()).toBe(true);
    expect(component.blockingLabel()).toBeNull();
  });

  it('el precio de línea multiplica extra_price por la cantidad elegida', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún', extra_price: 1000 });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ price: 15000, option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.incrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.lineTotal()).toBe(17000); // 15000 + 2*1000
  });

  // ── Precio de línea con promoción de paquete (bug fix) ──────────────────────

  it('el precio de línea NO aplica el precio de paquete si la cantidad no alcanza min_qty de la promoción', () => {
    const promo: MenuVariantPromotion = {
      condition_text: 'Llevando 2 Pequeño 8oz pagas $12.000',
      short_condition: '2 x $12.000',
      unit_equivalent: 6000,
      unit_equivalent_approx: false,
      unit_equivalent_text: '$6.000 c/u',
      display_text: '2 x $12.000 · $6.000 c/u',
      type: 'package_price',
      min_qty: 2,
      value: 12000,
    };
    create(makeProduct({
      variants: [makeVariant({
        price: 8000, discounted_price: 6000, discount_kind: 'package_price', promotion: promo,
      })],
    }));

    // Cantidad arranca en 1: no alcanza el min_qty=2 de la promoción -> precio normal.
    expect(component.lineTotal()).toBe(8000);

    component.inc(); // Cantidad = 2: ahora sí califica para el precio de paquete.
    expect(component.lineTotal()).toBe(12000); // 6000 * 2
  });

  it('el precio de línea aplica el precio de paquete a partir de `promotion.unit_equivalent` cuando el backend no pobló discounted_price (min_qty > 1, caso real del menú)', () => {
    // spec 066 / menu_unit_discount (backend): con min_qty > 1 el backend deja
    // discounted_price/discount_kind en null a propósito -- al navegar el menú
    // sin carrito no puede prometer un precio que depende de una cantidad que
    // el comensal aún no eligió. `promotion.unit_equivalent` sí llega siempre.
    const promo: MenuVariantPromotion = {
      condition_text: 'Llevando 2 Pequeña pagas $7.000',
      short_condition: '2 x $7.000',
      unit_equivalent: 3500,
      unit_equivalent_approx: false,
      unit_equivalent_text: '$3.500 c/u',
      display_text: '2 x $7.000 · $3.500 c/u',
      type: 'package_price',
      min_qty: 2,
      value: 7000,
    };
    create(makeProduct({
      variants: [makeVariant({
        price: 15000, discounted_price: null, discount_kind: null, promotion: promo,
      })],
    }));

    // Cantidad arranca en 1: no alcanza el min_qty=2 -> precio normal.
    expect(component.lineTotal()).toBe(15000);

    component.inc(); // Cantidad = 2: ahora sí califica.
    expect(component.lineTotal()).toBe(7000); // 3500 * 2, no 15000 * 2
  });

  it('con min_qty > 1 el remanente que no completa otro bloque va a precio normal, como en el motor real del cobro (_greedy_units)', () => {
    const promo: MenuVariantPromotion = {
      condition_text: 'Llevando 2 Pequeña pagas $7.000',
      short_condition: '2 x $7.000',
      unit_equivalent: 3500,
      unit_equivalent_approx: false,
      unit_equivalent_text: '$3.500 c/u',
      display_text: '2 x $7.000 · $3.500 c/u',
      type: 'package_price',
      min_qty: 2,
      value: 7000,
    };
    create(makeProduct({
      variants: [makeVariant({
        price: 15000, discounted_price: null, discount_kind: null, promotion: promo,
      })],
    }));

    for (let i = 1; i < 3; i++) component.inc();
    expect(component.lineTotal()).toBe(22000); // Cantidad = 3: 1 paquete (7000) + 1 normal (15000)

    component.inc();
    expect(component.lineTotal()).toBe(14000); // Cantidad = 4: 2 paquetes (2*7000), sin remanente

    component.inc();
    expect(component.lineTotal()).toBe(29000); // Cantidad = 5: 2 paquetes (14000) + 1 normal (15000)
  });

  // ── Topes de cantidad (spec 065, US4) ───────────────────────────────────────

  it('el botón "+" de una opción se deshabilita al alcanzar max_quantity_per_option', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', max_quantity_per_option: 2, options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));
    component.toggleGroup(group.id);

    component.incrementOption(group, bobombun);
    component.incrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.optionQuantity(group.id, bobombun.id)).toBe(2);
    expect(component.canIncrement(group, bobombun)).toBe(false);
    const { plus } = stepperButtons('Bobombún');
    expect(plus.disabled).toBe(true);
  });

  it('al alcanzar max_total_quantity se deshabilitan todos los "+" del grupo, aunque ninguna opción llegue a su propio tope', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const gomitas = makeOption({ id: 'g1o', name: 'Gomitas' });
    const group = makeGroup({
      selection_mode: 'cantidad', max_quantity_per_option: 3, max_total_quantity: 2,
      options: [bobombun, gomitas],
    });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    component.incrementOption(group, bobombun);
    component.incrementOption(group, gomitas);
    fixture.detectChanges();

    expect(component.canIncrement(group, bobombun)).toBe(false);
    expect(component.canIncrement(group, gomitas)).toBe(false);
  });

  it('sin topes configurados, el botón "+" nunca se deshabilita por cuenta propia', () => {
    const bobombun = makeOption({ id: 'b1', name: 'Bobombún' });
    const group = makeGroup({ selection_mode: 'cantidad', options: [bobombun] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    for (let i = 0; i < 10; i++) component.incrementOption(group, bobombun);
    fixture.detectChanges();

    expect(component.optionQuantity(group.id, bobombun.id)).toBe(10);
    expect(component.canIncrement(group, bobombun)).toBe(true);
  });
});

/**
 * spec 066 — `ProductSelectComponent` es el modal de presentaciones y está
 * **compartido** por el menú QR del comensal (`public-menu.component.ts`) y por las
 * dos superficies del cajero (`manual-order-page`, `pos-catalog-drawer`). Por eso
 * el cambio de FR-007 y el de FR-016 son **uno solo**, sin ramas por superficie:
 * SC-005 se cumple por construcción (research.md D-9).
 *
 * Lo que este spec protege:
 *  - la línea informativa aparece solo cuando el backend pobló `promotion`;
 *  - el tachado sale de **comparar** dos importes que ya llegaron, no de recalcular
 *    ninguno (FR-015, research.md D-7);
 *  - un precio de paquete no fabrica una insignia de porcentaje (research.md D-13).
 *
 * El componente no tenía spec: nace con esta spec.
 */
function variante(over: Partial<MenuVariant> = {}): MenuVariant {
  return {
    id: 'v1',
    name: 'Pequeño 8oz',
    price: 8000,
    discounted_price: null,
    discount_kind: null,
    promotion: null,
    option_groups: [],
    available: true,
    ...over,
  };
}

function promocion(over: Partial<MenuVariantPromotion> = {}): MenuVariantPromotion {
  return {
    condition_text: 'Llevando 2 Pequeño 8oz pagas $12.000',
    short_condition: '2 x $12.000',
    unit_equivalent: 6000,
    unit_equivalent_approx: false,
    unit_equivalent_text: '$6.000 c/u',
    display_text: '2 x $12.000 · $6.000 c/u',
    type: 'package_price',
    min_qty: 2,
    value: 12000,
    ...over,
  };
}

function producto(variants: MenuVariant[]): MenuProduct {
  return {
    id: 'p1',
    name: 'Granizado de café',
    description: null,
    image_url: null,
    variants,
    option_groups: [],
    available: true,
  };
}

describe('ProductSelectComponent — información de promoción (spec 066)', () => {
  let fixture: ComponentFixture<ProductSelectComponent>;

  function render(variants: MenuVariant[]): HTMLElement {
    fixture = TestBed.createComponent(ProductSelectComponent);
    fixture.componentInstance.product = producto(variants);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProductSelectComponent] }).compileComponents();
  });

  it('FR-008: la fila con promoción pinta el texto compuesto por el backend', () => {
    const el = render([variante({ promotion: promocion() })]);

    expect(el.textContent).toContain('2 x $12.000 · $6.000 c/u');
  });

  it('FR-008: la fila sin promoción no pinta ninguna línea informativa', () => {
    const el = render([variante()]);

    expect(el.textContent).not.toContain('c/u');
  });

  it('FR-016: la condición completa de la presentación elegida se muestra bajo la lista', () => {
    const el = render([variante({ promotion: promocion() })]);

    expect(el.textContent).toContain('Llevando 2 Pequeño 8oz pagas $12.000');
  });

  it('precio vigente menor que el normal: tachado + precio vigente', () => {
    const el = render([
      variante({ discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.querySelector('.line-through')).not.toBeNull();
  });

  it('FR-015: precio vigente mayor o igual que el normal -> sin tachado ni señal de descuento', () => {
    // El caso de research.md D-6: la regla se activó cuando $6.000 sí era descuento y
    // después el catálogo bajó a $5.000. El importe mostrado sigue siendo el que el
    // cobro aplica, pero no se anuncia como ahorro.
    const el = render([
      variante({ price: 5000, discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.querySelector('.line-through')).toBeNull();
    expect(el.querySelector('.bg-rose-100')).toBeNull();
  });

  it('D-13: un precio de paquete no fabrica insignia de porcentaje', () => {
    const el = render([
      variante({ discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.querySelector('.bg-rose-100')).toBeNull();
    expect(el.textContent).not.toContain('-25%');
  });

  it('un porcentaje sí conserva su insignia (no-regresión)', () => {
    const el = render([variante({ discounted_price: 7200, discount_kind: 'percent' })]);

    expect(el.querySelector('.bg-rose-100')).not.toBeNull();
    expect(el.textContent).toContain('-10%');
  });

  it('Agotado gana a todo, incluida la información de promoción', () => {
    const el = render([
      variante({ available: false, discounted_price: 6000, discount_kind: 'package_price' }),
    ]);

    expect(el.textContent).toContain('Agotado');
    expect(el.querySelector('.line-through')).toBeNull();
  });

  it('solo la presentación cubierta lleva línea informativa', () => {
    const el = render([
      variante({ id: 'v1', name: 'Pequeño 8oz', promotion: promocion() }),
      variante({ id: 'v2', name: 'Mediano 12oz', price: 10000 }),
    ]);

    const lineas = el.textContent?.match(/c\/u/g) ?? [];
    expect(lineas.length).toBe(1);
  });

  // ── spec 087, FR-014 (US8): presentación siempre visible junto a la promoción ──

  it('FR-014: la fila con promoción muestra el nombre de la presentación y la promoción por separado (nunca solo la promoción)', () => {
    const el = render([variante({ name: 'Pequeño 8oz', promotion: promocion() })]);

    const nombre = el.querySelector('[data-testid="variant-name"]') as HTMLElement;
    const promo = el.querySelector('[data-testid="variant-promo"]') as HTMLElement;
    expect(nombre.textContent?.trim()).toBe('Pequeño 8oz');
    expect(promo.textContent).toContain('c/u');
    expect(nombre).not.toBe(promo);
    expect(nombre.contains(promo)).toBe(false);
  });

  it('FR-014: la fila sin promoción no renderiza el elemento de la etiqueta', () => {
    const el = render([variante({ name: 'Mediano 12oz' })]);

    expect(el.querySelector('[data-testid="variant-name"]')?.textContent?.trim()).toBe('Mediano 12oz');
    expect(el.querySelector('[data-testid="variant-promo"]')).toBeNull();
  });

  it('FR-014: el nombre se ajusta en varias líneas (sin `truncate`) y la etiqueta de promoción baja de línea en vez de truncarse', () => {
    const el = render([
      variante({
        name: 'Presentación familiar extra grande con salsa de la casa',
        promotion: promocion(),
      }),
    ]);

    const nombre = el.querySelector('[data-testid="variant-name"]') as HTMLElement;
    const promo = el.querySelector('[data-testid="variant-promo"]') as HTMLElement;
    expect(nombre.classList.contains('truncate')).toBe(false);
    expect(nombre.classList.contains('break-words')).toBe(true);
    expect(promo.classList.contains('truncate')).toBe(false);
    expect(promo.classList.contains('whitespace-normal')).toBe(true);
    expect(promo.classList.contains('break-words')).toBe(true);
  });
});

// ── `[initialSelection]`: precarga para editar una línea ya agregada
// (rediseño create-order/code.html) ─────────────────────────────────────────
describe('ProductSelectComponent — [initialSelection] (edición de una línea del carrito)', () => {
  let fixture: ComponentFixture<ProductSelectComponent>;
  let component: ProductSelectComponent;

  function create(product: MenuProduct, initialSelection: ProductSelection | null = null): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductSelectComponent] });
    fixture = TestBed.createComponent(ProductSelectComponent);
    component = fixture.componentInstance;
    component.product = product;
    component.initialSelection = initialSelection;
    fixture.detectChanges(); // ngOnInit
  }

  it('sin initialSelection, preselecciona la primera variante disponible (no regresión)', () => {
    const v1 = makeVariant({ id: 'v1' });
    const v2 = makeVariant({ id: 'v2' });
    create(makeProduct({ variants: [v1, v2] }));

    expect(component.variantId()).toBe('v1');
  });

  it('con initialSelection, precarga variante, cantidad y notas', () => {
    const v1 = makeVariant({ id: 'v1' });
    const v2 = makeVariant({ id: 'v2' });
    const product = makeProduct({ variants: [v1, v2] });
    create(product, {
      product,
      variant: v2,
      options: [],
      quantity: 3,
      notes: 'Sin frutos secos',
    });

    expect(component.variantId()).toBe('v2');
    expect(component.quantity()).toBe(3);
    expect(component.notes()).toBe('Sin frutos secos');
  });

  it('con initialSelection, precarga las opciones elegidas resolviendo su grupo por búsqueda (MenuOption no lleva group_id)', () => {
    const topping = makeOption({ id: 'top1', name: 'Chispas' });
    const group = makeGroup({ id: 'g1', options: [topping] });
    const variant = makeVariant({ id: 'v1', option_groups: [group] });
    const product = makeProduct({ variants: [variant] });
    create(product, {
      product,
      variant,
      options: [{ option: topping, quantity: 1, groupName: group.name }],
      quantity: 1,
      notes: null,
    });

    expect(component.optionQuantity(group.id, topping.id)).toBe(1);
  });

  it('el botón de confirmar dice "Guardar cambios" en modo edición, "Agregar" si no', () => {
    const variant = makeVariant({ id: 'v1' });
    const product = makeProduct({ variants: [variant] });

    create(product, { product, variant, options: [], quantity: 1, notes: null });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Guardar cambios');

    create(product);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Guardar cambios');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Agregar');
  });
});

// ── spec 081 (US2) — paso de cantidad al abrir desde "Promociones" ─────────
// Algoritmo reactivo revisado tras /speckit-analyze (hallazgo C1): `quantity`
// se resincroniza cada vez que `minQty`/`existingQty` cambian, lo que incluye
// un cambio de variante dentro del modal (contrato §2).
describe('ProductSelectComponent — [fromPromotions]/[existingQtyFor] (spec 081)', () => {
  let fixture: ComponentFixture<ProductSelectComponent>;
  let component: ProductSelectComponent;

  function create(
    product: MenuProduct,
    opts: { fromPromotions?: boolean; existingQtyFor?: (variantId: string, optionKey: string) => number } = {},
  ): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductSelectComponent] });
    fixture = TestBed.createComponent(ProductSelectComponent);
    component = fixture.componentInstance;
    component.product = product;
    if (opts.fromPromotions !== undefined) component.fromPromotions = opts.fromPromotions;
    if (opts.existingQtyFor) component.existingQtyFor = opts.existingQtyFor;
    fixture.detectChanges(); // ngOnInit
  }

  it('(a) fromPromotions == false (valor por defecto): quantity arranca en 1 y el paso es 1, aunque la variante tenga promoción (FR-005/FR-010, sin cambio)', () => {
    const v = makeVariant({ id: 'v1', promotion: promocion({ min_qty: 2 }) });
    create(makeProduct({ variants: [v] }));

    expect(component.quantity()).toBe(1);
    component.inc();
    expect(component.quantity()).toBe(2);
    component.inc();
    expect(component.quantity()).toBe(3); // de 1 en 1, no de 2 en 2
  });

  it('(b) fromPromotions == true, min_qty == 2, sin unidades previas: quantity arranca en 2 y avanza de 2 en 2', () => {
    const v = makeVariant({ id: 'v1', promotion: promocion({ min_qty: 2 }) });
    create(makeProduct({ variants: [v] }), { fromPromotions: true, existingQtyFor: () => 0 });

    expect(component.quantity()).toBe(2);
    component.inc();
    expect(component.quantity()).toBe(4);
    component.dec();
    expect(component.quantity()).toBe(2);
    component.dec(); // ya está en el mínimo: no baja de un paso completo dentro del modal
    expect(component.quantity()).toBe(2);
  });

  it('(c) fromPromotions == true, min_qty == 1: quantity arranca en 1, igual que si no viniera de "Promociones" (FR-005)', () => {
    const v = makeVariant({ id: 'v1', promotion: promocion({ min_qty: 1 }) });
    create(makeProduct({ variants: [v] }), { fromPromotions: true, existingQtyFor: () => 0 });

    expect(component.quantity()).toBe(1);
  });

  it('(d) fromPromotions == true, min_qty == 2, existingQtyFor devuelve 1: quantity arranca en 1 (múltiplo más cercano hacia arriba: 2 − 1), no en 2 (FR-012, hallazgo C2)', () => {
    const v = makeVariant({ id: 'v1', promotion: promocion({ min_qty: 2 }) });
    create(makeProduct({ variants: [v] }), { fromPromotions: true, existingQtyFor: () => 1 });

    expect(component.quantity()).toBe(1);
  });

  it('(e) cambiar de variante dentro del modal reajusta quantity de inmediato al nuevo min_qty, sin esperar a inc()/dec() (FR-011, hallazgo C1)', () => {
    const sinPromo = makeVariant({ id: 'v1', name: 'Sin promo' });
    const conPromo = makeVariant({ id: 'v2', name: 'Con promo', promotion: promocion({ min_qty: 2 }) });
    create(makeProduct({ variants: [sinPromo, conPromo] }), { fromPromotions: true, existingQtyFor: () => 0 });

    expect(component.quantity()).toBe(1); // arrancó en la variante sin promoción

    component.selectVariant(conPromo);
    fixture.detectChanges(); // fuerza el flush del effect() de resincronización
    expect(component.quantity()).toBe(2); // reajustada sin tocar inc()/dec()

    component.selectVariant(sinPromo);
    fixture.detectChanges();
    expect(component.quantity()).toBe(1); // vuelve a 1 al salir de la variante cubierta
  });

  it('confirm() emite stepQuantity == min_qty solo cuando fromPromotions && min_qty > 1', () => {
    const v = makeVariant({ id: 'v1', promotion: promocion({ min_qty: 2 }) });
    create(makeProduct({ variants: [v] }), { fromPromotions: true, existingQtyFor: () => 0 });

    let emitted: ProductSelection | undefined;
    component.added.subscribe((sel) => (emitted = sel));
    component.confirm();

    expect(emitted?.stepQuantity).toBe(2);
  });

  it('confirm() no emite stepQuantity fuera de "Promociones" (FR-010)', () => {
    const v = makeVariant({ id: 'v1', promotion: promocion({ min_qty: 2 }) });
    create(makeProduct({ variants: [v] })); // fromPromotions por defecto: false

    let emitted: ProductSelection | undefined;
    component.added.subscribe((sel) => (emitted = sel));
    component.confirm();

    expect(emitted?.stepQuantity).toBeUndefined();
  });

  // ── FR-015/FR-016, corregidos (tercera ronda): el precio con descuento
  // depende de si `quantity()` ya satisface `min_qty`, NUNCA de `fromPromotions`
  // ni de cómo se llegó al modal (buscador, categoría o "Promociones") ───────

  function headerPriceText(): string {
    return (fixture.nativeElement.querySelector('[data-testid="header-price"]') as HTMLElement)
      .textContent!.trim();
  }

  function packagePromo() {
    return promocion({
      min_qty: 2, type: 'package_price', value: 7000,
      short_condition: '2 x $7.000', unit_equivalent_text: '$3.500 c/u',
      display_text: '2 x $7.000 · $3.500 c/u',
    });
  }

  it('FR-015: con quantity() >= min_qty, el encabezado es el total con descuento (lineTotal()) — sin importar fromPromotions', () => {
    const v = makeVariant({ id: 'v1', price: 15000, promotion: packagePromo() });
    create(makeProduct({ variants: [v] })); // fromPromotions por defecto: false, como el buscador
    component.inc(); // 1 -> 2: alcanza min_qty a mano, igual que subir el "+" tras buscar el producto
    fixture.detectChanges();

    expect(component.quantity()).toBe(2);
    expect(component.lineTotal()).toBe(7000);
    expect(headerPriceText()).toContain('7.000');
    expect(headerPriceText()).not.toContain('15.000');
  });

  it('FR-015: con quantity() < min_qty, el encabezado sigue mostrando el precio de lista (startingPrice()), sin cambio', () => {
    const v = makeVariant({ id: 'v1', price: 15000, promotion: packagePromo() });
    create(makeProduct({ variants: [v] })); // quantity arranca en 1, min_qty == 2: no califica todavía

    expect(headerPriceText()).toContain('15.000');
  });

  it('FR-016: con quantity() >= min_qty, la fila tacha el precio de lista, muestra el total del paquete y la condición corta (sin "c/u")', () => {
    const v = makeVariant({ id: 'v1', price: 15000, promotion: packagePromo() });
    create(makeProduct({ variants: [v] }));
    component.inc(); // 1 -> 2
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('2 x $7.000');
    expect(el.textContent).not.toContain('$3.500 c/u');
    const struck = el.querySelector('.line-through');
    expect(struck?.textContent).toContain('15.000');
    expect(el.textContent).toContain('7.000'); // total del paquete, en negrita
  });

  it('FR-016: con quantity() < min_qty, la fila conserva display_text completo y el precio sin tachar', () => {
    const v = makeVariant({ id: 'v1', price: 15000, promotion: packagePromo() });
    create(makeProduct({ variants: [v] })); // quantity arranca en 1, no alcanza min_qty == 2

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('2 x $7.000 · $3.500 c/u');
    expect(el.querySelector('.line-through')).toBeNull();
  });

  it('FR-015/FR-016: activarse desde "Promociones" (fromPromotions == true) también muestra el descuento, sin cambio de comportamiento', () => {
    // El paso forzado de FR-004 ya deja quantity() en min_qty desde que se abre el modal.
    const v = makeVariant({ id: 'v1', price: 15000, promotion: packagePromo() });
    create(makeProduct({ variants: [v] }), { fromPromotions: true, existingQtyFor: () => 0 });

    expect(component.quantity()).toBe(2);
    expect(headerPriceText()).toContain('7.000');
    expect(fixture.nativeElement.querySelector('.line-through')?.textContent).toContain('15.000');
  });

  it('el botón de cerrar ya no usa el emoji ✕ (spec 082)', () => {
    create(makeProduct());
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('✕');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('close');
  });

  // ── spec 089 (A-94): adicionales cobrados una vez por línea (Menú QR) ───────

  describe('addonsPerLine (spec 089)', () => {
    function withTocino(addonsPerLine: boolean) {
      const tocino = makeOption({ id: 'toc', name: 'Tocino', extra_price: 3000 });
      const group = makeGroup({ id: 'ad', name: 'Adicionales', max_select: 3, options: [tocino] });
      create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));
      component.addonsPerLine = addonsPerLine;
      component.toggleOption(group, tocino);
      component.inc(); // cantidad = 2
      return { tocino, group };
    }

    it('2 hamburguesas de $15.000 con 1 tocino de $3.000 = $33.000, no $36.000', () => {
      withTocino(true);
      expect(component.lineTotal()).toBe(33000);
    });

    it('subir la cantidad a 3 no multiplica el adicional: $48.000', () => {
      withTocino(true);
      component.inc(); // cantidad = 3
      expect(component.lineTotal()).toBe(48000);
    });

    it('sin addonsPerLine (terminal POS, pedido manual) conserva el cálculo por unidad', () => {
      withTocino(false);
      expect(component.lineTotal()).toBe(36000); // (15000 + 3000) × 2
    });

    it('una opción de grupo incluido ($0) no suma con ninguna de las dos reglas', () => {
      const sabor = makeOption({ id: 'sab', name: 'Fresa', extra_price: 0 });
      const group = makeGroup({ id: 'sb', name: 'Sabores', max_select: 2, options: [sabor] });
      create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));
      component.addonsPerLine = true;
      component.toggleOption(group, sabor);
      component.inc();
      expect(component.lineTotal()).toBe(30000);
    });
  });

  // ── spec 089 (Historia 3): modo edición de una línea del carrito ────────────

  describe('editar adicionales de una línea (spec 089, Historia 3)', () => {
    function edicion(opts: { tocinoDisponible?: boolean } = {}) {
      const tocino = makeOption({ id: 'toc', name: 'Tocino', extra_price: 3000, available: opts.tocinoDisponible ?? true });
      const queso = makeOption({ id: 'que', name: 'Queso', extra_price: 2000 });
      const group = makeGroup({
        id: 'ad', name: 'Adicionales', selection_mode: 'cantidad', max_select: 3, options: [tocino, queso],
      });
      const variant = makeVariant({ option_groups: [group] });
      const product = makeProduct({ variants: [variant] });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [ProductSelectComponent] });
      fixture = TestBed.createComponent(ProductSelectComponent);
      component = fixture.componentInstance;
      component.product = product;
      component.addonsPerLine = true;
      component.quantityLocked = true;
      component.initialSelection = {
        product, variant, quantity: 2, notes: 'sin cebolla',
        options: [{ option: tocino, quantity: 1, groupName: 'Adicionales' }],
      };
      fixture.detectChanges();
      return { tocino, queso, group };
    }

    it('precarga el adicional y la nota; el botón dice "Guardar cambios" con el total por la regla nueva', () => {
      edicion();

      expect(component.notes()).toBe('sin cebolla');
      expect(component.optionQuantity('ad', 'toc')).toBe(1);
      expect(component.lineTotal()).toBe(33000); // 2 × 15.000 + 3.000
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Guardar cambios');
    });

    it('la cantidad de producto queda fija (sin +/−)', () => {
      edicion();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="cantidad-fija"]')?.textContent?.trim()).toBe('2');
      expect(el.querySelector('button[aria-label="Añadir uno"]')).toBeNull();
    });

    it('ignora existingQtyFor y el paso de la promoción: la cantidad no se reescribe al editar', () => {
      edicion();
      component.fromPromotions = true;
      component.existingQtyFor = () => 5;
      fixture.detectChanges();

      expect(component.quantity()).toBe(2);
      expect(component.minQty()).toBe(1);
    });

    it('se pueden dejar todos los adicionales en cero y guardar', () => {
      const { group, tocino } = edicion();
      component.decrementOption(group, tocino);
      fixture.detectChanges();

      let emitted: ProductSelection | undefined;
      component.added.subscribe((sel) => (emitted = sel));
      component.confirm();

      expect(emitted?.options).toEqual([]);
      expect(emitted?.quantity).toBe(2);
    });

    it('un adicional que se quedó sin stock aparece como "No disponible" y bloquea guardar hasta quitarlo', () => {
      const { group, tocino } = edicion({ tocinoDisponible: false });
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="no-disponibles"]')?.textContent).toContain('No disponible');
      expect(component.canConfirm()).toBe(false);
      expect(component.blockingLabel()).toContain('Quita «Tocino»');

      component.removeOption(group, tocino);
      fixture.detectChanges();

      expect(component.canConfirm()).toBe(true);
      expect(el.querySelector('[data-testid="no-disponibles"]')).toBeNull();
    });

    it('muestra el error del backend sin cerrar y avisa de los adicionales que ya no se ofrecen', () => {
      edicion();
      fixture.componentRef.setInput('externalError', 'Selección de opciones inválida');
      fixture.componentRef.setInput('staleOptionNames', ['Un adicional']);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="error-externo"]')?.textContent).toContain('Selección de opciones inválida');
      expect(el.querySelector('[data-testid="adicionales-retirados"]')?.textContent).toContain('se quitará');
    });
  });
});
