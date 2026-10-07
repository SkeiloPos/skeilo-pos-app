import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  MenuCategory,
  MenuOptionGroup,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';
import { DiningOrder } from '../interfaces/dining.interface';
import {
  CartItemPayload,
  CartItemUpdatePayload,
  CartResponse,
  DinerPaymentAttempt,
  DinerPaymentMethod,
  DinerTable,
  ReceiptPresignResponse,
  SessionOpenResponse,
  StockConflictDetail,
  SubmitCartPayload,
} from '../interfaces/diner.interface';
import { DinerTokenStore } from './diner-token.store';

/** Branding del negocio que acompaña al menú público. */
export interface ResolvedBusiness {
  name: string;
  logo_url: string | null;
}

/**
 * spec 063 (FR-022): anuncio de una promoción por **conjunto de variantes**
 * vigente en ese momento. Solo para mostrar la condición — no cambia precios.
 */
export interface MenuPromotionAnnouncement {
  promotion_id: string;
  promotion_name: string;
  rules: { text: string; variant_count: number; min_qty: number; value: number }[];
}

/** Resultado de resolver el QR firmado: mesa + negocio + menú activo. */
export interface ResolvedMenu {
  table: DinerTable;
  business: ResolvedBusiness | null;
  categories: MenuCategory[];
  /** spec 063 (FR-022): anuncios de promociones vigentes ahora — cada
   *  elemento de `promotions[].rules[]` es una regla (research.md D-R3). */
  promotions: MenuPromotionAnnouncement[];
}

/** Mapea grupos de opciones crudos; se usa a nivel de variante y de producto. */
function mapGroups(raw: unknown): MenuOptionGroup[] {
  return ((raw as Record<string, unknown>[]) ?? []).map((g) => ({
    id: g['id'] as string,
    name: g['name'] as string,
    min_select: (g['min_select'] as number) ?? 0,
    max_select: (g['max_select'] as number) ?? 0,
    consume: (g['consume'] as boolean) ?? false,
    selection_mode: (g['selection_mode'] as 'conteo' | 'cantidad') ?? 'conteo',
    max_quantity_per_option: (g['max_quantity_per_option'] as number | null) ?? null,
    max_total_quantity: (g['max_total_quantity'] as number | null) ?? null,
    options: ((g['options'] as Record<string, unknown>[]) ?? []).map((o) => ({
      id: o['id'] as string,
      name: o['name'] as string,
      extra_price: Number(o['extra_price']),
      available: (o['available'] as boolean) ?? true,
    })),
  }));
}

/**
 * Mapea el bloque `promotion` de una variante, o `null` si el backend no lo pobló.
 *
 * El backend serializa sus `Decimal` como string JSON (`"unit_equivalent": "3500"`,
 * igual que `price`/`discounted_price`), así que sin este `Number(...)` el `+` de
 * `lineTotal()` en `product-select.component.ts` concatena en vez de sumar
 * ("3500" + 0 → "35000") y el total termina multiplicado por 10.
 */
function mapPromotion(raw: unknown): MenuVariantPromotion | null {
  if (raw == null) return null;
  const p = raw as Record<string, unknown>;
  return {
    condition_text: p['condition_text'] as string,
    short_condition: p['short_condition'] as string,
    unit_equivalent: Number(p['unit_equivalent']),
    unit_equivalent_approx: (p['unit_equivalent_approx'] as boolean) ?? false,
    unit_equivalent_text: p['unit_equivalent_text'] as string,
    display_text: p['display_text'] as string,
    type: p['type'] as 'percent' | 'package_price',
    min_qty: Number(p['min_qty']),
    value: Number(p['value']),
  };
}

/**
 * Error de sesión (401). Por defecto significa "hay que volver a pedir el nombre al comensal";
 * `closed` (spec 089, A-95) distingue que la MESA SE CERRÓ (el backend lo marca con la cabecera
 * `X-Session-State: closed`) de un simple vencimiento (inactividad, duración máxima, firma): en ese
 * caso el Menú QR muestra "¡Gracias por tu visita!" en vez de pedir el nombre.
 */
