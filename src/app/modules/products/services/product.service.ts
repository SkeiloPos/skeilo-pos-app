import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';

import { MenuService } from '../../../core/services/menu.service';
import { injectPagedQuery } from '../../../core/query/paged-query';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import {
  DeactivatedVariant,
  Product,
  ProductCreatePayload,
  ProductDetail,
  ProductDraft,
  ProductForm,
  ProductUpdatePayload,
  RecipeItem,
  RecipeLineDraft,
  Variant,
  VariantCreatePayload,
  VariantDraft,
  VariantForm,
  VariantNameConflict,
  VariantOptionGroup,
  VariantOptionGroupDraft,
  VariantSavePayload,
  VariantUpdatePayload,
} from '../interfaces/product.interface';

/**
 * La presentación ya está tomada por otra variante del producto (409 del backend).
 *
 * Se tipa aparte del `HttpErrorResponse` porque el guardado necesita distinguir el caso
 * `active: false` — una presentación soft-borrada que hay que restaurar — del choque con
 * una que el usuario tiene delante.
 */
export class VariantNameConflictError extends Error {
  constructor(readonly conflict: VariantNameConflict) {
    super(conflict.error);
    this.name = 'VariantNameConflictError';
  }
}

/** Extrae el `detail` del 409 si tiene la forma del conflicto de nombre. */
function toNameConflict(err: unknown): VariantNameConflict | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 409) return null;
  const detail = (err.error as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object' && 'variant_id' in detail) {
    return detail as VariantNameConflict;
  }
  return null;
}

/** Raw backend product. */
interface ProductResponse {
  id: string;
  category_id: string;
  /** spec 097: resuelto en el servidor, sin depender de `GET /categories`. */
  category_name?: string | null;
  name: string;
  description: string | null;
  preparation_type: Product['preparation_type'];
  image_url: string | null;
  active: boolean;
  available: boolean;
  /** spec 093 (FR-013): quién marcó/desmarcó `available` por última vez y cuándo. */
  available_changed_at?: string | null;
  available_changed_by_name?: string | null;
  tracks_inventory: boolean;
  created_at: string;
  updated_at?: string | null;
}

/** Raw backend variant (decimals arrive as strings). */
interface VariantResponse {
  id: string;
  product_id: string;
  sku: string | null;
  price: string;
  active: boolean;
  presentation_id: string;
  presentation_name: string;
  /** spec 099: ausente contra un backend sin desplegar. */
  name?: string;
  display_name?: string;
  /** spec 103 (D1): solo presente cuando viene de `GET /products/{id}` (no de
   *  `GET /products/{id}/variants`, que no los trae). `recipe` puede venir ausente o
   *  vacío para el rol Cajero (D3) -- ambos casos se tratan igual, receta vacía. */
  recipe?: RecipeItemResponse[];
  option_groups?: VariantOptionGroupResponse[];
}

/** spec 093 (escenario 9): `GET /products/{id}` -- a diferencia del listado, incluye
 *  las presentaciones activas con su precio (sin receta ni grupos de opciones). */
interface ProductDetailResponse extends ProductResponse {
  variants: VariantResponse[];
  /** Ajuste posterior a la spec 103: las desactivadas, ya en la misma respuesta --
   *  `GET /products/{id}/variants` deja de hacer falta solo para listarlas. */
  deactivated: VariantResponse[];
}

interface RecipeItemResponse {
  id: string;
  inventory_item_id: string;
  /** spec 105 (research.md): denormalizados por el backend desde el insumo, igual que
   *  `category_name`/`presentation_name` -- evita un `GET /inventory/items/{id}` por cada
   *  línea de receta al mostrar el nombre/unidad de un insumo ya guardado. */
  inventory_item_name: string;
  unit_measure_id: string;
  quantity: string;
}

/** Raw backend `VariantOptionGroupResponse` de `GET /variants/{id}/option-groups`. */
interface VariantOptionGroupResponse {
  id: string;
  product_variant_id: string;
  option_group_id: string;
  min_select: number;
  max_select: number;
  quantity_per_option: string;
}

