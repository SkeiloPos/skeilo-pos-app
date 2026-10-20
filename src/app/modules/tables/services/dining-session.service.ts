import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AddAdditionPayload,
  AddToppingPayload,
  CheckoutAndSendPayload,
  CheckoutPreview,
  ComplementaryPaymentPayload,
  DiningOrder,
  DiningOrderItem,
  DiningOrderStatus,
  DraftPreviewPayload,
  KitchenStatus,
  OrderCreatePayload,
  OrderItemPayload,
  PaymentAttempt,
} from '../interfaces/dining.interface';
import { Sale } from '../../sales/interfaces/sales.interface';

/**
 * Transporte del lado **staff** del flujo de mesas: comandas, preparación y cobro.
 *
 * El flujo del comensal (menú por QR, sesión, carrito, pedidos propios) vive en
 * `DinerService`: son rutas públicas que se autentican con `x-session-token` y
 * mezclarlas aquí arrastraría el Bearer del personal a peticiones anónimas.
 */
@Injectable({ providedIn: 'root' })
export class DiningSessionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  // ── Orders (`/orders`) ───────────────────────────────────────────────────

  /**
   * List comandas (staff), optionally filtered by status. Returns an array.
   *
   * `activeSessionsOnly` (spec 029, hotfix): la Terminal de Mesas lo manda
   * en `true` para no volver a mezclar pedidos ya cobrados de una visita
   * anterior con la sesión activa de la misma mesa física — ver
   * `orders/service.py::list_orders` en el backend.
   */
  async listOrders(status?: DiningOrderStatus, activeSessionsOnly?: boolean): Promise<DiningOrder[]> {
    const params: Record<string, string> = {};
    if (status) params['status'] = status;
    if (activeSessionsOnly) params['active_sessions_only'] = 'true';
    return firstValueFrom(
      this.http.get<DiningOrder[]>(`${this.api}/orders`, { params }),
    );
  }

  /** Fetch a single comanda by id (staff). Throws `HttpErrorResponse` (e.g. 404). */
  async getOrder(id: string): Promise<DiningOrder> {
    return firstValueFrom(this.http.get<DiningOrder>(`${this.api}/orders/${id}`));
  }

  /**
   * Crea un pedido de mostrador (feature 028). Se manda con
   * `hold_for_payment: true` para que la terminal pueda armarlo sin que toque
   * cocina ni descuente inventario hasta que se cobre con `checkoutAndSend`.
   */
  async createManualOrder(payload: OrderCreatePayload): Promise<DiningOrder> {
    return firstValueFrom(this.http.post<DiningOrder>(`${this.api}/orders`, payload));
  }

  /**
   * Cobra, factura y envía a cocina un pedido de mostrador en una sola llamada
   * atómica (feature 028). Devuelve la venta emitida, lista para imprimir.
   *
   * `409` si el pedido no está en el estado correcto, si `version` quedó
   * desactualizado (protección de doble clic) o si no se puede descontar
   * inventario.
   */
  async checkoutAndSend(orderId: string, payload: CheckoutAndSendPayload): Promise<Sale> {
    return firstValueFrom(
      this.http.post<Sale>(`${this.api}/orders/${orderId}/checkout-and-send`, payload),
    );
  }

  /**
   * spec 073 (FR-001): desglose autoritativo del cobro de un pedido **ya
   * creado** (mesa, para llevar, domicilio) — `{subtotal, discount,
   * delivery_fee, total, promotion_evaluated_at}` calculado por el backend con
   * el mismo motor que emite la venta. Solo lectura: no bloquea el pedido ni
   * exige turno de caja. `409` si el pedido ya está pagado o cancelado.
   */
  async checkoutPreview(orderId: string): Promise<CheckoutPreview> {
    return firstValueFrom(
      this.http.get<CheckoutPreview>(`${this.api}/orders/${orderId}/checkout-preview`),
    );
  }

  /**
   * spec 073 (FR-013): mismo desglose para un **borrador** de orden manual que
   * todavía no existe como pedido — el frontend manda las mismas líneas que
   * usará para el `POST /orders` real. `promotion_evaluated_at` es la hora de
   * la llamada (sin congelar): el pedido congela su instante recién al crearse.
   */
  async draftPreview(payload: DraftPreviewPayload): Promise<CheckoutPreview> {
    return firstValueFrom(
      this.http.post<CheckoutPreview>(`${this.api}/orders/draft-preview`, payload),
    );
  }

  /**
   * Busca la venta ya facturada de un pedido (feature 028, T033) para poder
   * "Reimprimir Factura POS" sin depender de una caché local: sirve tanto
   * para un pedido de mostrador cobrado en otra pestaña/sesión como para uno
   * de origen QR, que nunca pasa por `checkoutAndSend`. `GET /invoices` ya
   * filtra por `order_id` y trae el `sale_id`; de ahí se pide la venta
   * completa (con `items`/`payments`) que espera `saleToReceipt`.
   *
   * Devuelve `null` si el pedido todavía no tiene ninguna factura emitida.
   */
  async findSaleForOrder(orderId: string): Promise<Sale | null> {
    const invoices = await firstValueFrom(
      this.http.get<Array<{ sale_id: string }>>(`${this.api}/invoices`, {
        params: { order_id: orderId },
      }),
    );
    const invoice = invoices[0];
    if (!invoice) return null;
    return firstValueFrom(this.http.get<Sale>(`${this.api}/sales/${invoice.sale_id}`));
  }

  /**
   * Acepta un pedido `recibida` → `abierta`.
   *
   * **Es el único punto que descuenta inventario** en el flujo de mesa. Un
   * `400` significa que falta stock; el pedido se queda en `recibida` y se
   * puede reintentar tras reponer.
   */
  async confirmOrder(orderId: string): Promise<DiningOrder> {
    return firstValueFrom(this.http.post<DiningOrder>(`${this.api}/orders/${orderId}/confirm`, {}));
  }

  /** Cancela un pedido (staff, sin restricción de estado). */
  async cancelOrder(orderId: string, motivo: string): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/${orderId}/cancel`, { motivo }),
    );
  }

  /**
   * Avanza la preparación de un ítem (`pendiente`→`en_preparacion`→`listo`).
   *
   * El backend admite el salto directo `pendiente → listo`, que es el que usa
   * el botón de un toque de la terminal.
   */
  async updateItemKitchen(itemId: string, estado: KitchenStatus): Promise<DiningOrderItem> {
    return firstValueFrom(
      this.http.patch<DiningOrderItem>(`${this.api}/orders/items/${itemId}/kitchen`, {
        estado_cocina: estado,
      }),
    );
  }

  /**
   * Marca `listo` todo lo que quede en curso del pedido, en una sola petición.
   *
   * Existe para no encadenar un PATCH por ítem —y por transición— cada vez que
   * el cajero cobra una mesa que aún no ha marcado.
   */
  async markOrderReady(orderId: string): Promise<DiningOrder> {
    return firstValueFrom(this.http.post<DiningOrder>(`${this.api}/orders/${orderId}/ready`, {}));
  }

  // ── Intentos de pago (cajero, spec 024) ──────────────────────────────────

  /** Historial completo de intentos de pago de una orden (incluye rechazados
   *  con su motivo — vista de cajero/back-office, a diferencia de
   *  `DiningOrder.current_payment_attempt`). */
  async listPaymentAttempts(orderId: string): Promise<PaymentAttempt[]> {
    return firstValueFrom(
      this.http.get<PaymentAttempt[]>(`${this.api}/orders/${orderId}/payment-attempts`),
    );
  }

  /**
   * Aprueba un comprobante de transferencia. Feature 028: aprobar ya genera
   * la venta/factura en la misma llamada (antes solo se generaba al "Cobrar
   * y cerrar mesa", botón que esta feature retiró del flujo QR) — por eso
   * necesita el turno de caja abierto, igual que `checkoutAndSend`.
   */
  async approvePaymentAttempt(attemptId: string, cashShiftId: string): Promise<PaymentAttempt> {
    return firstValueFrom(
      this.http.post<PaymentAttempt>(
        `${this.api}/orders/payment-attempts/${attemptId}/approve`,
        { cash_shift_id: cashShiftId },
      ),
    );
  }

  /** Rechaza un comprobante de transferencia; el motivo es obligatorio. */
  async rejectPaymentAttempt(attemptId: string, reason: string): Promise<PaymentAttempt> {
    return firstValueFrom(
      this.http.post<PaymentAttempt>(
        `${this.api}/orders/payment-attempts/${attemptId}/reject`,
        { reason },
      ),
    );
  }

  /** Confirma un pago en efectivo; el backend calcula el cambio y ya genera
   *  la venta/factura en la misma llamada (feature 028 — ver
   *  `approvePaymentAttempt`). */
  async confirmCashPaymentAttempt(
    attemptId: string,
    amountReceived: number,
    cashShiftId: string,
  ): Promise<PaymentAttempt> {
    return firstValueFrom(
      this.http.post<PaymentAttempt>(
        `${this.api}/orders/payment-attempts/${attemptId}/confirm-cash`,
        { amount_received: amountReceived, cash_shift_id: cashShiftId },
      ),
    );
  }

  // ── Cobro / cierre de comedor (Fase 7) ───────────────────────────────────

  /** Add a single item directly to a specific order (waiter). The order must
   *  already exist (spec 087/A-85 — replaces `addTableItem`, which resolved
   *  the order implicitly by table; parallel orders per table make that
   *  resolution ambiguous). Deducts inventory. Returns the updated order. */
  async addOrderItems(orderId: string, item: OrderItemPayload): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/${orderId}/items`, item),
    );
  }

  /** Void (and optionally replace) an order item. Reverses inventory if pendiente. */
  async voidItem(itemId: string, motivo: string): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/items/${itemId}/void`, { motivo }),
    );
  }

  /**
   * Agrega una adición a una línea de pedido ya creada (spec 123), mientras
   * siga `pendiente`/`en_preparacion`. Si el pedido ya tenía factura emitida,
   * no la toca: el nuevo saldo pendiente viaja en `pending_balance` de la
   * respuesta, sin cobrarse todavía.
   */
  async addAddition(itemId: string, body: AddAdditionPayload): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/items/${itemId}/additions`, body),
    );
  }

  /**
   * Sube o baja la cantidad de una adición que ya está en la línea (spec 123), en vez
   * de forzar a anular la línea para ajustar un topping ya agregado. `quantity` es el
   * total nuevo (no un delta); el backend rechaza repetir la misma cantidad.
   */
  async updateAdditionQuantity(
    itemId: string, optionId: string, quantity: number,
  ): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.patch<DiningOrder>(
        `${this.api}/orders/items/${itemId}/additions/${optionId}`, { quantity },
      ),
    );
  }

  /**
   * Quita del todo una adición que ya está en la línea (spec 123), en vez de forzar a
   * anular la línea entera para deshacerla. El backend rechaza quitar una opción
   * obligatoria que dejaría la línea sin el mínimo exigido (p. ej. un sabor).
   */
  async removeAddition(itemId: string, optionId: string): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.delete<DiningOrder>(`${this.api}/orders/items/${itemId}/additions/${optionId}`),
    );
  }

  /**
   * Agrega una adición (producto-topping) a una línea de pedido ya creada
   * (spec 129) -- hermano de `addAddition`, para adiciones que ahora son
   * productos marcados `is_topping=true` en vez de opciones de un grupo.
   */
  async addTopping(itemId: string, body: AddToppingPayload): Promise<DiningOrder> {
    return firstValueFrom(
      this.http.post<DiningOrder>(`${this.api}/orders/items/${itemId}/toppings`, body),
    );
  }

  /**
   * Cobra el saldo pendiente de un pedido como pago complementario (spec
   * 123): genera una factura independiente vinculada al pedido, sin
   * modificar la factura original. Siempre un único método de pago (FR-018).
   */
  async settleComplementaryPayment(
    orderId: string, body: ComplementaryPaymentPayload,
  ): Promise<Sale> {
    return firstValueFrom(
      this.http.post<Sale>(`${this.api}/orders/${orderId}/complementary-payment`, body),
    );
  }

  /** Translate an error into a readable message (FastAPI `detail` string/array). */
  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      // El bloqueo por ítems sin terminar devuelve `detail` como `{error, items}`.
      if (detail && typeof detail === 'object') {
        return (detail as { error?: string }).error ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
