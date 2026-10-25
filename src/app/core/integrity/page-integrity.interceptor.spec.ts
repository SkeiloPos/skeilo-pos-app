import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PROTECTED_ACTIONS } from './protected-actions';
import { pageIntegrityInterceptor } from './page-integrity.interceptor';
import { PageIntegrityService } from './page-integrity.service';

const API = environment.apiBaseUrl;

/** Doble del servicio: solo lo que usa el interceptor (estado y aviso). */
class FakeIntegrity {
  readonly altered = signal(false);
  readonly avisos: string[] = [];
  notifyBlocked(label: string): void {
    this.avisos.push(label);
  }
}

/** Una URL concreta (con ids de ejemplo) para cada patrón anclado del catálogo. */
const EJEMPLOS: Record<string, string> = {
  'QR-1': '/cart/submit',
  'QR-2': '/cart/orders/ord-1/payment-attempts',
  'P-1': '/orders',
  'P-2': '/orders/ord-1/items',
  'P-3': '/orders/ord-1/checkout-and-send',
  'P-4': '/orders/ord-1/complementary-payment',
  'P-5': '/orders/payment-attempts/pa-1/approve',
  'P-6': '/orders/payment-attempts/pa-1/confirm-cash',
  'P-7': '/orders/payment-attempts/pa-1/adjust-split',
  'P-8': '/table-sessions/ts-1/close',
  'P-9': '/sales',
  'P-10': '/cash/shifts/open',
  'P-11': '/cash/shifts/sh-1/movements',
  'P-12': '/cash/shifts/sh-1/close',
};

/** Etiqueta que cada fila debe mostrar en el aviso (contracts/protected-actions.md). */
const ETIQUETAS: Record<string, string> = {
  'QR-1': 'enviar el pedido',
  'QR-2': 'pagar el pedido',
  'P-1': 'crear el pedido',
  'P-2': 'agregar productos al pedido',
  'P-3': 'cobrar el pedido',
  'P-4': 'cobrar el saldo pendiente',
  'P-5': 'aprobar el pago',
  'P-6': 'confirmar el pago en efectivo',
  'P-7': 'reajustar el pago',
  'P-8': 'cobrar y cerrar la cuenta de la mesa',
  'P-9': 'cobrar la venta',
  'P-10': 'abrir el turno de caja',
  'P-11': 'registrar el movimiento de caja',
  'P-12': 'cerrar el turno de caja',
};

