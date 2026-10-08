import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import type { VariantDraft } from '../interfaces/product.interface';
import { environment } from '../../../../environments/environment';
import { ProductFormComponent } from './product-form.component';
import { CategoryService } from '../../categories/services/category.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { OptionGroupService } from '../../option-groups/services/option-group.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';
import { PresentationService } from '../../presentations/services/presentation.service';
import type { Presentation } from '../../presentations/interfaces/presentation.interface';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';

const API = environment.apiBaseUrl;
const PRODUCTS = `${API}/products`;
const VARIANTS = `${API}/variants`;

function makeSummary(partial: Partial<PlanSummary>): PlanSummary {
  return {
    plan_name: 'Pro',
    ciclo_facturacion: 'mensual',
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, compras: true, promociones: true },
    ...partial,
  };
}

/**
 * Por defecto, plan CON el módulo Inventario -- así los tests de spec 027 (switch
 * habilitado, sin gating por plan en juego) siguen pasando sin tocarlos. Los tests de
 * gating por plan (spec 064, US5) lo redefinen explícitamente a `inventario: false`.
 */
const planSummary = signal<PlanSummary | null>(makeSummary({}));

/** Drain pending microtasks so the next request in a chained flow gets dispatched. */
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Los cuatro servicios de datos de referencia (categorías, insumos, unidades, grupos
 * de opciones) no son lo que este spec verifica — son colaboradores. Se reemplazan por
 * fakes livianos para no depender de la sincronización real de sus queries de
 * TanStack, dejando `ProductService` como el único backend real de HTTP en juego.
 */
class FakeCategoryService {
  allCategories = signal<{ id: string; name: string }[]>([{ id: 'c1', name: 'Helados' }]);
  loadAllCategories(): void {}
  /** spec 102: búsqueda remota del picker de Categoría — por defecto, sin resultados. */
  searchActiveCategories(_query: string): Promise<{ id: string; name: string }[]> {
    return Promise.resolve([]);
  }
}
class FakeInventoryService {
  allItems = signal<{ id: string; name: string }[]>([]);
  /** spec 102: insumos resueltos por id porque no estaban en `allItems()`. */
  resolvedExtraItems = signal<{ id: string; name: string }[]>([]);
  loadAllItems(): void {}
  /** spec 098: búsqueda remota del picker de "Insumos fijos" — por defecto, sin resultados. */
  searchActiveItems(_query: string): Promise<{ id: string; name: string }[]> {
    return Promise.resolve([]);
  }
  /** spec 102: por defecto no-op; los tests de Historia 1 lo espían/sobrescriben. */
  resolveMissingItems(_ids: string[]): Promise<void> {
    return Promise.resolve();
  }
}
class FakeUnitMeasureService {
  unitMeasures = signal<unknown[]>([]);
  async loadUnitMeasures(): Promise<void> {}
}
class FakeOptionGroupService {
  groups = signal<unknown[]>([]);
  async loadGroups(): Promise<void> {}
}
/** spec 084 (US1): presentaciones activas de prueba para el `<select>` de cada fila. */
class FakePresentationService {
  allPresentations = signal<Presentation[]>([
    { id: 'p-grande', name: 'Grande', active: true, created_at: '2026-01-01T00:00:00' },
    { id: 'p-mediana', name: 'Mediana', active: true, created_at: '2026-01-01T00:00:00' },
    { id: 'p-pequena', name: 'Pequeña', active: true, created_at: '2026-01-01T00:00:00' },
  ]);
  loadAllPresentations(): void {}
  /** spec 102: búsqueda remota del picker de Presentación — por defecto, sin resultados. */
  searchActivePresentations(_query: string): Promise<Presentation[]> {
    return Promise.resolve([]);
  }
}

