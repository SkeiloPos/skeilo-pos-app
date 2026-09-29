import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { ManualOrderPageComponent } from './manual-order-page.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';
import { MenuService } from '../../../core/services/menu.service';
import { MenuCategory, MenuProduct } from '../../products/interfaces/product.interface';
import { DiningSessionService } from '../services/dining-session.service';
import { CheckoutPreview, DiningOrder } from '../interfaces/dining.interface';
import { ConfirmService } from '../../../shared/feedback/confirm.service';

const API = environment.apiBaseUrl;

/** spec 077 sumó `AuthService → PushRegistrationService → SwPush` al árbol de
 *  inyección de esta página; los TestBeds de este archivo no proveían `SwPush`
 *  y quedaron en `NG0201`. Ningún test de aquí ejercita push (spec 078, stub
 *  local). */
const swPushStub = { provide: SwPush, useValue: { isEnabled: false } };

function table(partial: Partial<Table>): Table {
  return { id: 't1', number: 1, name: null, qr_token: 'tok', active: true, status: 'libre', ...partial };
}

/** Producto de catálogo mínimo para spec 051 (imagen en tarjeta/detalle). */
function menuProduct(partial: Partial<MenuProduct>): MenuProduct {
  return {
    id: 'p1',
    name: 'Producto Test',
    description: null,
    image_url: null,
    variants: [{ id: 'v1', name: 'Único', price: 4000 } as MenuProduct['variants'][number]],
    option_groups: [],
    available: true,
    ...partial,
  };
}

function menuCategory(products: MenuProduct[], partial: Partial<MenuCategory> = {}): MenuCategory {
  return { id: 'c1', name: 'Categoría Test', products, ...partial };
}

/** Vista dedicada de armado de pedido nuevo (ajuste posterior a spec 036).
 *  `store.init()` se anula (`vi.spyOn`) para no disparar las peticiones
 *  HTTP de `ngOnInit` ajenas a lo que prueba este spec — mismo patrón que
 *  `table-sessions.component.spec.ts`. `PosTerminalStore` es component-level
 *  (`providers` propio), así que se toma desde `fixture.componentInstance`,
 *  no desde `TestBed.inject`. */
