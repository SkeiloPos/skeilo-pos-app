import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PosOrderPanelComponent } from './pos-order-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';
import { TableService } from '../services/table.service';
import { Table } from '../interfaces/table.interface';
import { MenuService } from '../../../core/services/menu.service';

const API = environment.apiBaseUrl;

/** Pedido con un solo ítem ya en cocina ('listo'), origen mesero. `paid` se
 *  fija por test (spec 029, Historia 1: "Anular" desaparece una vez pagado). */
function orderConItemListo(paid: boolean): DiningOrder {
  return {
    id: 'o1',
    channel: 'POS',
    status: 'abierta',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-21T10:00:00',
    paid,
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'listo' }],
  } as DiningOrder;
}

/** Spec 029, Historia 1 (FR-007): un pedido ya pagado no se puede anular —
 *  el botón "Anular" deja de mostrarse en el panel de pedido. */
describe('PosOrderPanelComponent — anulación bloqueada tras pago', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const anularButton = (): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Anular',
    ) as HTMLButtonElement | undefined;

  it('no muestra "Anular" cuando el pedido seleccionado ya está pagado', () => {
    store.orders.set([orderConItemListo(true)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(anularButton()).toBeUndefined();
  });

  it('sí muestra "Anular" cuando el pedido seleccionado todavía no está pagado', () => {
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(anularButton()).toBeDefined();
  });
});

/** Spec 029, Historia 2 (FR-009/010/011): ningún control de descuento
 *  manual — el atajo F4 y su popover se retiraron por completo; el único
 *  descuento posible es el automático por promoción. */
describe('PosOrderPanelComponent — sin descuento manual', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no existe ningún botón/campo para aplicar un descuento manual', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Aplicar descuento');
    expect(texto).not.toContain('F4');
    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull();
  });

  it('el descuento mostrado en el total es siempre $0 sin promociones activas', () => {
    expect(store.totals().discount).toBe(0);
  });
});

/** Spec 049, FR-002: el resumen Subtotal/Descuento/Total se retiró de este
 *  panel — vive ahora en session-bill-panel.component.ts ("Cuenta de la
 *  mesa"). `store.totals()` en sí no cambia (sigue alimentando el panel de
 *  cuenta indirectamente vía `bill.split`), solo deja de renderizarse aquí. */
describe('PosOrderPanelComponent — sin resumen de totales (spec 049)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no muestra ninguna fila "Subtotal", "Descuento" ni "Total"', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Subtotal');
    expect(texto).not.toContain('Descuento');
    expect(texto).not.toContain('Total');
  });

  it('conserva "Marcar pedido listo" fuera del contenedor de totales retirado', () => {
    // orderConItemListo(false) ya tiene su único ítem 'listo': kitchenReady()
    // es true y el botón no se muestra (comportamiento ya existente, sin
    // relación con esta spec) — se necesita un ítem 'pendiente' para verlo.
    store.orders.set([
      { ...orderConItemListo(false), items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'pendiente' }] },
    ]);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Marcar pedido listo');
  });
});

/**
 * spec 089 (A-94): las líneas del Menú QR cobran los adicionales una sola vez por línea; el total
 * de cada línea del panel los incluye y los muestra aparte del precio por unidad.
 */
