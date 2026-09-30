import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { DinerService, DinerSessionExpiredError } from './diner.service';
import { DinerTokenStore } from './diner-token.store';

const API = environment.apiBaseUrl;

describe('DinerService', () => {
  let service: DinerService;
  let http: HttpTestingController;
  let tokens: DinerTokenStore;

  beforeEach(() => {
    // Los ficheros de spec comparten entorno y corren en paralelo: si otro dejó
    // el TestBed instanciado, `configureTestingModule` lanza
    // "test module has already been instantiated". Resetear aquí hace este spec
    // independiente del orden de ejecución.
    TestBed.resetTestingModule();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        DinerService,
        DinerTokenStore,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(DinerService);
    http = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(DinerTokenStore);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('resuelve el menú por el token firmado', async () => {
    const promise = service.resolveByToken('signed.jwt');
    const req = http.expectOne(`${API}/menu/qr-token/signed.jwt`);
    expect(req.request.method).toBe('GET');

    req.flush({
      table: { id: 't1', number: 5, name: 'Terraza' },
      business: { name: 'Heladería', logo_url: null },
      menu: [{ id: 'c1', name: 'Helados', products: [] }],
    });

    const res = await promise;
    expect(res.table.number).toBe(5);
    expect(res.business?.name).toBe('Heladería');
    expect(res.categories.length).toBe(1);
  });

  it('convierte a número los campos de `promotion` que el backend serializa como string (spec 066)', async () => {
    // El backend serializa sus `Decimal` como string JSON -- `"unit_equivalent": "3500"`,
    // igual que `price`/`discounted_price` -- así que sin este `Number(...)` el `+` de
    // `lineTotal()` en `product-select.component.ts` concatena en vez de sumar
    // ("3500" + 0 -> "35000") y el total del paquete termina multiplicado por 10.
    const promise = service.resolveByToken('signed.jwt');
    const req = http.expectOne(`${API}/menu/qr-token/signed.jwt`);
    req.flush({
      table: { id: 't1', number: 5, name: 'Terraza' },
      business: { name: 'Heladería', logo_url: null },
      menu: [{
        id: 'c1', name: 'Helados',
        products: [{
          id: 'p1', name: 'Banana Split Especial', description: null, image_url: null,
          variants: [{
            id: 'v1', presentation_id: 'pr1', presentation_name: 'Pequeña', price: '15000.00',
            discounted_price: null, discount_kind: null,
            promotion: {
              condition_text: 'Llevando 2 Pequeña pagas $7.000',
              short_condition: '2 x $7.000',
              unit_equivalent: '3500',
              unit_equivalent_approx: false,
              unit_equivalent_text: '$3.500 c/u',
              display_text: '2 x $7.000 · $3.500 c/u',
              type: 'package_price',
              min_qty: 2,
              value: '7000.00',
            },
          }],
        }],
      }],
    });

    const res = await promise;
    const promo = res.categories[0].products[0].variants[0].promotion;
    expect(promo?.unit_equivalent).toBe(3500);
    expect(promo?.value).toBe(7000);
    expect(promo?.min_qty).toBe(2);
  });

  it('el nombre de la variante sale de `presentation_name` (spec 084 A-79; spec 087, FR-014) -- sin él el modal solo mostraba la promoción', async () => {
    const promise = service.resolveByToken('signed.jwt');
    const req = http.expectOne(`${API}/menu/qr-token/signed.jwt`);
    req.flush({
      table: { id: 't1', number: 5, name: 'Terraza' },
      business: { name: 'Heladería', logo_url: null },
      menu: [{
        id: 'c1', name: 'Granizados',
        products: [{
          id: 'p1', name: 'Granizado del diablo', description: null, image_url: null,
          variants: [
            { id: 'v1', presentation_id: 'pr-grande', presentation_name: 'Grande', price: '16000.00' },
            { id: 'v2', presentation_id: 'pr-mediano', presentation_name: 'Mediano', price: '11000.00' },
          ],
        }],
      }],
    });

    const variants = (await promise).categories[0].products[0].variants;
    expect(variants.map((v) => v.name)).toEqual(['Grande', 'Mediano']);
    expect(variants.map((v) => v.presentation_id)).toEqual(['pr-grande', 'pr-mediano']);
  });

  it('abre sesión y persiste el session_token', async () => {
    const promise = service.openSession('signed.jwt', 'Ana');
    const req = http.expectOne(`${API}/cart/sessions`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ qr_token: 'signed.jwt', display_name: 'Ana' });

    req.flush({
      participant_id: 'p1',
      table_session_id: 'ts1',
      display_name: 'Ana',
      display_label: 'Ana (2)',
      expires_at: null,
      table: { id: 't1', number: 5, name: null },
      cart_id: 'c1',
      session_token: 'tok-123',
    });

    const res = await promise;
    // La UI muestra el nombre desambiguado, no el que escribió el comensal.
    expect(res.display_label).toBe('Ana (2)');
    expect(tokens.token()).toBe('tok-123');
  });

  it('envía el carrito con POST /cart/submit, junto con su método de pago (spec 025)', async () => {
    const promise = service.submitCart('pm-efectivo');
    const req = http.expectOne(`${API}/cart/submit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      payment_method_id: 'pm-efectivo',
      receipt_file_url: null,
    });

    req.flush({ id: 'o1', status: 'recibida', channel: 'QR_MENU', created_at: '2026-07-28T10:00:00' });

    const order = await promise;
    // Queda pendiente de que el personal lo acepte: aún no descontó inventario.
    expect(order.status).toBe('recibida');
  });

  it('envía el receipt_file_url cuando el método no es efectivo (spec 025)', async () => {
    const promise = service.submitCart('pm-nequi', 'https://example.invalid/a.jpg');
    const req = http.expectOne(`${API}/cart/submit`);
    expect(req.request.body).toEqual({
      payment_method_id: 'pm-nequi',
      receipt_file_url: 'https://example.invalid/a.jpg',
    });

    req.flush({ id: 'o1', status: 'recibida', channel: 'QR_MENU', created_at: '2026-07-28T10:00:00' });
    await promise;
  });

  it('presigna el comprobante antes de enviar el pedido, sin ningún attempt_id (spec 025)', async () => {
    const promise = service.presignPaymentReceipt('image/jpeg');
    const req = http.expectOne(`${API}/cart/payment-receipt/presign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ content_type: 'image/jpeg' });

    req.flush({
      upload_url: 'https://r2.example/upload',
      key: 'k1',
      public_url: 'https://r2.example/k1.jpg',
      expires_in: 300,
    });

    const res = await promise;
    expect(res.public_url).toBe('https://r2.example/k1.jpg');
  });

  /**
   * Para el comensal un 401 no es un error de programación: es "vuelve a
   * escanear el QR". Se traduce a un error propio y se descarta el token para
   * que la pantalla relance el flujo de nombre.
   */
  it('traduce el 401 a DinerSessionExpiredError y descarta el token', async () => {
    tokens.set('tok-viejo');

    const promise = service.myOrders().catch((e: unknown) => e);
    http
      .expectOne(`${API}/cart/orders`)
      .flush({ detail: 'Sesión no activa' }, { status: 401, statusText: 'Unauthorized' });

    const err = await promise;
    expect(err instanceof DinerSessionExpiredError).toBe(true);
    expect(tokens.token()).toBeNull();
  });

  // ── spec 089 (A-95): distinguir "mesa cerrada" de "sesión vencida" ────────

  it('un 401 con X-Session-State: closed lanza DinerSessionExpiredError con closed = true (mismo mensaje del cuerpo)', async () => {
    tokens.set('tok-viejo');

    const promise = service.myOrders().catch((e: unknown) => e);
    http.expectOne(`${API}/cart/orders`).flush(
      { detail: 'Sesión no activa' },
      { status: 401, statusText: 'Unauthorized', headers: { 'X-Session-State': 'closed' } },
    );

    const err = (await promise) as DinerSessionExpiredError;
    expect(err instanceof DinerSessionExpiredError).toBe(true);
    expect(err.closed).toBe(true);
    expect(err.message).toBe('Sesión no activa'); // los mensajes actuales no cambian
    expect(tokens.token()).toBeNull();
  });

  it('un 401 SIN la cabecera (vencimiento) lanza closed = false', async () => {
    tokens.set('tok-viejo');

    const promise = service.myOrders().catch((e: unknown) => e);
    http.expectOne(`${API}/cart/orders`).flush(
      { detail: 'Sesión expirada por inactividad. Vuelve a escanear el QR.' },
      { status: 401, statusText: 'Unauthorized' },
    );

    const err = (await promise) as DinerSessionExpiredError;
    expect(err.closed).toBe(false);
    expect(err.message).toContain('inactividad');
  });

  it('una cabecera con otro valor no cuenta como cierre', async () => {
    tokens.set('tok-viejo');

    const promise = service.myOrders().catch((e: unknown) => e);
    http.expectOne(`${API}/cart/orders`).flush(
      { detail: 'x' },
      { status: 401, statusText: 'Unauthorized', headers: { 'X-Session-State': 'expired' } },
    );

    expect(((await promise) as DinerSessionExpiredError).closed).toBe(false);
  });

  // ── Salir de la mesa ──────────────────────────────────────────────────────

  it('avisa al backend al salir y descarta el token', async () => {
    tokens.set('tok-123');

    const promise = service.leave();
    const req = http.expectOne(`${API}/cart/leave`);
    expect(req.request.method).toBe('POST');

    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
    expect(tokens.token()).toBeNull();
  });

  /**
   * Salir con el token ya caducado no debe relanzar el flujo de nombre: el
   * comensal se está yendo y el objetivo ya está cumplido. Enseñarle una
   * pantalla de "sesión expirada" justo al salir sería absurdo.
   */
  it('un 401 al salir no lanza DinerSessionExpiredError', async () => {
    tokens.set('tok-viejo');

    const promise = service.leave().then(
      () => 'ok',
      (e: unknown) => e,
    );
    http
      .expectOne(`${API}/cart/leave`)
      .flush({ detail: 'Sesión no activa' }, { status: 401, statusText: 'Unauthorized' });

    const result = await promise;
    expect(result instanceof DinerSessionExpiredError).toBe(false);
    // Pase lo que pase, el token local se descarta.
    expect(tokens.token()).toBeNull();
  });

  // ── Los dos formatos de "sin stock" ───────────────────────────────────────

  it('expone el detalle estructurado del 409 del carrito', async () => {
    const promise = service
      .addItem({ product_variant_id: 'v1', quantity: 99 })
      .catch((e: unknown) => e);

    http.expectOne(`${API}/cart/items`).flush(
      {
        detail: {
          error: 'Stock insuficiente',
          insumo: 'Leche entera',
          disponible: '2.000',
          requerido: '5.000',
          contexto: 'carrito',
        },
      },
      { status: 409, statusText: 'Conflict' },
    );

    const err = await promise;
    const stock = service.stockConflict(err);
    expect(stock?.insumo).toBe('Leche entera');
    expect(stock?.disponible).toBe('2.000');
  });

  it('el mismo problema en formato cadena no se confunde con el estructurado', () => {
    const err = new (class extends Error {})('x') as unknown;
    expect(service.stockConflict(err)).toBeNull();
  });

  it('traduce el 429 usando Retry-After', async () => {
    const promise = service.getCart().catch((e: unknown) => e);
    http
      .expectOne(`${API}/cart`)
      .flush({ detail: 'Demasiadas peticiones' }, {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '30' },
      });

    const err = await promise;
    expect(service.extractError(err)).toContain('30 segundos');
  });
});
