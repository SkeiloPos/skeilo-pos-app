import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CheckoutOrderSummaryComponent,
  UMBRAL_EXPANDIDO_POR_DEFECTO,
} from './checkout-order-summary.component';
import { CartLine } from '../../services/dining-cart.service';

/**
 * spec 092 — el componente compartido del resumen del pedido.
 *
 * Es el artefacto que FR-021 convierte en la única fuente del resumen para los
 * dos pasos del checkout, así que estos tests son el contrato de render de
 * `contracts/checkout-order-summary.md`: si pasan, los dos pasos no pueden
 * divergir; si alguno se relaja, sí.
 *
 * El umbral se importa (`UMBRAL_EXPANDIDO_POR_DEFECTO`) en vez de repetir el
 * literal `3` (research.md D8): el umbral es una decisión de producto con un
 * único punto de cambio, y un test que repita el número obliga a tocar dos
 * lugares cuando el producto lo ajuste.
 */
function buildLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'l1',
    productName: 'Granizado del diablo',
    variantName: 'Vaso',
    optionNames: [],
    quantity: 1,
    notes: null,
    unitPrice: 15000,
    addonsTotal: 0,
    lineTotal: 15000,
    productVariantId: 'v1',
    optionKey: '',
    optionSelections: [],
    ...overrides,
  };
}

/** `n` líneas distinguibles — para las dos fronteras del umbral (FR-008). */
function buildLines(n: number): CartLine[] {
  return Array.from({ length: n }, (_, i) =>
    buildLine({ id: `l${i + 1}`, productName: `Producto ${i + 1}`, lineTotal: 1000 * (i + 1) }),
  );
}

