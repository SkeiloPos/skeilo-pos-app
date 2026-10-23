import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { TransferDetailsStepComponent } from './transfer-details-step.component';
import { CheckoutProgressStore } from './checkout-progress.store';
import { DinerService } from '../../services/diner.service';
import { DinerTokenStore } from '../../services/diner-token.store';
import { CartLine, DiningCartService } from '../../services/dining-cart.service';
import { ToastService } from '../../../../shared/feedback/toast.service';
import { DinerPaymentMethod, PaymentMethodField } from '../../interfaces/diner.interface';
import { UMBRAL_EXPANDIDO_POR_DEFECTO } from './checkout-order-summary.component';

/**
 * Primer archivo de test de este componente (spec 060, research.md D5) — el
 * harness base (mocks de routing/servicios + `buildMethod`) es compartido por
 * las historias 1 (copiar) y 2 (descargar).
 */
function buildMethod(fields: PaymentMethodField[], paymentInfo: Record<string, string>): DinerPaymentMethod {
  return {
    id: 'm1',
    name: 'Nequi',
    type: 'transfer',
    is_cash: false,
    payment_info: paymentInfo,
    fields,
  };
}

/**
 * spec 092 (research.md D10) — estado del carrito que esta pantalla ahora lee.
 *
 * Hasta la spec 092 el doble era `{ clear, clearDiner }`: alcanzaba porque la
 * plantilla no tocaba el carrito. En cuanto lee `cart.total()`, `cart.count()`,
 * `cart.lines()` y `cart.savings()`, un doble incompleto tumba **todo** el
 * archivo por métodos inexistentes, no solo los tests nuevos.
 *
 * `count` es una señal escribible a propósito, aunque en el servicio real sea
 * un `computed` sobre las líneas: FR-003 cuenta **unidades** y FR-008 mide el
 * umbral en **líneas**, así que los tests necesitan moverlas por separado.
 */
function buildCartStub() {
  const lines = signal<CartLine[]>([]);
  return {
    lines,
    total: signal(0),
    count: signal(0),
    grossTotal: signal(0),
    savings: signal(0),
    isEmpty: computed(() => lines().length === 0),
    clear: vi.fn(),
    clearDiner: vi.fn(),
  };
}

/** Línea de carrito completa; `overrides` solo para lo que el caso necesite. */
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

/** `n` líneas distinguibles entre sí — para las fronteras del umbral (FR-008). */
function buildLines(n: number): CartLine[] {
  return Array.from({ length: n }, (_, i) =>
    buildLine({ id: `l${i + 1}`, productName: `Producto ${i + 1}` }),
  );
}

/** Igual que `table-qr.component.spec.ts`: sondea la condición en vez de un
 *  número fijo de `await Promise.resolve()`, porque `ngOnInit` es async. */
