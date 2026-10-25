import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PosCatalogDrawerComponent } from './pos-catalog-drawer.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { MenuService } from '../../../core/services/menu.service';
import { MenuProduct } from '../../products/interfaces/product.interface';
import { simulateTranslation } from '../../../testing/simulate-translation';

function product(id: string, name: string): MenuProduct {
  return {
    id,
    name,
    description: null,
    image_url: null,
    variants: [{ id: `${id}-v1`, name: 'Única', price: 8000, option_groups: [] }],
    option_groups: [],
    available: true,
  } as unknown as MenuProduct;
}

/** Spec 036, Historia 2: catálogo embebido del "+ Agregar producto" — sin
 *  overlay de pantalla completa, con buscador por nombre combinado con el
 *  filtro de categoría ya existente. */
describe('PosCatalogDrawerComponent', () => {
  let fixture: ComponentFixture<PosCatalogDrawerComponent>;
  let store: PosTerminalStore;
  let menuService: MenuService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosCatalogDrawerComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: PromotionService,
          useValue: {
            loadActive: () => {},
            activePromotions: () => [],
            ready: () => false,
            now: () => new Date(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(PosCatalogDrawerComponent);
    store = TestBed.inject(PosTerminalStore);
    menuService = TestBed.inject(MenuService);
    http = TestBed.inject(HttpTestingController);

    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [product('p1', 'Malteada de fresa'), product('p2', 'Jugo de mango')] },
      { id: 'c2', name: 'Postres', products: [product('p3', 'Helado de fresa')] },
    ]);
    store.catalogCategoryId.set('c1');
  });

  afterEach(() => http.verify());

  it('no se monta como overlay de pantalla completa (sin fixed inset-0 / backdrop)', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fixed.inset-0')).toBeNull();
    expect(el.querySelector('[class*="bg-black"]')).toBeNull();
  });

  it('muestra los productos de la categoría activa por defecto', () => {
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).toContain('Jugo de mango');
  });

  it('filtra por nombre en tiempo real', () => {
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'malteada';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(store.catalogSearchText()).toBe('malteada');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).not.toContain('Jugo de mango');
  });

  it('combina el filtro de categoría ya existente con la búsqueda por nombre', () => {
    fixture.detectChanges();

    store.setCatalogSearchText('fresa');
    fixture.detectChanges();

    // Categoría "Bebidas" (c1) + "fresa" → solo "Malteada de fresa", no
    // "Helado de fresa" (está en Postres, c2).
    let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).not.toContain('Helado de fresa');

    const categoryButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Postres',
    ) as HTMLButtonElement;
    categoryButton.click();
    fixture.detectChanges();

    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Helado de fresa');
    expect(text).not.toContain('Malteada de fresa');
  });

  it('sin coincidencias muestra un estado vacío claro, no una grilla en blanco', () => {
    fixture.detectChanges();

    store.setCatalogSearchText('no-existe-xyz');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.toLowerCase()).toContain('sin productos');
  });

  it('seleccionar un producto abre la configuración de variante (mismo flujo ya existente)', () => {
    fixture.detectChanges();

    const productButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Malteada de fresa'),
    ) as HTMLButtonElement;
    productButton.click();

    expect(store.configuringProduct()?.id).toBe('p1');
  });

  // ─── spec 073, US6 (FR-016/FR-017): condición legible del backend ────────────

  function productWithPromo(id: string, name: string, promo: unknown): MenuProduct {
    return {
      id,
      name,
      description: null,
      image_url: null,
      variants: [{ id: `${id}-v1`, name: 'Única', price: 8000, option_groups: [], promotion: promo }],
      option_groups: [],
      available: true,
    } as unknown as MenuProduct;
  }

  it('Scenario 1: pinta la condición legible del backend (short_condition), no la insignia local "-50%"', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [
        productWithPromo('p1', 'Cono', { short_condition: '2 x -50%', display_text: '2 x -50% · ≈ $4.000 c/u', min_qty: 2, type: 'percent', value: 50 }),
      ] },
    ]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('2 x -50%');
  });

  it('Scenario 2: regla de paquete → muestra esa condición ("3 x $20.000"), no un precio unitario suelto', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [
        productWithPromo('p1', 'Paquete', { short_condition: '3 x $20.000', display_text: '3 x $20.000 · ≈ $6.667 c/u', min_qty: 3, type: 'package_price', value: 20000 }),
      ] },
    ]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('3 x $20.000');
  });

  it('Scenario 3: producto sin promoción → cardPromotionText devuelve null y no pinta ninguna insignia', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [product('p1', 'Sin promo')] },
    ]);
    fixture.detectChanges();

    expect(store.cardPromotionText(store.categories()[0].products[0].variants)).toBeNull();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('🏷️');
  });

  it('Scenario 4: min_qty = 1 → se pinta el texto del backend tal cual, sin rama especial', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [
        productWithPromo('p1', 'Cono', { short_condition: '-15%', display_text: '$6.800 c/u', min_qty: 1, type: 'percent', value: 15 }),
      ] },
    ]);
    fixture.detectChanges();

    expect(store.cardPromotionText(store.categories()[0].products[0].variants)).toBe('-15%');
  });

  // Reescrito para el rediseño visual (spec 131): el ícono pasa de
  // `app-mi-icon` (Material, "sell") a `app-lucide-icon` ("percent", SVG
  // estilo lucide, research.md punto 3) — el emoji sigue sin aparecer.
  it('la insignia de promoción ya no usa el emoji 🏷️ ni el ícono Material (spec 131)', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [
        productWithPromo('p1', 'Cono', { short_condition: '-15%', display_text: '$6.800 c/u', min_qty: 1, type: 'percent', value: 15 }),
      ] },
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('🏷️');
    expect(el.querySelector('app-lucide-icon svg')).toBeTruthy();
  });

  it('"← Volver a la lista" cierra el catálogo sin perder ningún ítem ya agregado', () => {
    store.draftLines.set([
      {
        kind: 'product',
        key: 'existing',
        product: product('pX', 'Ya agregado'),
        variant: { id: 'vX', price: 5000 } as never,
        options: [],
        quantity: 1,
        notes: null,
        unitPrice: 5000,
        addonsTotal: 0,
      },
    ]);
    store.catalogOpen.set(true);
    fixture.detectChanges();

    // Spec 131: el ícono "←" artesanal pasa a un app-lucide-icon "arrow-left" —
    // el texto del botón ya no lleva la flecha.
    const backButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Volver a la lista',
    ) as HTMLButtonElement;
    backButton.click();

    expect(store.catalogOpen()).toBe(false);
    expect(store.draftLines()).toHaveLength(1);
  });

  // ─── spec 093 (escenario 5): producto agotado, atenuado y sin poder agregarse ───

  function soldOutProduct(id: string, name: string): MenuProduct {
    return { ...product(id, name), sold_out: true } as unknown as MenuProduct;
  }

  it('un producto agotado sigue visible, con la etiqueta "Agotado"', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [soldOutProduct('p1', 'Fresa boom')] },
    ]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Fresa boom');
    expect(text).toContain('Agotado');
  });

  it('el botón de un producto agotado está deshabilitado y no abre la configuración', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [soldOutProduct('p1', 'Fresa boom')] },
    ]);
    fixture.detectChanges();

    const productButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Fresa boom'),
    ) as HTMLButtonElement;

    expect(productButton.disabled).toBe(true);
    productButton.click();
    expect(store.configuringProduct()).toBeNull();
  });

  it('un producto disponible no muestra la etiqueta "Agotado" ni queda deshabilitado', () => {
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Agotado');
    const productButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Malteada de fresa'),
    ) as HTMLButtonElement;
    expect(productButton.disabled).toBe(false);
  });

  // ─── spec 115: pestaña "Promociones" (FR-014 — mismo tratamiento que manual-order-page) ───

  function productoConPromo(id: string, name: string, minQty = 2): MenuProduct {
    return {
      id, name, description: null, image_url: null, option_groups: [], available: true,
      variants: [{
        id: `${id}-v1`, name: 'Única', price: 17000, option_groups: [], available: true,
        promotion: {
          condition_text: '2 x $17.000', short_condition: '2 x $17.000', unit_equivalent: 8500,
          unit_equivalent_approx: false, unit_equivalent_text: '$8.500 c/u',
          display_text: '2 x $17.000', type: 'package_price', min_qty: minQty, value: 17000,
        },
      }],
    } as unknown as MenuProduct;
  }

  it('T011: la fila de categorías incluye el botón "Promociones"', () => {
    fixture.detectChanges();

    const textos = Array.from(fixture.nativeElement.querySelectorAll('button')).map(
      (b) => (b as HTMLButtonElement).textContent?.trim(),
    );
    expect(textos.some((t) => t?.includes('Promociones'))).toBe(true);
  });

  it('T012: al seleccionar "Promociones" la grilla muestra solo productos en promoción, con su condición visible', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [productoConPromo('p1', 'Malteada Promo'), product('p2', 'Jugo Normal')] },
    ]);
    fixture.detectChanges();

    const promoBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Promociones'),
    ) as HTMLButtonElement;
    promoBtn.click();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada Promo');
    expect(text).not.toContain('Jugo Normal');
    expect(text).toContain('2 x $17.000');
  });

  it('T013: sin promociones vigentes, "Promociones" muestra el mismo mensaje explícito que manual-order-page', () => {
    menuService.categories.set([{ id: 'c1', name: 'Bebidas', products: [product('p1', 'Jugo Normal')] }]);
    fixture.detectChanges();

    const promoBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Promociones'),
    ) as HTMLButtonElement;
    promoBtn.click();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No hay promociones activas en este momento');
  });

  it('T026/T040: openConfig recibe fromPromotions=true desde "Promociones", false desde una categoría (FR-014)', () => {
    menuService.categories.set([
      { id: 'c1', name: 'Bebidas', products: [productoConPromo('p1', 'Malteada Promo')] },
    ]);
    fixture.detectChanges();
    const openSpy = vi.spyOn(store, 'openConfig');

    const card = () => Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Malteada Promo'),
    ) as HTMLButtonElement;

    card().click(); // desde la categoría "Bebidas" (no "Promociones")
    expect(openSpy).toHaveBeenLastCalledWith(expect.anything(), false);

    const promoBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Promociones'),
    ) as HTMLButtonElement;
    promoBtn.click();
    fixture.detectChanges();
    card().click(); // desde "Promociones"
    expect(openSpy).toHaveBeenLastCalledWith(expect.anything(), true);
  });

  it('spec 134 (FR-021, nivel B): con la página alterada, el mensaje del catálogo vacío alterna entre textos y sigue lo que se escribe en el buscador', () => {
    menuService.categories.set([{ id: 'c1', name: 'Bebidas', products: [] }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const traduccion = simulateTranslation(el);
    const mensaje = (): string => (el.querySelector('p.py-10')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const cambiar = (fn: () => void): void => {
      fn();
      fixture.detectChanges();
      traduccion.refresh(); // el traductor sigue activo: traduce lo recién pintado
    };

    expect(mensaje()).toBe('Sin productos en esta categoría.');

    cambiar(() => store.catalogSearchText.set('zzz'));
    expect(mensaje()).toBe('Sin productos que coincidan con "zzz".');
    cambiar(() => store.catalogSearchText.set('zzzz'));
    expect(mensaje()).toBe('Sin productos que coincidan con "zzzz".');

    cambiar(() => fixture.componentInstance.showingPromotions.set(true));
    expect(mensaje()).toBe('No hay promociones activas en este momento.');

    cambiar(() => {
      fixture.componentInstance.showingPromotions.set(false);
      store.catalogSearchText.set('');
    });
    expect(mensaje()).toBe('Sin productos en esta categoría.');
    traduccion.revert();
  });
});
