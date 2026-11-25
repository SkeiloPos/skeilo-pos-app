import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { TableSessionsComponent } from './table-sessions.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';

/** spec 077 introdujo `AuthService → PushRegistrationService → SwPush` en el
 *  árbol de inyección de esta página; los TestBeds de este archivo no proveían
 *  `SwPush` y quedaron en `NG0201`. Ningún test de aquí ejercita push — basta
 *  con que el token resuelva (spec 078, decisión de implementación: stub local). */
const swPushStub = { provide: SwPush, useValue: { isEnabled: false } };

/** Spec 029, Historia 2: el atajo F4 (descuento manual) se retiró por
 *  completo — presionarlo ya no dispara ninguna acción. No se llama
 *  `fixture.detectChanges()` a propósito: evita `ngOnInit()`/`store.init()`
 *  (que dispara varias peticiones HTTP no relacionadas con este atajo) — se
 *  ejercita `onKey()` directamente sobre la instancia del componente. */
describe('TableSessionsComponent — atajo F4 retirado (spec 029)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
  });

  it('F4 no produce ningún efecto observable', () => {
    const event = new KeyboardEvent('keydown', { key: 'F4', cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    expect(() => fixture.componentInstance.onKey(event)).not.toThrow();
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});

/**
 * Ajuste posterior a spec 036: F3 ("+ Crear Orden Manual") ya no llama a
 * `store.startManualOrder()` (que abría el catálogo embebido) — navega a la
 * vista dedicada `manual-order-page.component.ts`. No se llama
 * `fixture.detectChanges()` a propósito (mismo motivo que el bloque F4 de
 * arriba): evita `ngOnInit()`/`store.init()`.
 *
 * Bugfix posterior: sin mesa seleccionada, F3 ya no se queda sin hacer nada
 * -- navega a la ruta genérica (sin `:tableId`) para que el usuario elija la
 * mesa en el propio formulario, en vez de quedar inútil (o, en la versión
 * previa a este bugfix, auto-asignar la primera mesa libre sin que el
 * usuario la tocara).
 */
describe('TableSessionsComponent — atajo F3 navega a la vista de armado de pedido (ajuste posterior)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    router = TestBed.inject(Router);
  });

  it('con una mesa seleccionada, F3 navega a la vista dedicada', () => {
    fixture.componentInstance.store.selectedTableId.set('t1');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const event = new KeyboardEvent('keydown', { key: 'F3', cancelable: true });
    fixture.componentInstance.onKey(event);

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });

  it('sin mesa seleccionada, F3 navega a la ruta genérica (sin mesa preasignada)', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const event = new KeyboardEvent('keydown', { key: 'F3', cancelable: true });
    fixture.componentInstance.onKey(event);

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones/orden-manual']);
  });
});

// ── A pedido del usuario: sin panel vacío, CTA en la sub-barra ─────────────
describe('TableSessionsComponent — sin selección: sin panel de detalle vacío, CTA en la sub-barra', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  it('sin selección, no renderiza ningún contenido de detalle (vive en su propia ruta)', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-pos-order-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-pos-checkout-panel')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Sin selección');
    expect(fixture.nativeElement.textContent).not.toContain('Atajos de teclado');
  });

  it('"Crear pedido nuevo" aparece en la sub-barra', () => {
    fixture.detectChanges();

    const cta = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo'),
    ) as HTMLButtonElement | undefined;
    expect(cta).toBeTruthy();
  });
});

/**
 * spec 078 (US2, FR-007–FR-015): el CTA "Crear pedido nuevo" está fuera del
 * guard de pestaña — visible y habilitado en las tres pestañas y en los tres
 * anchos, con etiqueta de texto siempre. Desde "Domicilios" / "Para llevar"
 * navega a la ruta sin `:tableId` con `?tipo=`.
 */