describe('ManualOrderPageComponent', () => {
  let fixture: ComponentFixture<ManualOrderPageComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let router: Router;
  let http: HttpTestingController;

  function createComponent(tableId: string | null, tipo?: string): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManualOrderPageComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(tableId ? { tableId } : {}),
              // spec 078 (US2): `ngOnInit` lee `?tipo=` de aquí.
              queryParamMap: convertToParamMap(tipo ? { tipo } : {}),
            },
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ManualOrderPageComponent);
    store = fixture.componentInstance.store;
    tableService = TestBed.inject(TableService);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
    // spec 073: el effect del componente pide `POST /orders/draft-preview` en
    // cada cambio del borrador. Por defecto se simula un fallo — la pantalla
    // cae a `store.totals()` (subtotal local, sin descuento — FR-015), que es
    // exactamente lo que estos tests preexistentes esperan ver. Los tests
    // propios de US5 (más abajo) usan el endpoint real.
    vi.spyOn(TestBed.inject(DiningSessionService), 'draftPreview').mockRejectedValue(
      new Error('draft-preview no mockeado en este test'),
    );
  }

  afterEach(() => http.verify());

  /** Helpers para el select buscable de mesas (spec 053). */
  function abrirSelectorMesas(): void {
    const boton = fixture.nativeElement.querySelector('app-searchable-select button') as HTMLButtonElement;
    boton.click();
    fixture.detectChanges();
  }

  function opcionesMesas(): HTMLLIElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('app-searchable-select li')) as HTMLLIElement[];
  }

  /** Helpers para el campo "Cliente" (spec 054). Rediseño
   *  (`create-order/code.html`): la etiqueta es un `<label>` (no `<h3>`), y
   *  en "Para llevar" dice "Cliente / Para llevar" -- de ahí el
   *  `startsWith` en vez de una comparación exacta. */
  function clienteHeading(): HTMLElement {
    return Array.from(fixture.nativeElement.querySelectorAll('h3, label')).find((h) =>
      (h as HTMLElement).textContent?.trim().startsWith('Cliente'),
    ) as HTMLElement;
  }

  /** spec 087 (FR-005, A-88): los 3 tabs tratan "Cliente" igual -- un input
   *  simple, siempre editable, directo hermano de su `<label>` (sin toggle de
   *  solo-lectura ni botón de edición, retirados con el auto-relleno
   *  "Consumidor final"). */
  function campoCliente(): HTMLInputElement {
    return clienteHeading().nextElementSibling as HTMLInputElement;
  }

  function escribirCliente(texto: string): void {
    const input = campoCliente();
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function buscarEnSelectorMesas(texto: string): void {
    const input = fixture.nativeElement.querySelector('app-searchable-select input') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('al iniciar, selecciona la mesa del parámetro de ruta', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(store.selectedTableId()).toBe('t1');
  });

  // ── spec 055: "Para Llevar" habilitada, "Domicilio" sigue deshabilitada ───

  function botonTipoOrden(texto: string): HTMLButtonElement {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes(texto),
    ) as HTMLButtonElement;
  }

  function botonConfirmar(): HTMLButtonElement {
    return botonTipoOrden('Crear pedido');
  }

  it('"Para Llevar" y "Domicilio" ya no son placeholders deshabilitados (spec 055 FR-008, spec 056 FR-001)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(botonTipoOrden('Para llevar').disabled).toBe(false);
    expect(botonTipoOrden('Domicilio').disabled).toBe(false);
  });

  // ── spec 078 (US2): tipo preseleccionado desde `?tipo=` ──────────────────

  it('ngOnInit con ?tipo=domicilio preselecciona "domicilios" una sola vez (FR-008)', async () => {
    createComponent(null, 'domicilio');
    const spy = vi.spyOn(fixture.componentInstance, 'setOrderTypeTab');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.orderTypeTab()).toBe('domicilios');
    expect(spy.mock.calls.filter((c) => c[0] === 'domicilios')).toHaveLength(1);
  });

  it('ngOnInit con ?tipo=para-llevar preselecciona "para-llevar" (FR-009)', async () => {
    createComponent(null, 'para-llevar');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.orderTypeTab()).toBe('para-llevar');
  });

  for (const tipo of [undefined, 'mesas', 'cualquier-cosa']) {
    it(`ngOnInit con ?tipo=${tipo ?? '(ausente)'} no toca el tipo — queda en "mesas" como hoy (FR-010)`, async () => {
      createComponent(null, tipo);
      const spy = vi.spyOn(fixture.componentInstance, 'setOrderTypeTab');
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      expect(store.orderTypeTab()).toBe('mesas');
      expect(spy).not.toHaveBeenCalled();
    });
  }

  it('tras la preselección, el tipo sigue siendo editable dentro del formulario (FR-011)', async () => {
    createComponent(null, 'domicilio');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(store.orderTypeTab()).toBe('domicilios');

    botonTipoOrden('Para llevar').click();
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('para-llevar');
  });

  it('al seleccionar "Para Llevar", el bloque "Mesas" desaparece (FR-009)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    botonTipoOrden('Para llevar').click();
    fixture.detectChanges();

    expect(clienteHeading()).toBeTruthy();
    const mesasHeading = Array.from(fixture.nativeElement.querySelectorAll('h3')).find(
      (h) => (h as HTMLElement).textContent?.trim() === 'Mesas',
    );
    expect(mesasHeading).toBeUndefined();
    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeNull();
  });

  it('con "Para Llevar" y el carrito no vacío, "Crear pedido" se habilita sin ninguna mesa seleccionada (FR-009)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    botonTipoOrden('Para llevar').click();
    store.customerName.set('Ana Torres');
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(store.selectedTableId()).toBeNull();
    expect(botonConfirmar().disabled).toBe(false);
  });

  it('con "En Mesa" y ninguna mesa seleccionada, "Crear pedido" sigue deshabilitado aunque haya productos (FR-009, no regresión)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('mesas');
    expect(botonConfirmar().disabled).toBe(true);
  });

  it('al seleccionar "Para Llevar", el campo Cliente queda vacío y editable, sin valor por defecto (spec 087, FR-005/A-88 -- reemplaza el auto-relleno "Consumidor final" de spec 054)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    botonTipoOrden('Para llevar').click();
    fixture.detectChanges();

    expect(campoCliente().value).toBe('');
    expect(campoCliente().readOnly).toBe(false);
  });

  // ── spec 056: "Domicilio" habilitada con sus propios campos ──────────────

  /** Los campos de "Domicilio" (a diferencia de "Cliente" en Mesa/Para
   *  Llevar) no están envueltos en un `<div class="relative">`: el input es
   *  el `nextElementSibling` directo del `<h3>` de su etiqueta. */
  function campoDomicilio(etiqueta: string): HTMLInputElement {
    const heading = Array.from(fixture.nativeElement.querySelectorAll('h3, label')).find(
      (h) => (h as HTMLElement).textContent?.trim() === etiqueta,
    ) as HTMLElement;
    return heading.nextElementSibling as HTMLInputElement;
  }

  function seleccionarDomicilio(): void {
    botonTipoOrden('Domicilio').click();
    fixture.detectChanges();
  }

  it('al seleccionar "Domicilio", el bloque "Mesas" desaparece y no exige mesa (FR-002)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    seleccionarDomicilio();

    const mesasHeading = Array.from(fixture.nativeElement.querySelectorAll('h3')).find(
      (h) => (h as HTMLElement).textContent?.trim() === 'Mesas',
    );
    expect(mesasHeading).toBeUndefined();
    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeNull();
  });

  it('al seleccionar "Domicilio", muestra Cliente/Dirección/Teléfono/Valor del domicilio vacíos, sin readOnly (FR-003, FR-004, FR-005, FR-006)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();

    expect(campoDomicilio('Nombre cliente').value).toBe('');
    expect(campoDomicilio('Nombre cliente').readOnly).toBe(false);
    expect(campoDomicilio('Dirección de entrega').value).toBe('');
    expect(campoDomicilio('Teléfono').value).toBe('');
    expect(campoDomicilio('Tarifa Domicilio').value).toBe('');
  });

  it('con "Domicilio", "Crear pedido" está deshabilitado si falta Cliente, Dirección, o el valor del domicilio (FR-007)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    // Sin nada diligenciado: deshabilitado.
    expect(botonConfirmar().disabled).toBe(true);

    store.customerName.set('Ana Torres');
    fixture.detectChanges();
    expect(botonConfirmar().disabled).toBe(true); // falta dirección y valor

    store.deliveryAddress.set('Cra 45 #12-30');
    fixture.detectChanges();
    expect(botonConfirmar().disabled).toBe(true); // falta valor del domicilio

    store.deliveryFee.set(6000);
    fixture.detectChanges();
    expect(botonConfirmar().disabled).toBe(false); // teléfono nunca es obligatorio (FR-008)
  });

  it('con "Domicilio" y los tres campos obligatorios diligenciados, el valor del domicilio se refleja en el total (FR-009)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    store.customerName.set('Ana Torres');
    store.deliveryAddress.set('Cra 45 #12-30');
    store.deliveryFee.set(6000);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Domicilio');
    expect(store.totals().total).toBe(11000);
  });

  it('"Domicilio" crea el pedido con order_type DELIVERY y los datos de entrega (FR-010)', async () => {
    createComponent(null);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    seleccionarDomicilio();
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    store.customerName.set('Ana Torres');
    store.deliveryAddress.set('Cra 45 #12-30');
    store.deliveryFee.set(6000);
    fixture.detectChanges();

    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    botonConfirmar().click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalled();
    // El "Cliente" de Domicilio no debe quedar sobrescrito por el default de
    // "Consumidor final" (research.md Decisión 8, applyDefaultCustomerName).
    expect(store.customerName()).toBe('Ana Torres');
  });

  it('el campo "Mesa asignada" tiene su propia etiqueta, distinguible del encabezado "Nueva orden" (US3, FR-004/FR-005; rediseño create-order/code.html)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const nuevaOrdenHeading = fixture.nativeElement.querySelector('h2') as HTMLElement | null;
    expect(nuevaOrdenHeading?.textContent).toContain('Nueva orden');

    const mesaHeading = Array.from(fixture.nativeElement.querySelectorAll('label')).find(
      (h) => (h as HTMLElement).textContent?.trim() === 'Mesa asignada',
    ) as HTMLElement | undefined;
    expect(mesaHeading).toBeTruthy();
    expect(mesaHeading!.tagName).not.toBe(nuevaOrdenHeading!.tagName);
  });

  it('la barra superior solo contiene "Volver a la Terminal", sin el encabezado "Nueva orden" (spec 052, US1, FR-005)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const backButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Volver a la Terminal'),
    ) as HTMLButtonElement;
    const topBar = backButton.closest('div') as HTMLElement;
    expect(topBar.textContent).not.toContain('Nueva orden');
  });

  it('"Nueva orden" y "Mesa asignada" viven en el mismo panel derecho (spec 052, US1, FR-001/FR-002/FR-006; rediseño create-order/code.html)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const rightPanel = fixture.nativeElement.querySelector('[data-testid="ticket-column"]') as HTMLElement | null;
    expect(rightPanel).toBeTruthy();
    expect(rightPanel!.textContent).toContain('Nueva orden');
    expect(rightPanel!.textContent).toContain('Mesa asignada');
    expect(rightPanel!.textContent).toContain('Crear pedido');
    expect(rightPanel!.textContent).not.toContain('Volver a la Terminal');
  });

  /** Rediseño (`create-order/code.html`): el panel derecho ya no tiene un
   *  ancho fijo en píxeles -- ocupa 35% desde `lg` (mismo mecanismo de
   *  `table-sessions.component.ts`, ver `[data-testid="ticket-column"]`). */
  it('el panel derecho ocupa 35% del ancho desde lg (rediseño create-order/code.html)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const rightPanel = fixture.nativeElement.querySelector('[data-testid="ticket-column"]') as HTMLElement;
    expect(rightPanel.classList.contains('lg:w-[35%]')).toBe(true);
  });

  it('la tarjeta de catálogo muestra la imagen del producto cuando tiene image_url (US1, FR-001)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      menuCategory([menuProduct({ id: 'p1', name: 'Fresa Salvaje', image_url: 'https://cdn.test/fresa.jpg' })]),
    ]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('img[alt="Fresa Salvaje"]') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toContain('fresa.jpg');
  });

  it('la tarjeta de catálogo muestra un ícono de respaldo cuando el producto no tiene image_url (US1, FR-002)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([menuCategory([menuProduct({ id: 'p1', name: 'Sin Foto', image_url: null })])]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    const ligaduras = Array.from(
      fixture.nativeElement.querySelectorAll('app-mi-icon .material-icons-outlined'),
    ).map((n) => (n as HTMLElement).textContent?.trim());
    expect(ligaduras).toContain('hide_image');
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Sin Foto');
  });

  it('al seleccionar un producto con imagen desde el catálogo, el detalle también la muestra (US2, FR-003)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      menuCategory([menuProduct({ id: 'p1', name: 'Fresa Salvaje', image_url: 'https://cdn.test/fresa.jpg' })]),
    ]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const card = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Fresa Salvaje'),
    ) as HTMLButtonElement;
    card.click();
    fixture.detectChanges();

    const modalImg = fixture.nativeElement.querySelector('app-product-select img') as HTMLImageElement | null;
    expect(modalImg).toBeTruthy();
    expect(modalImg!.src).toContain('fresa.jpg');
  });

  it('al seleccionar un producto sin imagen desde el catálogo, el detalle se abre sin imagen rota (US2)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([menuCategory([menuProduct({ id: 'p1', name: 'Sin Foto', image_url: null })])]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const card = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Sin Foto'),
    ) as HTMLButtonElement;
    card.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-product-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-product-select img')).toBeNull();
  });

  // ── Pestaña "Todos" (rediseño create-order/code.html) ──────────────────────
  it('"Todos" está activa por defecto y junta los productos de todas las categorías', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      menuCategory([menuProduct({ id: 'p1', name: 'Cono Fresa' })], { id: 'c1', name: 'Conos' }),
      menuCategory([menuProduct({ id: 'p2', name: 'Malteada Choco' })], { id: 'c2', name: 'Malteadas' }),
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Cono Fresa');
    expect(texto).toContain('Malteada Choco');

    const todosButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Todos'),
    ) as HTMLButtonElement;
    expect(todosButton.className).toContain('bg-[#f3f4f6]');
  });

  it('elegir una categoría puntual filtra el grid; volver a "Todos" restaura la lista combinada', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      menuCategory([menuProduct({ id: 'p1', name: 'Cono Fresa' })], { id: 'c1', name: 'Conos' }),
      menuCategory([menuProduct({ id: 'p2', name: 'Malteada Choco' })], { id: 'c2', name: 'Malteadas' }),
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const categoriaButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Malteadas',
    ) as HTMLButtonElement;
    categoriaButton.click();
    fixture.detectChanges();

    let texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Malteada Choco');
    expect(texto).not.toContain('Cono Fresa');

    const todosButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Todos'),
    ) as HTMLButtonElement;
    todosButton.click();
    fixture.detectChanges();

    texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Malteada Choco');
    expect(texto).toContain('Cono Fresa');
  });

  // ── Descuento por línea del carrito (rediseño create-order/code.html) ──────
  it('una línea cuya promoción ya califica (cantidad ≥ min_qty) muestra insignia, tachado y "Ahorras $X"', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Paleta Frutos Rojos' } as never,
      variant: {
        id: 'v1',
        price: 7000,
        discounted_price: 5500,
        promotion: { min_qty: 2, short_condition: '2x1 Promo' },
      } as never,
      options: [],
      quantity: 2,
      notes: null,
    });
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('2x1 Promo');
    expect(texto).toContain('Ahorras');
    // $ 14.000 tachado (2 x $7.000 sin descuento) y $ 11.000 con descuento (2 x $5.500).
    expect(texto).toContain('14.000');
    expect(texto).toContain('11.000');
  });

  it('una línea con promoción vigente pero cantidad insuficiente no muestra insignia de descuento (mismo guardia que product-select)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Paleta Frutos Rojos' } as never,
      variant: {
        id: 'v1',
        price: 7000,
        discounted_price: 5500,
        promotion: { min_qty: 2, short_condition: '2x1 Promo' },
      } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('2x1 Promo');
    expect(texto).not.toContain('Ahorras');
  });

  it('el selector de mesas permite buscar y cambiar a otra mesa libre, pero no a una ocupada (spec 053, US1, FR-002/FR-005)', async () => {
    createComponent('t1');
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't2', number: 2, status: 'libre' }),
      table({ id: 't3', number: 3, status: 'ocupada' }),
    ]);
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'abierta',
        dining_table_id: 't3',
        created_at: '2026-08-21T10:00:00',
        items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente' }],
      } as unknown as ReturnType<PosTerminalStore['orders']>[number],
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    buscarEnSelectorMesas('2');
    const opcionM2 = opcionesMesas().find((li) => li.textContent?.includes('Mesa 2'));
    opcionM2!.click();
    fixture.detectChanges();
    http.expectOne(`${API}/table-sessions`).flush([]);
    expect(store.selectedTableId()).toBe('t2');

    abrirSelectorMesas();
    const opcionM3 = opcionesMesas().find((li) => li.textContent?.includes('Mesa 3'));
    opcionM3!.click();
    fixture.detectChanges();
    expect(store.selectedTableId()).toBe('t2');
  });

  it('bugfix: entrar a "orden-manual" con una mesa ya ocupada (única a la que puede caer "Crear pedido nuevo" sin ninguna mesa libre) arranca con el pedido nuevo vacío, sin precargar los ítems del pedido ya existente', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 1, status: 'ocupada' })]);
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'abierta',
        dining_table_id: 't1',
        created_at: '2026-08-21T10:00:00',
        items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '4000', estado_cocina: 'pendiente' }],
      } as unknown as ReturnType<PosTerminalStore['orders']>[number],
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    // `selectTable()` de la terminal auto-selecciona el pedido existente
    // ('o1') -- esta pantalla lo limpia de inmediato porque nunca edita un
    // pedido persistido, solo arma uno nuevo (`draftLines()`).
    expect(store.selectedOrderId()).toBeNull();
    expect(store.cartView().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Ítems: 0');

    // Con la mesa ocupada seleccionada, `selectTable()` también dispara
    // `ensureCheckoutDataLoaded()` (mismo pipeline de cobro que la terminal
    // de mesas) — ajeno a lo que prueba este test, solo se drena.
    for (const req of http.match(() => true)) req.flush([]);
  });

  it('bugfix: cambiar la mesa asignada en "orden-manual" conserva el carrito en curso (draftLines), no lo vacía', async () => {
    createComponent('t1');
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't2', number: 2, status: 'libre' }),
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Gaseosa' } as never,
      variant: { id: 'v1', price: 3500 } as never,
      options: [],
      quantity: 3,
      notes: null,
    });
    fixture.detectChanges();
    expect(store.draftLines().length).toBe(1);

    abrirSelectorMesas();
    buscarEnSelectorMesas('2');
    const opcionM2 = opcionesMesas().find((li) => li.textContent?.includes('Mesa 2'));
    opcionM2!.click();
    fixture.detectChanges();
    http.expectOne(`${API}/table-sessions`).flush([]);
    for (const req of http.match(() => true)) req.flush([]);

    expect(store.selectedTableId()).toBe('t2');
    expect(store.selectedOrderId()).toBeNull();
    expect(store.draftLines().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Gaseosa');
  });

  it('el listado de mesas ya no es una rejilla de botones, sino un select buscable (spec 053, US1, FR-001)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.grid-cols-4')).toBeNull();
  });

  it('el listado del select muestra el nombre y el estado de cada mesa (spec 053, US2, FR-003)', async () => {
    createComponent('t1');
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't3', number: 3, status: 'ocupada' }),
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    const opciones = opcionesMesas();
    const libre = opciones.find((li) => li.textContent?.includes('Mesa 1'));
    const ocupada = opciones.find((li) => li.textContent?.includes('Mesa 3'));
    expect(libre?.textContent).toContain('Libre');
    expect(ocupada?.textContent).toContain('Ocupada');
  });

  it('cuando la mesa tiene un nombre personalizado, el número sigue apareciendo en el listado (corrección posterior a spec 053)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 1, name: 'Terraza', status: 'libre' })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    const opcion = opcionesMesas().find((li) => li.textContent?.includes('Terraza'));
    expect(opcion?.textContent).toContain('Mesa 1');
    expect(opcion?.textContent).toContain('Terraza');
    expect(opcion?.textContent).toContain('Libre');
  });

  it('hacer clic sobre una mesa ocupada no la selecciona ni cierra el listado (spec 053, US2, FR-004)', async () => {
    createComponent('t1');
    tableService.tables.set([
      table({ id: 't1', number: 1, status: 'libre' }),
      table({ id: 't3', number: 3, status: 'ocupada' }),
    ]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    abrirSelectorMesas();
    const ocupada = opcionesMesas().find((li) => li.textContent?.includes('Mesa 3'));
    ocupada!.click();
    fixture.detectChanges();

    expect(store.selectedTableId()).toBe('t1');
    expect(fixture.nativeElement.querySelector('app-searchable-select ul')).toBeTruthy();
  });

  it('agregar un producto al draft se refleja en el resumen, con Impuesto siempre en $0 (FR-011; rediseño create-order/code.html ya no pinta la fila "Impuesto")', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Granizado Fresa Salvaje' } as never,
      variant: { id: 'v1', price: 4500 } as never,
      options: [],
      quantity: 2,
      notes: null,
    });
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Granizado Fresa Salvaje');
    expect(store.totals().tax).toBe(0);
  });

  it('"Crear pedido" está deshabilitado con el carrito vacío', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido'),
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });

  it('"Crear pedido" crea el pedido y navega de vuelta a la Terminal de Mesas', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    store.customerName.set('Ana Torres');

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(true);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones']);
  });

  it('si la creación falla, no navega', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('"← Volver a la Terminal" navega de vuelta sin crear ningún pedido', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const backButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Volver a la Terminal'),
    ) as HTMLButtonElement;
    backButton.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones']);
    expect(createSpy).not.toHaveBeenCalled();
  });

  // spec 087 (FR-005, A-88): reemplaza el auto-relleno "Consumidor final" +
  // toggle de solo-lectura de spec 054 -- el campo Cliente ahora es siempre
  // editable, sin valor por defecto, y bloquea "Crear pedido" si queda vacío.

  it('el campo Cliente empieza vacío y editable, sin ningún valor por defecto (spec 087, FR-005/A-88)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const input = campoCliente();
    expect(input.value).toBe('');
    expect(input.readOnly).toBe(false);
  });

  it('escribir en el campo Cliente actualiza el nombre directamente, sin ningún botón de edición (spec 087, FR-005/A-88)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    escribirCliente('María Pérez');

    expect(campoCliente().value).toBe('María Pérez');
    expect(store.customerName()).toBe('María Pérez');
  });

  it('"Crear pedido" está deshabilitado sin nombre de cliente, aunque haya productos y mesa (spec 087, FR-005/A-88)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(botonConfirmar().disabled).toBe(true);
  });

  it('confirmar sin nombre de cliente muestra el mensaje de error inline y no crea el pedido (spec 087, FR-005/A-88)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const diningSessionService = TestBed.inject(DiningSessionService);
    const createSpy = vi
      .spyOn(diningSessionService, 'createManualOrder')
      .mockResolvedValue({ id: 'o9' } as DiningOrder);

    await fixture.componentInstance.confirm();
    fixture.detectChanges();

    expect(createSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('El nombre del cliente es obligatorio.');
  });

  it('al confirmar con un nombre diligenciado, se envía ese nombre como customer_name (spec 087, FR-005/A-88)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    escribirCliente('María Pérez');

    const diningSessionService = TestBed.inject(DiningSessionService);
    const createSpy = vi
      .spyOn(diningSessionService, 'createManualOrder')
      .mockResolvedValue({ id: 'o9' } as DiningOrder);
    vi.spyOn(store, 'reload').mockResolvedValue(undefined);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await Promise.resolve();

    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'María Pérez' }));
  });

  // ── Rediseño responsive (create-order/code.html): una sola tarjeta a la
  // vez por debajo de lg, mismo mecanismo que table-sessions.component.ts ──
  it('por debajo de lg muestra el catálogo por defecto; "Ver pedido" pasa al ticket y "Volver al catálogo" regresa (rediseño responsive)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const catalogo = () => fixture.nativeElement.querySelector('[data-testid="catalogo-column"]') as HTMLElement;
    const ticket = () => fixture.nativeElement.querySelector('[data-testid="ticket-column"]') as HTMLElement;

    expect(catalogo().classList.contains('hidden')).toBe(false);
    expect(ticket().classList.contains('hidden')).toBe(true);
    // Carrito vacío: el botón flotante "Ver pedido" no se muestra.
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Ver pedido'),
      ),
    ).toBeUndefined();

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const verPedido = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Ver pedido'),
    ) as HTMLButtonElement;
    expect(verPedido).toBeTruthy();
    verPedido.click();
    fixture.detectChanges();

    expect(catalogo().classList.contains('hidden')).toBe(true);
    expect(ticket().classList.contains('hidden')).toBe(false);

    const backButton = fixture.nativeElement.querySelector('[data-testid="page-back-button"]') as HTMLButtonElement;
    expect(backButton).toBeTruthy();
    backButton.click();
    fixture.detectChanges();

    expect(catalogo().classList.contains('hidden')).toBe(false);
    expect(ticket().classList.contains('hidden')).toBe(true);
  });

  // ── Nuevo: editar una línea del carrito ya agregada ────────────────────────
  it('el lápiz de una línea del carrito llama a store.openConfigForEdit y reabre el modal precargado', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    const product = {
      id: 'p1',
      name: 'Mango Tropical',
      description: null,
      image_url: null,
      available: true,
      option_groups: [],
      variants: [{ id: 'v1', name: 'Única', price: 5000, option_groups: [], available: true }],
    };
    store.addDraftFromSelection({
      product: product as never,
      variant: product.variants[0] as never,
      options: [],
      quantity: 1,
      notes: 'Sin azúcar',
    });
    fixture.detectChanges();

    const editSpy = vi.spyOn(store, 'openConfigForEdit');
    const draftKey = store.draftLines()[0].key;
    // Rediseño (create-order/code.html): dos íconos por línea ("Ver/Editar
    // Notas" y "Modificar Toppings"), ambos abren el mismo modal unificado
    // -- esta app no separa notas y toppings en dos modales distintos.
    const notesButton = fixture.nativeElement.querySelector(
      '[title="Ver/Editar Notas"]',
    ) as HTMLButtonElement;
    const toppingsButton = fixture.nativeElement.querySelector(
      '[title="Modificar Toppings"]',
    ) as HTMLButtonElement;
    expect(notesButton).toBeTruthy();
    expect(toppingsButton).toBeTruthy();
    notesButton.click();
    fixture.detectChanges();

    expect(editSpy).toHaveBeenCalledWith(draftKey);
    const modal = fixture.nativeElement.querySelector('app-product-select');
    expect(modal).toBeTruthy();
    expect((modal as HTMLElement).textContent).toContain('Guardar cambios');
  });

  // ── Fila de carrito responsive (apilada en mobile, tabla desde sm) ────────
  it('cada línea del carrito renderiza dos variantes (tabla desde sm, tarjeta apilada por debajo de sm) con las mismas acciones', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    // El encabezado de columnas también es ".hidden.sm\:grid.grid-cols-12" --
    // se distingue por ".items-center", que solo llevan las filas de ítem.
    const tabla = fixture.nativeElement.querySelector(
      '.hidden.sm\\:grid.grid-cols-12.items-center',
    ) as HTMLElement;
    const tarjeta = fixture.nativeElement.querySelector('.flex.sm\\:hidden.flex-col') as HTMLElement;
    expect(tabla).toBeTruthy();
    expect(tarjeta).toBeTruthy();
    expect(tabla.textContent).toContain('Mango Tropical');
    expect(tarjeta.textContent).toContain('Mango Tropical');

    // Los botones de eliminar/editar de la variante apilada funcionan igual
    // que los de la tabla (mismos (click), solo cambia el marcado/tamaño).
    const removeButtons = Array.from(
      fixture.nativeElement.querySelectorAll('[title="Eliminar ítem"]'),
    ) as HTMLButtonElement[];
    expect(removeButtons.length).toBe(2);

    const draftKey = store.draftLines()[0].key;
    const removeSpy = vi.spyOn(store, 'removeDraft');
    removeButtons[1].click(); // el de la tarjeta apilada (segundo en el DOM)
    expect(removeSpy).toHaveBeenCalledWith(draftKey);
  });

  it('el botón "Limpiar todo" ya no existe en el detalle del pedido', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Mango Tropical' } as never,
      variant: { id: 'v1', price: 5000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent?.includes('Limpiar todo'),
      ),
    ).toBeUndefined();
  });

  it('ningún ícono se renderiza ya como SVG artesanal ni con forma de cono de helado (spec 082)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([menuCategory([menuProduct({ id: 'p1', name: 'Fresa' })])]);
    store.setCatalogCategory('c1');
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    // "tune" reemplaza el ícono con forma de cono/copa de helado de "Modificar
    // Toppings" (data-model.md, nota de heladería) — no debe quedar ningún
    // ícono con esa forma, y "tune" debe ser el que la reemplaza.
    expect(ligaduras).toEqual(
      expect.arrayContaining(['arrow_back', 'search', 'table_restaurant', 'shopping_bag', 'delivery_dining']),
    );
  });

  it('"Modificar Toppings" (antes con forma de cono de helado) renderiza la ligadura "tune", no el ícono de reserva (spec 082)', async () => {
    createComponent('t1');
    tableService.tables.set([table({ id: 't1', number: 3 })]);
    fixture.detectChanges();
    await Promise.resolve();
    http.expectOne(`${API}/table-sessions`).flush([]);

    const product = {
      id: 'p1',
      name: 'Mango Tropical',
      description: null,
      image_url: null,
      available: true,
      option_groups: [],
      variants: [{ id: 'v1', name: 'Única', price: 5000, option_groups: [], available: true }],
    };
    store.addDraftFromSelection({
      product: product as never,
      variant: product.variants[0] as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const toppingsButton = fixture.nativeElement.querySelector(
      '[title="Modificar Toppings"]',
    ) as HTMLButtonElement;
    expect(toppingsButton).toBeTruthy();
    const icon = toppingsButton.querySelector('.material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('tune');
  });
});

/**
 * spec 073, US5 (FR-013 a FR-015a): la pantalla de armado muestra el total con
 * descuento del borrador (backend), recalculado en cada cambio; si al confirmar
 * el total cambió, pide una segunda confirmación.
 */
describe('ManualOrderPageComponent — desglose del borrador (spec 073, US5)', () => {
  let fixture: ComponentFixture<ManualOrderPageComponent>;
  let store: PosTerminalStore;
  let api: DiningSessionService;
  let router: Router;

  function preview(subtotal: string, discount: string, total: string, deliveryFee = '0'): CheckoutPreview {
    return { subtotal, discount, delivery_fee: deliveryFee, total, promotion_evaluated_at: '2026-09-02T19:59:00Z' };
  }

  function setup(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManualOrderPageComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    fixture = TestBed.createComponent(ManualOrderPageComponent);
    store = fixture.componentInstance.store;
    api = TestBed.inject(DiningSessionService);
    router = TestBed.inject(Router);
    TestBed.inject(HttpTestingController); // se drena implícitamente (mock de draftPreview)
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
    // spec 087 (FR-005, A-88): customer_name ahora es obligatorio -- este
    // describe prueba el desglose de totales, no la validación del nombre.
    store.customerName.set('Ana Torres');
  }

  function addCono(qty: number): void {
    for (let i = 0; i < qty; i++) {
      store.addDraftFromSelection({
        product: { id: 'p1', name: 'Cono' } as never,
        variant: { id: 'v1', price: 8000 } as never,
        options: [],
        quantity: 1,
        notes: null,
      });
    }
    fixture.detectChanges();
  }

  const summaryText = (): string => fixture.nativeElement.textContent as string;

  it('Scenario 1: 1 cono → Total $8.000 sin fila de descuento', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockResolvedValue(preview('8000', '0', '8000'));
    fixture.detectChanges();

    addCono(1);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    expect(summaryText()).toContain('8.000');
    expect(summaryText()).not.toContain('Descuento');
  });

  it('Scenario 2: 2 conos → Subtotal 16.000 / Descuento −8.000 / Total 8.000', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockResolvedValue(preview('16000', '8000', '8000'));
    fixture.detectChanges();

    addCono(2);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    const t = summaryText();
    expect(t).toContain('Descuento');
    expect(t).toContain('16.000');
    expect(t).toContain('8.000');
  });

  it('Scenario 4 (FR-015): si el draft-preview falla, muestra el subtotal sin descuento + aviso y NO deshabilita "Crear pedido"', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockRejectedValue(new Error('sin conexión'));
    vi.spyOn(store, 'setOrderTypeTab').mockImplementation((t) => store.orderTypeTab.set(t));
    store.setOrderTypeTab('para-llevar'); // no exige mesa
    fixture.detectChanges();

    addCono(2);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();

    expect(summaryText()).toContain('El descuento se confirma al cobrar');
    // subtotal local (2 x 8000), sin descuento aplicado
    expect(summaryText()).toContain('16.000');

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido'),
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
  });

  it('Scenario 5 (FR-015a): si el total cambió al confirmar, pide una segunda confirmación antes de crear el pedido', async () => {
    setup();
    const draftSpy = vi.spyOn(api, 'draftPreview')
      .mockResolvedValueOnce(preview('16000', '8000', '8000'))  // al armar el borrador
      .mockResolvedValue(preview('16000', '0', '16000'));       // al confirmar: venció la franja
    const createSpy = vi.spyOn(store, 'createManualOrderFromDraft').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(store, 'setOrderTypeTab').mockImplementation((t) => store.orderTypeTab.set(t));
    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();

    addCono(2);
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(store.draftPreview()?.total).toBe('8000');

    const confirmSvc = TestBed.inject(ConfirmService);
    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido'),
    ) as HTMLButtonElement;
    confirmButton.click();
    await new Promise((r) => setTimeout(r));

    expect(confirmSvc.state()).not.toBeNull();
    expect(confirmSvc.state()!.title).toContain('El total cambió');
    confirmSvc.respond(false);
    await new Promise((r) => setTimeout(r));

    expect(createSpy).not.toHaveBeenCalled();
    expect(draftSpy).toHaveBeenCalled();
  });
});

