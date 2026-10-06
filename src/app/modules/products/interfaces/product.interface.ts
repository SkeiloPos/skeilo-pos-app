/**
 * Product domain models for the REST `/products`, `/variants`, `/option-groups`
 * and `/menu` APIs.
 *
 * The backend returns decimals (`price`, `extra_price`, `quantity`) as strings;
 * these domain types use `number`. The service handles the conversion.
 */

/** How a product is prepared. `prepared` = hecho al momento; `packaged` = empacado. */
export type PreparationType = 'prepared' | 'packaged';

/**
 * Tipo de precio de un grupo de opciones (spec 064). `incluido` = ya cubierto por el
 * precio de la presentación (un sabor de helado); sus opciones no pueden llevar
 * `extra_price` distinto de $0. `con_recargo` = cada opción cobra su propio precio (un
 * topping).
 */
export type OptionGroupPricingType = 'incluido' | 'con_recargo';

/**
 * Modo de selección de un grupo de opciones (spec 065). `conteo` (default) = el
 * comportamiento de hoy, `min_select`/`max_select` cuentan opciones distintas.
 * `cantidad` = el cliente elige unidades libres por opción, sin mínimo posible;
 * `min_select`/`max_select` se ignoran en ese modo.
 */
export type OptionGroupSelectionMode = 'conteo' | 'cantidad';

// --- Products ---

/** A product (list/detail). Mirrors backend `ProductResponse`/`ProductListResponse`. */
export interface Product {
  id: string;
  category_id: string;
  /** spec 097: resuelto por el backend, sin depender de `GET /categories` (tope 100
   *  por página) cargado aparte en el cliente. */
  category_name: string | null;
  name: string;
  description: string | null;
  preparation_type: PreparationType;
  image_url: string | null;
  active: boolean;
  /** Disponibilidad operativa ('agotado temporal'), distinta de `active` (RF-006). */
  available: boolean;
  /** spec 093 (FR-013): quién marcó/desmarcó `available` por última vez y cuándo.
   *  `null` = nunca se tocó el interruptor dedicado. */
  available_changed_at: string | null;
  available_changed_by_name: string | null;
  /** Si el producto exige y aplica descuento de inventario en sus presentaciones. */
  tracks_inventory: boolean;
  created_at: string;
  updated_at?: string | null;
}

/**
 * `GET /products/{id}` (spec 093, escenario 9): el detalle de solo lectura de la Carta
 * del menú, con las presentaciones activas y su precio -- sin receta ni grupos de
 * opciones (FR-018). Usado por {@link ProductDetailPageComponent}.
 */
export interface ProductDetail extends Product {
  variants: Variant[];
}

/** Editable fields captured by the product create/edit forms. */
export interface ProductForm {
  category_id: string;
  name: string;
  description: string;
  preparation_type: PreparationType;
  image_url: string;
  /**
   * Imagen que el formulario mostraba al abrirse (spec 088): `null` si el producto no tenía
   * ninguna. Solo se usa al editar; el backend ignora en silencio una imagen enviada si esta
   * base no coincide con la vigente (formulario desactualizado).
   */
  image_url_base?: string | null;
}

/** `POST /products` (`ProductCreate`). */
export interface ProductCreatePayload {
  category_id: string;
  name: string;
  description?: string | null;
  preparation_type: PreparationType;
  image_url?: string | null;
  tracks_inventory?: boolean;
  /**
   * Presentaciones iniciales, con receta y grupos de opciones (spec 043). Vacío/ausente = se
   * crea automáticamente la presentación "Single" a precio 0 (`RN-CAT-05`), igual que hoy.
   */
  variants?: VariantSavePayload[];
}

/** `PATCH`/`PUT /products/{id}` (`ProductUpdate`) — all optional. */
export interface ProductUpdatePayload {
  category_id?: string;
  name?: string;
  description?: string | null;
  preparation_type?: PreparationType;
  image_url?: string | null;
  /**
   * Imagen que el formulario mostraba al abrirse (spec 088, FR-002). Se envía siempre al
   * guardar una edición (`null` explícito si el producto no tenía imagen: "no enviada" y `null`
   * son distintos para el backend); `image_url` solo viaja si la imagen realmente cambió.
   */
  image_url_base?: string | null;
  active?: boolean;
  available?: boolean;
  tracks_inventory?: boolean;
  /**
   * Árbol completo de presentaciones deseado (spec 043). Ausente del body = no tocar ninguna
   * presentación (back-compat). Presente (incluso `[]`) = reemplazo total: crea las entradas sin
   * `id`, actualiza las que traen `id`, desactiva cualquier presentación activa no listada.
   */
  variants?: VariantSavePayload[];
}