describe('CheckoutOrderSummaryComponent', () => {
  let fixture: ComponentFixture<CheckoutOrderSummaryComponent>;

  interface Inputs {
    lines?: CartLine[];
    total?: number;
    count?: number;
    savings?: number;
    collapsible?: boolean;
    showSavings?: boolean;
  }

  function render(inputs: Inputs = {}): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CheckoutOrderSummaryComponent] });
    fixture = TestBed.createComponent(CheckoutOrderSummaryComponent);
    const c = fixture.componentInstance;
    c.lines = inputs.lines ?? buildLines(1);
    c.total = inputs.total ?? 15000;
    c.count = inputs.count ?? 1;
    if (inputs.savings != null) c.savings = inputs.savings;
    if (inputs.collapsible != null) c.collapsible = inputs.collapsible;
    if (inputs.showSavings != null) c.showSavings = inputs.showSavings;
    fixture.detectChanges();
  }

  const text = (): string => fixture.nativeElement.textContent ?? '';
  const details = (): HTMLDetailsElement | null =>
    fixture.nativeElement.querySelector('details');
  const summary = (): HTMLElement | null => fixture.nativeElement.querySelector('summary');

  // ── FR-008: fronteras del umbral ──────────────────────────────────────────

  it(`con ${UMBRAL_EXPANDIDO_POR_DEFECTO} líneas o menos llega expandido (FR-008, frontera inferior)`, () => {
    render({ lines: buildLines(UMBRAL_EXPANDIDO_POR_DEFECTO), collapsible: true, count: 3 });

    expect(details()).toBeTruthy();
    expect(details()!.hasAttribute('open')).toBe(true);
  });

  it(`con más de ${UMBRAL_EXPANDIDO_POR_DEFECTO} líneas llega contraído (FR-008, frontera superior)`, () => {
    render({ lines: buildLines(UMBRAL_EXPANDIDO_POR_DEFECTO + 1), collapsible: true, count: 4 });

    expect(details()!.hasAttribute('open')).toBe(false);
  });

  it('el umbral se mide en líneas, no en unidades: 2 líneas con 8 unidades llega expandido', () => {
    // FR-003/FR-006 cuentan unidades y FR-008 cuenta líneas: son dos medidas
    // distintas a propósito y el componente no las mezcla.
    render({ lines: buildLines(2), collapsible: true, count: 8 });

    expect(details()!.hasAttribute('open')).toBe(true);
    expect(summary()!.textContent).toContain('8 productos');
  });

  // ── FR-022: el paso de revisión no tiene control de colapso ───────────────

  it('sin collapsible no existe ningún <details> ni <summary> en el render (FR-022)', () => {
    render({ lines: buildLines(5), count: 5 });

    expect(details()).toBeNull();
    expect(summary()).toBeNull();
  });

  it('sin collapsible tampoco pinta el chevron (FR-022)', () => {
    render({ lines: buildLines(5), count: 5 });

    expect(fixture.nativeElement.querySelector('app-icon')).toBeNull();
  });

  it('sin collapsible lista igual TODAS las líneas, planas (FR-022)', () => {
    render({ lines: buildLines(5), count: 5 });

    for (let i = 1; i <= 5; i++) expect(text()).toContain(`Producto ${i}`);
  });

  // ── FR-021: un solo markup, el mismo contenido en los dos modos ───────────

  it('el mismo pedido produce las mismas líneas y el mismo total en los dos modos (FR-021, research.md D4)', () => {
    const lines = [
      buildLine({ id: 'a', productName: 'Helado', variantName: 'Vaso', quantity: 2, optionNames: ['Tocino x2'], notes: 'sin sal', lineTotal: 33000 }),
      buildLine({ id: 'b', productName: 'Malteada', variantName: 'Grande', lineTotal: 12000 }),
    ];

    render({ lines, total: 45000, count: 3, collapsible: false });
    const plano = text().replace(/\s+/g, ' ').trim();

    render({ lines, total: 45000, count: 3, collapsible: true });
    const colapsable = text().replace(/\s+/g, ' ').trim();

    // El modo colapsable añade el título y el conteo del <summary>; todo lo
    // demás —cada línea y cada total— tiene que aparecer igual en los dos.
    for (const fragmento of ['2×', 'Helado', 'Vaso', 'Tocino x2', 'sin sal', '$ 33.000', 'Malteada', 'Grande', '$ 12.000', 'Total', '$ 45.000']) {
      expect(plano).toContain(fragmento);
      expect(colapsable).toContain(fragmento);
    }
  });

  // ── FR-007: contenido de cada línea ───────────────────────────────────────

  it('una línea con adicionales y nota muestra los seis datos (FR-007)', () => {
    render({
      lines: [
        buildLine({
          quantity: 2,
          productName: 'Granizado del diablo',
          variantName: 'Vaso',
          optionNames: ['Tocino x2', 'Queso'],
          notes: 'sin sal',
          lineTotal: 33000,
        }),
      ],
      total: 33000,
      count: 2,
    });

    expect(text()).toContain('2×');
    expect(text()).toContain('Granizado del diablo');
    expect(text()).toContain('Vaso');
    expect(text()).toContain('Tocino x2, Queso'); // unidos con ", "
    expect(text()).toContain('sin sal');
    expect(text()).toContain('$ 33.000');
  });

  it('una línea sin adicionales y sin nota no pinta esos dos renglones (FR-007)', () => {
    render({ lines: [buildLine({ optionNames: [], notes: null })] });

    // Los renglones secundarios son los `text-gray-400`; sin adicionales ni
    // nota no debe quedar ninguno dentro de la línea.
    const secundarios = fixture.nativeElement.querySelectorAll('p.text-gray-400');
    expect(secundarios.length).toBe(0);
  });

  it('una nota vacía se trata como ausente, no como una nota en blanco (FR-007)', () => {
    render({ lines: [buildLine({ notes: '' })] });

    expect(fixture.nativeElement.querySelectorAll('p.text-gray-400').length).toBe(0);
  });

  it('respeta el orden en que llegan las líneas: el componente no reordena', () => {
    render({ lines: buildLines(3), count: 3 });
    const renglones = Array.from(
      fixture.nativeElement.querySelectorAll('p.text-gray-800') as NodeListOf<HTMLElement>,
    ).map((p) => p.textContent ?? '');

    expect(renglones[0]).toContain('Producto 1');
    expect(renglones[1]).toContain('Producto 2');
    expect(renglones[2]).toContain('Producto 3');
  });

  // ── FR-012: la fila "Ahorro" ──────────────────────────────────────────────

  it('con ahorro pinta la fila "Ahorro" con el monto formateado (FR-012)', () => {
    render({ savings: 1500, total: 8500 });

    expect(text()).toContain('Ahorro');
    expect(text()).toContain('$ 1.500');
  });

  it('sin ahorro NO pinta ninguna fila "Ahorro", ni en cero ni vacía (FR-012)', () => {
    render({ savings: 0 });

    expect(text()).not.toContain('Ahorro');
  });

  it('con savings pero showSavings en false tampoco la pinta (válvula de research.md D6)', () => {
    render({ savings: 1500, showSavings: false });

    expect(text()).not.toContain('Ahorro');
  });

  it('showSavings viene en true por defecto: olvidarlo no esconde el ahorro', () => {
    // El default seguro del contrato: olvidar un input produce el
    // comportamiento correcto, no una regresión silenciosa.
    render({ savings: 1500 });

    expect(text()).toContain('Ahorro');
  });

  // ── FR-013 / SC-007: nunca impuestos ni subtotal ───────────────────────────

  it('no pinta impuestos ni subtotal con ahorro, colapsable y varias líneas (FR-013, SC-007)', () => {
    render({ lines: buildLines(5), total: 45000, count: 9, savings: 1500, collapsible: true });

    expect(text()).not.toMatch(/impuesto|iva|subtotal/i);
  });

  it('tampoco los pinta en modo plano y sin ahorro (FR-013, SC-007)', () => {
    render({ lines: buildLines(2), count: 2, savings: 0 });

    expect(text()).not.toMatch(/impuesto|iva|subtotal/i);
  });

  // ── FR-006: un solo conteo ────────────────────────────────────────────────

  it('el <summary> dice el conteo en unidades, no el número de líneas (FR-006)', () => {
    render({ lines: buildLines(2), count: 5, collapsible: true });

    expect(summary()!.textContent).toContain('Resumen del pedido');
    expect(summary()!.textContent).toContain('5 productos');
  });

  it('el <summary> usa el singular con una sola unidad (research.md D11)', () => {
    render({ lines: buildLines(1), count: 1, collapsible: true });

    expect(summary()!.textContent).toContain('1 producto');
    expect(summary()!.textContent).not.toContain('1 productos');
  });

  // ── FR-014 / RN-001: ninguna cifra se calcula aquí ────────────────────────

  it('pinta total, ahorro y totales de línea tal como llegan, sin sumar ni redondear (FR-014, RN-001)', () => {
    // El total NO es la suma de las líneas (1000 + 2000 = 3000): el componente
    // pinta el 45000 que le pasaron, porque el cálculo oficial es del backend.
    render({ lines: buildLines(2), total: 45000, count: 2, savings: 1500 });

    expect(text()).toContain('$ 45.000');
    expect(text()).toContain('$ 1.500');
    expect(text()).toContain('$ 1.000');
    expect(text()).toContain('$ 2.000');
    expect(text()).not.toContain('$ 3.000'); // no suma las líneas por su cuenta
  });

  // ── FR-010: expandir no dispara nada ──────────────────────────────────────

  it('abrir el <details> a mano solo cambia el render: el componente no tiene salidas (FR-010)', () => {
    // En jsdom se fija `open` directamente; el toggle por click del <summary>
    // no es confiable allí (research.md D1). Lo que este test fija es que el
    // componente no tenga por dónde disparar un efecto.
    render({ lines: buildLines(5), count: 5, collapsible: true });
    const antes = text();

    details()!.open = true;
    fixture.detectChanges();

    expect(text()).toBe(antes); // el contenido ya estaba en el DOM, solo se revela
    // Sin `@Output` declarado, FR-010 no se puede violar desde aquí.
    expect(Object.keys(fixture.componentInstance).filter((k) => k.endsWith('Change'))).toEqual([]);
  });

  it('el estado inicial se congela y no se reafirma al cambiar las líneas (FR-009, research.md D2)', () => {
    // El fallo que esto previene: si `[attr.open]` estuviera enlazado a una
    // expresión viva, un cambio de líneas cerraría de golpe el panel que el
    // comensal acaba de abrir.
    render({ lines: buildLines(2), count: 2, collapsible: true });
    expect(details()!.hasAttribute('open')).toBe(true);

    details()!.open = false; // el comensal lo cierra
    fixture.componentInstance.lines = buildLines(5); // y el carrito cambia
    fixture.detectChanges();

    expect(details()!.open).toBe(false); // sigue cerrado: Angular no lo reabrió
  });

  // ── FR-019 / SC-009: sin desborde horizontal ──────────────────────────────

  it('recorta nombres, adicionales y notas en vez de ensanchar la caja (FR-019, SC-009)', () => {
    render({
      lines: [
        buildLine({
          productName: 'Granizado del diablo con doble porción de arequipe y maní',
          optionNames: ['Tocino x2', 'Queso costeño', 'Arequipe extra'],
          notes: 'por favor sin sal y con mucho hielo, muchas gracias',
        }),
      ],
    });

    const recortados = fixture.nativeElement.querySelectorAll('.truncate');
    expect(recortados.length).toBe(3); // nombre + adicionales + nota
    expect(fixture.nativeElement.querySelector('.min-w-0')).toBeTruthy();
  });

  // ── Contrato de accesibilidad ─────────────────────────────────────────────

  it('oculta el marcador nativo sin quitar la semántica, y no añade aria-expanded a mano (research.md D1)', () => {
    render({ lines: buildLines(5), count: 5, collapsible: true });

    expect(summary()!.className).toContain('list-none');
    expect(summary()!.className).toContain('cursor-pointer');
    // El estado lo lleva el atributo `open` del <details>, no un ARIA duplicado
    // que podría desincronizarse del estado real del elemento.
    expect(summary()!.hasAttribute('aria-expanded')).toBe(false);
    expect(summary()!.hasAttribute('tabindex')).toBe(false);
  });

  it('el chevron rota con group-open en vez de pintarse dos veces (research.md D3)', () => {
    render({ lines: buildLines(5), count: 5, collapsible: true });

    expect(details()!.className).toContain('group');
    const icono = fixture.nativeElement.querySelector('app-icon');
    expect(icono.getAttribute('name')).toBe('chevron-down');
    expect((icono.parentElement as HTMLElement).className).toContain('group-open:rotate-180');
  });
});