describe('TableSessionsComponent — CTA "Crear pedido nuevo" en las 3 pestañas (spec 078, US2)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    router = TestBed.inject(Router);
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  // Spec 131 (FR-022b/A-141): acotado al contenedor de la sub-barra
  // (`data-testid="sub-bar-new-order-cta"`), no a cualquier botón con ese
  // texto en toda la pantalla — `pos-checkout-panel.component.ts` tiene su
  // propio "+ Crear pedido nuevo" para el caso "Pedido de mostrador" (sin
  // pedido seleccionado), que es un botón distinto y no el que este describe
  // ejercita. Desde que ese contenedor también lleva el botón "Filtros" de
  // móvil (otro <button>, spec 131), se busca específicamente el que
  // contiene el texto "Crear pedido nuevo" en vez del primer <button> a secas.
  const cta = (): HTMLButtonElement | undefined =>
    Array.from(
      fixture.nativeElement.querySelector('[data-testid="sub-bar-new-order-cta"]')?.querySelectorAll('button') ?? [],
    ).find((b) => (b as HTMLButtonElement).textContent?.includes('Crear pedido nuevo')) as
      | HTMLButtonElement
      | undefined;

  for (const tab of ['mesas', 'domicilios', 'para-llevar'] as const) {
    it(`el CTA se renderiza con la pestaña en '${tab}' (sin tarjeta seleccionada) (FR-007)`, () => {
      store.setOrderTypeTab(tab);
      fixture.detectChanges();

      expect(cta()).toBeTruthy();
    });
  }

  it('la etiqueta "Crear pedido nuevo" es visible en los tres anchos — el <span> ya no lleva hidden sm:inline (FR-013, FR-015)', () => {
    fixture.detectChanges();

    const label = Array.from(cta()!.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === 'Crear pedido nuevo',
    ) as HTMLSpanElement;
    expect(label).toBeTruthy();
    expect(label.className).not.toContain('hidden');
    expect(label.className).not.toContain('sm:inline');
  });

  it("pulsarlo con la pestaña en 'domicilios' navega a la ruta sin :tableId con tipo=domicilio", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();

    cta()!.click();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/dashboard/mesas-sesiones/orden-manual'],
      { queryParams: { tipo: 'domicilio' } },
    );
  });

  it("pulsarlo con la pestaña en 'para-llevar' navega con tipo=para-llevar", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();

    cta()!.click();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/dashboard/mesas-sesiones/orden-manual'],
      { queryParams: { tipo: 'para-llevar' } },
    );
  });

  it("pulsarlo con la pestaña en 'mesas' y una mesa libre seleccionada navega con :tableId, sin tipo (FR-010)", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('mesas');
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    cta()!.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });

  it("el CTA nunca se deshabilita por falta de mesa seleccionada (FR-007, FR-012; bugfix: sin mesa navega a la ruta genérica en vez de auto-asignar una)", () => {
    store.setOrderTypeTab('mesas');
    fixture.detectChanges();
    expect(cta()!.disabled).toBe(false); // sin mesa seleccionada, pero habilitado

    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();
    expect(cta()!.disabled).toBe(false); // Domicilio no exige mesa

    store.setOrderTypeTab('para-llevar');
    fixture.detectChanges();
    expect(cta()!.disabled).toBe(false);
  });

  it("pulsarlo con la pestaña en 'mesas' y SIN mesa seleccionada navega a la ruta genérica, sin preasignar mesa", () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setOrderTypeTab('mesas');
    fixture.detectChanges();

    cta()!.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones/orden-manual']);
  });

});

// spec 111 (FR-001/FR-008): al volver de "Nueva orden", esta pantalla debe activar la pestaña
// correcta -- su store no es singleton y por defecto arranca en "mesas". `mesa`/`pedido` ya NO se
// leen aquí (spec: detalle en su propia ruta) -- quien crea el pedido navega directo a
// `table-order-detail.component.ts`, no de vuelta a esta grilla con esos query params.
describe('TableSessionsComponent — restaura la pestaña tras crear un pedido (spec 111)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  function createComponent(queryParams: Record<string, string>): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  }

  it('con ?pestana=para-llevar activa esa pestaña', () => {
    createComponent({ pestana: 'para-llevar' });
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('para-llevar');
  });

  it('con ?pestana=domicilios activa esa pestaña', () => {
    createComponent({ pestana: 'domicilios' });
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('domicilios');
  });

  it('sin ningún query param, queda en "mesas" (sin regresión)', () => {
    createComponent({});
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('mesas');
  });

  it('con un `pestana` inválido, lo ignora y queda en "mesas" (defensivo)', () => {
    createComponent({ pestana: 'algo-invalido' });
    fixture.detectChanges();

    expect(store.orderTypeTab()).toBe('mesas');
  });
});

/**
 * spec 131 (FR-002/FR-003, fidelidad al mockup de referencia): el buscador y
 * el filtro de ocupación se movieron de `pos-tables-panel.component.ts` a la
 * sub-barra de esta página, en la misma franja que las pestañas de tipo de
 * orden -- el mockup (`isTerminal`) los pone todos juntos en una sola fila.
 */
