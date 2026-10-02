import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { DinerService } from './diner.service';
import { DinerTokenStore } from './diner-token.store';
import { DiningCartService } from './dining-cart.service';

const API = environment.apiBaseUrl;

/** Respuesta mínima de `GET /cart`: sin líneas, con el nombre del comensal. */
const emptyCart = (displayLabel: string | null) => ({
  id: 'c1',
  participant_id: 'p1',
  display_name: 'Ana',
  display_label: displayLabel,
  status: 'abierto',
  total: '0',
  items: [],
});

describe('DiningCartService', () => {
  let cart: DiningCartService;
  let http: HttpTestingController;

  beforeEach(() => {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        DiningCartService,
        DinerService,
        DinerTokenStore,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    cart = TestBed.inject(DiningCartService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  /** Carga el carrito y responde con `body`. */
  const load = async (body: object): Promise<void> => {
    const promise = cart.load();
    http.expectOne(`${API}/cart`).flush(body);
    await promise;
  };

  it('restaura el nombre del comensal desde GET /cart', async () => {
    await load(emptyCart('Ana (2)'));

    // Es lo que hace que el saludo sobreviva a una recarga de la página: el
    // nombre no se guarda en el navegador, viene con el carrito.
    expect(cart.dinerName()).toBe('Ana (2)');
  });

  it('usa display_name cuando no hay label desambiguado', async () => {
    await load(emptyCart(null));

    expect(cart.dinerName()).toBe('Ana');
  });

  it('conserva el nombre al limpiar las líneas tras enviar el pedido', async () => {
    await load(emptyCart('Ana (2)'));

    cart.clear();

    // El comensal sigue en la mesa: solo se vacía el carrito.
    expect(cart.isEmpty()).toBe(true);
    expect(cart.dinerName()).toBe('Ana (2)');
  });

  it('olvida el nombre al salir de la mesa', async () => {
    await load(emptyCart('Ana (2)'));

    cart.clearDiner();

    expect(cart.dinerName()).toBe('');
  });

  // ── spec 081 (US2) — paso de cantidad por variante+opciones ───────────────

  it('CartLine expone productVariantId y optionKey, derivados de CartResponse.items[] (data-model.md)', async () => {
    await load({
      ...emptyCart('Ana'),
      items: [
        {
          id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '5000', line_total: '10000',
          notes: null,
          options: [
            { id: 'o1', option_id: 'opt-b', quantity: 1 },
            { id: 'o2', option_id: 'opt-a', quantity: 1 },
          ],
        },
      ],
    });

    const [line] = cart.lines();
    expect(line.productVariantId).toBe('v1');
    expect(line.optionKey).toBe('opt-a,opt-b'); // ordenado, no en el orden de llegada
  });

  it('stepFor(line) devuelve 1 para cualquier línea sin stepQuantity registrado (flujo de categoría normal, FR-010)', async () => {
    await load({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '5000', line_total: '5000', notes: null, options: [] },
      ],
    });

    expect(cart.stepFor(cart.lines()[0])).toBe(1);
  });

  it('add() con stepQuantity registra el paso, tras una respuesta exitosa, para la línea resultante (research.md D3)', async () => {
    const product = {
      id: 'p1', name: 'Producto', description: null, image_url: null,
      variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true }],
      option_groups: [], available: true,
    };
    const variant = product.variants[0];

    const promise = cart.add(product, variant, [], 2, null, 2);
    http.expectOne(`${API}/cart/items`).flush({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '8000', line_total: '16000', notes: null, options: [] },
      ],
    });
    await promise;

    expect(cart.stepFor(cart.lines()[0])).toBe(2);
  });

  it('add() sin stepQuantity (agregado desde una categoría normal) deja la línea en paso libre (FR-010)', async () => {
    const product = {
      id: 'p1', name: 'Producto', description: null, image_url: null,
      variants: [{ id: 'v1', name: 'Único', price: 8000, option_groups: [], available: true }],
      option_groups: [], available: true,
    };
    const variant = product.variants[0];

    const promise = cart.add(product, variant, [], 1, null);
    http.expectOne(`${API}/cart/items`).flush({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '8000', line_total: '8000', notes: null, options: [] },
      ],
    });
    await promise;

    expect(cart.stepFor(cart.lines()[0])).toBe(1);
  });

  // ── spec 089 (A-94): adicionales cobrados una vez por línea ────────────────

  it('CartLine expone addonsTotal y el total de línea incluye los adicionales una sola vez', async () => {
    await load({
      ...emptyCart('Ana'),
      total: '33000',
      items: [
        {
          id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '3000',
          line_total: '33000', notes: null, options: [{ id: 'o1', option_id: 'toc', quantity: 1, per_line: true }],
        },
      ],
    });

    const [line] = cart.lines();
    expect(line.unitPrice).toBe(15000); // solo la presentación
    expect(line.addonsTotal).toBe(3000);
    expect(line.lineTotal).toBe(33000);
    expect(cart.total()).toBe(33000);
  });

  it('cambiar la cantidad del producto no toca addonsTotal', async () => {
    await load({
      ...emptyCart('Ana'),
      total: '33000',
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '3000', line_total: '33000', notes: null, options: [] },
      ],
    });

    const promise = cart.setQuantity('i1', 3);
    http.expectOne(`${API}/cart/items/i1`).flush({
      ...emptyCart('Ana'),
      total: '48000',
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 3, unit_price: '15000', addons_total: '3000', line_total: '48000', notes: null, options: [] },
      ],
    });
    await promise;

    expect(cart.lines()[0].addonsTotal).toBe(3000);
    expect(cart.lines()[0].lineTotal).toBe(48000);
  });

  it('una línea histórica (sin addons_total) sigue valiendo unit_price × quantity', async () => {
    await load({
      ...emptyCart('Ana'),
      total: '36000',
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '18000', line_total: '36000', notes: null, options: [] },
      ],
    });

    expect(cart.lines()[0].addonsTotal).toBe(0);
    expect(cart.lines()[0].lineTotal).toBe(36000);
  });

  it('con un backend sin line_total reconstruye unit_price × quantity + addons_total, nunca sin los adicionales', async () => {
    await load({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '3000', notes: null, options: [] },
      ],
    });

    expect(cart.lines()[0].lineTotal).toBe(33000);
  });

  it('con promoción usa discounted_line_total (que ya incluye los adicionales)', async () => {
    await load({
      ...emptyCart('Ana'),
      total: '33000',
      discounted_total: '27000.00',
      items: [
        {
          id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '3000',
          line_total: '33000', discounted_unit_price: '12000.00', discounted_line_total: '27000.00',
          notes: null, options: [],
        },
      ],
    });

    expect(cart.lines()[0].lineTotal).toBe(27000);
    expect(cart.lines()[0].unitPrice).toBe(12000);
    expect(cart.total()).toBe(27000);
  });

  // ── spec 089 (Historia 3): editar adicionales sin eliminar la línea ────────

  it('updateItem hace PATCH /cart/items/{id} con {options, notes} —sin cantidad— y actualiza la línea en su lugar', async () => {
    await load({
      ...emptyCart('Ana'),
      total: '33000',
      items: [
        {
          id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '3000',
          line_total: '33000', notes: null, options: [{ id: 'o1', option_id: 'toc', quantity: 1, per_line: true }],
        },
      ],
    });
    const tocino = { id: 'toc', name: 'Tocino', extra_price: 3000, available: true };

    const promise = cart.updateItem('i1', [{ option: tocino, quantity: 2, groupName: 'Adicionales' }], 'sin sal');
    const req = http.expectOne(`${API}/cart/items/i1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ options: [{ option_id: 'toc', quantity: 2 }], notes: 'sin sal' });
    req.flush({
      ...emptyCart('Ana'),
      total: '36000',
      items: [
        {
          id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '6000',
          line_total: '36000', notes: 'sin sal', options: [{ id: 'o1', option_id: 'toc', quantity: 2, per_line: true }],
        },
      ],
    });
    await promise;

    expect(cart.lines().length).toBe(1);
    expect(cart.lines()[0].id).toBe('i1');
    expect(cart.lines()[0].quantity).toBe(2);
    expect(cart.lines()[0].lineTotal).toBe(36000);
    expect(cart.lines()[0].optionSelections).toEqual([{ optionId: 'toc', quantity: 2 }]);
  });

  it('updateItem con todos los adicionales quitados manda options vacías y la línea sigue en el carrito', async () => {
    await load({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '3000', line_total: '33000', notes: null, options: [{ id: 'o1', option_id: 'toc', quantity: 1 }] },
      ],
    });

    const promise = cart.updateItem('i1', [], null);
    const req = http.expectOne(`${API}/cart/items/i1`);
    expect(req.request.body).toEqual({ options: [], notes: null });
    req.flush({
      ...emptyCart('Ana'),
      total: '30000',
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '0', line_total: '30000', notes: null, options: [] },
      ],
    });
    await promise;

    expect(cart.lines()[0].lineTotal).toBe(30000);
    expect(cart.lines()[0].addonsTotal).toBe(0);
  });

  it('un 422 no toca el estado local y se propaga para mostrarlo sin cerrar el selector', async () => {
    await load({
      ...emptyCart('Ana'),
      items: [
        { id: 'i1', product_variant_id: 'v1', quantity: 2, unit_price: '15000', addons_total: '3000', line_total: '33000', notes: null, options: [] },
      ],
    });

    const promise = cart.updateItem('i1', [], null);
    http.expectOne(`${API}/cart/items/i1`).flush({ detail: 'inválido' }, { status: 422, statusText: 'Unprocessable' });

    await expect(promise).rejects.toBeTruthy();
    expect(cart.lines()[0].lineTotal).toBe(33000);
    expect(cart.busy()).toBe(false);
  });

  // ── spec 092 (research.md D5) — grossTotal y savings, aditivos ─────────────
  //
  // `total()` se queda hoy con `effectivePrice(cart.total, cart.discounted_total)`
  // y tira a la basura el total de lista. `grossTotal` lo conserva, y la
  // diferencia entre los dos ES el ahorro: el front no inventa ninguna cifra
  // (FR-014, RN-001). El contrato de arriba lo fijan los characterization tests
  // de `pos-backend` (`test_cart_service.py`): `discounted_total` es `None` sin
  // promoción —no cero— y estrictamente menor que `total` con promoción.

  it('sin discounted_total, grossTotal es el total y no hay ahorro', async () => {
    await load({ ...emptyCart('Ana'), total: '10000' });

    expect(cart.total()).toBe(10000);
    expect(cart.grossTotal()).toBe(10000);
    expect(cart.savings()).toBe(0);
  });

  it('con discounted_total en null (pedido sin promoción) tampoco hay ahorro', async () => {
    // El backend manda `null`, no cero, cuando no hay promoción: es el caso por
    // defecto y la fila "Ahorro" no debe aparecer (FR-012).
    await load({ ...emptyCart('Ana'), total: '10000', discounted_total: null });

    expect(cart.total()).toBe(10000);
    expect(cart.grossTotal()).toBe(10000);
    expect(cart.savings()).toBe(0);
  });

  it('con promoción vigente, el ahorro es la diferencia exacta entre el total de lista y el vigente', async () => {
    await load({ ...emptyCart('Ana'), total: '10000', discounted_total: '8500' });

    expect(cart.total()).toBe(8500); // el vigente, ya descontado (FR-004)
    expect(cart.grossTotal()).toBe(10000); // el de lista
    expect(cart.savings()).toBe(1500);
  });

  it('si llegara un discounted_total mayor o igual que el total, el ahorro es 0 y nunca negativo', async () => {
    // El `max(0, …)` no es desconfianza del backend: hace que la fila
    // simplemente no aparezca, en vez de pintar un "Ahorro: -$500".
    await load({ ...emptyCart('Ana'), total: '10000', discounted_total: '12000' });

    expect(cart.savings()).toBe(0);
  });

  it('clear() reinicia grossTotal junto con total, así que tampoco queda ahorro colgado', async () => {
    await load({ ...emptyCart('Ana'), total: '10000', discounted_total: '8500' });

    cart.clear();

    expect(cart.total()).toBe(0);
    expect(cart.grossTotal()).toBe(0);
    expect(cart.savings()).toBe(0);
  });
});
