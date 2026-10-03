import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { OrderDetailComponent } from './order-detail.component';
import { DiningOrder } from '../../tables/interfaces/dining.interface';
import { ToastService } from '../../../shared/feedback/toast.service';

const API = environment.apiBaseUrl;

/**
 * Spec 029, hotfix #5: mismo defecto que `orders-page.component.ts` (el
 * badge del detalle también usaba `status` crudo, sin mirar `paid`).
 */
describe('OrderDetailComponent', () => {
  let fixture: ComponentFixture<OrderDetailComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OrderDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'o1' }) } },
        },
      ],
    });
    fixture = TestBed.createComponent(OrderDetailComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne(`${API}/menu`).flush([]);
    http.expectOne(`${API}/orders/tables`).flush([]);
    http.expectOne(`${API}/orders/o1`).flush({
      id: 'o1',
      channel: 'QR_MENU',
      status: 'abierta',
      paid: true,
      created_at: '2026-08-21T18:27:00',
      dining_table_id: null,
      customer_name: null,
      items: [],
    } as DiningOrder);
  });

  afterEach(() => http.verify());

  it('un pedido abierta ya pagado (paid) se muestra con badge "Pagada"', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Pagada');
    expect((fixture.nativeElement.textContent as string)).not.toContain('Abierta');
  });

  it('el botón de volver ya no es la flecha "←" (spec 082)', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('←');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('arrow_back');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// spec 094 — desglose económico y datos de entrega
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los cuatro textos literales de la pantalla (FR-017, FR-018, FR-023, FR-024a)
 * no son parafraseables: los tests los comparan **completos**, no por
 * fragmento, justamente para que una edición descuidada de la plantilla los
 * rompa en rojo (`tasks.md` → Notes).
 */
const AVISO_AGRUPADA =
  'Este pedido se cobró junto con otros en una cuenta unificada; el total facturado está en Ventas';
const AVISO_SIN_COBRAR = 'El descuento se calcula al cobrar; este total aún puede cambiar';
const AVISO_SIN_DETALLE = 'Esta orden no tiene el detalle de precios por ítem';
const TOAST_COPIADO = 'Datos de envío copiados al portapapeles';
const TOAST_FALLO = 'No se pudieron copiar los datos';

const MESA_4 = {
  id: 't4',
  number: 4,
  name: null as string | null,
  status: 'free',
};

/** Pedido mínimo válido; cada caso sobreescribe lo que le interesa. */
function pedido(over: Partial<DiningOrder> = {}): DiningOrder {
  return {
    id: 'o1',
    channel: 'POS',
    status: 'abierta',
    created_at: '2026-08-21T18:27:00',
    dining_table_id: null,
    customer_name: null,
    items: [],
    ...over,
  } as DiningOrder;
}

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    product_variant_id: 'v1',
    quantity: 1,
    unit_price: '8000',
    estado_cocina: 'listo',
    ...over,
  };
}