describe('TableSessionsComponent — buscador y filtro de ocupación en la sub-barra (spec 131)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  it('en la pestaña "Mesas", sin selección, muestra el buscador con ícono lucide y el filtro de ocupación', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input[placeholder="Buscar mesa…"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(el.querySelector('app-lucide-icon svg')).toBeTruthy();
    const select = el.querySelector('select[aria-label="Filtrar por estado"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
  });

  it('escribir en el buscador actualiza store.search()', () => {
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input[placeholder="Buscar mesa…"]',
    ) as HTMLInputElement;
    input.value = 'Mesa 3';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(store.search()).toBe('Mesa 3');
  });

  it('F2 enfoca el buscador', () => {
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input[placeholder="Buscar mesa…"]',
    ) as HTMLInputElement;
    fixture.componentInstance.onKey({ key: 'F2', preventDefault: () => {} } as KeyboardEvent);

    expect(document.activeElement).toBe(input);
  });

  it('el filtro de ocupación muestra las 4 opciones con su conteo y elegir una actualiza store.filter()', () => {
    store.tables.set([
      { id: 't1', number: 1, name: null, qr_token: 'a', active: true, status: 'libre' },
      { id: 't2', number: 2, name: null, qr_token: 'b', active: true, status: 'ocupada' },
    ]);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      'select[aria-label="Filtrar por estado"]',
    ) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(labels).toEqual(['Todas · 2', 'Libres · 1', 'Ocupadas · 1', 'Pendientes · 0']);

    select.value = 'ocupadas';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(store.filter()).toBe('ocupadas');
  });

  // spec 131 (fidelidad responsive al mockup, tToggleFilt/tFiltOpen): en
  // móvil el filtro de ocupación empieza colapsado tras un botón "Filtros"
  // (solo ícono) junto a "Crear pedido nuevo" -- pulsarlo despliega el
  // buscador + el filtro de ocupación (cada uno a todo el ancho) debajo de
  // la sub-barra, con los mismos controles reales que la versión de
  // escritorio (oculta en este ancho).
  const filtrosToggle = (): HTMLButtonElement =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).getAttribute('aria-label') === 'Filtros',
    ) as HTMLButtonElement;

  it('el botón "Filtros" de móvil empieza colapsado (sin el panel desplegable)', () => {
    fixture.detectChanges();

    expect(filtrosToggle()).toBeTruthy();
    expect(filtrosToggle().getAttribute('aria-expanded')).toBe('false');
    // El <select> de escritorio existe (oculto por CSS en este ancho, no
    // removido del DOM) -- el panel desplegable de móvil no debe existir aún.
    expect(fixture.nativeElement.querySelectorAll('select[aria-label="Filtrar por estado"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('input[placeholder="Buscar mesa…"]')).not.toBeNull();
  });

  it('pulsar "Filtros" despliega un buscador y un filtro de ocupación adicionales, a todo el ancho', () => {
    store.tables.set([
      { id: 't1', number: 1, name: null, qr_token: 'a', active: true, status: 'libre' },
    ]);
    fixture.detectChanges();

    filtrosToggle().click();
    fixture.detectChanges();

    expect(filtrosToggle().getAttribute('aria-expanded')).toBe('true');
    // Ahora hay dos buscadores y dos selects en el DOM: el de escritorio
    // (oculto por CSS bajo "sm") y el del panel desplegable de móvil.
    const inputs = fixture.nativeElement.querySelectorAll('input[placeholder="Buscar mesa…"]');
    const selects = fixture.nativeElement.querySelectorAll('select[aria-label="Filtrar por estado"]');
    expect(inputs.length).toBe(2);
    expect(selects.length).toBe(2);

    const mobileSelect = selects[selects.length - 1] as HTMLSelectElement;
    expect(mobileSelect.className).toContain('w-full');
    mobileSelect.value = 'libres';
    mobileSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(store.filter()).toBe('libres');
  });

  it('pulsar "Filtros" de nuevo lo colapsa', () => {
    fixture.detectChanges();

    filtrosToggle().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('select[aria-label="Filtrar por estado"]').length).toBe(2);

    filtrosToggle().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('select[aria-label="Filtrar por estado"]').length).toBe(1);
  });

  it('en "Domicilios"/"Para llevar" no muestra el buscador ni el filtro de ocupación (solo aplican a mesas)', () => {
    fixture.detectChanges();
    store.setOrderTypeTab('domicilios');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[placeholder="Buscar mesa…"]')).toBeNull();
    expect(el.querySelector('select[aria-label="Filtrar por estado"]')).toBeNull();
  });

});