interface PresignResponse {
  upload_url: string;
  key: string;
  public_url: string;
  expires_in: number;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly menuService = inject(MenuService);
  private readonly optionGroupService = inject(OptionGroupService);
  private readonly productsUrl = `${environment.apiBaseUrl}/products`;
  private readonly variantsUrl = `${environment.apiBaseUrl}/variants`;
  private readonly uploadsUrl = `${environment.apiBaseUrl}/uploads`;

  readonly isSubmitting = signal(false);
  /**
   * Errores fuera de la query paginada: mutaciones, getProduct, drafts, subida de
   * imagen, y validaciones de formulario del lado del cliente (`product-form.component.ts`
   * escribe acá directo para reusar el mismo banner de error). Se funde con el
   * error de la query paginada en el `error` público de abajo.
   */
  readonly otherError = signal<string | null>(null);
  /**
   * Conflicto de nombre del último guardado, o null. El formulario lo consulta para
   * refrescar la lista de desactivadas y dejar el botón «Restaurar» a la vista.
   */
  readonly lastVariantConflict = signal<VariantNameConflict | null>(null);

  // Entrada de la query paginada (antes: reflejo del `Page<T>` leído del backend
  // tras cada fetch; ahora maneja al revés — son la entrada que arma la query key).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly search = signal('');
  readonly activeFilter = signal<'' | 'active' | 'inactive'>('');
  /** spec 093 (FR-006): filtro "Disponibles"/"Agotados" de la Carta del menú. */
  readonly availabilityFilter = signal<'' | 'available' | 'sold_out'>('');
  /** true tras el primer `loadProducts()`; gatea el fetch para que construir el
   *  servicio vía DI (p. ej. desde otro módulo) no dispare una petición sola. */
  private readonly wantsPage = signal(false);

  private readonly productsQuery = injectPagedQuery<ProductResponse>({
    queryKey: () => [
      'products',
      'page',
      {
        page: this.page(),
        size: this.size(),
        search: this.search().trim(),
        active: this.activeFilter(),
        available: this.availabilityFilter(),
      },
    ],
    queryFn: () =>
      this.fetchProductsPage(
        this.page(),
        this.size(),
        this.search().trim(),
        this.activeFilter(),
        this.availabilityFilter(),
      ),
    enabled: () => this.wantsPage(),
  });

  readonly products = computed(() =>
    (this.productsQuery.data()?.items ?? [])
      .map((p) => this.toProduct(p))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly total = computed(() => this.productsQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.productsQuery.data()?.pages ?? 0);
  /** true durante cualquier fetch (primero o repaginado) — igual semántica que
   *  el `loading` de antes, que el pager usa para deshabilitarse en cada cambio. */
  readonly loading = computed(() => this.productsQuery.isFetching());
  readonly error = computed(
    () =>
      this.otherError() ??
      (this.productsQuery.isError() ? this.extractError(this.productsQuery.error()) : null),
  );

  // --- Products ---

  private fetchProductsPage(
    page: number,
    size: number,
    search: string,
    activeFilter: '' | 'active' | 'inactive',
    availabilityFilter: '' | 'available' | 'sold_out' = '',
  ): Promise<Page<ProductResponse>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    if (activeFilter === 'active') params = params.set('active', 'true');
    if (activeFilter === 'inactive') params = params.set('active', 'false');
    if (availabilityFilter === 'available') params = params.set('available', 'true');
    if (availabilityFilter === 'sold_out') params = params.set('available', 'false');
    return firstValueFrom(this.http.get<Page<ProductResponse>>(this.productsUrl, { params }));
  }