export class DinerSessionExpiredError extends Error {
  constructor(
    message: string,
    /** `true` solo si el 401 trae `X-Session-State: closed`. */
    readonly closed = false,
  ) {
    super(message);
    this.name = 'DinerSessionExpiredError';
  }
}

/**
 * Transporte del flujo **público** del comensal (`/menu/qr-token`, `/cart`).
 *
 * Se autentica solo con el `session_token` firmado, que inyecta el
 * `authTokenInterceptor` en `x-session-token`. Nunca lleva el Bearer del staff:
 * por eso vive separado de `DiningSessionService`, que es el lado del personal.
 *
 * Los métodos lanzan `HttpErrorResponse` salvo el `401`, que se traduce a
 * `DinerSessionExpiredError` y limpia el token — es la señal de "vuelve a
 * escanear el QR", no un error de programación.
 */
@Injectable({ providedIn: 'root' })
export class DinerService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(DinerTokenStore);
  private readonly api = environment.apiBaseUrl;

  // ── Menú por QR firmado ──────────────────────────────────────────────────

  /**
   * Resuelve el token **firmado** del QR en mesa + negocio + menú.
   * El tenant viaja dentro del token, así que no hace falta `x-tenant-host`.
   */
  async resolveByToken(token: string): Promise<ResolvedMenu> {
    const raw = await firstValueFrom(
      this.http.get<Record<string, unknown>>(`${this.api}/menu/qr-token/${token}`),
    );
    return this.mapResolved(raw);
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Une al comensal a la mesa. Si la mesa ya tiene una sesión activa **se une a
   * ella**; si no, la abre. Persiste el `session_token` devuelto.
   */
  async openSession(qrToken: string, displayName: string): Promise<SessionOpenResponse> {
    const res = await firstValueFrom(
      this.http.post<SessionOpenResponse>(`${this.api}/cart/sessions`, {
        qr_token: qrToken,
        display_name: displayName,
      }),
    );
    this.tokenStore.set(res.session_token);
    return res;
  }

  // ── Carrito (borrador en el backend) ─────────────────────────────────────

  /** Carrito vigente. Devuelve el carrito completo, como toda mutación. */
  getCart(): Promise<CartResponse> {
    return this.call(() => this.http.get<CartResponse>(`${this.api}/cart`));
  }

  addItem(item: CartItemPayload): Promise<CartResponse> {
    return this.call(() => this.http.post<CartResponse>(`${this.api}/cart/items`, item));
  }

  updateItem(itemId: string, patch: CartItemUpdatePayload): Promise<CartResponse> {
    return this.call(() =>
      this.http.patch<CartResponse>(`${this.api}/cart/items/${itemId}`, patch),
    );
  }

  removeItem(itemId: string): Promise<CartResponse> {
    return this.call(() => this.http.delete<CartResponse>(`${this.api}/cart/items/${itemId}`));
  }

  // ── Pagos (spec 024) ─────────────────────────────────────────────────────

  /** Métodos de pago activos del tenant — nunca incluye uno desactivado. */
  getPaymentMethods(): Promise<DinerPaymentMethod[]> {
    return this.call(() =>
      this.http.get<DinerPaymentMethod[]>(`${this.api}/cart/payment-methods`),
    );
  }

  /** Inicia un intento de pago para una orden propia. `409` si ya hay uno
   *  pendiente de revisión (FR-015a). */
  createPaymentAttempt(orderId: string, paymentMethodId: string): Promise<DinerPaymentAttempt> {
    return this.call(() =>
      this.http.post<DinerPaymentAttempt>(`${this.api}/cart/orders/${orderId}/payment-attempts`, {
        payment_method_id: paymentMethodId,
      }),
    );
  }

  /** Pide la URL firmada para subir el comprobante directo a R2. */
  presignReceipt(attemptId: string, contentType: string): Promise<ReceiptPresignResponse> {
    return this.call(() =>
      this.http.post<ReceiptPresignResponse>(
        `${this.api}/cart/payment-attempts/${attemptId}/receipt/presign`,
        { content_type: contentType },
      ),
    );
  }

  /** Asocia el archivo ya subido a R2 con el intento. */
  attachReceipt(attemptId: string, fileUrl: string): Promise<DinerPaymentAttempt> {
    return this.call(() =>
      this.http.post<DinerPaymentAttempt>(
        `${this.api}/cart/payment-attempts/${attemptId}/receipt`,
        { file_url: fileUrl },
      ),
    );
  }

  /**
   * Presign genérico para el comprobante (spec 025): a diferencia de
   * `presignReceipt`, no exige ningún intento de pago previo — se usa
   * *antes* de enviar el pedido, cuando todavía no existe ninguna orden ni
   * intento al que asociar el archivo.
   */
  presignPaymentReceipt(contentType: string): Promise<ReceiptPresignResponse> {
    return this.call(() =>
      this.http.post<ReceiptPresignResponse>(`${this.api}/cart/payment-receipt/presign`, {
        content_type: contentType,
      }),
    );
  }

  /**
   * Sube el archivo directo a R2 con la URL firmada (fuera de la API misma:
   * es un `PUT` plano al bucket, sin `x-session-token` ni JSON).
   */
  async uploadReceiptFile(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) {
      throw new Error('No se pudo subir el comprobante. Intenta de nuevo.');
    }
  }

  // ── Pedidos propios ──────────────────────────────────────────────────────

  /**
   * Envía el carrito como pedido, junto con su método de pago (spec 025): el
   * pedido nace con su primer intento de pago adjunto — `receiptFileUrl` es
   * obligatorio salvo que el método sea efectivo. Queda en `recibida`: **no
   * descuenta inventario** hasta que el personal lo confirme.
   */
  submitCart(paymentMethodId: string, receiptFileUrl?: string | null): Promise<DiningOrder> {
    const body: SubmitCartPayload = {
      payment_method_id: paymentMethodId,
      receipt_file_url: receiptFileUrl ?? null,
    };
    return this.call(() => this.http.post<DiningOrder>(`${this.api}/cart/submit`, body));
  }

  /** Pedidos de este comensal. Única fuente del progreso (por polling). */
  myOrders(): Promise<DiningOrder[]> {
    return this.call(() => this.http.get<DiningOrder[]>(`${this.api}/cart/orders`));
  }

  /** Cancela un pedido propio. El backend rechaza si cocina ya empezó. */
  cancelMyOrder(orderId: string, motivo: string): Promise<DiningOrder> {
    return this.call(() =>
      this.http.post<DiningOrder>(`${this.api}/cart/orders/${orderId}/cancel`, { motivo }),
    );
  }

  /**
   * El comensal se va de la mesa. Si era el último y no dejó ningún pedido, la
   * mesa vuelve a estar libre en el acto en vez de quedarse ocupada.
   *
   * **No pasa por `call()` a propósito**: ese helper traduce el `401` a
   * `DinerSessionExpiredError` y relanza el flujo de nombre, que es justo lo que
   * no se quiere al salir. Aquí un token caducado significa que el objetivo ya
   * está cumplido, no que haya que pedir el nombre otra vez.
   */
  async leave(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${this.api}/cart/leave`, {}));
    } finally {
      this.tokenStore.clear();
    }
  }

  // ── Errores ──────────────────────────────────────────────────────────────

  /**
   * Traduce un error del comensal a un mensaje mostrable.
   *
   * El "no hay stock" llega en **dos formatos distintos** que no son
   * intercambiables: objeto estructurado en `/cart/items` (permite señalar el
   * insumo) y cadena plana en la confirmación del staff.
   */
  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (err instanceof DinerSessionExpiredError) return err.message;
    if (!(err instanceof HttpErrorResponse)) return fallback;

    if (err.status === 429) {
      const secs = Number(err.headers.get('Retry-After'));
      return Number.isFinite(secs) && secs > 0
        ? `Demasiadas peticiones. Espera ${secs} segundos.`
        : 'Demasiadas peticiones. Espera un momento.';
    }

    const body = err.error as { detail?: unknown; message?: string } | null;
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      return (detail[0] as { msg?: string })?.msg ?? fallback;
    }
    if (detail && typeof detail === 'object') {
      return (detail as { error?: string }).error ?? fallback;
    }
    return body?.message ?? fallback;
  }

  /** Detalle del conflicto de stock, si el error es ese `409` estructurado. */
  stockConflict(err: unknown): StockConflictDetail | null {
    if (!(err instanceof HttpErrorResponse) || err.status !== 409) return null;
    const detail = (err.error as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === 'object' && 'insumo' in detail) {
      return detail as StockConflictDetail;
    }
    return null;
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  /** Ejecuta la llamada traduciendo el `401` a "sesión caducada". */
  private async call<T>(fn: () => import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(fn());
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.tokenStore.clear();
        throw new DinerSessionExpiredError(
          this.extractError(err, 'Tu sesión terminó. Vuelve a escanear el QR.'),
          err.headers?.get('X-Session-State') === 'closed',
        );
      }
      throw err;
    }
  }

  private mapResolved(raw: Record<string, unknown>): ResolvedMenu {
    const tableRaw = (raw['table'] ?? raw['dining_table'] ?? raw) as Record<string, unknown>;
    const categoriesRaw = (raw['menu'] ?? raw['categories'] ?? raw['items'] ?? []) as unknown[];
    const businessRaw = raw['business'] as Record<string, unknown> | undefined;

    return {
      table: {
        id: (tableRaw['id'] as string) ?? '',
        number: (tableRaw['number'] as number) ?? 0,
        name: (tableRaw['name'] as string) ?? null,
      },
      business: businessRaw
        ? {
            name: (businessRaw['name'] as string) ?? '',
            logo_url: (businessRaw['logo_url'] as string) ?? null,
          }
        : null,
      categories: (categoriesRaw as Record<string, unknown>[]).map((c) => this.mapCategory(c)),
      promotions: ((raw['promotions'] as Record<string, unknown>[]) ?? []).map((p) => ({
        promotion_id: p['promotion_id'] as string,
        promotion_name: p['promotion_name'] as string,
        rules: ((p['rules'] as Record<string, unknown>[]) ?? []).map((r) => ({
          text: r['text'] as string,
          variant_count: (r['variant_count'] as number) ?? 0,
          min_qty: (r['min_qty'] as number) ?? 0,
          value: Number(r['value'] ?? 0),
        })),
      })),
    };
  }

  private mapCategory(c: Record<string, unknown>): MenuCategory {
    return {
      id: c['id'] as string,
      name: c['name'] as string,
      products: ((c['products'] as Record<string, unknown>[]) ?? []).map((p) => ({
        id: p['id'] as string,
        name: p['name'] as string,
        description: (p['description'] as string) ?? null,
        image_url: (p['image_url'] as string) ?? null,
        variants: ((p['variants'] as Record<string, unknown>[]) ?? []).map((v) => ({
          id: v['id'] as string,
          // spec 099: el backend nombra la variante con `display_name` (nombre propio
          // si lo tiene, si no el de su presentación). `?? presentation_name ?? name`
          // cubre, en orden, un backend sin desplegar aún (spec 084, A-79; spec 087,
          // FR-014) y cualquier resto más viejo.
          name: (v['display_name'] ?? v['presentation_name'] ?? v['name']) as string,
          presentation_id: v['presentation_id'] as string | undefined,
          price: Number(v['price']),
          discounted_price: v['discounted_price'] != null ? Number(v['discounted_price']) : null,
          discount_kind: (v['discount_kind'] as string) ?? null,
          // spec 066 (FR-007): el bloque llega ya calculado y ya renderizado.
          // `?? null` para no romper contra un backend aún sin desplegar.
          promotion: mapPromotion(v['promotion']),
          // Los grupos cuelgan de la presentación: cuántos sabores se eligen cambia
          // con el tamaño.
          option_groups: mapGroups(v['option_groups']),
          available: (v['available'] as boolean) ?? true,
        })),
        // `?? true` para no romper contra un backend aún sin desplegar: sin el campo,
        // todo se comporta como antes (disponible).
        available: (p['available'] as boolean) ?? true,
        // spec 093: marcado manual de "Agotado" (Cajero/Admin).
        sold_out: (p['sold_out'] as boolean) ?? false,
        option_groups: mapGroups(p['option_groups']),
      })),
    };
  }
}