/**
 * Una presentación dentro del árbol de `POST`/`PATCH`/`PUT /products` (spec 043,
 * `VariantSaveIn`). `id` ausente crea una presentación nueva; presente actualiza esa fila. La
 * posición dentro de `variants[]` determina su `display_order` (1-based).
 */
export interface VariantSavePayload {
  id?: string;
  price: number;
  sku?: string | null;
  /** `false` explícito desactiva la presentación en el mismo guardado (equivalente a un
   *  `DELETE /variants/{id}` de hoy, pero dentro de la transacción consolidada). Default `true`. */
  active?: boolean;
  recipe: RecipeItem[];
  option_groups: VariantOptionGroup[];
  /** spec 084 (A-79): la variante no tiene nombre propio; lo da su presentación del
   *  catálogo. `null` = "Presentación única" (productos sin tamaños). */
  presentation_id: string | null;
}

// --- Variants ---

/** A product variant (a concrete priced option, e.g. "Pequeño"). Mirrors `VariantResponse`. */
export interface Variant {
  id: string;
  product_id: string;
  sku: string | null;
  price: number;
  active: boolean;
  /** spec 084 (A-79): presentación del catálogo que nombra a la variante (siempre presente). */
  presentation_id: string;
  presentation_name: string;
}

/** Editable fields captured by the variant form. */
export interface VariantForm {
  /** `null` = "Presentación única". */
  presentation_id: string | null;
  price: number;
  sku: string | null;
}

/** `POST /products/{id}/variants` (`VariantCreate`). */
export interface VariantCreatePayload {
  /** `null` = "Presentación única". */
  presentation_id: string | null;
  price: number;
  sku?: string | null;
}

/** `PATCH /variants/{id}` (`VariantUpdate`) — all optional. */
export interface VariantUpdatePayload {
  presentation_id?: string;
  price?: number;
  sku?: string | null;
  active?: boolean;
}

/**
 * `detail` del 409 de nombre de presentación duplicado en `POST`/`PATCH`/`PUT /products` (spec
 * 043) cuando alguna entrada de `variants[]` choca con otra presentación del mismo producto.
 *
 * `active: false` es el caso interesante: la que estorba es una presentación soft-borrada, que
 * el editor no lista y por eso el usuario intenta recrearla. Se resuelve restaurándola (moverla
 * al draft, `product-form.component.ts` `restoreVariant`) y reintentando "Guardar" — no creando
 * otra ni con una llamada de red aparte.
 */
export interface VariantNameConflict {
  error: string;
  variant_id: string;
  active: boolean;
  /** Posición (0-based) de la entrada en conflicto dentro de `variants[]` del payload enviado. */
  variant_index?: number;
}

// --- Option groups & options ---

/** An option inside a group (e.g. a flavor). Mirrors `OptionResponse`. */
export interface Option {
  id: string;
  option_group_id: string;
  name: string;
  extra_price: number;
  /** Optional inventory item this option consumes. */
  inventory_item_id: string | null;
  item_quantity: number;
  active: boolean;
}

/** A group of options with selection bounds. Mirrors `OptionGroupResponse`. */
export interface OptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  active: boolean;
  pricing_type: OptionGroupPricingType;
  selection_mode: OptionGroupSelectionMode;
  max_quantity_per_option: number | null;
  max_total_quantity: number | null;
  options: Option[];
}

/** Editable fields captured by the option-group form. */
export interface OptionGroupForm {
  name: string;
  min_select: number;
  max_select: number;
  pricing_type: OptionGroupPricingType | null;
  selection_mode: OptionGroupSelectionMode;
  max_quantity_per_option: number | null;
  max_total_quantity: number | null;
}

/** `POST /option-groups` (`OptionGroupCreate`). `pricing_type` es obligatorio (FR-001):
 *  sin default de negocio razonable entre "incluido" y "con_recargo". `selection_mode`
 *  sí tiene default de negocio ("conteo", spec 065) -- es opcional. */
export interface OptionGroupCreatePayload {
  name: string;
  min_select: number;
  max_select: number;
  pricing_type: OptionGroupPricingType;
  selection_mode: OptionGroupSelectionMode;
  max_quantity_per_option: number | null;
  max_total_quantity: number | null;
}

/** `PATCH /option-groups/{id}` (`OptionGroupUpdate`). Partial: only sent fields apply. */
export interface OptionGroupUpdatePayload {
  name?: string;
  min_select?: number;
  max_select?: number;
  active?: boolean;
  pricing_type?: OptionGroupPricingType;
  selection_mode?: OptionGroupSelectionMode;
  max_quantity_per_option?: number | null;
  max_total_quantity?: number | null;
}

/** Editable fields captured by the option form. */
export interface OptionForm {
  name: string;
  extra_price: number;
  inventory_item_id: string | null;
  item_quantity: number;
}

