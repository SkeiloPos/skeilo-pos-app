import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PROMOTIONS_TAB_ID, PublicMenuComponent } from './public-menu.component';
import { DinerService, DinerSessionExpiredError } from '../services/diner.service';
import { DinerTokenStore } from '../services/diner-token.store';
import { CartLine, DiningCartService } from '../services/dining-cart.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import {
  MenuCategory,
  MenuProduct,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';
import { ResolvedBusiness } from '../services/diner.service';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';

/**
 * `DinerService` es transporte HTTP real (`inject(HttpClient)`); lo que este
 * spec verifica es la máquina de estados de `view()` alrededor del acceso
 * cerrado (Bug 1), no la resolución del menú en sí — un fake basta y evita
 * tener que simular la API completa.
 */
class FakeDinerService {
  categories: MenuCategory[] = [];
  business: ResolvedBusiness | null = null;
  /** spec 089: si se fija, `myOrders()` lo lanza (un 401 de sesión, con o sin cierre). */
  myOrdersError: unknown = null;
  async resolveByToken() {
    return {
      table: { id: 't1', number: 1, name: null },
      business: this.business,
      categories: this.categories,
    };
  }
  async leave(): Promise<void> {}
  /** spec 089 (A-95): las pruebas de acceso denegado comprueban que nunca se llama. */
  openSession = vi.fn(async () => ({}));
  async myOrders() {
    if (this.myOrdersError) throw this.myOrdersError;
    return [];
  }
  stockConflict(): null {
    return null;
  }
  extractError(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === 'string') return detail;
    return (detail as { error?: string } | undefined)?.error ?? fallback;
  }
}

class FakeDiningCartService {
  readonly dinerName = signal('');
  readonly count = signal(0);
  readonly isEmpty = signal(true);
  readonly total = signal(0);
  readonly busy = signal(false);
  readonly lines = signal<Partial<CartLine>[]>([]);
  /** spec 089 (Historia 3): `PATCH /cart/items/{id}` — cada test decide si acepta o rechaza. */
  updateItem = vi.fn(async (): Promise<void> => undefined);
  stepFor(): number {
    return 1;
  }
  indexMenu(): void {}
  async load(): Promise<void> {}
  clear = vi.fn();
  clearDiner = vi.fn();
}

class FakeRealtimeService {
  readonly status = signal<'idle' | 'open' | 'closed'>('idle');
  /** spec 089: handlers registrados por tipo de evento, para poder emitirlos desde los tests. */
  readonly handlers = new Map<string, (ev?: unknown) => void>();
  on(type: string, handler: (ev?: unknown) => void): () => void {
    this.handlers.set(type, handler);
    return () => this.handlers.delete(type);
  }
  emit(type: string, ev: unknown = {}): void {
    this.handlers.get(type)?.(ev);
  }
  connectDiner(): void {}
  disconnect(): void {}
}