async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: tiempo de espera agotado');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('TransferDetailsStepComponent', () => {
  let fixture: ComponentFixture<TransferDetailsStepComponent>;
  let component: TransferDetailsStepComponent;
  let toast: ToastService;
  let cart: ReturnType<typeof buildCartStub>;

  /** Estado del carrito del caso; lo que no se pase queda en su valor vacío. */
  interface CartState {
    lines?: CartLine[];
    total?: number;
    count?: number;
    grossTotal?: number;
    savings?: number;
  }

  async function createComponent(method: DinerPaymentMethod, state: CartState = {}): Promise<void> {
    TestBed.resetTestingModule();
    cart = buildCartStub();
    if (state.lines) cart.lines.set(state.lines);
    if (state.total != null) cart.total.set(state.total);
    if (state.count != null) cart.count.set(state.count);
    if (state.grossTotal != null) cart.grossTotal.set(state.grossTotal);
    if (state.savings != null) cart.savings.set(state.savings);
    TestBed.configureTestingModule({
      imports: [TransferDetailsStepComponent],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'test-token' } } } },
        {
          provide: DinerService,
          useValue: {
            getPaymentMethods: vi.fn().mockResolvedValue([method]),
            extractError: vi.fn((_err: unknown, fallback: string) => fallback),
          },
        },
        { provide: DinerTokenStore, useValue: { clear: vi.fn() } },
        { provide: DiningCartService, useValue: cart },
        {
          provide: CheckoutProgressStore,
          useValue: {
            read: vi.fn().mockReturnValue({
              step: 'transfer',
              payment_method_id: method.id,
              receipt_file_url: null,
              saved_at: new Date().toISOString(),
            }),
            paymentMethods: signal<DinerPaymentMethod[]>([method]),
            activeOrder: signal(null),
            write: vi.fn(),
            clearMethod: vi.fn(),
            clear: vi.fn(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TransferDetailsStepComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    await waitUntil(() => component.method() !== null);
    fixture.detectChanges();
  }

  /**
   * spec 092 (FR-002) — monta la pantalla con `method()` todavía en `null`.
   *
   * Es el único camino en que el componente se queda sin método sin navegar
   * fuera: `getPaymentMethods` falla y `ngOnInit` sale por el `catch` dejando
   * `error()` puesto. Sirve para probar que el bloque de total no depende de
   * que el método haya cargado.
   */
  async function createComponentWithoutMethod(state: CartState = {}): Promise<void> {
    TestBed.resetTestingModule();
    cart = buildCartStub();
    if (state.lines) cart.lines.set(state.lines);
    if (state.total != null) cart.total.set(state.total);
    if (state.count != null) cart.count.set(state.count);
    if (state.savings != null) cart.savings.set(state.savings);
    TestBed.configureTestingModule({
      imports: [TransferDetailsStepComponent],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'test-token' } } } },
        {
          provide: DinerService,
          useValue: {
            getPaymentMethods: vi.fn().mockRejectedValue(new Error('red caída')),
            extractError: vi.fn((_err: unknown, fallback: string) => fallback),
          },
        },
        { provide: DinerTokenStore, useValue: { clear: vi.fn() } },
        { provide: DiningCartService, useValue: cart },
        {
          provide: CheckoutProgressStore,
          useValue: {
            read: vi.fn().mockReturnValue({
              step: 'transfer',
              payment_method_id: 'm1',
              receipt_file_url: null,
              saved_at: new Date().toISOString(),
            }),
            paymentMethods: signal<DinerPaymentMethod[]>([]),
            activeOrder: signal(null),
            write: vi.fn(),
            clearMethod: vi.fn(),
            clear: vi.fn(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(TransferDetailsStepComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    await waitUntil(() => component.error() !== null);
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));
  const copyButtons = (): HTMLButtonElement[] =>
    buttons().filter((b) => (b.title || b.getAttribute('aria-label')) === 'Copiar');
  /** Lee el toast realmente pintado en pantalla (`role="status"`), no solo si
   *  se llamó al servicio — el propio `<app-toast-container>` debe estar
   *  montado dentro de este componente para que algo aparezca aquí (bug real
   *  encontrado en producción: el servicio se llamaba, pero nada se veía). */
  const visibleToastTexts = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="status"]')).map(
      (el) => (el as HTMLElement).textContent?.trim() ?? '',
    );

  // ── Historia 1 — copiar el número de cuenta/celular ─────────────────────

  it('muestra un botón de copiar junto a cada campo de texto con valor (FR-002, FR-010)', async () => {
    await createComponent(
      buildMethod(
        [
          { key: 'numero_celular', label: 'Número de celular', format: 'text' },
          { key: 'titular', label: 'Titular', format: 'text' },
        ],
        { numero_celular: '3106448749', titular: 'Deimer Hernandez' },
      ),
    );

    expect(copyButtons().length).toBe(2);
  });

  it('copia el valor exacto del campo al portapapeles y notifica éxito por 5000 ms (FR-001, FR-003, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
        numero_celular: '3106448749',
      }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const successSpy = vi.spyOn(toast, 'success');

    copyButtons()[0].click();
    await waitUntil(() => writeText.mock.calls.length > 0);
    await waitUntil(() => successSpy.mock.calls.length > 0);
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('3106448749');
    expect(successSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(visibleToastTexts().some((t) => t.includes('Copiado'))).toBe(true);
  });

  it('si el portapapeles falla, notifica error por 5000 ms y no notifica éxito (FR-008, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
        numero_celular: '3106448749',
      }),
    );
    const writeText = vi.fn().mockRejectedValue(new Error('denegado'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const successSpy = vi.spyOn(toast, 'success');
    const errorSpy = vi.spyOn(toast, 'error');

    copyButtons()[0].click();
    await waitUntil(() => errorSpy.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(successSpy).not.toHaveBeenCalled();
  });

  it('sin ningún campo de texto con valor, no muestra ningún botón de copiar (FR-011)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );

    expect(copyButtons().length).toBe(0);
  });

  // ── Historia 2 — descargar la imagen del QR ──────────────────────────────

  const downloadButtons = (): HTMLButtonElement[] =>
    buttons().filter((b) => (b.title || b.getAttribute('aria-label')) === 'Descargar');

  /** Mismo patrón que `table-qr.component.spec.ts`: intercepta `document.createElement('a')`
   *  para espiar el `click()` de la ancla temporal de descarga, sin tocar el resto del DOM. */
  function installAnchorSpy(): { clicks: () => { download: string }[] } {
    const clicks: { download: string }[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          clicks.push({ download: (el as HTMLAnchorElement).download });
        });
      }
      return el;
    });
    return { clicks: () => clicks };
  }

  it('muestra un botón de descargar junto al campo de imagen con valor (FR-004, FR-010)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );

    expect(downloadButtons().length).toBe(1);
  });

  it('descarga la imagen (fetch + blob) y notifica éxito por 5000 ms (FR-004, FR-006, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );
    const blob = new Blob(['fake'], { type: 'image/png' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const { clicks } = installAnchorSpy();
    const successSpy = vi.spyOn(toast, 'success');

    downloadButtons()[0].click();
    await waitUntil(() => clicks().length > 0);
    await waitUntil(() => successSpy.mock.calls.length > 0);
    fixture.detectChanges();

    // `cache: 'no-store'` es parte del contrato, no un detalle: sin él, el <img>
    // no-CORS del mismo QR envenena la caché del navegador y la revalidación del
    // `fetch` CORS devuelve un 504 de Cloudflare (ver JSDoc de downloadImage()).
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.com/qr.png',
      expect.objectContaining({ mode: 'cors', cache: 'no-store' }),
    );
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicks()[0].download).toContain('qr-nequi');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(successSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(visibleToastTexts().some((t) => t.includes('descargada'))).toBe(true);
  });

  it('si la descarga falla, notifica error por 5000 ms y no crea ninguna URL de objeto (FR-009, FR-007)', async () => {
    await createComponent(
      buildMethod([{ key: 'codigo_qr', label: 'Código QR', format: 'image' }], {
        codigo_qr: 'https://cdn.example.com/qr.png',
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    const successSpy = vi.spyOn(toast, 'success');
    const errorSpy = vi.spyOn(toast, 'error');

    downloadButtons()[0].click();
    await waitUntil(() => errorSpy.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 5000);
    expect(successSpy).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('sin ningún campo de imagen con valor, no muestra ningún botón de descargar (FR-011)', async () => {
    await createComponent(
      buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
        numero_celular: '3106448749',
      }),
    );

    expect(downloadButtons().length).toBe(0);
  });

  // ── spec 092 / Historia 1 — el total a pagar, destacado y arriba ──────────

  const nequi = () =>
    buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
      numero_celular: '3106448749',
    });
  const text = (): string => fixture.nativeElement.textContent ?? '';
  const totalBlock = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="payment-total"]');

  it('muestra el total a pagar con el formato de moneda del proyecto (FR-003, FR-004)', async () => {
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });

    expect(totalBlock()).toBeTruthy();
    expect(totalBlock().textContent).toContain('Total a pagar');
    expect(totalBlock().textContent).toContain('$ 23.500');
  });

  it('rediseño: el conteo de unidades ya no se repite en el bloque de total, solo vive en el resumen (RN-004)', async () => {
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });

    expect(totalBlock().textContent).not.toContain('productos');
    expect(
      fixture.nativeElement.querySelector('summary [data-testid="summary-count"]')!.textContent!.trim(),
    ).toBe('5 productos');
  });

  it('pinta el total ANTES del <h1> con el nombre del método en el orden del documento (FR-001)', async () => {
    // FR-001 exige que el total sea "el primer dato que se lee bajo el
    // encabezado, por delante del nombre del método de pago". Hasta esta spec
    // el <h1> era lo primero, así que esto es el cambio visible que la spec
    // autoriza explícitamente (research.md D9).
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });
    const h1 = fixture.nativeElement.querySelector('h1') as HTMLElement;

    expect(h1.textContent).toContain('Nequi');
    const posicion = totalBlock().compareDocumentPosition(h1);
    // DOCUMENT_POSITION_FOLLOWING (4): el <h1> viene DESPUÉS del bloque de total.
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la cifra del total lleva la clase de mayor tamaño de la vista, por encima del <h1> del método (FR-001)', async () => {
    // Que sea *de verdad* el texto más grande se verifica a mano (quickstart §2,
    // T014): jsdom no hace layout. Lo que este test fija es la intención, para
    // que un cambio futuro que encoja la cifra no pase inadvertido.
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });

    expect(totalBlock().querySelector('.text-3xl')).toBeTruthy();
    expect((fixture.nativeElement.querySelector('h1') as HTMLElement).className).toContain('text-lg');
  });

  it('rediseño: en un pago mixto, el bloque de total muestra solo la porción a transferir y la rotula por el método', async () => {
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });
    // Simula lo que ngOnInit ya fijó a partir del `cash_amount` del record del
    // store (CheckoutProgressStore) — se escribe directo en la señal pública
    // que la plantilla lee, sin rehacer todo el harness de creación.
    component.mixedCashAmount.set(8500);
    fixture.detectChanges();

    expect(totalBlock().textContent).toContain('Transfiere por Nequi');
    expect(totalBlock().textContent).toContain('$ 15.000');
    expect(totalBlock().textContent).toContain('Más $ 8.500 en efectivo al recibir el pedido');
  });

  it('el total NUNCA queda dentro de una zona colapsable (FR-002)', async () => {
    await createComponent(nequi(), { lines: buildLines(6), total: 23500, count: 6 });

    expect(totalBlock().closest('details')).toBeNull();
  });

  it('pinta el bloque de total aunque el método todavía no haya cargado (FR-002)', async () => {
    // El total no depende de la carga del método: va insertado antes del
    // `@if (!method())`, así que está visible sin ninguna interacción ni
    // ninguna espera de red (SC-001).
    await createComponentWithoutMethod({ lines: buildLines(2), total: 23500, count: 5 });

    expect(component.method()).toBeNull();
    expect(totalBlock()).toBeTruthy();
    expect(totalBlock().textContent).toContain('$ 23.500');
  });

  it('no introduce ninguna fila de impuestos ni de subtotal en el bloque de total (FR-013, SC-007)', async () => {
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });

    expect(text()).not.toMatch(/impuesto|iva|subtotal/i);
  });

  // ── spec 092 / Historia 2 — el resumen colapsable en esta pantalla ────────

  const summaryEl = (): HTMLElement =>
    fixture.nativeElement.querySelector('app-checkout-order-summary');
  const detailsEl = (): HTMLDetailsElement =>
    fixture.nativeElement.querySelector('details');

  it('monta el resumen compartido en modo colapsable (FR-005, FR-008)', async () => {
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });

    expect(summaryEl()).toBeTruthy();
    expect(detailsEl()).toBeTruthy(); // collapsible = true
    expect(summaryEl().textContent).toContain('Resumen del pedido');
  });

  it('ubica el resumen DESPUÉS de los datos bancarios y ANTES del aviso de comprobante (FR-016)', async () => {
    // spec 132 (A-144, FR-023): el paso de subida se retiró — el resumen
    // sigue entre los datos bancarios y el aviso de mostrar el comprobante
    // al cajero en la entrega, que ocupa su lugar en el orden del DOM.
    await createComponent(
      buildMethod([{ key: 'numero_celular', label: 'Número de celular', format: 'text' }], {
        numero_celular: '3106448749',
      }),
      { lines: buildLines(2), total: 23500, count: 5 },
    );
    const bankInfo = fixture.nativeElement.querySelector('[data-testid="bank-info"]') as HTMLElement;
    const aviso = Array.from(
      fixture.nativeElement.querySelectorAll('p') as NodeListOf<HTMLElement>,
    ).find((p) => p.textContent?.includes('muestra el comprobante desde la app de tu banco'))!;

    expect(bankInfo.compareDocumentPosition(summaryEl()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summaryEl().compareDocumentPosition(aviso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it(`con más de ${UMBRAL_EXPANDIDO_POR_DEFECTO} líneas el resumen llega contraído en esta pantalla (FR-008)`, async () => {
    await createComponent(nequi(), {
      lines: buildLines(UMBRAL_EXPANDIDO_POR_DEFECTO + 1),
      total: 23500,
      count: 4,
    });

    expect(detailsEl().hasAttribute('open')).toBe(false);
  });

  it(`con ${UMBRAL_EXPANDIDO_POR_DEFECTO} líneas llega expandido en esta pantalla (FR-008)`, async () => {
    await createComponent(nequi(), {
      lines: buildLines(UMBRAL_EXPANDIDO_POR_DEFECTO),
      total: 23500,
      count: 3,
    });

    expect(detailsEl().hasAttribute('open')).toBe(true);
  });

  it('el bloque de total sigue FUERA del <details> del resumen (FR-002)', async () => {
    await createComponent(nequi(), { lines: buildLines(6), total: 23500, count: 6 });

    expect(detailsEl()).toBeTruthy();
    expect(totalBlock().closest('details')).toBeNull();
  });

  it('pasa el ahorro al resumen, que lo pinta cuando hay promoción vigente (FR-012)', async () => {
    await createComponent(nequi(), {
      lines: buildLines(2),
      total: 23500,
      grossTotal: 25000,
      count: 5,
      savings: 1500,
    });

    expect(summaryEl().textContent).toContain('Ahorro');
    expect(summaryEl().textContent).toContain('$ 1.500');
  });

  it('sin promoción el resumen no pinta ninguna fila "Ahorro" (FR-012)', async () => {
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5, savings: 0 });

    expect(summaryEl().textContent).not.toContain('Ahorro');
  });

  it('rediseño: el único conteo de la pantalla vive en el <summary>, en plural (RN-004)', async () => {
    // Desde el rediseño, el bloque de total ya no repite el conteo (ver test
    // más arriba): el único lugar que lo muestra es el <summary>, así que no
    // hay nada más con lo que pueda divergir.
    await createComponent(nequi(), { lines: buildLines(2), total: 23500, count: 5 });
    const enSummary = fixture.nativeElement
      .querySelector('summary [data-testid="summary-count"]')!
      .textContent!.trim();

    expect(enSummary).toBe('5 productos');
  });

  it('rediseño: el conteo del <summary> usa el singular con una sola unidad (RN-004)', async () => {
    await createComponent(nequi(), { lines: buildLines(1), total: 15000, count: 1 });
    const enSummary = fixture.nativeElement
      .querySelector('summary [data-testid="summary-count"]')!
      .textContent!.trim();

    expect(enSummary).toBe('1 producto');
  });

  it('el resumen no introduce impuestos ni subtotal en esta pantalla (FR-013, SC-007)', async () => {
    await createComponent(nequi(), {
      lines: buildLines(6),
      total: 23500,
      count: 9,
      savings: 1500,
    });

    expect(text()).not.toMatch(/impuesto|iva|subtotal/i);
  });

  it('no altera el botón de enviar, habilitado sin comprobante (FR-018, spec 132 A-144)', async () => {
    await createComponent(nequi(), { lines: buildLines(6), total: 23500, count: 6 });
    const enviar = buttons().find((b) => b.textContent?.includes('Enviar pedido'))!;

    expect(enviar).toBeTruthy();
    expect(enviar.disabled).toBe(false); // spec 132: nunca exige comprobante
    expect(text()).toContain('muestra el comprobante desde la app de tu banco');
  });
});