describe('PosOrderPanelComponent — adicionales por línea (spec 089)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function conItem(extra: Partial<DiningOrderItem>): void {
    store.orders.set([
      {
        ...orderConItemListo(false),
        items: [
          { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', estado_cocina: 'pendiente', ...extra },
        ],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  }

  it('el total de la línea incluye el adicional una sola vez: $33.000, no $30.000 ni $36.000', () => {
    conItem({ addons_total: '3000', line_total: '33000' });

    expect(store.cartView()[0].subtotal).toBe(33000);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain(store.fmt(33000));
    expect(texto).toContain('adicionales');
  });

  it('una línea histórica sin adicionales conserva su total y no muestra la fila de adicionales', () => {
    conItem({ unit_price: '18000' });

    expect(store.cartView()[0].subtotal).toBe(36000);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('adicionales');
  });

  it('con promoción, el importe descontado y el tachado conservan el adicional', () => {
    conItem({
      addons_total: '3000', line_total: '33000',
      discounted_unit_price: '12000.00', discounted_line_total: '27000.00',
    });

    const row = store.cartView()[0];
    expect(row.subtotal).toBe(27000);
    expect(row.promo?.discountedAmount).toBe(27000); // 12.000 × 2 + 3.000
    expect(row.promo?.originalAmount).toBe(33000); // 15.000 × 2 + 3.000
    expect(row.promo?.savings).toBe(6000); // el adicional no se descuenta
  });

  it('A-129: la insignia de promoción usa el mismo formato del modal (condición sola, sin "Promoción" ni "Ahorras")', () => {
    conItem({
      addons_total: '3000', line_total: '33000',
      discounted_unit_price: '12000.00', discounted_line_total: '27000.00',
    });
    // `promo.badge` sale de `discountInfo()` como "-N%" para este camino (sin catalogPromo) --
    // se verifica el texto exacto que arma el store, no uno inventado en el test.
    const badge = store.cartView()[0].promo?.badge as string;
    expect(badge).toBeTruthy();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain(badge);
    expect(texto).not.toContain('Promoción');
    expect(texto).not.toContain('Ahorras');
  });

  it('A-133 (revierte A-130): con promoción, "{{ qty }} × ..." ya no se muestra en absoluto — con cantidades que no completan un paquete exacto, un promedio por unidad no representa ningún precio real', () => {
    conItem({ unit_price: '8000', discounted_unit_price: '7500.00', discounted_line_total: '15000.00' });

    const row = store.cartView()[0];
    expect(row.promo).toEqual({ badge: '-6%', originalAmount: 16000, discountedAmount: 15000, savings: 1000 });

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // "$ 7.500 c/u" (itemUnitPrice, ya descontado) sigue mostrándose -- lo único que se quita es
    // la fila "{{ qty }} × ...", que aquí habría sido un promedio ("2 × $ 7.500") sin relación
    // con ningún precio real cobrado.
    expect(texto).not.toContain('2 × $');
  });

  it('A-133: sin promoción, "{{ qty }} × ..." se sigue mostrando con el precio de lista (sin cambio)', () => {
    conItem({ unit_price: '8000' });

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('2 × $ 8.000');
  });

  // ─── spec 115 (hallazgo adicional): ítem "Pendiente" sin discounted_unit_price todavía ───

  it('A-128: un ítem "Pendiente" (sin discounted_unit_price, antes de cobrar) con promoción de paquete vigente en el catálogo muestra la insignia/tachado estimados', () => {
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      {
        id: 'c1', name: 'Helados', products: [{
          id: 'p1', name: 'Ojo de Diablo', description: null, image_url: null, available: true,
          option_groups: [],
          variants: [{
            id: 'v1', name: '8 onz', price: 8000, option_groups: [], available: true,
            promotion: {
              min_qty: 2, short_condition: '2 x $15.000', type: 'package_price', value: 15000, unit_equivalent: 7500,
            } as never,
          }],
        }],
      },
    ]);

    conItem({ unit_price: '8000', quantity: 2 });

    const row = store.cartView()[0];
    expect(row.promo).toEqual({
      badge: '2 x $15.000',
      originalAmount: 16000,
      discountedAmount: 15000,
      savings: 1000,
    });
    // `subtotal`/`unitPrice` de la línea NO cambian -- `discounted_unit_price` sigue sin
    // congelar; el backend resuelve el importe real al cobrar (FR-023, sin cambio).
    expect(row.subtotal).toBe(16000);
  });

  it('A-128: un ítem "Pendiente" sin promoción vigente en el catálogo no muestra ninguna insignia', () => {
    const menuService = TestBed.inject(MenuService);
    menuService.categories.set([
      { id: 'c1', name: 'Helados', products: [{
        id: 'p1', name: 'Ojo de Diablo', description: null, image_url: null, available: true,
        option_groups: [], variants: [{ id: 'v1', name: '8 onz', price: 8000, option_groups: [], available: true }],
      }] },
    ]);

    conItem({ unit_price: '8000', quantity: 2 });

    expect(store.cartView()[0].promo).toBeNull();
  });
});

/**
 * spec 078 (US4, FR-022–FR-024; research.md D5): con la columna de detalle ya
 * acotada (US3), las secciones fijas del panel de pedido van `shrink-0` y la
 * lista de productos queda como la ÚNICA región `flex-1 min-h-0 overflow-y-auto`
 * — recibe todo el alto libre.
 */