async function montar(order: DiningOrder, opciones: { tables?: unknown[] } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'o1' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderDetailComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();

  http.expectOne(`${API}/menu`).flush([]);
  http.expectOne(`${API}/orders/tables`).flush(opciones.tables ?? []);
  http.expectOne(`${API}/orders/o1`).flush(order);
  // `ngOnInit` es `async`: sin ceder el turno del event loop, el
  // `await api.getOrder(...)` no ha resuelto y la pantalla sigue en su
  // esqueleto de carga (que no tiene texto, así que el fallo se lee como
  // "la pantalla está vacía").
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();

  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('OrderDetailComponent — encabezado por tipo de pedido (spec 094, US1)', () => {
  it('con mesa, el rótulo dice "Mesa" y el valor el nombre de la mesa', async () => {
    const { el } = await montar(pedido({ dining_table_id: 't4' }), { tables: [MESA_4] });

    expect(el.textContent).toContain('Mesa 4');
    expect(el.textContent).toContain('Mesa');
    expect(el.textContent).not.toContain('Mostrador');
  });

  it('con mesa con nombre, el valor incluye el nombre tras el separador', async () => {
    const { el } = await montar(pedido({ dining_table_id: 't4' }), {
      tables: [{ ...MESA_4, name: 'Terraza' }],
    });

    expect(el.textContent).toContain('Mesa 4 · Terraza');
  });

  it('sin mesa y TAKEAWAY, el rótulo dice "Tipo de pedido" y el valor "Para llevar"', async () => {
    const { el } = await montar(pedido({ dining_table_id: null, order_type: 'TAKEAWAY' }));

    expect(el.textContent).toContain('Tipo de pedido');
    expect(el.textContent).toContain('Para llevar');
    expect(el.textContent).not.toContain('Mostrador');
  });

  it('sin mesa y DELIVERY, el valor es "Domicilio"', async () => {
    const { el } = await montar(pedido({ dining_table_id: null, order_type: 'DELIVERY' }));

    expect(el.textContent).toContain('Domicilio');
    expect(el.textContent).not.toContain('Mostrador');
  });

  it('sin mesa y sin order_type (pedido histórico), el valor es "Sin especificar"', async () => {
    // Se pregunta por `dining_table_id` y no por `order_type === 'DINE_IN'`
    // porque hay pedidos históricos con mesa y tipo nulo (research.md D13).
    const { el } = await montar(pedido({ dining_table_id: null, order_type: null }));

    expect(el.textContent).toContain('Sin especificar');
    expect(el.textContent).not.toContain('Mostrador');
  });
});

describe('OrderDetailComponent — importes por línea (spec 094, US1)', () => {
  const billing = {
    state: 'sin_factura' as const,
    source: 'pedido' as const,
    subtotal: '16000',
    discount: '0',
    discount_label: null,
    delivery_fee: '0',
    total: '16000',
    promotions: [],
    sin_detalle_de_precios: false,
  };

  it('muestra el precio unitario y el importe de la línea', async () => {
    const { el } = await montar(
      pedido({
        billing,
        items: [item({ quantity: 2, unit_price: '8000', line_total: '16000' })] as never,
      }),
    );

    expect(el.textContent).toContain('$ 8.000');
    expect(el.textContent).toContain('$ 16.000');
  });

  it('con adicionales por línea, el importe es el line_total completo y el monto de adicionales queda visible', async () => {
    // FR-004: `unitario × cantidad` no debe parecer contradecir el importe.
    const { el } = await montar(
      pedido({
        billing: { ...billing, subtotal: '18000', total: '18000' },
        items: [
          item({ quantity: 2, unit_price: '8000', addons_total: '2000', line_total: '18000' }),
        ] as never,
      }),
    );

    expect(el.textContent).toContain('$ 18.000');
    expect(el.textContent).toContain('$ 2.000');
  });

  it('nunca muestra discounted_unit_price ni discounted_line_total (Q5)', async () => {
    const { el } = await montar(
      pedido({
        billing,
        items: [
          item({
            quantity: 2,
            unit_price: '8000',
            line_total: '16000',
            discounted_unit_price: '6000',
            discounted_line_total: '12000',
          }),
        ] as never,
      }),
    );

    expect(el.textContent).not.toContain('$ 6.000');
    expect(el.textContent).not.toContain('$ 12.000');
  });

  it('un ítem anulado sigue visible, con el distintivo "Anulado" y sin importe', async () => {
    // FR-019a, research.md D9: el distintivo va EN LUGAR del importe; no se
    // muestra un importe tachado, que sigue leyéndose como dinero al ojear.
    const { el } = await montar(
      pedido({
        billing: { ...billing, subtotal: '8000', total: '8000' },
        items: [
          item({ id: 'i1', quantity: 1, unit_price: '8000', line_total: '8000' }),
          item({
            id: 'i2',
            quantity: 1,
            unit_price: '5000',
            line_total: '5000',
            estado_cocina: 'anulado',
          }),
        ] as never,
      }),
    );

    expect(el.textContent).toContain('Anulado');
    // La línea anulada sigue en la lista (no se oculta, Q7)...
    expect(el.querySelectorAll('[data-testid="item-row"]').length).toBe(2);
    // ...pero su importe no se pinta.
    expect(el.textContent).not.toContain('$ 5.000');
  });
});

describe('OrderDetailComponent — bloque de resumen (spec 094, US1)', () => {
  const conPromocion = {
    state: 'factura_propia' as const,
    source: 'factura' as const,
    subtotal: '28000',
    discount: '4000',
    discount_label: '2 x $12.000',
    delivery_fee: '0',
    total: '24000',
    promotions: [],
    sin_detalle_de_precios: false,
  };

  it('pasa los cuatro importes al resumen y rotula la fila con el nombre de la promoción', async () => {
    const { el } = await montar(pedido({ billing: conPromocion }));

    const resumen = el.querySelector('app-bill-summary');
    expect(resumen).toBeTruthy();
    expect(resumen!.textContent).toContain('$ 28.000');
    expect(resumen!.textContent).toContain('2 x $12.000');
    expect(resumen!.textContent).toContain('− $ 4.000');
    expect(resumen!.textContent).toContain('$ 24.000');
  });

  it('con discount_label nulo y descuento > 0, la fila dice "Descuento" (FR-009)', async () => {
    const { el } = await montar(
      pedido({ billing: { ...conPromocion, discount_label: null } }),
    );

    const resumen = el.querySelector('app-bill-summary')!;
    expect(resumen.textContent).toContain('Descuento');
    expect(resumen.textContent).toContain('− $ 4.000');
  });

  it('con descuento en 0, no hay fila de descuento (FR-006, RN-004)', async () => {
    const { el } = await montar(
      pedido({
        billing: { ...conPromocion, discount: '0', discount_label: null, total: '28000' },
      }),
    );

    const resumen = el.querySelector('app-bill-summary')!;
    expect(resumen.textContent).not.toContain('Descuento');
    expect(resumen.textContent).not.toContain('−');
  });

  it('con envío > 0, la fila de envío aparece rotulada exactamente "Domicilio"', async () => {
    // El default de `deliveryFeeLabel`, la misma palabra de las cuatro
    // superficies de cobro: no se pasa ningún input para renombrarla
    // (FR-005, FR-007, confirmado por el negocio en T007).
    const { el } = await montar(
      pedido({
        billing: {
          ...conPromocion,
          discount: '0',
          discount_label: null,
          delivery_fee: '3000',
          total: '31000',
        },
      }),
    );

    const resumen = el.querySelector('app-bill-summary')!;
    expect(resumen.textContent).toContain('Domicilio');
    expect(resumen.textContent).toContain('$ 3.000');
  });

  it('con envío en 0, no hay fila de envío (FR-007, RN-004)', async () => {
    const { el } = await montar(pedido({ billing: conPromocion }));

    const resumen = el.querySelector('app-bill-summary')!;
    expect(resumen.textContent).not.toContain('Domicilio');
  });

  it('sin billing en la respuesta, ni el resumen ni los importes por línea se renderizan', async () => {
    // Despliegue desacoplado (research.md D15): un frontend nuevo contra un
    // backend anterior no pinta ceros ni "undefined", y el resto de la pantalla
    // sigue funcionando.
    const { el } = await montar(
      pedido({
        items: [item({ quantity: 2, unit_price: '8000', line_total: '16000' })] as never,
        customer_name: 'María Gómez',
      }),
    );

    expect(el.querySelector('app-bill-summary')).toBeNull();
    expect(el.textContent).not.toContain('$ 16.000');
    expect(el.textContent).not.toContain('$ 0');
    expect(el.textContent).not.toContain('undefined');
    // El resto de la pantalla sí funciona.
    expect(el.textContent).toContain('María Gómez');
  });
});

describe('OrderDetailComponent — los tres avisos (spec 094, US1)', () => {
  const base = {
    source: 'pedido' as const,
    subtotal: '16000',
    discount: '0',
    discount_label: null,
    delivery_fee: '0',
    total: '16000',
    promotions: [],
    sin_detalle_de_precios: false,
  };

  it('factura_agrupada muestra el aviso literal de cuenta unificada', async () => {
    const { el } = await montar(
      pedido({ billing: { ...base, state: 'factura_agrupada' }, status: 'pagada' }),
    );

    expect(el.textContent).toContain(AVISO_AGRUPADA);
    expect(el.textContent).not.toContain(AVISO_SIN_COBRAR);
  });

  it('sin_factura y pedido abierto muestra el aviso literal de pedido sin cobrar', async () => {
    const { el } = await montar(
      pedido({ billing: { ...base, state: 'sin_factura' }, status: 'abierta' }),
    );

    expect(el.textContent).toContain(AVISO_SIN_COBRAR);
    expect(el.textContent).not.toContain(AVISO_AGRUPADA);
  });

  it('sin_factura y pedido cancelado no muestra ningún aviso, y sí el desglose', async () => {
    // research.md D7, confirmado por el negocio en T007: un pedido cancelado es
    // terminal, así que prometer que "el total aún puede cambiar" sería afirmar
    // algo falso. US1 §5 pide el desglose y la etiqueta "Cancelada".
    const { el } = await montar(
      pedido({ billing: { ...base, state: 'sin_factura' }, status: 'cancelada' }),
    );

    expect(el.textContent).not.toContain(AVISO_SIN_COBRAR);
    expect(el.textContent).not.toContain(AVISO_AGRUPADA);
    expect(el.textContent).toContain('Cancelada');
    expect(el.querySelector('app-bill-summary')).toBeTruthy();
  });

  it('un cancelado de una mesa cobrada llega como sin_factura y tampoco muestra el aviso de agrupada', async () => {
    // Garantía G4b: el servidor ya lo clasificó `sin_factura` (nunca se cobró),
    // así que la pantalla no tiene que deducir nada (FR-024b).
    const { el } = await montar(
      pedido({
        billing: { ...base, state: 'sin_factura' },
        status: 'cancelada',
        table_session_id: 'ts1',
      }),
    );

    expect(el.textContent).not.toContain(AVISO_AGRUPADA);
    expect(el.textContent).not.toContain(AVISO_SIN_COBRAR);
  });

  it('factura_propia no muestra ningún aviso', async () => {
    const { el } = await montar(
      pedido({
        billing: { ...base, state: 'factura_propia', source: 'factura' },
        status: 'pagada',
      }),
    );

    expect(el.textContent).not.toContain(AVISO_AGRUPADA);
    expect(el.textContent).not.toContain(AVISO_SIN_COBRAR);
    expect(el.textContent).not.toContain(AVISO_SIN_DETALLE);
  });
});

describe('OrderDetailComponent — bloque de datos de entrega (spec 094, US2)', () => {
  const COMPLETO = {
    order_type: 'DELIVERY',
    customer_name: 'María Gómez',
    delivery_phone: '3001234567',
    delivery_address: 'Cra 12 #34-56, Apto 201',
    notes: 'Portería azul, timbre 201',
  };

  function bloque(el: HTMLElement): HTMLElement | null {
    return el.querySelector('[data-testid="datos-de-entrega"]');
  }

  function botonCopiar(el: HTMLElement): HTMLButtonElement | null {
    return el.querySelector('[data-testid="copiar-datos"]');
  }

  it('con DELIVERY y los cuatro campos, el bloque aparece con sus cuatro etiquetas y valores', async () => {
    const { el } = await montar(pedido(COMPLETO as Partial<DiningOrder>));

    const b = bloque(el)!;
    expect(b).toBeTruthy();
    expect(el.textContent).toContain('Datos de entrega');
    for (const texto of [
      'Cliente', 'María Gómez',
      'Teléfono', '3001234567',
      'Dirección', 'Cra 12 #34-56, Apto 201',
      'Notas', 'Portería azul, timbre 201',
    ]) {
      expect(b.textContent).toContain(texto);
    }
  });

  it('con TAKEAWAY el bloque no aparece (FR-015)', async () => {
    const { el } = await montar(pedido({ ...COMPLETO, order_type: 'TAKEAWAY' } as Partial<DiningOrder>));

    expect(bloque(el)).toBeNull();
    expect(el.textContent).not.toContain('Datos de entrega');
  });

  it('con DINE_IN el bloque no aparece (FR-015)', async () => {
    const { el } = await montar(pedido({ ...COMPLETO, order_type: 'DINE_IN' } as Partial<DiningOrder>));

    expect(bloque(el)).toBeNull();
  });

  it('con solo dirección y teléfono, el bloque muestra esas dos filas y ninguna etiqueta huérfana', async () => {
    // FR-015a, FR-020, RN-003: un campo omitido no deja etiqueta sola, línea en
    // blanco, guion de relleno ni la palabra "null".
    const { el } = await montar(
      pedido({
        order_type: 'DELIVERY',
        delivery_address: 'Cra 12 #34-56',
        delivery_phone: '3001234567',
        customer_name: null,
        notes: null,
      } as Partial<DiningOrder>),
    );

    const b = bloque(el)!;
    expect(b).toBeTruthy();
    expect(b.textContent).toContain('Dirección');
    expect(b.textContent).toContain('Teléfono');
    expect(b.textContent).not.toContain('Cliente');
    expect(b.textContent).not.toContain('Notas');
    expect(b.textContent).not.toContain('null');
    expect(b.textContent).not.toContain('undefined');
    expect(b.textContent).not.toContain('—');
    expect(b.textContent).not.toContain(' - ');
    expect(b.querySelectorAll('[data-testid="campo-entrega"]').length).toBe(2);
  });

  it('con los cuatro campos vacíos, el bloque aparece y el botón de copiar queda deshabilitado', async () => {
    // research.md D14: el bloque es del TIPO de pedido, no de que los campos
    // estén llenos. Esconder que el pedido es un domicilio sería peor.
    const { el } = await montar(
      pedido({
        order_type: 'DELIVERY',
        customer_name: '   ',
        delivery_phone: '',
        delivery_address: null,
        notes: null,
      } as Partial<DiningOrder>),
    );

    expect(bloque(el)).toBeTruthy();
    expect(botonCopiar(el)!.disabled).toBe(true);
  });
});

/**
 * El doble del portapapeles muta `navigator`, que es global y compartido por
 * toda la suite: se restaura el descriptor original en `afterEach` para no
 * dejar un `clipboard` falso puesto a los demás archivos (una fuente de fallos
 * intermitentes que no se reproducen al ejecutar el archivo solo).
 */
function dobleDePortapapeles(impl: () => Promise<void>) {
  const writeText = vi.fn().mockImplementation(impl);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('OrderDetailComponent — copiar datos de entrega (spec 094, US2)', () => {
  const descriptorOriginal = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  afterEach(() => {
    if (descriptorOriginal) {
      Object.defineProperty(navigator, 'clipboard', descriptorOriginal);
    } else {
      Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'clipboard');
    }
    vi.restoreAllMocks();
  });

  const COMPLETO = {
    order_type: 'DELIVERY',
    customer_name: 'María Gómez',
    delivery_phone: '3001234567',
    delivery_address: 'Cra 12 #34-56, Apto 201',
    notes: 'Portería azul, timbre 201',
  };

  function botonCopiar(el: HTMLElement): HTMLButtonElement {
    return el.querySelector('[data-testid="copiar-datos"]')!;
  }

  async function esperar(condicion: () => boolean) {
    for (let i = 0; i < 50 && !condicion(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  it('copia exactamente las cuatro líneas con sus etiquetas, en orden y sin importes', async () => {
    const { el } = await montar(pedido(COMPLETO as Partial<DiningOrder>));
    const writeText = dobleDePortapapeles(() => Promise.resolve());

    botonCopiar(el).click();
    await esperar(() => writeText.mock.calls.length > 0);

    expect(writeText).toHaveBeenCalledWith(
      'Cliente: María Gómez\n' +
        'Teléfono: 3001234567\n' +
        'Dirección: Cra 12 #34-56, Apto 201\n' +
        'Notas: Portería azul, timbre 201',
    );
    const texto = writeText.mock.calls[0][0] as string;
    expect(texto).not.toContain('$');
    expect(texto).not.toContain('o1');
  });

  it('con solo dirección y teléfono, el texto copiado tiene exactamente dos líneas', async () => {
    // US2 §4: sin líneas vacías, sin "null", sin guiones de relleno.
    const { el } = await montar(
      pedido({
        order_type: 'DELIVERY',
        delivery_address: 'Cra 12 #34-56',
        delivery_phone: '3001234567',
        customer_name: null,
        notes: null,
      } as Partial<DiningOrder>),
    );
    const writeText = dobleDePortapapeles(() => Promise.resolve());

    botonCopiar(el).click();
    await esperar(() => writeText.mock.calls.length > 0);

    const texto = writeText.mock.calls[0][0] as string;
    expect(texto.split('\n').length).toBe(2);
    expect(texto).toBe('Teléfono: 3001234567\nDirección: Cra 12 #34-56');
    expect(texto).not.toContain('null');
  });

  it('tras el éxito, el ToastService recibe el literal de FR-017', async () => {
    const { el } = await montar(pedido(COMPLETO as Partial<DiningOrder>));
    const toast = TestBed.inject(ToastService);
    const successSpy = vi.spyOn(toast, 'success');
    const writeText = dobleDePortapapeles(() => Promise.resolve());

    botonCopiar(el).click();
    await esperar(() => successSpy.mock.calls.length > 0);

    expect(successSpy).toHaveBeenCalledWith(TOAST_COPIADO);
  });

  it('si el portapapeles falla, avisa el error, no lanza y el bloque sigue con sus datos', async () => {
    // US2 §5: el portapapeles no está disponible en contextos no seguros (la app
    // abierta por http:// en LAN). Los datos siguen visibles y seleccionables.
    const { el } = await montar(pedido(COMPLETO as Partial<DiningOrder>));
    const toast = TestBed.inject(ToastService);
    const errorSpy = vi.spyOn(toast, 'error');
    const successSpy = vi.spyOn(toast, 'success');
    const writeText = dobleDePortapapeles(() =>
      Promise.reject(new Error('portapapeles no disponible')),
    );

    expect(() => botonCopiar(el).click()).not.toThrow();
    await esperar(() => errorSpy.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(TOAST_FALLO);
    expect(successSpy).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="datos-de-entrega"]')).toBeTruthy();
    expect(el.textContent).toContain('María Gómez');
  });
});

describe('OrderDetailComponent — huecos de datos (spec 094, US3)', () => {
  const base = {
    state: 'sin_factura' as const,
    source: 'pedido' as const,
    subtotal: '0',
    discount: '0',
    discount_label: null,
    delivery_fee: '0',
    total: '0',
    promotions: [],
    sin_detalle_de_precios: false,
  };

  function filas(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll('[data-testid="item-row"]'));
  }

  function textoDeLasFilas(el: HTMLElement): string {
    return filas(el).map((f) => f.textContent ?? '').join(' ');
  }

  it('con sin_detalle_de_precios, muestra el Total y el aviso, y ningún importe por línea', async () => {
    // US3 §1: los importes se OMITEN, no se pintan en "$ 0" (FR-018).
    const { el } = await montar(
      pedido({
        status: 'cancelada', // evita que se sume el aviso de pedido sin cobrar
        billing: { ...base, sin_detalle_de_precios: true },
        items: [
          item({ id: 'i1', quantity: 2, unit_price: '0', line_total: '0' }),
          item({ id: 'i2', quantity: 1, unit_price: '0', line_total: '0' }),
        ] as never,
      }),
    );

    expect(el.textContent).toContain(AVISO_SIN_DETALLE);
    // El Total sí se muestra, con su valor real.
    expect(el.querySelector('app-bill-summary')!.textContent).toContain('$ 0');
    // Las líneas siguen visibles, pero sin ningún importe.
    expect(filas(el).length).toBe(2);
    expect(textoDeLasFilas(el)).not.toContain('$');
  });

  it('en un pedido corriente el aviso no aparece y los importes por línea sí', async () => {
    const { el } = await montar(
      pedido({
        billing: { ...base, subtotal: '16000', total: '16000' },
        items: [item({ quantity: 2, unit_price: '8000', line_total: '16000' })] as never,
      }),
    );

    expect(el.textContent).not.toContain(AVISO_SIN_DETALLE);
    expect(textoDeLasFilas(el)).toContain('$ 16.000');
  });

  it('con todas las líneas anuladas, se ven marcadas, el resumen dice $ 0 y el aviso no aparece', async () => {
    // US3 §3: el "$ 0" es el valor REAL de lo cobrable, no un hueco. La lista no
    // puede quedar vacía: ocultar los ítems anulados lo prohíbe Q7.
    const { el } = await montar(
      pedido({
        status: 'cancelada',
        billing: { ...base, sin_detalle_de_precios: false },
        items: [
          item({ id: 'i1', unit_price: '8000', line_total: '8000', estado_cocina: 'anulado' }),
          item({ id: 'i2', unit_price: '5000', line_total: '5000', estado_cocina: 'anulado' }),
        ] as never,
      }),
    );

    expect(filas(el).length).toBe(2);
    expect(textoDeLasFilas(el)).toContain('Anulado');
    expect(el.textContent).not.toContain(AVISO_SIN_DETALLE);
    expect(el.querySelector('app-bill-summary')!.textContent).toContain('$ 0');
    expect(el.textContent).not.toContain('Sin ítems');
  });

  it('con todos los campos opcionales vacíos, la pantalla no muestra null, undefined ni guion de relleno', async () => {
    // US3 §4, FR-020, RN-003: lo vacío no se pinta. Ni en pantalla ni en el
    // texto copiado.
    const { el } = await montar(
      pedido({
        billing: { ...base, subtotal: '8000', total: '8000' },
        customer_name: null,
        notes: null,
        delivery_address: null,
        delivery_phone: null,
        order_type: null,
        items: [
          item({ unit_price: '8000', line_total: '8000', notes: null, options: [] }),
        ] as never,
      }),
    );

    const texto = el.textContent ?? '';
    expect(texto).not.toContain('null');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('—');
    expect(texto).not.toContain('N/A');
  });
});

describe('OrderDetailComponent — la etiqueta "Cliente" (spec 094, US4)', () => {
  const billing = {
    state: 'sin_factura' as const,
    source: 'pedido' as const,
    subtotal: '8000',
    discount: '0',
    discount_label: null,
    delivery_fee: '0',
    total: '8000',
    promotions: [],
    sin_detalle_de_precios: false,
  };

  for (const tipo of ['DINE_IN', 'TAKEAWAY', 'DELIVERY']) {
    it(`con order_type ${tipo}, la etiqueta dice "Cliente" y "Comensal" no aparece`, async () => {
      // FR-013, SC-005: la palabra "Comensal" no debe quedar en ninguna parte de
      // la pantalla, en ninguno de los tres tipos de pedido.
      const { el } = await montar(
        pedido({ order_type: tipo, customer_name: 'María Gómez', billing } as Partial<DiningOrder>),
      );

      expect(el.textContent).toContain('Cliente');
      expect(el.textContent).toContain('María Gómez');
      expect(el.textContent).not.toContain('Comensal');
    });
  }
});