  /** Antes: async, esperaba el round-trip. Ahora: setter síncrono; el fetch es un
   *  efecto reactivo de `productsQuery` sobre page/size/search/activeFilter/wantsPage. */
  loadProducts(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  /** Aplica el término de búsqueda y recarga desde la página 1. */
  setSearch(term: string): void {
    this.search.set(term);
    this.loadProducts(1);
  }

  /** Aplica el filtro de estado y recarga desde la página 1. */
  setActiveFilter(filter: '' | 'active' | 'inactive'): void {
    this.activeFilter.set(filter);
    this.loadProducts(1);
  }

  /** Aplica el filtro Todos/Disponibles/Agotados (spec 093, FR-006) y recarga. */
  setAvailabilityFilter(filter: '' | 'available' | 'sold_out'): void {
    this.availabilityFilter.set(filter);
    this.loadProducts(1);
  }

  async getProduct(id: string): Promise<Product | null> {
    try {
      const p = await firstValueFrom(this.http.get<ProductResponse>(`${this.productsUrl}/${id}`));
      return this.toProduct(p);
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return null;
    }
  }

  /** spec 093 (escenario 9): detalle de solo lectura de "Carta del menú", con las
   *  presentaciones activas y su precio -- usa el mismo `GET /products/{id}` que
   *  {@link getProduct}, que ahora también trae `variants`. */
  async getProductDetail(id: string): Promise<ProductDetail | null> {
    try {
      const p = await firstValueFrom(
        this.http.get<ProductDetailResponse>(`${this.productsUrl}/${id}`),
      );
      return {
        ...this.toProduct(p),
        variants: p.variants.map((v) => this.toVariant(v)),
      };
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return null;
    }
  }

  /** Creates a product and returns its id (or null on error). */
  async createProduct(form: ProductForm): Promise<string | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    const payload: ProductCreatePayload = {
      category_id: form.category_id,
      name: form.name,
      description: form.description || null,
      preparation_type: form.preparation_type,
      image_url: form.image_url || null,
    };
    try {
      const created = await firstValueFrom(
        this.http.post<ProductResponse>(this.productsUrl, payload),
      );
      await this.queryClient.invalidateQueries({ queryKey: ['products'] });
      return created.id;
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateProduct(id: string, form: ProductForm): Promise<boolean> {
    const base = form.image_url_base ?? null;
    const payload: ProductUpdatePayload = {
      category_id: form.category_id,
      name: form.name,
      description: form.description || null,
      preparation_type: form.preparation_type,
      // spec 088: solo se reenvía la imagen si cambió respecto de la que el formulario vio
      // (reenviar la imagen sin tocar es lo que un formulario desactualizado usaba para
      // deshacer una imagen más nueva); siempre viaja la base.
      image_url: form.image_url && form.image_url !== base ? form.image_url : null,
      image_url_base: base,
    };
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload),
    );
    if (ok) await this.queryClient.invalidateQueries({ queryKey: ['products'] });
    return ok;
  }