describe('pageIntegrityInterceptor (spec 134, contracts/protected-actions.md)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let integrity: FakeIntegrity;

  beforeEach(() => {
    TestBed.resetTestingModule();
    integrity = new FakeIntegrity();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([pageIntegrityInterceptor])),
        provideHttpClientTesting(),
        { provide: PageIntegrityService, useValue: integrity },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Envía la petición y devuelve el error con el que se rechazó (o `null` si salió). */
  async function enviar(method: string, path: string): Promise<HttpErrorResponse | null> {
    const resultado = firstValueFrom(http.request(method, `${API}${path}`, { body: {} })).then(
      () => null,
      (err: HttpErrorResponse) => err,
    );
    const pendientes = httpMock.match(`${API}${path}`);
    for (const req of pendientes) req.flush({});
    return resultado;
  }

  // Una prueba por fila del catálogo: menú QR (US2) y panel del personal (US3).
  describe.each(PROTECTED_ACTIONS)('$id · $method $label', (accion) => {
    const ruta = EJEMPLOS[accion.id];

    it('con la página alterada se rechaza con 423, con el motivo en español y sin llegar a la red', async () => {
      integrity.altered.set(true);

      const err = await enviar(accion.method, ruta);

      expect(err).toBeInstanceOf(HttpErrorResponse);
      expect(err!.status).toBe(423);
      expect(err!.error.code).toBe('page_altered');
      expect(err!.error.detail).toBe(
        `No se pudo ${accion.label}: la página fue alterada por el navegador. Recarga para continuar.`,
      );
      // `afterEach(httpMock.verify)` falla si la petición hubiera llegado al backend.
      httpMock.expectNone(`${API}${ruta}`);
    });

    it('notifica al aviso con la etiqueta de la acción', async () => {
      integrity.altered.set(true);

      await enviar(accion.method, ruta);

      expect(integrity.avisos).toEqual([accion.label]);
    });

    it('con la página íntegra pasa y llega al backend', async () => {
      const promesa = firstValueFrom(http.request(accion.method, `${API}${ruta}`, { body: {} }));
      httpMock.expectOne(`${API}${ruta}`).flush({ ok: true });

      await expect(promesa).resolves.toEqual({ ok: true });
      expect(integrity.avisos).toEqual([]);
    });
  });

  describe('el catálogo', () => {
    it('tiene exactamente las 14 acciones del contrato, con id, método, ruta anclada y etiqueta', () => {
      expect(PROTECTED_ACTIONS.map((a) => a.id)).toEqual(Object.keys(EJEMPLOS));
      for (const a of PROTECTED_ACTIONS) {
        expect(a.label, a.id).toBe(ETIQUETAS[a.id]);
        expect(a.method, a.id).toBe('POST');
        expect(a.path.source.startsWith('^'), a.id).toBe(true);
        expect(a.path.source.endsWith('$'), a.id).toBe(true);
        // El ejemplo del contrato coincide con su propia fila y con ninguna otra.
        const coinciden = PROTECTED_ACTIONS.filter((x) => x.path.test(EJEMPLOS[a.id]));
        expect(coinciden.map((x) => x.id), a.id).toEqual([a.id]);
      }
    });

    it('P-2 (agregar productos a un pedido) coincide, pero anular un ítem no', async () => {
      integrity.altered.set(true);

      expect((await enviar('POST', '/orders/ord-1/items'))?.status).toBe(423);
      expect(await enviar('POST', '/orders/items/it-1/void')).toBeNull();
      expect(await enviar('POST', '/orders/items/it-1/additions')).toBeNull();
    });
  });

  describe('rutas del panel evaluadas y NO protegidas (pasan siempre, aun alterada)', () => {
    const NO_PROTEGIDAS: [string, string][] = [
      ['POST', '/orders/draft-preview'],
      ['GET', '/orders/ord-1/checkout-preview'],
      ['POST', '/orders/ord-1/confirm'],
      ['POST', '/orders/ord-1/ready'],
      ['POST', '/orders/ord-1/start-preparation'],
      ['POST', '/orders/ord-1/move'],
      ['POST', '/orders/merge'],
      ['PATCH', '/orders/items/it-1/kitchen'],
      ['POST', '/orders/ord-1/cancel'],
      ['POST', '/orders/items/it-1/void'],
      ['POST', '/orders/items/it-1/additions'],
      ['PATCH', '/orders/items/it-1/additions/op-1'],
      ['DELETE', '/orders/items/it-1/additions/op-1'],
      ['POST', '/orders/items/it-1/toppings'],
      ['POST', '/orders/payment-attempts/pa-1/reject'],
      ['POST', '/table-sessions/ts-1/release'],
      ['POST', '/cash/registers'],
      // Consultas de las mismas superficies: nunca se bloquean.
      ['GET', '/orders'],
      ['GET', '/orders/ord-1/payment-attempts'],
      ['GET', '/cash/shifts/current'],
      ['GET', '/sales'],
    ];

    it.each(NO_PROTEGIDAS)('%s %s', async (metodo, ruta) => {
      integrity.altered.set(true);

      expect(await enviar(metodo, ruta)).toBeNull();
      expect(integrity.avisos).toEqual([]);
    });
  });

  describe('lo que no es una acción protegida', () => {
    it('las rutas del carrito del menú QR pasan siempre, incluso con la página alterada', async () => {
      integrity.altered.set(true);
      const casos: [string, string][] = [
        ['POST', '/cart/items'],
        ['PATCH', '/cart/items/it-1'],
        ['DELETE', '/cart/items/it-1'],
        ['POST', '/cart/sessions'],
        ['POST', '/cart/leave'],
        ['POST', '/cart/orders/ord-1/cancel'],
        ['GET', '/cart/orders'],
      ];

      for (const [metodo, ruta] of casos) {
        expect(await enviar(metodo, ruta), `${metodo} ${ruta}`).toBeNull();
      }
      expect(integrity.avisos).toEqual([]);
    });

    it('la misma ruta con otro método no coincide (GET /cart/submit no es el envío)', async () => {
      integrity.altered.set(true);

      expect(await enviar('GET', '/cart/submit')).toBeNull();
    });

    it('las rutas se anclan: un prefijo o sufijo extra no coincide', async () => {
      integrity.altered.set(true);

      expect(await enviar('POST', '/cart/submit/extra')).toBeNull();
      expect(await enviar('POST', '/cart/orders/ord-1/payment-attempts/at-1/receipt')).toBeNull();
      expect(await enviar('POST', '/otro/cart/submit')).toBeNull();
    });
  });

  describe('coincidencia de rutas', () => {
    it('una ruta con query string coincide', async () => {
      integrity.altered.set(true);

      const err = await enviar('POST', '/cart/submit?x=1');

      expect(err?.status).toBe(423);
    });

    it('un id distinto coincide (el id es un comodín del patrón)', async () => {
      integrity.altered.set(true);

      for (const id of ['abc', '3f2c8c6e-1111-4222-8333-944455556666', '12345']) {
        const err = await enviar('POST', `/cart/orders/${id}/payment-attempts`);
        expect(err?.status, id).toBe(423);
      }
    });

    it('una URL ajena a apiBaseUrl nunca se toca', async () => {
      integrity.altered.set(true);

      const promesa = firstValueFrom(http.post('https://otro-dominio.example/cart/submit', {}));
      httpMock.expectOne('https://otro-dominio.example/cart/submit').flush({});

      await expect(promesa).resolves.toEqual({});
      expect(integrity.avisos).toEqual([]);
    });
  });

  describe('FR-014 · lo que ya salió no se interfiere', () => {
    it('una petición enviada antes de alterarse completa su respuesta, aunque la página se altere en vuelo', async () => {
      const promesa = firstValueFrom(http.post(`${API}/cart/submit`, {}));
      const req = httpMock.expectOne(`${API}/cart/submit`); // ya salió, página íntegra

      integrity.altered.set(true); // se altera mientras está en vuelo
      req.flush({ id: 'ord-1' });

      await expect(promesa).resolves.toEqual({ id: 'ord-1' });
      expect(integrity.avisos).toEqual([]);
    });

    it('al volver a íntegra, las acciones vuelven a salir', async () => {
      integrity.altered.set(true);
      expect((await enviar('POST', '/cart/submit'))?.status).toBe(423);

      integrity.altered.set(false);
      const promesa = firstValueFrom(http.post(`${API}/cart/submit`, {}));
      httpMock.expectOne(`${API}/cart/submit`).flush({ id: 'ord-2' });

      await expect(promesa).resolves.toEqual({ id: 'ord-2' });
    });
  });
});