describe('PosOrderPanelComponent — reparto de alto: lista de productos sin scroll propio (spec 078, US4; hotfix posterior)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function seleccionarPedido(nItems: number): void {
    store.orders.set([
      {
        ...orderConItemListo(false),
        items: Array.from({ length: nItems }, (_, i) => ({
          id: `i${i}`,
          product_variant_id: 'v1',
          quantity: 1,
          unit_price: '5000',
          estado_cocina: 'pendiente' as const,
        })),
      },
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  }

  it('el encabezado del panel va shrink-0', () => {
    seleccionarPedido(6);
    const header = fixture.nativeElement.querySelector('.border-b.shrink-0') as HTMLElement;
    expect(header).toBeTruthy();
    expect(header.className).toContain('shrink-0');
  });

  const divs = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('div')) as HTMLElement[];

  it('la lista de productos ya no tiene scroll propio (a pedido del usuario: un solo scroll para toda la columna, en table-sessions.component.ts)', () => {
    seleccionarPedido(6);
    const scrollRegions = divs().filter((d) => d.className.includes('overflow-y-auto'));
    expect(scrollRegions).toHaveLength(0);
  });

  it('"Marcar pedido listo" (en la cabecera, a pedido del usuario) queda shrink-0, fuera de la lista scrolleable (FR-023)', () => {
    // Se subió de una fila propia a todo el ancho debajo de la lista, a la
    // cabecera (a la derecha de "Mesa N", junto a las pestañas/insignias) --
    // en ambos casos su contenedor es shrink-0 y ajeno al scroll de la lista.
    seleccionarPedido(6);
    const marcar = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.includes('Marcar pedido listo'),
    );
    expect(marcar).toBeTruthy();
    const bar = marcar!.parentElement as HTMLElement;
    expect(bar.className).toContain('shrink-0');
    expect(bar.className).not.toContain('overflow-y-auto');
  });

  it('un pedido de 1–2 productos no fuerza alto artificial (la lista crece a su alto natural, sin min-height fijo) (FR-024)', () => {
    seleccionarPedido(2);
    // Rediseño de ítems (sin tarjetas por ítem): la lista es el contenedor
    // divide-y que envuelve el @for de líneas de carrito.
    const list = divs().find((d) => d.className.includes('divide-y')) as HTMLElement;
    expect(list).toBeTruthy();
    expect(list.className).not.toMatch(/\bh-\[/);
    expect(list.className).not.toMatch(/\bmin-h-\[/);
  });
});

/** Spec 029, Historia 3 (FR-013): el encabezado del pedido distingue tres
 *  estados — "en preparación", "pago pendiente" y "listo para cobrar" —, ya
 *  no solo dos. */
describe('PosOrderPanelComponent — encabezado de tres estados (spec 029)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  function orderCon(estado: 'pendiente' | 'listo', paid: boolean): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      status: 'abierta',
      version: 1,
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-21T10:00:00',
      paid,
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: estado }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
  });

  afterEach(() => http.verify());

  // El texto "Pedido · <estado>" que mostraba estos tres valores se retiró de
  // la cabecera (dejaba de caber junto a las pestañas "Pedido N", movidas al
  // lado del botón de cerrar) -- headerStatusText() sigue existiendo y
  // decidiendo la insignia "Cobro pendiente", así que estas pruebas verifican
  // el método directamente en vez de buscar el texto en el DOM.
  it('cocina en curso → "en preparación", sin importar el pago', () => {
    store.orders.set([orderCon('pendiente', false)]);
    fixture.detectChanges();
    expect(fixture.componentInstance.headerStatusText()).toBe('en preparación');
  });

  it('cocina lista pero sin pagar → "pago pendiente" (insignia "Cobro pendiente" visible)', () => {
    store.orders.set([orderCon('listo', false)]);
    fixture.detectChanges();
    expect(fixture.componentInstance.headerStatusText()).toBe('pago pendiente');
    expect(fixture.nativeElement.textContent).toContain('Cobro pendiente');
  });

  it('cocina lista y pagado → "listo para cobrar"', () => {
    store.orders.set([orderCon('listo', true)]);
    fixture.detectChanges();
    expect(fixture.componentInstance.headerStatusText()).toBe('listo para cobrar');
  });
});

/** Pedido sin ítems, origen mesero, todavía sin cocina — mesa ocupada
 *  "armando pedido" (spec 036, Historia 2). */
function orderVacio(channel: DiningOrder['channel'] = 'POS', paid = false): DiningOrder {
  return {
    id: 'o1',
    channel,
    status: 'abierta',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-21T10:00:00',
    paid,
    items: [],
  } as DiningOrder;
}

/** Spec 036, Historia 2: el catálogo se embebe en el mismo panel central en
 *  vez de abrirse como overlay de pantalla completa. */