  async toggleActive(id: string, current: boolean): Promise<boolean> {
    const payload: ProductUpdatePayload = { active: !current };
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}`, payload),
    );
    if (ok) await this.queryClient.invalidateQueries({ queryKey: ['products'] });
    return ok;
  }

  /** Marca el producto como disponible / agotado temporalmente (RF-006). spec 093
   *  (research.md D3): único endpoint que Cajero y Admin usan para esto -- a
   *  diferencia de {@link updateProduct}/{@link toggleActive}, no pasa por el PATCH
   *  completo (exclusivo de Admin). */
  async toggleAvailable(id: string, current: boolean): Promise<boolean> {
    const ok = await this.run(() =>
      this.http.patch<ProductResponse>(`${this.productsUrl}/${id}/availability`, {
        available: !current,
      }),
    );
    if (ok) await this.queryClient.invalidateQueries({ queryKey: ['products'] });
    return ok;
  }

  // --- Variants ---

  /** Variantes del producto; `active` filtra por estado (sin él, todas). */
  async loadVariants(productId: string, active?: boolean): Promise<Variant[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<VariantResponse[]>(`${this.productsUrl}/${productId}/variants`, {
          params: active === undefined ? {} : { active },
        }),
      );
      return data.map((v) => this.toVariant(v));
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return [];
    }
  }

  /** Las presentaciones soft-borradas, para la sección «desactivadas» del editor. */
  async loadDeactivated(productId: string): Promise<DeactivatedVariant[]> {
    const variants = await this.loadVariants(productId, false);
    return variants.map((v) => ({
      id: v.id,
      price: v.price,
      presentationId: v.presentation_id,
      presentationName: v.presentation_name,
    }));
  }

  /** Devuelve una presentación desactivada a la carta. */
  async restoreVariant(variantId: string): Promise<boolean> {
    return this.updateVariant(variantId, { active: true });
  }

  async createVariant(productId: string, form: VariantForm): Promise<boolean> {
    const payload: VariantCreatePayload = {
      presentation_id: form.presentation_id,
      price: form.price,
      sku: form.sku,
    };
    return this.run(() =>
      this.http.post<VariantResponse>(`${this.productsUrl}/${productId}/variants`, payload),
    );
  }

  async updateVariant(variantId: string, payload: VariantUpdatePayload): Promise<boolean> {
    return this.run(() => this.http.patch(`${this.variantsUrl}/${variantId}`, payload));
  }

  async deleteVariant(variantId: string): Promise<boolean> {
    return this.run(() => this.http.delete(`${this.variantsUrl}/${variantId}`));
  }

  // --- Recipes (per variant, consume inventory items) ---

  /**
   * Petición cruda, sin atrapar errores de red/servidor (spec 102, D2): un 404 es un
   * estado vacío válido (`return []`), pero cualquier otro error se propaga para que el
   * llamador decida — `getProductDraft` lo aísla por variante (`Promise.allSettled`);
   * `getVariantRecipe` (abajo) lo atrapa para mantener su contrato de siempre resolver.
   */
  private async fetchVariantRecipeRaw(variantId: string): Promise<RecipeItem[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<RecipeItemResponse[]>(`${this.variantsUrl}/${variantId}/recipe`),
      );
      return data.map((i) => ({
        inventory_item_id: i.inventory_item_id,
        quantity: Number(i.quantity),
      }));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) return [];
      throw err;
    }
  }

  /** Fetch a variant's recipe. A missing recipe (404) is a valid empty state. */
  async getVariantRecipe(variantId: string): Promise<RecipeItem[]> {
    try {
      return await this.fetchVariantRecipeRaw(variantId);
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return [];
    }
  }

  // --- Option groups (per variant) ---

  /**
   * Misma razón de ser que `fetchVariantRecipeRaw`: 404 es vacío válido, lo demás se propaga.
   * El GET de los links y el catálogo de grupos se piden EN PARALELO (como ya hacía el código
   * original) — no uno tras otro — para no introducir latencia nueva en las llamadas de una
   * sola variante (`restoreVariant()`, `retryVariant()`).
   */
  private async fetchVariantOptionGroupsRaw(variantId: string): Promise<VariantOptionGroupDraft[]> {
    try {
      const [links] = await Promise.all([
        firstValueFrom(
          this.http.get<VariantOptionGroupResponse[]>(
            `${this.variantsUrl}/${variantId}/option-groups`,
          ),
        ),
        this.ensureOptionGroupsLoaded(),
      ]);
      const byId = new Map(this.optionGroupService.groups().map((g) => [g.id, g]));
      return links.map((l) => ({
        option_group_id: l.option_group_id,
        name: byId.get(l.option_group_id)?.name ?? 'Grupo',
        min_select: l.min_select,
        max_select: l.max_select,
        quantity_per_option: Number(l.quantity_per_option),
      }));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) return [];
      throw err;
    }
  }

  /** En vuelo (si existe) la carga del catálogo de grupos de opciones — ver `ensureOptionGroupsLoaded`. */
  private optionGroupsLoadPromise: Promise<void> | null = null;

  /**
   * Asegura el catálogo de grupos de opciones cargado antes de resolver nombres, sin volver a
   * pedirlo si ya hay una carga en curso o completa (spec 102, D2). A diferencia de la guarda
   * original (`groups().length ? ... : loadGroups()`), esto NO confunde "catálogo vacío porque el
   * tenant no tiene ningún grupo" con "catálogo nunca cargado": una respuesta `[]` también cuenta
   * como cargado, así que no se reintenta en cada llamada concurrente (lo que, con varias
   * variantes en paralelo, dispararía una `GET /option-groups` por variante en vez de una sola).
   */
  private async ensureOptionGroupsLoaded(): Promise<void> {
    if (this.optionGroupService.groups().length > 0) return;
    if (!this.optionGroupsLoadPromise) {
      this.optionGroupsLoadPromise = this.optionGroupService.loadGroups();
    }
    await this.optionGroupsLoadPromise;
  }

  /**
   * Grupos que ofrece una variante, con su nombre resuelto contra el catálogo (el
   * endpoint solo devuelve ids).
   */
  async getVariantOptionGroups(variantId: string): Promise<VariantOptionGroupDraft[]> {
    try {
      return await this.fetchVariantOptionGroupsRaw(variantId);
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return [];
    }
  }

  // --- Draft: single-page create/edit orchestration ---

  /**
   * Loads a product and its whole graph (cada variante con su receta y sus grupos)
   * into a single editable {@link ProductDraft}.
   */
  async getProductDraft(id: string): Promise<ProductDraft | null> {
    // Spec 103-detalle-producto-consolidado (research.md D4): `GET /products/{id}` ya
    // trae, por cada variante activa, su receta y sus grupos de opciones embebidos --
    // se lee directo de aquí, sin disparar ninguna petición adicional por tamaño (no se
    // reusa `getProduct()`, que descarta `variants`, para no pedir el detalle dos veces).
    let raw: ProductDetailResponse;
    try {
      raw = await firstValueFrom(
        this.http.get<ProductDetailResponse>(`${this.productsUrl}/${id}`),
      );
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return null;
    }
    const product = this.toProduct(raw);

    // El nombre de cada grupo de opciones (el link embebido solo trae su id) se resuelve
    // contra el catálogo local, cargado una sola vez -- igual que antes (research.md D4),
    // ya no una vez por variante en paralelo.
    if (raw.variants.length > 0) {
      await this.ensureOptionGroupsLoaded();
    }
    const groupById = new Map(this.optionGroupService.groups().map((g) => [g.id, g]));

    const variantDrafts: VariantDraft[] = raw.variants.map((v) => ({
      id: v.id,
      localId: v.id,
      price: Number(v.price),
      presentationId: v.presentation_id,
      presentationName: v.presentation_name,
      name: v.name ?? '',
      recipe: (v.recipe ?? []).map((r) => ({
        inventory_item_id: r.inventory_item_id,
        quantity: Number(r.quantity),
        inventory_item_name: r.inventory_item_name,
        unit_measure_id: r.unit_measure_id,
      })),
      optionGroups: (v.option_groups ?? []).map((l) => ({
        option_group_id: l.option_group_id,
        name: groupById.get(l.option_group_id)?.name ?? 'Grupo',
        min_select: l.min_select,
        max_select: l.max_select,
        quantity_per_option: Number(l.quantity_per_option),
      })),
    }));

    return {
      id: product.id,
      name: product.name,
      category_id: product.category_id,
      // spec 102 (D4): nombre ya resuelto por el backend (spec 097), para el resguardo del
      // selector de categoría si quedó fuera de `allCategories()`.
      category_name: product.category_name ?? '',
      description: product.description ?? '',
      preparation_type: product.preparation_type,
      image_url: product.image_url ?? '',
      // spec 088: la imagen vigente al abrir el formulario, para detectar un formulario
      // desactualizado; no cambia al subir una imagen nueva.
      image_url_base: product.image_url ?? null,
      active: product.active,
      hasSizes: variantDrafts.length > 1,
      tracks_inventory: product.tracks_inventory,
      variants: variantDrafts,
      // Ajuste posterior a la spec 103: las desactivadas ya vienen en la misma
      // respuesta de `GET /products/{id}` -- deja de hacer falta un segundo
      // `GET /products/{id}/variants` solo para listarlas.
      deactivated: raw.deactivated.map((v) => ({
        id: v.id,
        price: Number(v.price),
        presentationId: v.presentation_id,
        presentationName: v.presentation_name,
      })),
    };
  }

  /**
   * Persists a whole {@link ProductDraft}, orchestrating the flat backend
   * endpoints (there is no nested create). Returns the product id on success,
   * `null` on failure. Runs sequentially: a failing step aborts the rest, so on
   * create the product may remain partially saved (still editable afterwards).
   */
  async saveProduct(draft: ProductDraft): Promise<string | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    this.lastVariantConflict.set(null);
    try {
      const productId = draft.id
        ? await this.saveExistingProduct(draft)
        : await this.saveNewProduct(draft);
      await this.queryClient.invalidateQueries({ queryKey: ['products'] });
      return productId;
    } catch (err) {
      if (err instanceof VariantNameConflictError) {
        this.lastVariantConflict.set(err.conflict);
        this.otherError.set(this.conflictMessage(err.conflict));
      } else {
        this.otherError.set(this.extractError(err));
      }
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Mensaje del 409 de nombre, dirigido a la acción que lo resuelve. */
  private conflictMessage(conflict: VariantNameConflict): string {
    return conflict.active
      ? conflict.error
      : `${conflict.error} Búscala en «Presentaciones desactivadas», más abajo.`;
  }

  /**
   * Guardado consolidado (spec 043): una sola petición trae el producto y el árbol completo de
   * presentaciones (cada una con su receta y sus grupos de opciones), en vez de orquestar una
   * llamada por presentación + receta + grupos + reordenamiento como antes de esta spec. El
   * backend persiste todo en una única transacción (todo o nada, FR-004).
   */
  private async saveNewProduct(draft: ProductDraft): Promise<string> {
    const payload: ProductCreatePayload = {
      ...this.toProductPayload(draft),
      variants: draft.variants.map((v) => this.toVariantSavePayload(v)),
    };
    try {
      const created = await firstValueFrom(
        this.http.post<ProductResponse>(this.productsUrl, payload),
      );
      return created.id;
    } catch (err) {
      const conflict = toNameConflict(err);
      if (conflict) throw new VariantNameConflictError(conflict);
      throw err;
    }
  }

  private async saveExistingProduct(draft: ProductDraft): Promise<string> {
    const productId = draft.id!;
    // `draft.variants` ya trae TODAS las presentaciones activas (editadas o no) más las nuevas;
    // el backend reconcilia contra eso: crea las que no tienen `id`, actualiza las que sí, y
    // desactiva cualquier presentación activa existente que no aparezca aquí (data-model.md,
    // tabla de reconciliación) — sustituye al bucle de PATCH/POST + DELETE + reorder de antes.
    const payload: ProductUpdatePayload = {
      ...this.toProductPayload(draft),
      variants: draft.variants.map((v) => this.toVariantSavePayload(v)),
    };
    try {
      await firstValueFrom(
        this.http.patch<ProductResponse>(`${this.productsUrl}/${productId}`, payload),
      );
      return productId;
    } catch (err) {
      const conflict = toNameConflict(err);
      if (conflict) throw new VariantNameConflictError(conflict);
      throw err;
    }
  }

  /**
   * Mapea una presentación del draft al `VariantSaveIn` que espera el backend (spec 043):
   * mismo filtrado/deduplicado que antes hacían `setRecipe`/`setVariantOptionGroups` por
   * separado, ahora aplicado antes de armar el árbol completo.
   */
  private toVariantSavePayload(v: VariantDraft): VariantSavePayload {
    const seenItems = new Set<string>();
    const recipe: RecipeItem[] = [];
    for (const l of v.recipe) {
      if (!l.inventory_item_id || Number(l.quantity) <= 0) continue;
      if (seenItems.has(l.inventory_item_id)) continue;
      seenItems.add(l.inventory_item_id);
      recipe.push({ inventory_item_id: l.inventory_item_id, quantity: Number(l.quantity) });
    }

    const seenGroups = new Set<string>();
    const optionGroups: VariantOptionGroup[] = [];
    for (const g of v.optionGroups) {
      if (!g.option_group_id || seenGroups.has(g.option_group_id)) continue;
      seenGroups.add(g.option_group_id);
      optionGroups.push({
        option_group_id: g.option_group_id,
        min_select: Number(g.min_select) || 0,
        max_select: Number(g.max_select) || 1,
        quantity_per_option: Number(g.quantity_per_option) || 0,
      });
    }

    return {
      ...(v.id ? { id: v.id } : {}),
      price: v.price,
      presentation_id: v.presentationId,
      name: v.name ?? '',
      recipe,
      option_groups: optionGroups,
    };
  }

  private toProductPayload(draft: ProductDraft): ProductCreatePayload & ProductUpdatePayload {
    const common = {
      category_id: draft.category_id,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      preparation_type: draft.preparation_type,
      tracks_inventory: draft.tracks_inventory,
    };
    // Producto nuevo: no hay imagen vigente que comparar, así que no hay base.
    if (!draft.id) return { ...common, image_url: draft.image_url || null };

    // spec 088 (FR-002): al editar, `image_url` solo viaja si la imagen cambió respecto de la que
    // el formulario mostraba al abrirse (nunca se reenvía la imagen sin tocar) y la base viaja
    // siempre — `null` explícito si el producto no tenía imagen, que el backend distingue de
    // "no enviada". Si otro usuario ya cambió la imagen, el backend ignora la de este formulario.
    const base = draft.image_url_base ?? null;
    return {
      ...common,
      image_url: draft.image_url && draft.image_url !== base ? draft.image_url : null,
      image_url_base: base,
    };
  }

  // --- Image storage (Cloudflare R2, via presigned upload) ---

  /**
   * Uploads a product image directly to R2: asks the backend for a presigned
   * PUT URL scoped to the tenant, then PUTs the file straight to R2 (bytes
   * never go through our API). Deleting the previous image is handled by the
   * backend automatically when `image_url` changes on PATCH /products/{id} (spec 088:
   * only if the form's `image_url_base` still matches the current image, the new file
   * exists and no other row uses the previous one).
   */
  async uploadProductImage(file: File): Promise<string> {
    const presign = await firstValueFrom(
      this.http.post<PresignResponse>(`${this.uploadsUrl}/presign`, {
        filename: file.name,
        content_type: file.type,
      }),
    );

    await firstValueFrom(
      this.http.put(presign.upload_url, file, {
        headers: { 'Content-Type': file.type },
      }),
    );

    return presign.public_url;
  }

  // --- Helpers ---

  /** Runs a write request under isSubmitting/error; returns success boolean. */
  private async run(request: () => Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    try {
      await firstValueFrom(request());
      return true;
    } catch (err) {
      this.otherError.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private toProduct(p: ProductResponse): Product {
    return {
      id: p.id,
      category_id: p.category_id,
      category_name: p.category_name ?? null,
      name: p.name,
      description: p.description,
      preparation_type: p.preparation_type,
      image_url: p.image_url,
      active: p.active,
      available: p.available ?? true,
      available_changed_at: p.available_changed_at ?? null,
      available_changed_by_name: p.available_changed_by_name ?? null,
      tracks_inventory: p.tracks_inventory ?? false,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }

  private toVariant(v: VariantResponse): Variant {
    return {
      id: v.id,
      product_id: v.product_id,
      sku: v.sku,
      price: Number(v.price),
      active: v.active,
      presentation_id: v.presentation_id,
      presentation_name: v.presentation_name,
      name: v.name,
      display_name: v.display_name,
    };
  }

  /**
   * Mensaje legible del error del backend. `detail` llega en tres formas: texto, la lista
   * de pydantic en los 422, y un objeto en los 409 que traen datos para actuar (nombre
   * de variante tomado, grupo de opciones en uso). Sin cubrir el objeto, esos 409 se
   * mostraban como `[object Object]`.
   */
  private extractError(err: unknown): string {
    const fallback = 'No se pudo completar la operación.';
    if (!(err instanceof HttpErrorResponse)) return fallback;
    const body = err.error as { detail?: unknown; message?: string } | null;
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      return (detail[0] as { msg?: string })?.msg ?? fallback;
    }
    if (detail && typeof detail === 'object') {
      return (detail as { error?: string }).error ?? fallback;
    }
    return body?.message ?? fallback;
  }
}