/** `POST /option-groups/{gid}/options` (`OptionCreate`). */
export interface OptionCreatePayload {
  name: string;
  extra_price: number;
  inventory_item_id?: string | null;
  item_quantity: number;
}

/**
 * `PATCH /options/{id}` (`OptionUpdate`). Partial: only sent fields apply.
 * `inventory_item_id: null` explicitly unlinks the inventory item.
 */
export interface OptionUpdatePayload {
  name?: string;
  extra_price?: number;
  inventory_item_id?: string | null;
  item_quantity?: number;
  active?: boolean;
}

// --- Recipes (per variant, consume inventory items) ---

/**
 * Un insumo fijo que la variante consume siempre (200 g de fruta). Lo que el cliente
 * elige va en {@link VariantOptionGroup}, no aquí.
 */
export interface RecipeItem {
  inventory_item_id: string;
  quantity: number;
}

/** `PUT /variants/{id}/recipe` (`RecipeSet`). */
export interface RecipeSetPayload {
  items: RecipeItem[];
}

// --- Grupos de opciones por variante ---

/**
 * Un grupo que ofrece una presentación: cuántas opciones elige el cliente y cuánto
 * descuenta **cada una** de ellas.
 *
 * Vive en la variante y no en el producto porque las tres cosas cambian con el tamaño:
 * la ensalada pequeña elige 1 sabor y descuenta 60 g, la mediana elige 2 y descuenta
 * 120 g de cada uno.
 *
 * `quantity_per_option` es por opción elegida, no el total del grupo. En 0 el grupo se
 * ofrece pero no descuenta por sí mismo.
 */
export interface VariantOptionGroup {
  option_group_id: string;
  min_select: number;
  max_select: number;
  quantity_per_option: number;
}

/** `PUT /variants/{id}/option-groups` (`VariantOptionGroupSet`). */
export interface VariantOptionGroupSetPayload {
  groups: VariantOptionGroup[];
}

// --- Draft (single-page create/edit) ---
//
// El backend no admite creación anidada; el draft es el modelo de UI que la
// página unifica y que `ProductService.saveProduct` orquesta en varias llamadas.

/** Un insumo fijo en el draft. `inventory_item_id` es null mientras no se elige. */
export interface RecipeLineDraft {
  inventory_item_id: string | null;
  quantity: number;
}

/** Un grupo ofrecido por la variante, en el draft. `name` se resuelve para mostrarlo. */
export interface VariantOptionGroupDraft {
  option_group_id: string | null;
  name: string;
  min_select: number;
  max_select: number;
  quantity_per_option: number;
}

/**
 * Una presentación en el draft, con TODO lo suyo: precio, insumos fijos y grupos.
 * `id === null` = aún no existe en el backend.
 */
export interface VariantDraft {
  /** Id de backend, o null si es nueva. */
  id: string | null;
  /** Clave local estable para `@for` mientras no hay id. */
  localId: string;
  price: number;
  /** spec 084 (A-79): presentación del catálogo que nombra a la variante. `null` solo en
   *  una fila nueva que aún no eligió (con tamaños) o en la variante única (sin tamaños, el
   *  backend usa "Presentación única"). */
  presentationId: string | null;
  /** Nombre de esa presentación, para pintar la fila sin esperar al catálogo. `''` si aún
   *  no eligió. */
  presentationName: string;
  recipe: RecipeLineDraft[];
  optionGroups: VariantOptionGroupDraft[];
}

/**
 * Presentación soft-borrada: no se vende ni sale en la carta, pero su fila sigue
 * existiendo y sigue ocupando su nombre dentro del producto. Se lista aparte para poder
 * restaurarla; no se edita, así que no necesita receta ni grupos.
 */
export interface DeactivatedVariant {
  id: string;
  price: number;
  presentationId: string;
  presentationName: string;
}

/** Draft completo del producto para la página unificada de crear/editar. */
export interface ProductDraft {
  id: string | null;
  name: string;
  category_id: string;
  description: string;
  preparation_type: PreparationType;
  image_url: string;
  /**
   * Imagen vigente del producto al cargar el formulario (spec 088), o `null` si no tenía. No se
   * modifica al subir una imagen nueva: es lo que el backend compara para detectar un
   * formulario desactualizado. `null` en un producto nuevo (no aplica).
   */
  image_url_base: string | null;
  active: boolean;
  hasSizes: boolean;
  /**
   * Si el producto maneja inventario. Apagado por defecto en un producto nuevo. Habilita
   * la sección de insumos (receta fija y grupos de opciones) de cada presentación cuando
   * está activado; apagarlo NO borra los insumos ya guardados, solo deja de exigirlos y
   * de aplicarlos al vender.
   */
  tracks_inventory: boolean;
  /** Las presentaciones vivas: las únicas editables y las únicas que se guardan. */
  variants: VariantDraft[];
  /** Las desactivadas del producto. Vacío en un producto nuevo. */
  deactivated: DeactivatedVariant[];
}