describe('PosOrderPanelComponent — catálogo embebido (spec 036, Historia 2)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([orderVacio()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const findButton = (text: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === text,
    ) as HTMLButtonElement | undefined;

  it('pulsar "+ Agregar producto" embebe el catálogo en el mismo panel, sin overlay de pantalla completa', () => {
    findButton('＋ Agregar producto')!.click();
    fixture.detectChanges();

    expect(store.catalogOpen()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Catálogo de productos');
    expect(el.querySelector('.fixed.inset-0')).toBeNull();
  });

  it('seleccionar un producto desde el catálogo regresa a la lista de ítems, ahora con el producto agregado', () => {
    findButton('＋ Agregar producto')!.click();
    fixture.detectChanges();
    expect(store.catalogOpen()).toBe(true);

    // Simula completar la selección de variante/opciones ya existente
    // (`app-product-select`), que llama a `addDraftFromSelection()`.
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Malteada de fresa' } as never,
      variant: { id: 'v1', price: 8000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    expect(store.catalogOpen()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Malteada de fresa');
    expect(text).not.toContain('Catálogo de productos');
  });

  it('[T010] spec 113 (FR-007): agregar un producto con presentación a una orden ya creada muestra el pill de presentación de inmediato, sin esperar a guardar', () => {
    findButton('＋ Agregar producto')!.click();
    fixture.detectChanges();

    store.addDraftFromSelection({
      product: {
        id: 'p1',
        name: 'Ojo de Diablo',
        variants: [
          { id: 'v-8oz', name: '8 oz', price: 8000 },
          { id: 'v-12oz', name: '12 oz', price: 11000 },
        ],
      } as never,
      variant: { id: 'v-12oz', name: '12 oz', price: 11000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ojo de Diablo');
    const pill = Array.from(fixture.nativeElement.querySelectorAll('span')).find(
      (el) => (el as HTMLElement).className.includes('rounded-full') && (el as HTMLElement).textContent?.trim() === '12 oz',
    );
    expect(pill).toBeTruthy();
  });

  it('decidir no agregar nada y volver conserva los ítems ya agregados', () => {
    store.addDraftFromSelection({
      product: { id: 'p1', name: 'Ya agregado' } as never,
      variant: { id: 'v1', price: 8000 } as never,
      options: [],
      quantity: 1,
      notes: null,
    });
    fixture.detectChanges();

    findButton('＋ Agregar producto')!.click();
    fixture.detectChanges();
    expect(store.catalogOpen()).toBe(true);

    findButton('← Volver a la lista')!.click();
    fixture.detectChanges();

    expect(store.catalogOpen()).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ya agregado');
  });
});

/** Spec 036, US2, escenario 5: una orden QR de solo lectura ("Resumen de
 *  Cuenta") no ofrece "+ Agregar producto" — mismo criterio que ya usa
 *  `pos-checkout-panel.component.ts` (`getSidebarMode`). */
describe('PosOrderPanelComponent — sin catálogo para una orden QR de solo lectura (spec 036)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  function ordenQrPagadaConCocinaPendiente(): DiningOrder {
    // spec 035 (A-52): una orden 'pagada' con ítems aún sin terminar de
    // preparar sigue contando como consumo vivo de la mesa → `pos-order-panel`
    // la muestra (estado 'pedido'), pero es de solo lectura (getSidebarMode).
    return {
      id: 'o1',
      channel: 'QR_MENU',
      status: 'pagada',
      version: 1,
      dining_table_id: 't1',
      customer_name: 'Ana',
      created_at: '2026-08-21T10:00:00',
      paid: true,
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'en_preparacion' }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([ordenQrPagadaConCocinaPendiente()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no ofrece el botón "+ Agregar producto"', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('＋ Agregar producto');
  });
});

function table(partial: Partial<Table>): Table {
  return { id: 't1', number: 1, name: null, qr_token: 'tok', active: true, status: 'ocupada', ...partial };
}

function pendingOrder(id: string, tableId: string): DiningOrder {
  return {
    id,
    channel: 'QR_MENU',
    status: 'recibida',
    dining_table_id: tableId,
    customer_name: null,
    created_at: '2026-08-21T10:00:00',
    items: [],
  } as DiningOrder;
}

/**
 * Spec 045: sin mesa seleccionada, este panel ya no muestra la sección
 * global "Pagos por confirmar" (spec 036 FR-004, retirada) — solo un
 * placeholder informativo único.
 */
describe('PosOrderPanelComponent — placeholder cuando no hay mesa seleccionada (spec 045)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin mesa seleccionada, muestra un único placeholder informativo (sin "Pagos por confirmar")', () => {
    tableService.tables.set([table({ id: 't1', number: 4 })]);
    store.orders.set([pendingOrder('o1', 't1')]);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Pagos por confirmar');
    expect(texto).toContain('Selecciona una mesa');
  });

  it('con una mesa/pedido seleccionado, ya no muestra "Pagos por confirmar" (solo el detalle del pedido)', () => {
    tableService.tables.set([table({ id: 't1', number: 4 })]);
    store.orders.set([
      {
        id: 'o2',
        channel: 'POS',
        status: 'abierta',
        dining_table_id: 't1',
        customer_name: null,
        created_at: '2026-08-21T10:00:00',
        paid: false,
        items: [],
      } as DiningOrder,
    ]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o2');
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Pagos por confirmar');
  });
});

/** Spec 049: cabecera de solo lectura + pestañas "Pedido N". */
describe('PosOrderPanelComponent — cabecera y pestañas (spec 049)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let tableService: TableService;
  let http: HttpTestingController;

  function ordenSimple(
    id: string,
    estado: 'pendiente' | 'listo',
    customerName: string | null = 'Deimer Hernandez',
  ): DiningOrder {
    return {
      id,
      channel: 'POS',
      status: 'abierta',
      dining_table_id: 't1',
      customer_name: customerName,
      // spec 087 (FR-006): la pestaña ya no rotula por posición sino por
      // este número, asignado una sola vez por el backend — se deriva del id
      // ('o1' -> 1, 'o2' -> 2) para mantener las mismas etiquetas "Pedido N"
      // que ya esperaban los tests de este describe.
      table_order_number: Number(id.replace(/\D/g, '')) || null,
      created_at: '2026-08-21T08:10:00',
      paid: false,
      items: [{ id: `${id}-i1`, product_variant_id: 'v1', quantity: 2, unit_price: '4000', estado_cocina: estado }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    tableService = TestBed.inject(TableService);
    http = TestBed.inject(HttpTestingController);
    tableService.tables.set([table({ id: 't1', number: 2, status: 'ocupada' })]);
  });

  afterEach(() => http.verify());

  const findButton = (text: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === text,
    ) as HTMLButtonElement | undefined;

  it('la cabecera muestra mesa, chip de estado y cliente como texto, sin ningún input editable', () => {
    store.orders.set([ordenSimple('o1', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    // `selectedOrderId` se fija directo (patrón ya usado en este archivo);
    // `customerName` normalmente lo copia `selectTable()`/`selectOrder()`
    // desde `order.customer_name`, así que se fija igual aquí a propósito.
    store.customerName.set('Deimer Hernandez');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Mesa 2');
    // Con un ítem 'pendiente', el chip refleja el estado derivado real
    // ("En preparación", `deriveTableStatus`), no el estado crudo de la mesa
    // ("Ocupada") — mismo criterio ya usado por la grilla (`tablesView()`).
    expect(el.textContent).toContain('En preparación');
    expect(el.textContent).toContain('Deimer Hernandez');
    expect(el.querySelector('input[type="text"]')).toBeNull();
  });

  it('con dos pedidos activos aparecen "Pedido 1" y "Pedido 2", sin la opción "Todos los pedidos"', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(findButton('Pedido 1')).toBeDefined();
    expect(findButton('Pedido 2')).toBeDefined();
    expect(fixture.nativeElement.textContent).not.toContain('Todos los pedidos');
  });

  it('elegir "Pedido 2" enfoca esa orden', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    findButton('Pedido 2')!.click();
    fixture.detectChanges();

    expect(store.selectedOrderId()).toBe('o2');
  });

  it('con un único pedido activo no aparece ningún selector de pestañas', () => {
    store.orders.set([ordenSimple('o1', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Todos los pedidos');
    expect(fixture.nativeElement.textContent).not.toContain('Pedido 1');
  });

  it('spec 049, FR-001: no existe ningún control "+ Nuevo pedido" con varios pedidos activos', () => {
    store.orders.set([ordenSimple('o1', 'listo'), ordenSimple('o2', 'pendiente')]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(findButton('+ Nuevo pedido')).toBeUndefined();
    expect(fixture.nativeElement.textContent).not.toContain('Nuevo pedido');
  });
});

function standaloneOrder(orderType: 'TAKEAWAY' | 'DELIVERY', extra: Partial<DiningOrder> = {}): DiningOrder {
  return {
    id: 'o1',
    channel: 'POS',
    order_type: orderType,
    status: 'abierta',
    version: 1,
    dining_table_id: null,
    customer_name: 'María G.',
    created_at: '2026-08-21T10:00:00',
    paid: false,
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'pendiente' }],
    ...extra,
  } as DiningOrder;
}

/** Spec 059, Historia 3 (FR-010/FR-012): un pedido de Domicilio/Para llevar
 *  seleccionado sin mesa muestra su detalle, no el placeholder — mismo
 *  panel que ya usa una mesa con pedido. */
describe('PosOrderPanelComponent — pedido sin mesa (spec 059, Historia 3)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('muestra el detalle del pedido (no el placeholder) para un pedido "Para llevar" sin mesa', () => {
    store.orders.set([standaloneOrder('TAKEAWAY')]);
    store.selectedTableId.set(null);
    store.selectedOrderId.set('o1');
    // `customerName` lo llena `selectStandaloneOrder()` en el flujo real —
    // se fija a mano aquí porque este test manipula la selección
    // directamente, sin pasar por ese método (mismo patrón ya usado por el
    // resto de este archivo para `selectedTableId`/`selectedOrderId`).
    store.customerName.set('María G.');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Selecciona una mesa');
    expect(text).toContain('Para llevar');
    expect(text).toContain('María G.');
  });

  it('con order_type DELIVERY, el título es "Domicilio" y se ven dirección/teléfono/valor del domicilio', () => {
    store.orders.set([
      standaloneOrder('DELIVERY', {
        delivery_address: 'Cra 45 # 10-20',
        delivery_phone: '3001234567',
        delivery_fee: 5000,
      }),
    ]);
    store.selectedTableId.set(null);
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Domicilio');
    expect(text).toContain('Cra 45 # 10-20');
    expect(text).toContain('3001234567');
  });

  it('sin teléfono (opcional), no muestra la línea de teléfono', () => {
    store.orders.set([
      standaloneOrder('DELIVERY', {
        delivery_address: 'Cra 45 # 10-20',
        delivery_phone: null,
        delivery_fee: 5000,
      }),
    ]);
    store.selectedTableId.set(null);
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect((fixture.nativeElement.textContent as string)).not.toContain('📞');
  });

  // ── spec 078 (US5): fila compacta del domicilio junto al estado ──────────

  const deliveryRow = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="delivery-info-row"]');

  function seleccionarDomicilio(extra: Partial<DiningOrder> = {}): void {
    store.orders.set([
      standaloneOrder('DELIVERY', {
        delivery_address: 'Carrera 45 # 10-20 apto 302, barrio Los Almendros, cerca al parque principal',
        delivery_phone: '3001234567',
        delivery_fee: 6000,
        ...extra,
      }),
    ]);
    store.selectedTableId.set(null);
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  }

  it('dirección + teléfono + valor van en UNA fila compacta flex flex-wrap, no un bloque vertical con space-y (FR-026)', () => {
    seleccionarDomicilio();
    const row = deliveryRow();
    expect(row).toBeTruthy();
    expect(row.className).toContain('flex');
    expect(row.className).toContain('flex-wrap');
    expect(row.className).not.toMatch(/\bspace-y-/);
    // Un contenedor, no tres <p> apilados.
    expect(row.querySelectorAll('p')).toHaveLength(0);
    expect(row.querySelectorAll('span').length).toBeGreaterThanOrEqual(3);
  });

  it('la dirección va en un <span> con break-words y sin truncate ni line-clamp (FR-028)', () => {
    seleccionarDomicilio();
    const addr = Array.from(deliveryRow().querySelectorAll('span')).find((s) =>
      s.textContent?.includes('Carrera 45'),
    ) as HTMLElement;
    expect(addr.className).toContain('break-words');
    expect(addr.className).not.toContain('truncate');
    expect(addr.className).not.toMatch(/line-clamp/);
  });

  it('el valor del ícono de domicilio es store.fmt(selectedOrder().delivery_fee) — el mismo número del total de la tarjeta (FR-029)', () => {
    seleccionarDomicilio({ delivery_fee: 6000 });
    const value = Array.from(deliveryRow().querySelectorAll('span')).find((s) =>
      s.textContent?.includes('Domicilio:'),
    ) as HTMLElement;
    expect(value.textContent).toContain(store.fmt(6000));
  });

  it('los tres datos siguen presentes y legibles (FR-027)', () => {
    seleccionarDomicilio();
    const text = deliveryRow().textContent as string;
    expect(text).toContain('Carrera 45 # 10-20');
    expect(text).toContain('3001234567');
    expect(text).toContain(store.fmt(6000));
  });

  it('con order_type distinto de DELIVERY la fila no se renderiza (FR-030)', () => {
    store.orders.set([standaloneOrder('TAKEAWAY')]);
    store.selectedTableId.set(null);
    store.selectedOrderId.set('o1');
    store.customerName.set('María G.');
    fixture.detectChanges();

    expect(deliveryRow()).toBeNull();
  });

  it('los íconos de dirección/teléfono/domicilio ya no son emoji (spec 082)', () => {
    seleccionarDomicilio();
    const el = deliveryRow();
    expect(el.textContent).not.toContain('📍');
    expect(el.textContent).not.toContain('📞');
    expect(el.textContent).not.toContain('🛵');
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(
      expect.arrayContaining(['location_on', 'call', 'delivery_dining']),
    );
  });
});

/**
 * spec 118 (FR-005/FR-007, contracts/detail-panel-line-grouping.md): dos
 * adiciones sucesivas de la misma presentación que alcanzan el umbral de
 * una promoción por volumen se renderizan como una sola card del detalle,
 * con el mismo formato de insignia/tachado/monto ajustado que ya usa una
 * card de una sola adición -- no dos cards separadas.
 */
describe('PosOrderPanelComponent — una sola card para adiciones sucesivas con promoción (spec 118, Historia 2)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** "Fresa boom" a $7.000, promoción `2 x $12.000` ya persistida por el
   *  backend en ambas filas (`refresh_order_item_discounts`) -- agregadas
   *  en dos `add_item_to_order` sucesivos, no en una sola llamada. */
  function pedidoConDosAdicionesSucesivas(): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      status: 'abierta',
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-21T10:00:00',
      paid: false,
      items: [
        {
          id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '7000',
          estado_cocina: 'listo', discounted_unit_price: '6000', discounted_line_total: '6000',
        },
        {
          id: 'i2', product_variant_id: 'v1', quantity: 1, unit_price: '7000',
          estado_cocina: 'listo', discounted_unit_price: '6000', discounted_line_total: '6000',
        },
      ] as DiningOrderItem[],
    } as DiningOrder;
  }

  const cardRows = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.py-3.flex.items-start.gap-3')) as HTMLElement[];

  it('renderiza una sola card (no dos) para las dos filas agrupadas', () => {
    store.orders.set([pedidoConDosAdicionesSucesivas()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(cardRows().length).toBe(1);
  });

  it('la card agrupada muestra insignia, precio tachado y monto ajustado -- el mismo formato que una card de una sola adición', () => {
    store.orders.set([pedidoConDosAdicionesSucesivas()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    const [row] = cardRows();
    expect(row.textContent).toContain('2x');
    expect(row.textContent).toContain('-14%');
    const strike = row.querySelector('.line-through') as HTMLElement;
    expect(strike).toBeTruthy();
    expect(strike.textContent?.trim()).toBe(store.fmt(14000));
    expect(row.textContent).toContain(store.fmt(12000));
  });
});

/**
 * El selector "Agregar adición" rechazaba con 422 ("Esa opción ya está en la
 * línea") al elegir un topping que la línea ya tenía -- único camino era
 * anular la línea entera. Ahora, si la opción ya está en la línea, el mismo
 * botón sube su cantidad (PATCH) en vez de intentar agregarla de nuevo (POST).
 */
describe('PosOrderPanelComponent — reutilizar "Agregar adición" para subir cantidad', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;
  let menuService: MenuService;

  function pedidoConAdicion(): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      status: 'abierta',
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-21T10:00:00',
      paid: false,
      items: [{
        id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '8000',
        estado_cocina: 'pendiente',
        options: [{ id: 'oio1', option_id: 'opt1', quantity: 3, name: 'Gomita' }],
      }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    menuService = TestBed.inject(MenuService);
    menuService.categories.set([{
      id: 'c1', name: 'Helados', products: [{
        id: 'p1', name: 'Ojo de Diablo', description: null, image_url: null, available: true,
        option_groups: [],
        variants: [{
          id: 'v1', name: '8 onz', price: 8000, available: true,
          option_groups: [{
            id: 'g1', name: 'Toppings', min_select: 0, max_select: 99, consume: false,
            selection_mode: 'cantidad', max_quantity_per_option: null, max_total_quantity: null,
            options: [
              { id: 'opt1', name: 'Gomita', extra_price: 1000, available: true },
              { id: 'opt2', name: 'Cinta acida', extra_price: 1000, available: true },
            ],
          }],
        }],
      }],
    }]);
    store.catalogCategoryId.set('c1');
    store.orders.set([pedidoConAdicion()]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    store.openAdditionPicker('i1', 'v1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const filaDe = (nombre: string): HTMLElement =>
    Array.from(fixture.nativeElement.querySelectorAll('.border-b.border-gray-50')).find((row) =>
      (row as HTMLElement).textContent?.includes(nombre),
    ) as HTMLElement;

  // La fila tiene hasta cuatro botones: stepper "−", stepper "+", el de confirmar
  // (Agregar/Actualizar, único con fondo indigo) y, solo si ya está en la línea, el
  // de quitarla -- se identifica por clase, no por posición, porque ese último varía.
  const confirmarBotonDe = (fila: HTMLElement): HTMLButtonElement =>
    fila.querySelector('button.bg-indigo-600') as HTMLButtonElement;
  const quitarBotonDe = (fila: HTMLElement): HTMLButtonElement | null =>
    fila.querySelector('button[title="Quitar esta adición de la línea"]');
  const stepperBotonDe = (fila: HTMLElement, simbolo: '−' | '+'): HTMLButtonElement =>
    (Array.from(fila.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.trim() === simbolo,
    )!;

  it('la opción ya en la línea arranca en su cantidad actual (no en "actual + 1") y el botón dice "Actualizar"', () => {
    const fila = filaDe('Gomita');
    expect(fila.textContent).toContain('Ya en la línea: x3');
    expect(confirmarBotonDe(fila).textContent?.trim()).toBe('Actualizar');
    const input = fila.querySelector('input') as HTMLInputElement;
    // No asume que el cajero quiere una unidad más -- arranca en lo que ya hay.
    expect(input.value).toBe('3');
    // El PATCH admite bajar la cantidad -- el `min` nunca baja de 1 (no de 0).
    expect(input.min).toBe('1');
  });

  it('una opción nueva arranca en 0 (no en 1) -- no asume que siempre se agrega al menos una unidad', () => {
    const fila = filaDe('Cinta acida');
    expect(fila.textContent).not.toContain('Ya en la línea');
    expect(confirmarBotonDe(fila).textContent?.trim()).toBe('Agregar');
    const input = fila.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('0');
    expect(input.min).toBe('0');
  });

  it('el botón de confirmar arranca deshabilitado (0 en una opción nueva, o la misma cantidad en una existente) y se habilita al mover el contador', () => {
    const nueva = filaDe('Cinta acida');
    expect(confirmarBotonDe(nueva).disabled).toBe(true);
    stepperBotonDe(nueva, '+').click();
    fixture.detectChanges();
    expect(confirmarBotonDe(nueva).disabled).toBe(false);

    const existente = filaDe('Gomita');
    expect(confirmarBotonDe(existente).disabled).toBe(true);
    stepperBotonDe(existente, '+').click();
    fixture.detectChanges();
    expect(confirmarBotonDe(existente).disabled).toBe(false);
  });

  it('el stepper +/- incrementa y decrementa el campo, sin bajar del mínimo de cada caso', () => {
    const fila = filaDe('Gomita');
    const input = fila.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('3');

    stepperBotonDe(fila, '+').click();
    fixture.detectChanges();
    expect(input.value).toBe('4');

    stepperBotonDe(fila, '−').click();
    stepperBotonDe(fila, '−').click();
    stepperBotonDe(fila, '−').click();
    stepperBotonDe(fila, '−').click();
    fixture.detectChanges();
    expect(input.value).toBe('1'); // existente: nunca baja de additionQtyMinFor (1)

    const botonMenos = stepperBotonDe(fila, '−');
    expect(botonMenos.disabled).toBe(true);
  });

  it('el stepper "−" de una opción nueva se deshabilita en 0, no en 1', () => {
    const fila = filaDe('Cinta acida');
    const input = fila.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('0');
    expect(stepperBotonDe(fila, '−').disabled).toBe(true);

    stepperBotonDe(fila, '+').click();
    fixture.detectChanges();
    expect(input.value).toBe('1');
    expect(stepperBotonDe(fila, '−').disabled).toBe(false);

    stepperBotonDe(fila, '−').click();
    fixture.detectChanges();
    expect(input.value).toBe('0');
    expect(stepperBotonDe(fila, '−').disabled).toBe(true);
  });

  it('"Actualizar" con una cantidad menor a la actual también llama a store.updateAdditionQuantity', () => {
    const update = vi.spyOn(store, 'updateAdditionQuantity').mockResolvedValue(undefined);

    const fila = filaDe('Gomita');
    const input = fila.querySelector('input') as HTMLInputElement;
    input.value = '1';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); // el botón pasa de deshabilitado (1 ≠ 3) a habilitado

    confirmarBotonDe(fila).click();

    expect(update).toHaveBeenCalledWith('opt1', 1);
  });

  it('"Actualizar" llama a store.updateAdditionQuantity (PATCH), no a confirmAddition (POST)', () => {
    // El resto del flujo HTTP de `updateAdditionQuantity`/`confirmAddition` (incluido su
    // `reload()` en cascada) ya está cubierto en `pos-terminal.store.spec.ts` -- aquí solo
    // importa a cuál de los dos métodos enruta el botón reutilizado.
    const update = vi.spyOn(store, 'updateAdditionQuantity').mockResolvedValue(undefined);
    const confirm = vi.spyOn(store, 'confirmAddition').mockResolvedValue(undefined);

    const fila = filaDe('Gomita');
    stepperBotonDe(fila, '+').click(); // 3 -> 4: sin mover el contador, el botón sigue deshabilitado
    fixture.detectChanges();
    confirmarBotonDe(fila).click();

    expect(update).toHaveBeenCalledWith('opt1', 4);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('"Agregar" sobre una opción nueva sigue llamando a store.confirmAddition (POST)', () => {
    const update = vi.spyOn(store, 'updateAdditionQuantity').mockResolvedValue(undefined);
    const confirm = vi.spyOn(store, 'confirmAddition').mockResolvedValue(undefined);

    const fila = filaDe('Cinta acida');
    stepperBotonDe(fila, '+').click(); // 0 -> 1: el cajero elige explícitamente cuántas quiere
    fixture.detectChanges();
    confirmarBotonDe(fila).click();

    expect(confirm).toHaveBeenCalledWith('opt2', 1);
    expect(update).not.toHaveBeenCalled();
  });

  it('solo la opción ya en la línea tiene botón para quitarla', () => {
    expect(quitarBotonDe(filaDe('Gomita'))).toBeTruthy();
    expect(quitarBotonDe(filaDe('Cinta acida'))).toBeNull();
  });

  it('el botón de quitar llama a store.removeAddition con el id de la opción', () => {
    const remove = vi.spyOn(store, 'removeAddition').mockResolvedValue(undefined);

    quitarBotonDe(filaDe('Gomita'))!.click();

    expect(remove).toHaveBeenCalledWith('opt1');
  });

  it('"Agregar adición" en la línea desaparece si la variante no tiene ningún grupo de opciones configurado', () => {
    menuService.categories.set([{
      id: 'c1', name: 'Helados', products: [{
        id: 'p1', name: 'Ojo de Diablo', description: null, image_url: null, available: true,
        option_groups: [],
        variants: [{ id: 'v1', name: '8 onz', price: 8000, available: true, option_groups: [] }],
      }],
    }]);
    store.closeAdditionPicker();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Agregar adición');
  });
});