// ── spec 087, FR-016 (US10): TOTAL ORDEN sobre el conjunto vigente completo ──
describe('ManualOrderPageComponent — TOTAL ORDEN con ítems guardados (spec 087, US10)', () => {
  let fixture: ComponentFixture<ManualOrderPageComponent>;
  let store: PosTerminalStore;
  let api: DiningSessionService;

  function preview(subtotal: string, discount: string, total: string): CheckoutPreview {
    return { subtotal, discount, delivery_fee: '0', total, promotion_evaluated_at: '2026-09-29T10:00:00Z' };
  }

  function setup(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManualOrderPageComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    fixture = TestBed.createComponent(ManualOrderPageComponent);
    store = fixture.componentInstance.store;
    api = TestBed.inject(DiningSessionService);
    TestBed.inject(HttpTestingController);
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
    store.customerName.set('Ana Torres');
  }

  function pedido(items: Array<Record<string, unknown>>): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      status: 'abierta',
      created_at: '2026-09-29T10:00:00',
      dining_table_id: 't1',
      items: items.map((it, i) => ({
        id: `o1-i${i}`, product_variant_id: 'v1', quantity: 1, unit_price: '8000',
        estado_cocina: 'listo', ...it,
      })),
    } as unknown as DiningOrder;
  }

  async function asentar(): Promise<void> {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  }

  const texto = (): string => fixture.nativeElement.textContent as string;

  it('tras guardar un ítem nuevo, el TOTAL ORDEN refleja el total del preview del conjunto completo, no el subtotal local', async () => {
    setup();
    const spy = vi.spyOn(api, 'draftPreview').mockResolvedValue(preview('16000', '4000', '12000'));
    store.orders.set([pedido([{ quantity: 2 }])]);
    store.selectedOrderId.set('o1');
    await asentar();

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.at(-1)![0].items).toEqual([
      { product_variant_id: 'v1', quantity: 2, options: [] },
    ]);
    // 12.000 viene del backend (con promoción); el subtotal local sería 16.000 sin descuento.
    expect(texto()).toContain('12.000');
    expect(texto()).toContain('Descuento');
  });

  it('al anular un ítem guardado, el total desciende sin recargar', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockImplementation(async (payload) => {
      const total = payload.items.reduce((s, i) => s + (i.quantity ?? 1) * 8000, 0);
      return preview(String(total), '0', String(total));
    });
    store.orders.set([pedido([{}, { id: 'o1-i1' }])]);
    store.selectedOrderId.set('o1');
    await asentar();
    expect(texto()).toContain('16.000');

    store.orders.set([pedido([{}, { id: 'o1-i1', estado_cocina: 'anulado' }])]);
    await asentar();

    expect(texto()).not.toContain('16.000');
    expect(texto()).toContain('8.000');
  });

  it('con cero ítems vigentes el total mostrado es $0, no el anterior', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockResolvedValue(preview('8000', '0', '8000'));
    store.orders.set([pedido([{}])]);
    store.selectedOrderId.set('o1');
    await asentar();
    expect(texto()).toContain('8.000');

    store.orders.set([pedido([{ estado_cocina: 'anulado' }])]);
    await asentar();

    expect(store.draftPreview()).toBeNull();
    expect(store.totals().total).toBe(0);
    expect(texto()).not.toContain('8.000');
  });

  it('los combos se suman a su precio de combo al total del preview (que no los cubre)', async () => {
    setup();
    vi.spyOn(api, 'draftPreview').mockResolvedValue(preview('8000', '0', '8000'));
    store.orders.set([
      pedido([{}, { id: 'o1-c0', product_variant_id: 'v-combo', combo_id: 'combo-1', unit_price: '5000' }]),
    ]);
    store.selectedOrderId.set('o1');
    await asentar();

    expect(store.combosSubtotal()).toBe(5000);
    expect(texto()).toContain('13.000');
  });
});