describe('PublicMenuComponent', () => {
  /**
   * Crea una instancia nueva del componente para `token`, como si fuera un
   * acceso nuevo a `/menu/t/:token` (primera carga, recarga, "Atrás"/
   * "Adelante" o reapertura de la URL — Angular no distingue el disparador,
   * todos pasan por el mismo `ngOnInit`). `DinerTokenStore` es `providedIn:
   * 'root'`: al no sobreescribirlo, cada `resetTestingModule()` crea una
   * instancia nueva que sigue leyendo la misma `sessionStorage` real del
   * navegador — así es como la marca de "acceso cerrado" sobrevive entre
   * instancias, igual que sobrevive entre pestañas reales.
   */
  async function createComponent(
    token: string,
    categories: MenuCategory[] = [],
    opts: { withSession?: boolean; business?: ResolvedBusiness | null } = {},
  ): Promise<{ fixture: ComponentFixture<PublicMenuComponent>; component: PublicMenuComponent }> {
    TestBed.resetTestingModule();
    // `DinerTokenStore` lee `localStorage` al construirse: fijar el
    // `session_token` **antes** de crear el componente simula un comensal que
    // ya tiene sesión abierta, para llegar a `view() === 'menu'`.
    if (opts.withSession) localStorage.setItem('pos.diner.session_token', 'session-tok');
    const diner = new FakeDinerService();
    diner.categories = categories;
    diner.business = opts.business ?? null;
    TestBed.configureTestingModule({
      imports: [PublicMenuComponent],
      providers: [
        { provide: DinerService, useValue: diner },
        { provide: DiningCartService, useClass: FakeDiningCartService },
        { provide: RealtimeService, useClass: FakeRealtimeService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ token }) },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PublicMenuComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    // Con sesión ya abierta, `ngOnInit` encadena `Promise.all([cart.load(),
    // refreshOrders()])` tras resolver el token — un solo `whenStable()` no
    // siempre alcanza a drenar esa segunda ronda de microtareas.
    const start = Date.now();
    while (fixture.componentInstance.view() === 'loading' && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 5));
      fixture.detectChanges();
    }
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('un primer acceso (sin marca de cierre) muestra la pantalla de nombre', async () => {
    const { component } = await createComponent('tok-1');
    expect(component.view()).toBe('name');
  });

  it('tras cerrar sesión, un acceso posterior con el mismo :token muestra el acceso denegado en vez de la pantalla de nombre — cubre recarga, "Atrás" y "Adelante" (FR-002 a FR-005; A-95 FR-015a/b)', async () => {
    const { component: first } = await createComponent('tok-1');
    expect(first.view()).toBe('name');

    await first.exit();
    // A-95: "Salir" termina en la pantalla de gracias (como el cierre de la mesa); el acceso
    // denegado solo aparece al recargar.
    expect(first.view()).toBe('closed');

    // Simula un ngOnInit posterior en la misma pestaña con el mismo :token:
    // recarga (F5), "Atrás" o "Adelante" invocan exactamente este mismo flujo.
    const { component: second, fixture: fixture2 } = await createComponent('tok-1');

    expect(second.view()).toBe('exited');
    const texto = (fixture2.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Por favor, escanea nuevamente el código QR de la mesa para ingresar al menú');
    expect(texto).not.toContain('Acceso finalizado');
    expect(texto).not.toContain('Gracias por tu visita');
    expect(texto).not.toContain('🍦');
    expect(texto).not.toContain('Continuar');
  });

  it('la pantalla de gracias tras "Salir" muestra el logo y el nombre del negocio (no el emoji) cuando hay branding disponible', async () => {
    const business: ResolvedBusiness = { name: 'Heladería Polar', logo_url: 'https://cdn.example/logo.png' };
    const { component, fixture } = await createComponent('tok-1', [], { business });
    await component.exit();
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example/logo.png');
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Heladería Polar');
    expect(texto).toContain('¡Gracias por tu visita! Esperamos verte pronto.');
  });

  it('reabrir la misma URL sin la marca de cierre (:token distinto, equivalente a un escaneo físico nuevo) sí muestra la pantalla de nombre (FR-006)', async () => {
    const { component: first } = await createComponent('tok-1');
    await first.exit();
    expect(first.view()).toBe('closed');

    const { component: second } = await createComponent('tok-2');

    expect(second.view()).toBe('name');
  });

  // ── Bug 3 — placeholder neutro en el catálogo (FR-016 a FR-020) ───────────

  function product(partial: Partial<MenuProduct>): MenuProduct {
    return {
      id: 'p1',
      name: 'Producto',
      description: null,
      image_url: null,
      variants: [{ id: 'v1', name: 'Único', price: 5000, option_groups: [], available: true }],
      option_groups: [],
      available: true,
      ...partial,
    };
  }

  it('un producto sin image_url renderiza <app-icon name="image-off">, no el emoji 🍦 (FR-016 a FR-018)', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1', name: 'Sin foto', image_url: null })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    expect(fixture.componentInstance.view()).toBe('menu');
    expect(fixture.nativeElement.querySelector('app-icon[name="image-off"]')).not.toBeNull();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('🍦');
  });

  it('un producto con image_url sigue mostrando su imagen real, sin cambios (FR-018)', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1',
        name: 'Helados',
        products: [product({ id: 'p2', name: 'Con foto', image_url: 'https://cdn.example/p2.jpg' })],
      },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    const img = fixture.nativeElement.querySelector('img[alt="Con foto"]') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example/p2.jpg');
    expect(fixture.nativeElement.querySelector('app-icon[name="image-off"]')).toBeNull();
  });

  // ── spec 093 (escenario 6): producto agotado, atenuado, sin poder agregarse ──

  it('un producto agotado sigue visible en el menú, con la etiqueta "Agotado"', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1', name: 'Fresa boom', sold_out: true })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Fresa boom');
    expect(texto).toContain('Agotado');
  });

  it('el botón de un producto agotado está deshabilitado y no abre la selección de variante', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1', name: 'Fresa boom', sold_out: true })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    const productButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Fresa boom'),
    ) as HTMLButtonElement;

    expect(productButton.disabled).toBe(true);
    productButton.click();
    expect(fixture.componentInstance.selectedProduct()).toBeNull();
  });

  it('un producto disponible no muestra la etiqueta "Agotado" ni queda deshabilitado', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1', name: 'Oreo split', sold_out: false })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Agotado');
    const productButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Oreo split'),
    ) as HTMLButtonElement;
    expect(productButton.disabled).toBe(false);
  });

  // ── Notas del ítem en "Mis pedidos" (spec 061, FR-001 a FR-003) ───────────

  it('una nota de ítem se muestra en "Mis pedidos", asociada solo a la línea que la tiene (FR-001 a FR-003)', async () => {
    const order: DiningOrder = {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'recibida',
      created_at: new Date().toISOString(),
      items: [
        {
          id: 'it1',
          product_variant_id: 'v1',
          quantity: 1,
          unit_price: '5000',
          estado_cocina: 'pendiente',
          notes: 'sin banana',
        },
        {
          id: 'it2',
          product_variant_id: 'v1',
          quantity: 1,
          unit_price: '5000',
          estado_cocina: 'pendiente',
          notes: null,
        },
      ],
    };
    const { fixture, component } = await createComponent('tok-1', [], { withSession: true });
    component.myOrders.set([order]);
    component.section.set('pedidos');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('sin banana');
    expect(texto.split('sin banana').length - 1).toBe(1);
  });

  // ── Precio, promoción y total del pedido en "Mis pedidos" ─────────────────

  it('muestra el precio de cada línea y el total del pedido', async () => {
    const order: DiningOrder = {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'recibida',
      created_at: new Date().toISOString(),
      items: [
        { id: 'it1', product_variant_id: 'v1', quantity: 2, unit_price: '5000', estado_cocina: 'pendiente' },
        { id: 'it2', product_variant_id: 'v1', quantity: 1, unit_price: '3000', estado_cocina: 'pendiente' },
      ],
    };
    const { fixture } = await createComponent('tok-1', [], { withSession: true });
    fixture.componentInstance.myOrders.set([order]);
    fixture.componentInstance.section.set('pedidos');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('$ 10.000'); // 2 × 5.000
    expect(texto).toContain('$ 3.000');
    expect(texto).toContain('$ 13.000'); // total del pedido
  });

  it('tacha el precio de lista y muestra el descontado cuando la línea tiene promoción', async () => {
    const order: DiningOrder = {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'recibida',
      created_at: new Date().toISOString(),
      items: [
        {
          id: 'it1',
          product_variant_id: 'v1',
          quantity: 2,
          unit_price: '5000',
          discounted_unit_price: '4000',
          discounted_line_total: '8000',
          estado_cocina: 'pendiente',
        },
      ],
    };
    const { fixture } = await createComponent('tok-1', [], { withSession: true });
    fixture.componentInstance.myOrders.set([order]);
    fixture.componentInstance.section.set('pedidos');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('$ 10.000'); // tachado: precio de lista sin descuento
    expect(texto).toContain('$ 8.000'); // total con descuento
    const lineThrough = (fixture.nativeElement as HTMLElement).querySelector('.line-through');
    expect(lineThrough?.textContent).toContain('10.000');
  });

  // ── spec 089 (A-94): adicionales cobrados una vez por línea en el historial ──

  it('spec 089: 2 × $15.000 con un adicional de $3.000 muestra $33.000 y el adicional aparte', async () => {
    const order: DiningOrder = {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'recibida',
      created_at: new Date().toISOString(),
      items: [
        {
          id: 'it1', product_variant_id: 'v1', quantity: 2, unit_price: '15000',
          addons_total: '3000', line_total: '33000', estado_cocina: 'pendiente',
          options: [{ id: 'oo1', option_id: 'toc', quantity: 1, per_line: true, name: 'Tocino' }],
        },
      ],
    };
    const { fixture } = await createComponent('tok-1', [], { withSession: true });
    fixture.componentInstance.myOrders.set([order]);
    fixture.componentInstance.section.set('pedidos');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('$ 33.000'); // total de la línea y del pedido
    expect(texto).toContain('3.000 adicionales');
    expect(texto).not.toContain('$ 36.000');
    expect(fixture.componentInstance.orderTotal(order)).toBe(33000);
  });

  it('spec 089: con promoción, el tachado incluye el adicional y el ahorro no lo descuenta', async () => {
    const { fixture } = await createComponent('tok-1', [], { withSession: true });
    const cmp = fixture.componentInstance;
    const item = {
      id: 'it1', product_variant_id: 'v1', quantity: 2, unit_price: '15000',
      addons_total: '3000', line_total: '33000', discounted_unit_price: '12000.00',
      discounted_line_total: '27000.00', estado_cocina: 'pendiente',
    } as DiningOrderItem;

    expect(cmp.itemOriginalLineTotal(item)).toBe(33000);
    expect(cmp.itemLineTotal(item)).toBe(27000);
    expect(cmp.itemPromo(item)?.savings).toBe(6000); // 20 % solo sobre 30.000
  });

  it('spec 089: una línea histórica sin los campos nuevos conserva su total de siempre', async () => {
    const { fixture } = await createComponent('tok-1', [], { withSession: true });
    const item = {
      id: 'it1', product_variant_id: 'v1', quantity: 2, unit_price: '18000', estado_cocina: 'pendiente',
    } as DiningOrderItem;

    expect(fixture.componentInstance.itemLineTotal(item)).toBe(36000);
  });

  // ── spec 066 (A-67, FR-013 a FR-015) — insignia genérica en la tarjeta ────

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

  async function carta(variants: MenuProduct['variants']): Promise<HTMLElement> {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Granizados', products: [product({ variants })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });
    return fixture.nativeElement as HTMLElement;
  }

  it('CA1: una promoción de paquete vigente produce insignia — hoy no produce ninguna señal', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: promocion(),
      },
    ]);

    expect(el.textContent).toContain('🎉 Promo');
  });

  it('CA2: una regla de porcentaje produce la MISMA insignia, no una distinta por tipo', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: promocion({
          type: 'percent', min_qty: 3, value: 15,
          short_condition: '3 x -15%', display_text: '3 x -15% · $6.800 c/u',
        }),
      },
    ]);

    expect(el.textContent).toContain('🎉 Promo');
    // La insignia por tipo que gobernaba antes ya no se pinta en la tarjeta.
    expect(el.textContent).not.toContain('🏷️');
  });

  it('CA3: un producto sin presentaciones cubiertas no lleva insignia', async () => {
    const el = await carta([
      { id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true },
    ]);

    expect(el.textContent).not.toContain('🎉 Promo');
  });

  it('CA4: fuera de su ventana el backend no pobló promotion -> sin insignia', async () => {
    // La vigencia la resolvió el backend; la tarjeta solo lee lo que llegó (FR-013).
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: null,
      },
    ]);

    expect(el.textContent).not.toContain('🎉 Promo');
  });

  it('CA5: con porcentaje de cantidad mínima 1 se conserva el tachado Y ADEMÁS hay insignia (FR-015)', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, discounted_price: 7200,
        discount_kind: 'percent', option_groups: [], available: true,
        promotion: promocion({
          type: 'percent', min_qty: 1, value: 10,
          short_condition: '1 x -10%', display_text: '1 x -10% · $7.200 c/u',
        }),
      },
    ]);

    expect(el.textContent).toContain('🎉 Promo');
    expect(el.querySelector('.line-through')).not.toBeNull();
  });

  // ── spec 084 (bug 1, FR-012 a FR-015) — precio de promoción en la tarjeta ─
  //
  // CA1 arriba ("hoy no produce ninguna señal") describe exactamente el vacío
  // que esta spec cierra: una regla de paquete con min_qty >= 2 (la norma
  // desde spec 083 FR-025) solo dejaba la insignia genérica, sin ningún
  // precio — el comensal tenía que abrir el producto para saber cuánto
  // costaba o cuántas unidades necesitaba.

  it('FR-012: además de la insignia, la tarjeta ahora muestra el precio de la regla vigente (min_qty >= 2)', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: promocion(), // 2 x $12.000 · $6.000 c/u, min_qty 2
      },
    ]);

    expect(el.textContent).toContain('🎉 Promo');
    // spec 084 (A-82): solo la condición; el equivalente por unidad (`· $6.000 c/u`) se quitó.
    expect(el.textContent).toContain('2 x $12.000');
    expect(el.textContent).not.toContain('c/u');
  });

  it('FR-013: dos variantes cubiertas con precios distintos → la tarjeta muestra "Desde " + el más barato por unidad', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true,
        promotion: promocion({ unit_equivalent: 6000, short_condition: '2 x $12.000' }),
      },
      {
        id: 'v2', name: 'Grande 16oz', price: 12000, option_groups: [], available: true,
        promotion: promocion({ unit_equivalent: 4500, short_condition: '2 x $9.000' }),
      },
    ]);

    expect(el.textContent).toContain('Desde 2 x $9.000');
    expect(el.textContent).not.toContain('2 x $12.000');
    expect(el.textContent).not.toContain('c/u');
  });

  it('FR-014 (spec 066 FR-015, sin cambio): con min_qty 1 sigue mostrando el precio tachado, sin el texto de "N x"', async () => {
    const el = await carta([
      {
        id: 'v1', name: 'Pequeño 8oz', price: 8000, discounted_price: 7200,
        discount_kind: 'percent', option_groups: [], available: true,
        promotion: promocion({
          type: 'percent', min_qty: 1, value: 10,
          short_condition: '1 x -10%', display_text: '1 x -10% · $7.200 c/u',
        }),
      },
    ]);

    expect(el.querySelector('.line-through')?.textContent).toContain('8.000');
    expect(el.textContent).not.toContain('1 x -10% · $7.200 c/u');
  });

  it('FR-015 (sin cambio): sin ninguna variante cubierta, la tarjeta no muestra precio de promoción', async () => {
    const el = await carta([
      { id: 'v1', name: 'Pequeño 8oz', price: 8000, option_groups: [], available: true },
    ]);

    expect(el.textContent).not.toContain('🎉 Promo');
    expect(el.textContent).not.toContain(' x $');
  });

  // ── spec 081 (US1) — pestaña dedicada de "Promociones" ────────────────────

  it('FR-001/FR-008: la pestaña "Promociones" aparece en la navegación aunque no haya ninguna promoción vigente', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { fixture } = await createComponent('tok-1', categories, { withSession: true });

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Promociones');
  });

  it('FR-002: seleccionar "Promociones" filtra a solo los productos con alguna variante en promoción vigente, sin importar la categoría', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
          product({ id: 'p2', name: 'Sin promo' }),
        ],
      },
      {
        id: 'c2', name: 'Bebidas',
        products: [
          product({ id: 'p3', name: 'Otra con promo', variants: [{ id: 'v3', name: 'Único', price: 6000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    fixture.detectChanges();

    const nombres = component.visibleProducts().map((p) => p.name);
    expect(nombres).toEqual(['Con promo', 'Otra con promo']);
  });

  it('FR-003: una tarjeta de producto dentro de "Promociones" conserva la insignia y la condición, igual que en su categoría original', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('🎉 Promo');
  });

  it('FR-008: sin ninguna promoción vigente, "Promociones" muestra un aviso en vez de una grilla vacía sin explicación', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('No hay promociones activas en este momento');
  });

  it('FR-009: seleccionar una categoría normal después de "Promociones" sigue mostrando todos sus productos, con o sin promoción', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
          product({ id: 'p2', name: 'Sin promo' }),
        ],
      },
    ];
    const { fixture, component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    component.selectCategory('c1');
    fixture.detectChanges();

    const nombres = component.visibleProducts().map((p) => p.name);
    expect(nombres).toEqual(['Con promo', 'Sin promo']);
  });

  // ── spec 081 (US3) — regresión: fuera de "Promociones" nada cambia ────────

  it('FR-010: openProduct() fuera de "Promociones" no marca fromPromotions, aunque el producto tenga promoción', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory('c1');
    component.openProduct(component.visibleProducts()[0]);

    expect(component.selectedProductFromPromotions()).toBe(false);
  });

  it('FR-002/FR-011: openProduct() desde "Promociones" sí marca fromPromotions == true', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [
          product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] }),
        ],
      },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);
    component.openProduct(component.visibleProducts()[0]);

    expect(component.selectedProductFromPromotions()).toBe(true);
  });

  // ── Ajustes tras probar en un entorno real (2026-09-12) ───────────────────

  it('con "Promociones" activa, activeCategory() es null — no se resalta ninguna categoría a la vez que "Promociones"', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    component.selectCategory(PROMOTIONS_TAB_ID);

    expect(component.activeCategory()).toBeNull();
  });

  it('FR-014: al ingresar con al menos una promoción vigente, "Promociones" queda seleccionada por defecto, sin que el comensal presione nada', async () => {
    const categories: MenuCategory[] = [
      {
        id: 'c1', name: 'Helados',
        products: [product({ id: 'p1', name: 'Con promo', variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true, promotion: promocion() }] })],
      },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    expect(component.activeCategoryId()).toBe(PROMOTIONS_TAB_ID);
  });

  it('FR-014: sin ninguna promoción vigente, la primera categoría queda seleccionada, igual que antes de esta spec', async () => {
    const categories: MenuCategory[] = [
      { id: 'c1', name: 'Helados', products: [product({ id: 'p1' })] },
    ];
    const { component } = await createComponent('tok-1', categories, { withSession: true });

    expect(component.activeCategoryId()).toBeNull();
    expect(component.activeCategory()?.id).toBe('c1');
  });

  // ── spec 089 (Historia 3): editar los adicionales de una línea del carrito ──

  describe('editar adicionales (spec 089, Historia 3)', () => {
    const tocino = { id: 'toc', name: 'Tocino', extra_price: 3000, available: true };
    const queso = { id: 'que', name: 'Queso', extra_price: 2000, available: true };
    const menu = (): MenuCategory[] => [
      {
        id: 'c1',
        name: 'Hamburguesas',
        products: [
          product({
            id: 'p1', name: 'Hamburguesa',
            variants: [
              {
                id: 'v1', name: 'Sencilla', price: 15000, available: true,
                option_groups: [
                  {
                    id: 'g1', name: 'Adicionales', min_select: 0, max_select: 3, consume: false,
                    selection_mode: 'cantidad', max_quantity_per_option: null, max_total_quantity: null,
                    options: [tocino, queso],
                  },
                ],
              },
            ],
          }),
        ],
      },
    ];
    const linea = (over: Partial<CartLine> = {}): Partial<CartLine> => ({
      id: 'l1', productVariantId: 'v1', productName: 'Hamburguesa', variantName: 'Sencilla',
      quantity: 2, notes: 'sin cebolla', unitPrice: 15000, addonsTotal: 3000, lineTotal: 33000,
      optionKey: 'toc', optionNames: ['Tocino x1'], optionSelections: [{ optionId: 'toc', quantity: 1 }],
      ...over,
    });

    async function abrir(over: Partial<CartLine> = {}) {
      const { fixture, component } = await createComponent('tok-1', menu(), { withSession: true });
      const cart = TestBed.inject(DiningCartService) as unknown as FakeDiningCartService;
      cart.lines.set([linea(over)]);
      cart.isEmpty.set(false);
      fixture.detectChanges();
      return { fixture, component, cart };
    }

    it('"Editar adicionales" abre el selector con la variante, la cantidad, la nota y el adicional ya elegidos', async () => {
      const { fixture, component } = await abrir();

      component.openEditAddons('l1');
      fixture.detectChanges();

      const ed = component.editing()!;
      expect(ed.selection.variant.id).toBe('v1');
      expect(ed.selection.quantity).toBe(2);
      expect(ed.selection.notes).toBe('sin cebolla');
      expect(ed.selection.options.map((c) => [c.option.id, c.quantity])).toEqual([['toc', 1]]);
      const modal = fixture.nativeElement.querySelector('app-product-select') as HTMLElement;
      expect(modal).not.toBeNull();
      expect(modal.textContent).toContain('Guardar cambios');
      // La cantidad de producto no se puede cambiar al editar adicionales.
      expect(modal.querySelector('[data-testid="cantidad-fija"]')?.textContent?.trim()).toBe('2');
    });

    it('Guardar cambios llama a updateItem con las opciones y la nota, y cierra el selector', async () => {
      const { fixture, component, cart } = await abrir();
      component.openEditAddons('l1');
      fixture.detectChanges();

      await component.onEditSaved({
        ...component.editing()!.selection,
        options: [{ option: queso, quantity: 2, groupName: 'Adicionales' }],
        notes: 'sin sal',
      });

      expect(cart.updateItem).toHaveBeenCalledWith(
        'l1', [{ option: queso, quantity: 2, groupName: 'Adicionales' }], 'sin sal',
      );
      expect(component.editingLine()).toBeNull();
    });

    it('quitar todos los adicionales y guardar envía options vacías y no elimina la línea', async () => {
      const { fixture, component, cart } = await abrir();
      component.openEditAddons('l1');
      fixture.detectChanges();

      await component.onEditSaved({ ...component.editing()!.selection, options: [] });

      expect(cart.updateItem).toHaveBeenCalledWith('l1', [], 'sin cebolla');
    });

    it('Cancelar cierra el selector, deja la línea intacta y no llama al backend', async () => {
      const { fixture, component, cart } = await abrir();
      component.openEditAddons('l1');
      fixture.detectChanges();

      component.closeEdit();
      fixture.detectChanges();

      expect(component.editingLine()).toBeNull();
      expect(cart.updateItem).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('app-product-select')).toBeNull();
      expect(cart.lines()[0].id).toBe('l1');
    });

    it('si el backend responde 422, muestra su mensaje SIN cerrar el selector', async () => {
      const { fixture, component, cart } = await abrir();
      component.openEditAddons('l1');
      fixture.detectChanges();
      cart.updateItem.mockRejectedValueOnce(
        new HttpErrorResponse({ status: 422, error: { detail: { error: 'Selección de opciones inválida: «Adicionales» admite como máximo 2 unidad(es) por opción' } } }),
      );

      await component.onEditSaved(component.editing()!.selection);
      fixture.detectChanges();

      expect(component.editingLine()).not.toBeNull();
      const error = fixture.nativeElement.querySelector('[data-testid="error-externo"]') as HTMLElement;
      expect(error.textContent).toContain('admite como máximo 2');
    });

    it('un adicional que el menú ya no ofrece (desactivado) se avisa y se quitará al guardar', async () => {
      const { fixture, component } = await abrir({
        optionSelections: [{ optionId: 'toc', quantity: 1 }, { optionId: 'ya-no-existe', quantity: 1 }],
      });

      component.openEditAddons('l1');
      fixture.detectChanges();

      expect(component.editing()!.selection.options.map((c) => c.option.id)).toEqual(['toc']);
      const aviso = fixture.nativeElement.querySelector('[data-testid="adicionales-retirados"]') as HTMLElement;
      expect(aviso.textContent).toContain('Un adicional');
      expect(aviso.textContent).toContain('se quitará');
    });

    it('una línea cuyo producto ya no está en el menú no se puede editar: solo quitar', async () => {
      const { fixture, component } = await abrir({ productVariantId: 'variante-desactivada' });

      expect(component.nonEditableLineIds().has('l1')).toBe(true);
      component.openEditAddons('l1');
      fixture.detectChanges();

      expect(component.editingLine()).toBeNull();
    });

    it('una línea con su producto en el menú sí es editable', async () => {
      const { component } = await abrir();
      expect(component.nonEditableLineIds().has('l1')).toBe(false);
    });
  });

  // ── spec 089 (A-95): pantalla "¡Gracias por tu visita!" al cerrarse la mesa ──

  describe('mesa cerrada (spec 089, A-95)', () => {
    async function conSesion(business: ResolvedBusiness | null = null) {
      const r = await createComponent('tok-1', [], { withSession: true, business });
      const rt = TestBed.inject(RealtimeService) as unknown as FakeRealtimeService;
      const diner = TestBed.inject(DinerService) as unknown as FakeDinerService;
      const cart = TestBed.inject(DiningCartService) as unknown as FakeDiningCartService;
      const tokens = TestBed.inject(DinerTokenStore);
      return { ...r, rt, diner, cart, tokens };
    }

    it('el evento session.closed (cualquier reason) lleva a la pantalla de gracias con el texto exigido', async () => {
      for (const reason of ['paid', 'swept', 'released', 'empty']) {
        sessionStorage.clear(); // cada vuelta es una pestaña nueva: sin la marca de la anterior
        const { component, fixture, rt } = await conSesion();
        expect(component.view()).toBe('menu');

        rt.emit('session.closed', { reason });
        fixture.detectChanges();

        expect(component.view()).toBe('closed');
        const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(texto).toContain('¡Gracias por tu visita! Esperamos verte pronto.');
      }
    });

    it('la pantalla de gracias no ofrece botones, enlaces, historial ni recibo', async () => {
      const { fixture, rt, component } = await conSesion();
      component.myOrders.set([
        { id: 'o1', channel: 'QR_MENU', status: 'recibida', created_at: new Date().toISOString(), items: [] } as DiningOrder,
      ]);

      rt.emit('session.closed', { reason: 'paid' });
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('button')).toBeNull();
      expect(el.querySelector('a')).toBeNull();
      expect(el.querySelector('nav')).toBeNull();
      expect(el.textContent).not.toContain('Pedidos');
      expect(el.textContent).not.toContain('Recibo');
      expect(component.myOrders()).toEqual([]);
    });

    it('limpia carrito, sesión y token; deja de sondear (nada de la sesión anterior sobrevive)', async () => {
      const { component, rt, cart, tokens } = await conSesion();
      expect(tokens.token()).toBe('session-tok');

      rt.emit('session.closed', { reason: 'released' });

      expect(component.view()).toBe('closed');
      expect(tokens.token()).toBeNull();
      expect(cart.clear).toHaveBeenCalled();
      expect(cart.clearDiner).toHaveBeenCalled();
      expect(component.myOrders()).toEqual([]);
      expect(component.orderError()).toBeNull();
    });

    it('con el negocio conocido muestra su logo y nombre, como la pantalla de salida', async () => {
      const business: ResolvedBusiness = { name: 'Heladería Polar', logo_url: 'https://cdn.example/logo.png' };
      const { fixture, rt } = await conSesion(business);

      rt.emit('session.closed', { reason: 'paid' });
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect((el.querySelector('img') as HTMLImageElement).src).toBe('https://cdn.example/logo.png');
      expect(el.textContent).toContain('Heladería Polar');
    });

    it('un 401 CON X-Session-State: closed en el sondeo (teléfono sin conexión al cierre) lleva a gracias', async () => {
      const { component, fixture, rt, diner } = await conSesion();
      diner.myOrdersError = new DinerSessionExpiredError('Sesión no activa', true);

      rt.emit('reconnected'); // al volver la conexión se refresca y el 401 dice "cerrada"
      await new Promise((r) => setTimeout(r, 300));
      fixture.detectChanges();

      expect(component.view()).toBe('closed');
    });

    it('un 401 CON cabecera al cargar (token de una sesión anterior) lleva al acceso denegado, no a gracias (A-95 FR-017a)', async () => {
      TestBed.resetTestingModule();
      localStorage.setItem('pos.diner.session_token', 'session-tok');
      const diner = new FakeDinerService();
      diner.myOrdersError = new DinerSessionExpiredError('Sesión no activa', true);
      TestBed.configureTestingModule({
        imports: [PublicMenuComponent],
        providers: [
          { provide: DinerService, useValue: diner },
          { provide: DiningCartService, useClass: FakeDiningCartService },
          { provide: RealtimeService, useClass: FakeRealtimeService },
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok-1' }) }, queryParamMap: of(convertToParamMap({})) } },
          { provide: Router, useValue: { navigate: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(PublicMenuComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 30));
      fixture.detectChanges();

      expect(fixture.componentInstance.view()).toBe('exited');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="vista-acceso-denegado"]')).not.toBeNull();
      expect(el.textContent).not.toContain('¡Gracias por tu visita!');
      expect(el.querySelector('button')).toBeNull();
      expect(el.querySelector('input')).toBeNull();
      // deja la marca por pestaña y no queda ningún dato del comensal
      expect(sessionStorage.getItem('pos.diner.exited_token')).toBe('tok-1');
      expect(localStorage.getItem('pos.diner.session_token')).toBeNull();
    });

    it('un 401 SIN cabecera (vencimiento por inactividad) conserva la pantalla de nombre con su mensaje', async () => {
      const { component, fixture, rt, diner } = await conSesion();
      diner.myOrdersError = new DinerSessionExpiredError('Sesión expirada por inactividad. Vuelve a escanear el QR.', false);

      rt.emit('reconnected');
      await new Promise((r) => setTimeout(r, 300));
      fixture.detectChanges();

      expect(component.view()).toBe('name');
      expect(component.errorMessage()).toContain('inactividad');
    });

    it('si el comensal ya había salido con "Salir" y luego llega session.closed, no cambia de pantalla (A-95 FR-015c)', async () => {
      const { component, fixture, rt } = await conSesion();
      await component.exit();
      expect(component.view()).toBe('closed');

      rt.emit('session.closed', { reason: 'paid' });
      fixture.detectChanges();

      expect(component.view()).toBe('closed');
      expect(fixture.nativeElement.textContent).toContain('¡Gracias por tu visita! Esperamos verte pronto.');
    });

    // ── SC-011 / US4 escenarios 10–12: mismo estado final, recarga y pestaña nueva ──

    function dinerKeys(area: Storage): string[] {
      const keys: string[] = [];
      for (let i = 0; i < area.length; i++) {
        const k = area.key(i);
        if (k?.startsWith('pos.diner.')) keys.push(k);
      }
      return keys;
    }

    it('tras session.closed (cada reason) y tras "Salir" el estado del navegador es idéntico: solo pos.diner.exited_token = token público', async () => {
      const estados: string[] = [];
      const escenarios: Array<(r: Awaited<ReturnType<typeof conSesion>>) => Promise<void>> = [
        ...['paid', 'swept', 'released', 'empty'].map(
          (reason) => async (r: Awaited<ReturnType<typeof conSesion>>) => r.rt.emit('session.closed', { reason }),
        ),
        async (r) => r.component.exit(),
      ];
      for (const cerrar of escenarios) {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('pos.diner.checkout_progress.o1', '{"step":2}');
        sessionStorage.setItem('pos.diner.checkout_progress.o2', '{"step":1}');
        const r = await conSesion();
        await cerrar(r);

        estados.push(
          JSON.stringify({
            local: dinerKeys(localStorage),
            session: dinerKeys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)]),
            cookies: document.cookie.includes('pos.diner'),
          }),
        );
      }

      expect(new Set(estados).size).toBe(1);
      expect(JSON.parse(estados[0])).toEqual({
        local: [],
        session: [['pos.diner.exited_token', 'tok-1']],
        cookies: false,
      });
    });

    it('recargar tras el cierre (marca presente) muestra el acceso denegado y NO abre sesión ni pide nombre', async () => {
      const { rt } = await conSesion();
      rt.emit('session.closed', { reason: 'paid' });

      const { component, fixture } = await createComponent('tok-1');
      const diner = TestBed.inject(DinerService) as unknown as FakeDinerService;

      expect(component.view()).toBe('exited');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="vista-acceso-denegado"]')).not.toBeNull();
      expect(el.querySelector('input')).toBeNull();
      expect(el.querySelector('button')).toBeNull();
      expect(diner.openSession).not.toHaveBeenCalled();
    });

    it('una pestaña sin marca (escaneo nuevo) entra por el nombre y puede abrir sesión nueva (FR-015c)', async () => {
      const { rt } = await conSesion();
      rt.emit('session.closed', { reason: 'paid' });
      sessionStorage.clear(); // pestaña nueva: sessionStorage vacío

      const { component } = await createComponent('tok-1');

      expect(component.view()).toBe('name');
    });

    it('con sessionStorage bloqueado la pantalla de gracias se muestra sin lanzar', async () => {
      const { component, fixture, rt } = await conSesion();
      const bloqueado = () => {
        throw new DOMException('bloqueado', 'SecurityError');
      };
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(bloqueado);
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(bloqueado);
      try {
        expect(() => rt.emit('session.closed', { reason: 'paid' })).not.toThrow();
        fixture.detectChanges();
        expect(component.view()).toBe('closed');
        expect(fixture.nativeElement.textContent).toContain('¡Gracias por tu visita! Esperamos verte pronto.');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('un pago por transferencia en curso no bloquea la pantalla de gracias (FR-019): el modal de pago se cierra', async () => {
      const { component, fixture, rt } = await conSesion();
      component.payingOrder.set({ id: 'o1', channel: 'QR_MENU', status: 'recibida', created_at: new Date().toISOString(), items: [] } as DiningOrder);
      component.cartDrawerOpen.set(true);
      fixture.detectChanges();

      rt.emit('session.closed', { reason: 'paid' });
      fixture.detectChanges();

      expect(component.view()).toBe('closed');
      expect(component.payingOrder()).toBeNull();
      expect(component.cartDrawerOpen()).toBe(false);
      expect(fixture.nativeElement.querySelector('button')).toBeNull();
    });

    it('una acción rechazada con 401 de cierre (p. ej. agregar al carrito) también lleva a gracias', async () => {
      const { component, fixture } = await conSesion();
      const showCartError = (component as unknown as { showCartError(e: unknown): void }).showCartError.bind(component);

      showCartError(new DinerSessionExpiredError('Sesión no activa', true));
      fixture.detectChanges();

      expect(component.view()).toBe('closed');
    });
  });
});