describe('ProductFormComponent', () => {
  let fixture: ComponentFixture<ProductFormComponent>;
  let component: ProductFormComponent;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;

  /** Arranca el componente en modo "producto nuevo" (sin `id` en la ruta). */
  async function createNew(): Promise<void> {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupService },
        { provide: PresentationService, useClass: FakePresentationService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit
    await tick();
    await tick();
    await tick();
    fixture.detectChanges();
  }

  afterEach(() => http.verify());
  beforeEach(() => planSummary.set(makeSummary({})));

  const switchButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[role="switch"][title*="descuenta insumos"]');

  const text = (): string => fixture.nativeElement.textContent as string;

  it('un producto nuevo abre con el switch de inventario apagado por defecto', async () => {
    await createNew();

    expect(component.draft().tracks_inventory).toBe(false);
    expect(switchButton().getAttribute('aria-checked')).toBe('false');
  });

  it('la sección de insumos fijos aparece deshabilitada mientras el switch está apagado, pero "Sabores a elegir" sigue disponible (spec 064, FR-006)', async () => {
    await createNew();

    expect(text()).not.toContain('Insumos fijos');
    // A diferencia del comportamiento anterior a spec 064: "Sabores a elegir" (selector
    // de grupo, min/max) ya NO depende del switch de inventario -- un producto sin
    // inventario puede seguir ofreciendo sabores/toppings con precio.
    expect(text()).toContain('Sabores a elegir');
    expect(text()).toContain('Activa "Maneja inventario"');
  });

  it('activar el switch habilita la sección de insumos fijos y la parte de inventario de "Sabores a elegir"', async () => {
    await createNew();

    switchButton().click();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(true);
    expect(text()).toContain('Insumos fijos');
    expect(text()).toContain('Sabores a elegir');
    expect(text()).not.toContain('Activa "Maneja inventario"');
  });

  it('sin inventario, se puede agregar un grupo de opciones y fijar min/max, pero no aparece el input de cantidad ni el detalle de insumo', async () => {
    await createNew();
    const localId = component.activeVariant()!.localId;

    component.addGroup(localId);
    component.setGroupField(localId, 0, 'option_group_id', 'g1');
    component.setGroupField(localId, 0, 'min_select', 1);
    component.setGroupField(localId, 0, 'max_select', 1);
    fixture.detectChanges();

    expect(component.activeVariant()!.optionGroups.length).toBe(1);
    expect(component.activeVariant()!.optionGroups[0].option_group_id).toBe('g1');
    expect(text()).toContain('elige');
    // "descuenta" (verbo) también aparece en la descripción siempre visible del switch
    // ("...este producto descuenta al venderse") -- se verifica la frase completa que
    // solo existe junto al input de cantidad_per_option, para no dar un falso negativo.
    expect(text()).not.toContain('por cada uno');
    expect(text()).not.toContain('Descuenta de:');
  });

  it('activar el switch sobre un grupo ya elegido revela la cantidad de consumo y el detalle de insumo', async () => {
    await createNew();
    const localId = component.activeVariant()!.localId;
    component.addGroup(localId);
    component.setGroupField(localId, 0, 'option_group_id', 'g1');
    fixture.detectChanges();

    switchButton().click();
    fixture.detectChanges();

    expect(text()).toContain('por cada uno');
    expect(text()).toContain('Descuenta de:');
  });

  it('advierte de inmediato si el switch está activado y ninguna presentación tiene insumos (FR-013)', async () => {
    await createNew();
    expect(text()).not.toContain('no podrá venderse');

    switchButton().click();
    fixture.detectChanges();

    expect(text()).toContain('Este producto no podrá venderse hasta que se le configure al menos un insumo');
  });

  it('la advertencia desaparece en cuanto se agrega un insumo fijo', async () => {
    await createNew();
    switchButton().click();
    fixture.detectChanges();
    expect(component.showsInventoryWarning()).toBe(true);

    component.addRecipeLine(component.activeVariant()!.localId);
    component.setRecipeField(component.activeVariant()!.localId, 0, 'inventory_item_id', 'i1');
    component.setRecipeField(component.activeVariant()!.localId, 0, 'quantity', 1);
    fixture.detectChanges();

    expect(component.showsInventoryWarning()).toBe(false);
    expect(text()).not.toContain('no podrá venderse');
  });

  /** Enciende el switch y agrega un insumo fijo a la presentación activa. */
  function activarConInsumo(): void {
    switchButton().click();
    fixture.detectChanges();
    const localId = component.activeVariant()!.localId;
    component.addRecipeLine(localId);
    component.setRecipeField(localId, 0, 'inventory_item_id', 'i1');
    component.setRecipeField(localId, 0, 'quantity', 1);
    fixture.detectChanges();
  }

  it('apagar el switch de un producto sin insumos configurados no pide confirmación', async () => {
    await createNew();
    switchButton().click(); // enciende, sin insumos
    fixture.detectChanges();

    const confirm = TestBed.inject(ConfirmService);
    switchButton().click(); // apaga
    fixture.detectChanges();

    expect(confirm.state()).toBeNull();
    expect(component.draft().tracks_inventory).toBe(false);
  });

  it('apagar el switch con insumos configurados pide confirmación explícita (FR-014)', async () => {
    await createNew();
    activarConInsumo();

    const confirm = TestBed.inject(ConfirmService);
    switchButton().click(); // intenta apagar
    fixture.detectChanges();

    expect(confirm.state()).not.toBeNull();
    expect(confirm.state()?.title).toContain('Desactivar');
    // El switch todavía no cambió: la confirmación está pendiente de respuesta.
    expect(component.draft().tracks_inventory).toBe(true);
  });

  it('cancelar la confirmación deja el switch activado y los insumos intactos', async () => {
    await createNew();
    activarConInsumo();
    const confirm = TestBed.inject(ConfirmService);

    switchButton().click();
    fixture.detectChanges();
    confirm.respond(false);
    await tick();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(true);
    expect(component.activeVariant()!.recipe.length).toBe(1);
    expect(text()).toContain('Insumos fijos');
  });

  it('aceptar la confirmación apaga el switch sin borrar los insumos, y reactivar no vuelve a preguntar', async () => {
    await createNew();
    activarConInsumo();
    const confirm = TestBed.inject(ConfirmService);

    switchButton().click();
    fixture.detectChanges();
    confirm.respond(true);
    await tick();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(false);
    expect(component.activeVariant()!.recipe.length).toBe(1); // insumo conservado en memoria
    expect(text()).not.toContain('Insumos fijos'); // sección deshabilitada

    // Reactivar el switch: no pide confirmación y muestra el insumo tal como quedó.
    switchButton().click();
    fixture.detectChanges();

    expect(confirm.state()).toBeNull();
    expect(component.draft().tracks_inventory).toBe(true);
    expect(component.activeVariant()!.recipe.length).toBe(1);
    expect(text()).toContain('Insumos fijos');
  });

  it('el selector de "Insumos fijos" busca en el servidor: encuentra un insumo aunque no esté en la lista ya cargada (spec 098)', async () => {
    await createNew();
    switchButton().click();
    fixture.detectChanges();
    const localId = component.activeVariant()!.localId;
    component.addRecipeLine(localId);
    fixture.detectChanges();

    // `allItems()` (la lista cargada por defecto) sigue vacía -- simula exactamente el
    // caso reportado: un insumo que existe y está activo, pero fuera de la página ya
    // cargada. La búsqueda remota es la única forma de encontrarlo.
    const inventoryService = TestBed.inject(InventoryService) as unknown as FakeInventoryService;
    const insumoLejano = { id: 'i-105', name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS' };
    inventoryService.searchActiveItems = vi.fn().mockResolvedValue([insumoLejano]);

    // Spec 102: ya no es el único `app-searchable-select` del formulario (categoría y
    // presentación también lo usan ahora) -- se identifica por su placeholder.
    const picker = fixture.debugElement
      .queryAll(By.directive(SearchableSelectComponent))
      .find((el) => el.componentInstance.placeholder === 'Insumo…');
    expect(picker).toBeTruthy();
    const searchFn = picker!.componentInstance.search as
      | ((q: string) => Promise<{ id: string; label: string }[]>)
      | undefined;
    expect(searchFn).toBeTruthy();

    const resultado = await searchFn!('mozar');

    expect(inventoryService.searchActiveItems).toHaveBeenCalledWith('mozar');
    expect(resultado).toEqual([{ id: 'i-105', label: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS' }]);
  });

  // ── Historia 3 (spec 102): búsqueda remota en categorías y presentaciones ─

  it('el selector de Categoría busca en el servidor: encuentra una categoría aunque no esté en allCategories() (D3)', async () => {
    await createNew();

    const categoryService = TestBed.inject(CategoryService) as unknown as FakeCategoryService;
    const categoriaLejana = { id: 'cat-105', name: 'Postres fríos' };
    categoryService.searchActiveCategories = vi.fn().mockResolvedValue([categoriaLejana]);

    const picker = fixture.debugElement
      .queryAll(By.directive(SearchableSelectComponent))
      .find((el) => el.componentInstance.placeholder === 'Seleccionar categoría…')!;
    expect(picker).toBeTruthy();
    const searchFn = picker.componentInstance.search as (
      q: string,
    ) => Promise<{ id: string; label: string }[]>;

    const resultado = await searchFn('postre');

    expect(categoryService.searchActiveCategories).toHaveBeenCalledWith('postre');
    expect(resultado).toEqual([{ id: 'cat-105', label: 'Postres fríos' }]);
  });

  it('el selector de Presentación de una fila busca en el servidor: encuentra una presentación aunque no esté en allPresentations() (D3)', async () => {
    await createEdit('p9', true);

    const presentationService = TestBed.inject(
      PresentationService,
    ) as unknown as FakePresentationService;
    const presentacionLejana = { id: 'pres-105', name: 'Familiar 32 onz', active: true, created_at: '2026-01-01T00:00:00' };
    presentationService.searchActivePresentations = vi.fn().mockResolvedValue([presentacionLejana]);

    const v1 = component.draft().variants[0];
    const row = variantRow(v1.localId);
    const picker = fixture.debugElement
      .queryAll(By.directive(SearchableSelectComponent))
      .find(
        (el) =>
          row.contains(el.nativeElement as Node) &&
          el.componentInstance.placeholder === 'Elige una presentación',
      )!;
    expect(picker).toBeTruthy();
    const searchFn = picker.componentInstance.search as (
      q: string,
    ) => Promise<{ id: string; label: string }[]>;

    const resultado = await searchFn('familiar');

    expect(presentationService.searchActivePresentations).toHaveBeenCalledWith('familiar');
    expect(resultado).toEqual([{ id: 'pres-105', label: 'Familiar 32 onz' }]);
  });

  it('el selector de Categoría conserva visible la categoría ya elegida aunque quede fuera de allCategories() (D4)', async () => {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupService },
        { provide: PresentationService, useClass: FakePresentationService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p9' }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
    await tick();

    // 'cat-105' no está en allCategories() (FakeCategoryService solo trae 'c1' = Helados):
    // simula estar fuera de los primeros 100.
    http.expectOne(`${PRODUCTS}/p9`).flush({
      id: 'p9',
      category_id: 'cat-105',
      category_name: 'Postres fríos',
      name: 'Cono doble',
      description: null,
      preparation_type: 'prepared',
      image_url: null,
      active: true,
      available: true,
      tracks_inventory: false,
      created_at: '2026-08-19T00:00:00',
      variants: [],
      deactivated: [],
    });
    await tick();
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();

    expect(component.draft().category_id).toBe('cat-105');
    expect(component.categoryOptions()).toContainEqual({ id: 'cat-105', label: 'Postres fríos' });

    const picker = fixture.debugElement
      .queryAll(By.directive(SearchableSelectComponent))
      .find((el) => el.componentInstance.placeholder === 'Seleccionar categoría…')!;
    const boton = (picker.nativeElement as HTMLElement).querySelector('button')!;
    expect(boton.textContent).toContain('Postres fríos');
  });

  it('guardar un producto nuevo sin insumos no produce ningún error de validación', async () => {
    await createNew();
    component.setField('name', 'Domicilio');
    component.setField('category_id', 'c1');
    fixture.detectChanges();

    const savePromise = component.save();

    // Spec 043: una sola petición trae el producto y su única variante (con su receta/
    // grupos vacíos). Spec 084 (A-79): `presentation_id: null` = "Presentación única",
    // que el backend resuelve. Spec 099: `name` siempre viaja, `''` por defecto.
    const created = http.expectOne(PRODUCTS);
    expect(created.request.method).toBe('POST');
    expect(created.request.body.tracks_inventory).toBe(false);
    expect(created.request.body.variants).toEqual([
      { price: 0, presentation_id: null, name: '', recipe: [], option_groups: [] },
    ]);
    created.flush({
      id: 'p1',
      category_id: 'c1',
      name: 'Domicilio',
      description: null,
      preparation_type: 'prepared',
      image_url: null,
      active: true,
      available: true,
      tracks_inventory: false,
      created_at: '2026-08-19T00:00:00',
      variants: [],
    });

    await savePromise;
    expect(component.service.error()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/products']);
  });

  // ── Bug 4 — "Copiar insumos" solo con inventario activo (FR-021 a FR-024) ─

  /** Arranca en modo edición para `id`, con dos presentaciones ya guardadas
   *  (una con un insumo) y `tracks_inventory` según `tracksInventory`. */
  async function createEdit(id: string, tracksInventory: boolean): Promise<void> {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupService },
        { provide: PresentationService, useClass: FakePresentationService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit
    await tick();

    // Spec 103: receta y grupos de opciones ya vienen embebidos por variante en la misma
    // respuesta de detalle -- v1 ya tiene un insumo guardado; v2 no.
    http.expectOne(`${PRODUCTS}/${id}`).flush({
      id,
      category_id: 'c1',
      name: 'Cono doble',
      description: null,
      preparation_type: 'prepared',
      image_url: null,
      active: true,
      available: true,
      tracks_inventory: tracksInventory,
      created_at: '2026-08-19T00:00:00',
      variants: [
        {
          id: 'v1', product_id: id, sku: null, price: '8000', active: true,
          presentation_id: 'p-grande', presentation_name: 'Grande',
          recipe: [{ id: 'r1', inventory_item_id: 'i1', quantity: '1' }],
          option_groups: [],
        },
        {
          id: 'v2', product_id: id, sku: null, price: '5000', active: true,
          presentation_id: 'p-pequena', presentation_name: 'Pequeña',
          recipe: [], option_groups: [],
        },
      ],
      // Ajuste posterior a la spec 103: las desactivadas ya vienen en la misma
      // respuesta -- ya no hace falta un segundo `GET /products/{id}/variants`.
      deactivated: [] as unknown[],
    });
    await tick();
    fixture.detectChanges();
  }

  /** El botón "Copiar insumos..." de la presentación activa, o `null` si no está. */
  const copyButton = (): HTMLButtonElement | null =>
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.includes('Copiar insumos'),
    ) ?? null;

  // Spec 064 cambia deliberadamente el criterio de visibilidad de este botón: antes
  // (spec 027) exigía `tracks_inventory=true` porque copiaba "insumos y sabores" y
  // ambos vivían detrás del mismo switch. Ahora "Sabores a elegir" (selector de grupo,
  // min/max) ya no depende del switch (FR-006) -- el botón sigue teniendo sentido sin
  // inventario (copiar a qué grupos ofrece cada tamaño), así que su condición pasa a
  // ser solo `hasSizes && variants.length > 1`, sin importar `tracks_inventory`.

  it('el botón "Copiar insumos..." aparece con hasSizes && variants.length > 1, aunque tracks_inventory esté apagado', async () => {
    await createNew();
    component.toggleHasSizes(); // hasSizes=true, 3 variantes — switch de inventario sigue apagado
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(false);
    expect(component.draft().hasSizes && component.draft().variants.length > 1).toBe(true);
    expect(copyButton()).not.toBeNull();
  });

  it('el botón "Copiar insumos..." también aparece con tracks_inventory=true, en las mismas condiciones', async () => {
    await createNew();
    component.toggleHasSizes();
    await component.toggleTracksInventory();
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(true);
    expect(copyButton()).not.toBeNull();
    expect(copyButton()!.textContent).toContain('Copiar insumos');
  });

  it('el botón no depende de toggleTracksInventory(): permanece visible al encender y apagar', async () => {
    await createNew();
    component.toggleHasSizes();
    fixture.detectChanges();
    expect(copyButton()).not.toBeNull();

    await component.toggleTracksInventory(); // enciende
    fixture.detectChanges();
    expect(copyButton()).not.toBeNull();

    await component.toggleTracksInventory(); // apaga (sin insumos configurados: no pide confirmación)
    fixture.detectChanges();
    expect(copyButton()).not.toBeNull();
  });

  it('en edición, el botón aparece igual con tracks_inventory=false o =true', async () => {
    await createEdit('p9', false);
    expect(component.draft().hasSizes).toBe(true); // 2 variantes ya guardadas
    expect(copyButton()).not.toBeNull();
  });

  it('en edición, con tracks_inventory=true el botón aparece igual que en creación', async () => {
    await createEdit('p9', true);

    expect(component.draft().hasSizes).toBe(true);
    expect(copyButton()).not.toBeNull();
  });

  // ── Orden de presentaciones por arrastre (spec 042) ──────────────────────

  const drop = (previousIndex: number, currentIndex: number) =>
    ({ previousIndex, currentIndex }) as CdkDragDrop<VariantDraft[]>;

  it('arrastrar reordena draft().variants de inmediato, sin ninguna llamada al backend', async () => {
    await createEdit('p9', true); // v1 Grande, v2 Pequeña (ese orden)

    expect(component.draft().variants.map((v) => v.presentationName)).toEqual(['Grande', 'Pequeña']);

    component.onVariantDrop(drop(0, 1));
    fixture.detectChanges();

    expect(component.draft().variants.map((v) => v.presentationName)).toEqual(['Pequeña', 'Grande']);
    // Puramente local: ninguna petición pendiente por el solo hecho de arrastrar.
    http.expectNone((r) => r.url.endsWith('/variants/reorder'));
  });

  it('soltar en la misma posición no cambia nada', async () => {
    await createEdit('p9', true);
    const before = component.draft().variants.map((v) => v.presentationName);

    component.onVariantDrop(drop(1, 1));
    fixture.detectChanges();

    expect(component.draft().variants.map((v) => v.presentationName)).toEqual(before);
  });

  it('guardar tras arrastrar persiste el nuevo orden en una sola llamada atómica', async () => {
    await createEdit('p9', true);
    component.onVariantDrop(drop(0, 1)); // Grande, Pequeña → Pequeña, Grande
    fixture.detectChanges();

    const savePromise = component.save();

    // Spec 043: una sola petición PATCH trae producto + presentaciones en el orden
    // ya arrastrado -- el orden de `variants[]` en el body reemplaza al endpoint de
    // reordenamiento por separado (spec 042).
    const req = http.expectOne(`${PRODUCTS}/p9`);
    expect(req.request.method).toBe('PATCH');
    const ids = (req.request.body.variants as Array<{ id?: string }>).map((v) => v.id);
    expect(ids).toEqual(['v2', 'v1']); // Pequeña (v2) primero tras arrastrar
    req.flush({
      id: 'p9', category_id: 'c1', name: 'Cono doble', description: null,
      preparation_type: 'prepared', image_url: null, active: true, available: true,
      tracks_inventory: true, created_at: '2026-08-19T00:00:00', variants: [],
    });

    await savePromise;
    expect(component.service.error()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/dashboard/products']);
  });

  // ── Guardado unificado de producto (spec 043) ────────────────────────────

  it('restaurar una presentación desactivada solo la trae al draft, sin ninguna llamada de escritura', async () => {
    await createEdit('p9', true);
    component.draft.update((d) => ({
      ...d,
      deactivated: [{ id: 'v3', price: 4000, presentationId: 'p-mediana', presentationName: 'Mediana' }],
    }));

    const restorePromise = component.restoreVariant({
      id: 'v3', price: 4000, presentationId: 'p-mediana', presentationName: 'Mediana',
    });

    // Solo lectura (sin cambios, spec 043 no toca los GET) -- research.md Decisión 4:
    // ya no hay ningún PATCH /variants/v3 disparado por el solo hecho de restaurar.
    http.expectOne(`${VARIANTS}/v3/recipe`).flush([]);
    http.expectOne(`${VARIANTS}/v3/option-groups`).flush([]);
    http.expectNone(`${VARIANTS}/v3`);

    await restorePromise;

    expect(component.draft().variants.map((v) => v.presentationName)).toContain('Mediana');
    expect(component.draft().deactivated).toEqual([]);
  });

  // ── Gating por plan del switch de inventario (spec 064, US5) ─────────────

  it('sin el módulo Inventario en el plan, el switch aparece deshabilitado', async () => {
    planSummary.set(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));
    await createNew();

    expect(switchButton().disabled).toBe(true);
  });

  it('sin el módulo Inventario, hacer click en el switch deshabilitado no cambia nada', async () => {
    planSummary.set(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));
    await createNew();

    switchButton().click(); // no-op: el navegador nunca dispara (click) sobre [disabled]
    fixture.detectChanges();

    expect(component.draft().tracks_inventory).toBe(false);
  });

  it('un producto existente con tracks_inventory=true conserva ese valor visible aunque el switch esté deshabilitado sin el módulo', async () => {
    planSummary.set(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));
    await createEdit('p9', true);

    expect(component.draft().tracks_inventory).toBe(true);
    expect(switchButton().getAttribute('aria-checked')).toBe('true');
    expect(switchButton().disabled).toBe(true);
    // sectionsEnabled() combina el switch con el plan: sin módulo, ni "Insumos fijos" ni
    // la parte de inventario de "Sabores a elegir" se muestran, aunque el switch siga en
    // `true` (dato preservado, FR-013) -- research.md Decisión 5.
    expect(text()).not.toContain('Insumos fijos');
  });

  it('con el módulo Inventario incluido, el switch funciona con normalidad (sin regresión)', async () => {
    planSummary.set(makeSummary({ modules: { inventario: true, compras: true, promociones: true } }));
    await createNew();

    expect(switchButton().disabled).toBe(false);
    switchButton().click();
    fixture.detectChanges();
    expect(component.draft().tracks_inventory).toBe(true);
  });

  // ── Variante sin nombre: la presentación la nombra (spec 084, US7, A-79) ──

  /** La fila `<div cdkDrag>` de una variante -- para no confundir su `<select>` con los de
   *  `category_id`/`preparation_type` (arriba del todo). */
  const variantRow = (localId: string): HTMLElement =>
    (Array.from(fixture.nativeElement.querySelectorAll('[cdkDrag]')) as HTMLElement[])[
      component.draft().variants.findIndex((v) => v.localId === localId)
    ];

  /** spec 102 (D3): el selector de presentación de una fila dejó de ser un `<select>`
   *  nativo -- ahora es `app-searchable-select`; esto devuelve su botón cerrado. */
  const variantRowPresentationButton = (localId: string): HTMLButtonElement =>
    variantRow(localId).querySelector('app-searchable-select button')!;

  /** spec 099: el input de texto del "Nombre (opcional)" de una fila. */
  const variantRowNameInput = (localId: string): HTMLInputElement =>
    variantRow(localId).querySelector('input[type="text"]')!;

  /** Texto de la tarjeta a partir de un ancla, para comparar el orden vertical. */
  const position = (needle: string): number => fixture.nativeElement.innerHTML.indexOf(needle);

  it('la tabla de tamaños tiene un campo "Nombre (opcional)" junto a la presentación (spec 099)', async () => {
    await createEdit('p9', true);
    const row = variantRow(component.draft().variants[0].localId);

    // El input del precio (app-money-input) y el nuevo input de nombre propio.
    expect(row.querySelectorAll('input').length).toBe(2);
    expect(row.querySelector('app-searchable-select')).not.toBeNull();
    expect(text()).toContain('Nombre (opcional)');
  });

  // ── Nombre comercial propio de la variante (spec 099) ───────────────────

  it('el placeholder dice "Se mostrará: <presentación>" cuando ya se eligió una', async () => {
    await createEdit('p9', true);
    const v1 = component.draft().variants[0];
    expect(v1.presentationName).toBe('Grande');

    expect(variantRowNameInput(v1.localId).placeholder).toBe('Se mostrará: Grande');
  });

  it('el placeholder dice "Se mostrará la presentación" si aún no se eligió ninguna', async () => {
    await createEdit('p9', true);
    component.addVariant();
    fixture.detectChanges();
    const nueva = component.draft().variants[2];

    expect(variantRowNameInput(nueva.localId).placeholder).toBe('Se mostrará la presentación');
  });

  it('escribir un nombre y guardar lo persiste; borrarlo hace que la fila vuelva a mostrar la presentación', async () => {
    await createEdit('p9', true);
    const v1 = component.draft().variants[0];

    const input = variantRowNameInput(v1.localId);
    input.value = 'Para compartir';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.draft().variants[0].name).toBe('Para compartir');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.draft().variants[0].name).toBe('');
  });

  it('61 caracteres en el nombre bloquea el guardado con el mensaje del límite (Escenario 8)', async () => {
    await createEdit('p9', true);
    const v1 = component.draft().variants[0];

    component.setVariantField(v1.localId, 'name', 'a'.repeat(61));
    fixture.detectChanges();

    expect(component.canSave()).toBe(false);
    expect(text()).toContain('El nombre admite hasta 60 caracteres');
  });

  it('dos variantes que resolverían al mismo nombre dentro del producto bloquean el guardado (Escenario 9)', async () => {
    await createEdit('p9', true);
    const [v1, v2] = component.draft().variants;
    // v1 = "Grande", v2 = "Pequeña" (FakePresentationService). Ponerle a v2 el nombre
    // "Grande" hace que ambas resuelvan a la misma etiqueta.
    component.setVariantField(v2.localId, 'name', 'Grande');
    fixture.detectChanges();

    expect(component.canSave()).toBe(false);
    expect(text()).toContain('Ya existe un tamaño con ese nombre en este producto');

    void v1;
  });

  it('el selector de presentación no ofrece "Sin presentación"', async () => {
    await createEdit('p9', true);
    const v1 = component.draft().variants[0];
    const labels = component.presentationSelectOptionsFor(v1).map((o) => o.label);

    expect(labels).not.toContain('Sin presentación');
  });

  it('el select excluye las presentaciones ya elegidas en otras filas, pero conserva la propia', async () => {
    await createEdit('p9', true); // v1 Grande, v2 Pequeña
    const [v1] = component.draft().variants;
    const names = component.presentationOptionsFor(v1).map((o) => o.name);

    expect(names).toContain('Grande'); // la propia
    expect(names).toContain('Mediana'); // libre
    expect(names).not.toContain('Pequeña'); // ya la usa la fila 2
  });

  it('elegir una presentación guarda su id y su nombre en la fila', async () => {
    await createEdit('p9', true);
    const v2 = component.draft().variants[1];

    component.setVariantPresentation(v2.localId, 'p-mediana');
    fixture.detectChanges();

    expect(component.draft().variants[1].presentationId).toBe('p-mediana');
    expect(component.draft().variants[1].presentationName).toBe('Mediana');
  });

  it('elegir una presentación en el desplegable (DOM) actualiza el id y el nombre en la fila', async () => {
    await createEdit('p9', true);
    const v1 = component.draft().variants[0];
    const row = variantRow(v1.localId);

    variantRowPresentationButton(v1.localId).click();
    fixture.detectChanges();

    const option = (
      Array.from(row.querySelectorAll('app-searchable-select li')) as HTMLLIElement[]
    ).find((li) => li.textContent?.trim() === 'Mediana')!;
    option.click();
    fixture.detectChanges();

    expect(component.draft().variants[0].presentationId).toBe('p-mediana');
    expect(component.draft().variants[0].presentationName).toBe('Mediana');
  });

  it('una fila nueva sin presentación bloquea el guardado y se señala en la fila', async () => {
    await createEdit('p9', true);
    component.addVariant();
    fixture.detectChanges();
    const nueva = component.draft().variants[2];

    expect(nueva.presentationId).toBeNull();
    expect(component.canSave()).toBe(false);
    expect(component.isPresentationMissing(nueva)).toBe(true);
    expect(text()).toContain('Elige una presentación');

    component.setVariantPresentation(nueva.localId, 'p-mediana');
    expect(component.canSave()).toBe(true);
  });

  it('el guardado envía presentation_id y el nombre propio (spec 099, \'\' por defecto) de cada variante', async () => {
    await createEdit('p9', true);
    const [v1, v2] = component.draft().variants;
    component.setVariantPresentation(v1.localId, 'p-mediana');
    fixture.detectChanges();

    const savePromise = component.save();

    const req = http.expectOne(`${PRODUCTS}/p9`);
    const variants = req.request.body.variants as Array<Record<string, unknown>>;
    expect(variants.find((v) => v['id'] === v1.id)?.['presentation_id']).toBe('p-mediana');
    expect(variants.find((v) => v['id'] === v2.id)?.['presentation_id']).toBe('p-pequena');
    expect(variants.every((v) => v['name'] === '')).toBe(true);
    req.flush({
      id: 'p9', category_id: 'c1', name: 'Cono doble', description: null,
      preparation_type: 'prepared', image_url: null, active: true, available: true,
      tracks_inventory: true, created_at: '2026-08-19T00:00:00', variants: [],
    });
    await savePromise;
  });

  // ── Imagen base (spec 088, FR-002, A-92) ────────────────────────────────

  const savedProduct = (id: string) => ({
    id, category_id: 'c1', name: 'Cono doble', description: null,
    preparation_type: 'prepared', image_url: null, active: true, available: true,
    tracks_inventory: true, created_at: '2026-08-19T00:00:00', variants: [],
  });

  it('al guardar sin tocar la imagen no se envía image_url y sí la base (null si no había imagen)', async () => {
    await createEdit('p9', true); // el producto de prueba no tiene imagen
    expect(component.draft().image_url_base).toBeNull();

    const savePromise = component.save();
    const req = http.expectOne(`${PRODUCTS}/p9`);
    expect(req.request.body.image_url).toBeNull();
    expect('image_url_base' in req.request.body).toBe(true);
    expect(req.request.body.image_url_base).toBeNull();
    req.flush(savedProduct('p9'));
    await savePromise;
  });

  it('con una imagen ya cargada, guardar sin tocarla no la reenvía: solo viaja la base', async () => {
    await createEdit('p9', true);
    const asset = 'https://assets.skeilopos.com/acme/products/vigente.png';
    // Lo que produce `getProductDraft` para un producto que ya tenía imagen.
    component.draft.update((d) => ({ ...d, image_url: asset, image_url_base: asset }));

    const savePromise = component.save();
    const req = http.expectOne(`${PRODUCTS}/p9`);
    expect(req.request.body.image_url).toBeNull();
    expect(req.request.body.image_url_base).toBe(asset);
    req.flush(savedProduct('p9'));
    await savePromise;
  });

  it('con una imagen nueva viajan image_url (la nueva) y la base (la vigente al abrir)', async () => {
    await createEdit('p9', true);
    const asset = 'https://assets.skeilopos.com/acme/products/vigente.png';
    const nueva = 'https://pub-x.r2.dev/acme/products/nueva.png';
    component.draft.update((d) => ({ ...d, image_url: nueva, image_url_base: asset }));

    const savePromise = component.save();
    const req = http.expectOne(`${PRODUCTS}/p9`);
    expect(req.request.body.image_url).toBe(nueva);
    expect(req.request.body.image_url_base).toBe(asset);
    req.flush(savedProduct('p9'));
    await savePromise;
  });

  it('encender tamaños preselecciona Grande/Mediana/Pequeña si el catálogo las tiene', async () => {
    await createNew();
    component.toggleHasSizes();
    fixture.detectChanges();

    expect(component.draft().variants.map((v) => v.presentationName)).toEqual([
      'Grande', 'Mediana', 'Pequeña',
    ]);
    expect(component.canSave()).toBe(false); // sin nombre ni categoría: solo verifica que no explote
  });

  it('apagar tamaños deja la única variante en "Presentación única" (id nulo, lo resuelve el backend)', async () => {
    await createEdit('p9', true);
    component.toggleHasSizes(); // colapsa a una sola variante (la primera)
    fixture.detectChanges();

    expect(component.draft().variants.length).toBe(1);
    expect(component.draft().variants[0].presentationId).toBeNull();
    expect(component.draft().variants[0].presentationName).toBe('Presentación única');
  });

  it('restaurar una variante cuya presentación ya usa otra fila se rechaza', async () => {
    await createEdit('p9', true);
    component.draft.update((d) => ({
      ...d,
      deactivated: [{ id: 'v9', price: 1, presentationId: 'p-grande', presentationName: 'Grande' }],
    }));

    await component.restoreVariant({
      id: 'v9', price: 1, presentationId: 'p-grande', presentationName: 'Grande',
    });

    expect(component.service.otherError()).toContain('Grande');
    expect(component.draft().deactivated.length).toBe(1);
  });

  // ── Orden de la tarjeta "Tamaños del producto" (spec 084, US8) ───────────

  it('con tamaños, la tabla va antes de "Maneja inventario" y este antes del detalle', async () => {
    await createEdit('p9', false);

    const tabla = position('+ Agregar tamaño');
    const inventario = position('Maneja inventario');
    const detalle = position('Insumos fijos') === -1
      ? position('Activa "Maneja inventario" arriba')
      : position('Insumos fijos');

    expect(tabla).toBeGreaterThan(-1);
    expect(inventario).toBeGreaterThan(tabla);
    expect(detalle).toBeGreaterThan(inventario);
  });

  it('con "Maneja inventario" apagado, la tabla de tamaños sigue visible y editable', async () => {
    await createEdit('p9', false);

    expect(component.draft().tracks_inventory).toBe(false);
    expect(variantRow(component.draft().variants[0].localId)).toBeTruthy();
    expect(variantRowPresentationButton(component.draft().variants[0].localId).disabled).toBe(false);
  });

  it('sin tamaños no hay tabla y "Maneja inventario" queda bajo el encabezado', async () => {
    await createNew();

    expect(fixture.nativeElement.querySelectorAll('[cdkDrag]').length).toBe(0);
    expect(position('Maneja inventario')).toBeGreaterThan(position('Tamaños del producto'));
  });

  // ── Historia 1 (spec 102): nombre real de insumos ya guardados ───────────

  it('tras cargar un producto, resuelve por id el insumo de la receta que no está en allItems(), y el selector muestra su nombre real', async () => {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupService },
        { provide: PresentationService, useClass: FakePresentationService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p9' }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    const inventory = TestBed.inject(InventoryService) as unknown as FakeInventoryService;
    const resolveSpy = vi
      .spyOn(inventory, 'resolveMissingItems')
      .mockImplementation(async (ids: string[]) => {
        // Simula la resolución real contra `GET /items/{id}`: cada id pedido obtiene un
        // insumo con nombre real.
        inventory.resolvedExtraItems.set(ids.map((id) => ({ id, name: `Insumo resuelto ${id}` })));
      });

    fixture.detectChanges(); // dispara ngOnInit
    await tick();

    // Spec 103: receta embebida directamente en GET /products/{id}. 'i1' no está en
    // allItems() (FakeInventoryService la deja vacía): simula estar fuera de los
    // primeros 100.
    http.expectOne(`${PRODUCTS}/p9`).flush({
      id: 'p9',
      category_id: 'c1',
      name: 'Cono doble',
      description: null,
      preparation_type: 'prepared',
      image_url: null,
      active: true,
      available: true,
      tracks_inventory: true,
      created_at: '2026-08-19T00:00:00',
      variants: [
        {
          id: 'v1', product_id: 'p9', sku: null, price: '8000', active: true,
          presentation_id: 'p-grande', presentation_name: 'Grande',
          recipe: [{ id: 'r1', inventory_item_id: 'i1', quantity: '1' }],
          option_groups: [],
        },
      ],
      deactivated: [],
    });
    await tick();
    await tick(); // deja completar la microtarea de `void resolveMissingItems(...)`
    fixture.detectChanges();

    expect(resolveSpy).toHaveBeenCalledWith(['i1']);
    expect(component.inventoryOptions()).toEqual([{ id: 'i1', label: 'Insumo resuelto i1' }]);

    // Se identifica por su placeholder: categoría y presentación también son
    // `app-searchable-select` ahora (spec 102, D3).
    const picker = fixture.debugElement
      .queryAll(By.directive(SearchableSelectComponent))
      .find((el) => el.componentInstance.placeholder === 'Insumo…')!;
    const boton = (picker.nativeElement as HTMLElement).querySelector('button')!;
    expect(boton.textContent).toContain('Insumo resuelto i1');
    expect(boton.textContent).not.toContain('Insumo…');
  });

  it('recolecta también el insumo del desglose de consumo de una opción, no solo el de la receta', async () => {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();

    class FakeOptionGroupServiceConInsumo {
      groups = signal([
        {
          id: 'og1',
          name: 'Sabores',
          options: [
            {
              id: 'o1',
              option_group_id: 'og1',
              name: 'Fresa',
              extra_price: 0,
              inventory_item_id: 'i2',
              item_quantity: 1,
              active: true,
            },
          ],
        },
      ]);
      async loadGroups(): Promise<void> {}
    }

    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupServiceConInsumo },
        { provide: PresentationService, useClass: FakePresentationService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p9' }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    const inventory = TestBed.inject(InventoryService) as unknown as FakeInventoryService;
    const resolveSpy = vi
      .spyOn(inventory, 'resolveMissingItems')
      .mockImplementation(async () => {});

    fixture.detectChanges();
    await tick();

    http.expectOne(`${PRODUCTS}/p9`).flush({
      id: 'p9',
      category_id: 'c1',
      name: 'Cono doble',
      description: null,
      preparation_type: 'prepared',
      image_url: null,
      active: true,
      available: true,
      tracks_inventory: true,
      created_at: '2026-08-19T00:00:00',
      variants: [
        {
          id: 'v1', product_id: 'p9', sku: null, price: '8000', active: true,
          presentation_id: 'p-grande', presentation_name: 'Grande',
          recipe: [],
          option_groups: [
            { id: 'vog1', product_variant_id: 'v1', option_group_id: 'og1', min_select: 1, max_select: 1, quantity_per_option: '0' },
          ],
        },
      ],
      deactivated: [],
    });
    await tick();
    await tick();
    fixture.detectChanges();

    expect(resolveSpy).toHaveBeenCalledWith(['i2']);
  });

  // ── Historia única (spec 103): sin control de "Reintentar" por tamaño ─────

  it('nunca existe un control de "Reintentar" por tamaño: la carga deja de ser parcial (FR-009)', async () => {
    await createEdit('p9', true);

    const retryButton = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.includes('Reintentar'),
    );
    expect(retryButton).toBeUndefined();
    expect((component as unknown as { retryVariantLoad?: unknown }).retryVariantLoad).toBeUndefined();
  });

  it('si GET /products/{id} falla por completo, el formulario navega fuera sin mostrar ningún control por tamaño', async () => {
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
        { provide: CategoryService, useClass: FakeCategoryService },
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
        { provide: OptionGroupService, useClass: FakeOptionGroupService },
        { provide: PresentationService, useClass: FakePresentationService },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p9' }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
    fixture = TestBed.createComponent(ProductFormComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
    await tick();

    // Falla total de GET /products/{id} -- no hay degradación parcial que mostrar por
    // tamaño (research.md D4/Edge Cases): ningún otro endpoint llega a pedirse.
    http.expectOne(`${PRODUCTS}/p9`).flush('boom', { status: 500, statusText: 'Server Error' });
    await tick();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/dashboard/products']);
    http.expectNone(`${PRODUCTS}/p9/variants`);
  });

});