// --- Public menu (`GET /menu`) ---

export interface MenuOption {
  id: string;
  name: string;
  extra_price: number;
  /** Hay stock del insumo que consume. `false` = se muestra como "Agotado". */
  available: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  /**
   * El grupo descuenta inventario por cada opción elegida.
   *
   * Cambia cuántas hay que elegir: un helado de tres bolas reparte una cantidad
   * física fija entre los sabores, así que elegir uno solo sirve tres y
   * descuenta uno. Por eso ahí se exige el máximo y no el mínimo. Ver
   * `requiredCount()` en `product-select.component.ts`.
   */
  consume: boolean;
  /**
   * Modo de selección (spec 065). `conteo` (default) = el comportamiento de
   * siempre, `min_select`/`max_select` cuentan opciones distintas. `cantidad` =
   * el cliente elige unidades libres por opción, sin mínimo posible;
   * `min_select`/`max_select` se ignoran en ese modo.
   */
  selection_mode: OptionGroupSelectionMode;
  /** Solo tienen efecto en modo "cantidad"; `null` = sin tope. */
  max_quantity_per_option: number | null;
  max_total_quantity: number | null;
  options: MenuOption[];
}

/**
 * spec 066 (FR-007): información de la regla vigente que cubre una presentación.
 * La calcula y la **renderiza** el backend — textos incluidos — para que el peso
 * colombiano y el redondeo al peso no se repitan en `number` de JavaScript
 * (research.md D-4). Aquí solo se pinta: nunca se recalcula un importe.
 */
export interface MenuVariantPromotion {
  /** Condición completa, la misma cadena que el cartel y administración (SC-005). */
  condition_text: string;
  /** `2 x $12.000` | `3 x -15%` */
  short_condition: string;
  unit_equivalent: number;
  /** El importe exacto no era entero en pesos: el texto lleva `≈`. */
  unit_equivalent_approx: boolean;
  /** `$6.000 c/u` | `≈ $4.333 c/u` */
  unit_equivalent_text: string;
  /** `2 x $12.000 · $6.000 c/u` — lo que se pinta bajo el precio. */
  display_text: string;
  type: 'percent' | 'package_price';
  min_qty: number;
  value: number;
}

export interface MenuVariant {
  id: string;
  /** Nombre de la variante = el de su presentación (spec 084, A-79). */
  name: string;
  /** Presentación del catálogo que nombra a la variante (spec 084, A-79/A-80). Opcional: solo
   *  lo necesita el emparejamiento de reglas de promoción; algunos armadores del menú
   *  (modo diner) no lo pueblan. */
  presentation_id?: string;
  price: number;
  /** Precio ya con el mejor descuento vigente aplicado, o `null`/ausente si no hay. */
  discounted_price?: number | null;
  /** Tipo de promoción que generó `discounted_price` ('percent'/'fixed'), o `null`/ausente si no hay. */
  discount_kind?: string | null;
  /**
   * spec 066 (FR-007): la regla vigente que cubre esta presentación, o `null`.
   * La vigencia ya la resolvió el backend al poblarla — leerla no es evaluarla.
   */
  promotion?: MenuVariantPromotion | null;
  /**
   * Fuente autoritativa de qué puede elegir el cliente: cuántas opciones y de qué
   * grupos cambia con el tamaño.
   */
  option_groups: MenuOptionGroup[];
  /** `false` si un grupo obligatorio de esta presentación se quedó sin stock. */
  available: boolean;
}

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  variants: MenuVariant[];
  /**
   * Unión de los grupos de todas las presentaciones. **Solo sirve para resolver el
   * nombre y el precio de una opción** (tickets, comandas, carrito): su
   * `min/max_select` es el de la primera presentación que lo ofrece y no significa
   * nada. Para saber qué puede elegir el cliente, usar `variants[].option_groups`.
   */
  option_groups: MenuOptionGroup[];
  /** `false` si ninguna presentación se puede pedir. */
  available: boolean;
  /** spec 093 (FR-019/FR-020): marcado manual de "Agotado" (Cajero/Admin, Carta del
   *  menú) -- independiente de `available` (arriba). `true` = no se puede agregar al
   *  pedido, aunque siga visible en el menú (Terminal de mesas y menú QR). Opcional
   *  (a diferencia de `available`) para no obligar a los fixtures de test ya
   *  existentes en todo el repo a declararlo: ausente se trata como `false`. */
  sold_out?: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}

/** Nombre de la presentación del catálogo que nombra la variante de un producto sin tamaños
 *  (A-74/A-79). El backend la crea si el tenant no la tiene. */
export const DEFAULT_PRESENTATION_NAME = 'Presentación única';
