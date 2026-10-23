import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { DiningSessionService } from './dining-session.service';

const API = environment.apiBaseUrl;

/**
 * Lado **staff**. El flujo del comensal (menú por QR, sesión, carrito, pedidos
 * propios) se prueba en `diner.service.spec.ts`: son rutas públicas con otro
 * modelo de auth.
 */
describe('DiningSessionService', () => {
  let service: DiningSessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DiningSessionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DiningSessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista comandas y filtra por estado', async () => {
    const promise = service.listOrders('recibida');
    const req = http.expectOne((r) => r.url === `${API}/orders`);

    expect(req.request.params.get('status')).toBe('recibida');
    req.flush([]);
    await promise;
  });

  /**
   * Spec 029, hotfix: la Terminal de Mesas manda `active_sessions_only` para
   * que un pedido ya cobrado de una visita anterior (mesa liberada y
   * reabierta por QR) no vuelva a mezclarse con la sesión activa de la misma
   * mesa física — ver `orders/service.py::list_orders` en el backend.
   */
  it('lista comandas acotadas a sesiones activas cuando se pide', async () => {
    const promise = service.listOrders(undefined, true);
    const req = http.expectOne((r) => r.url === `${API}/orders`);

    expect(req.request.params.get('active_sessions_only')).toBe('true');
    expect(req.request.params.has('status')).toBe(false);
    req.flush([]);
    await promise;
  });

  it('sin el flag, no manda active_sessions_only (comportamiento actual)', async () => {
    const promise = service.listOrders();
    const req = http.expectOne((r) => r.url === `${API}/orders`);

    expect(req.request.params.has('active_sessions_only')).toBe(false);
    req.flush([]);
    await promise;
  });

  /**
   * Confirmar es el único punto que descuenta inventario en el flujo de mesa:
   * ni el carrito, ni el envío del comensal, ni el cobro lo tocan.
   */
  it('confirma un pedido recibido', async () => {
    const promise = service.confirmOrder('o1');
    const req = http.expectOne(`${API}/orders/o1/confirm`);

    expect(req.request.method).toBe('POST');
    req.flush({ id: 'o1', status: 'abierta', channel: 'QR_MENU', created_at: '2026-07-28' });

    const order = await promise;
    expect(order.status).toBe('abierta');
  });

  /**
   * "Aceptar pedido" sin cobrar: deja que cocina empiece mientras el pago
   * sigue pendiente de revisión. A diferencia de `confirmOrder`, NO descuenta
   * inventario ni cambia `status` -- el pedido sigue `recibida`.
   */
  it('acepta un pedido para cocina sin cobrar', async () => {
    const promise = service.acceptOrderForKitchen('o1');
    const req = http.expectOne(`${API}/orders/o1/start-preparation`);

    expect(req.request.method).toBe('POST');
    req.flush({ id: 'o1', status: 'recibida', channel: 'QR_MENU', created_at: '2026-07-28' });

    const order = await promise;
    expect(order.status).toBe('recibida');
  });

  it('cancela un pedido con motivo', async () => {
    const promise = service.cancelOrder('o1', 'Rechazado por el personal');
    const req = http.expectOne(`${API}/orders/o1/cancel`);

    expect(req.request.body).toEqual({ motivo: 'Rechazado por el personal' });
    req.flush({ id: 'o1', status: 'cancelada', channel: 'QR_MENU', created_at: '2026-07-28' });
    await promise;
  });

  it('avanza el estado de cocina de un ítem', async () => {
    const promise = service.updateItemKitchen('i1', 'listo');
    const req = http.expectOne(`${API}/orders/items/i1/kitchen`);

    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ estado_cocina: 'listo' });
    req.flush({ id: 'i1', estado_cocina: 'listo' });
    await promise;
  });

  it('traduce el detail en array (422) de FastAPI', async () => {
    const promise = service.getOrder('nope').catch((e: unknown) => e);
    http
      .expectOne(`${API}/orders/nope`)
      .flush({ detail: [{ msg: 'Campo requerido' }] }, { status: 422, statusText: 'Unprocessable' });

    expect(service.extractError(await promise)).toBe('Campo requerido');
  });

  it('traduce el detail como objeto (bloqueo por cocina)', async () => {
    const promise = service.getOrder('x').catch((e: unknown) => e);
    http.expectOne(`${API}/orders/x`).flush(
      { detail: { error: 'Hay ítems sin terminar en cocina', items: [] } },
      { status: 409, statusText: 'Conflict' },
    );

    expect(service.extractError(await promise)).toBe('Hay ítems sin terminar en cocina');
  });

  // ── feature 028: terminal híbrida por origen ─────────────────────────────

  it('crea un pedido de mostrador con hold_for_payment (T023)', async () => {
    const promise = service.createManualOrder({
      channel: 'POS',
      dining_table_id: 't1',
      customer_name: null,
      items: [{ product_variant_id: 'v1', quantity: 1 }],
      hold_for_payment: true,
    });
    const req = http.expectOne(`${API}/orders`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body.hold_for_payment).toBe(true);
    expect(req.request.body.channel).toBe('POS');
    req.flush({ id: 'o1', channel: 'POS', status: 'recibida', created_at: '2026-08-20' });

    const order = await promise;
    expect(order.id).toBe('o1');
  });

  it('cobra, factura y envía a cocina un pedido de mostrador (T025)', async () => {
    const promise = service.checkoutAndSend('o1', {
      version: 3,
      cash_shift_id: 'shift-1',
      payments: [{ payment_method_id: 'pm1', amount: 10000 }],
      billing_customer_name: 'Consumidor Final',
    });
    const req = http.expectOne(`${API}/orders/o1/checkout-and-send`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body.version).toBe(3);
    req.flush({ id: 's1', total: '10000', status: 'paid', sold_at: '2026-08-20T12:00:00' });

    const sale = await promise;
    expect(sale.id).toBe('s1');
  });
});
