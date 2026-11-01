import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CloseSessionPayload,
  CloseSessionResponse,
  SessionBill,
  TableSession,
} from '../interfaces/dining.interface';

/** Detalle del `409` al cerrar: hay pedidos sin confirmar o comida en cocina. */
export interface CloseBlockedDetail {
  error: string;
  order_ids?: string[];
  items?: unknown[];
}

/**
 * Sesión de mesa (staff): agrupa a todos los comensales de una mesa y es la
 * unidad de cobro.
 *
 * Sustituye al ciclo `block` → `pay` por orden: cerrar la sesión cobra todos
 * sus pedidos de una vez, cierra a los comensales, abandona sus carritos y
 * libera la mesa en una sola operación.
 */
@Injectable({ providedIn: 'root' })
export class TableSessionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  /** Sesiones abiertas (una por mesa ocupada). */
  list(): Promise<TableSession[]> {
    return firstValueFrom(this.http.get<TableSession[]>(`${this.api}/table-sessions`));
  }

  get(id: string): Promise<TableSession> {
    return firstValueFrom(this.http.get<TableSession>(`${this.api}/table-sessions/${id}`));
  }

  /** Cuenta de la sesión: total + desglose por comensal. */
  bill(id: string): Promise<SessionBill> {
    return firstValueFrom(this.http.get<SessionBill>(`${this.api}/table-sessions/${id}/bill`));
  }

  /**
   * Cobra y cierra la sesión.
   *
   * `unified` genera una venta; `split`, una por comensal. Requiere que ningún
   * pedido siga en `pendiente` y que cocina haya terminado todo.
   */
  close(id: string, payload: CloseSessionPayload): Promise<CloseSessionResponse> {
    return firstValueFrom(
      this.http.post<CloseSessionResponse>(`${this.api}/table-sessions/${id}/close`, payload),
    );
  }

  /**
   * Libera una mesa ya cobrada por completo, sin cobrar nada (feature 028).
   *
   * `409` si queda algo sin pagar o cocina no ha terminado algún ítem —
   * `extractError` ya sabe leer ese mensaje.
   */
  release(tableSessionId: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.api}/table-sessions/${tableSessionId}/release`, {}),
    );
  }

  /** Pedidos sin confirmar / comida en curso que impiden cerrar (`409`). */
  closeBlocked(err: unknown): CloseBlockedDetail | null {
    if (!(err instanceof HttpErrorResponse) || err.status !== 409) return null;
    const detail = (err.error as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === 'object' && 'error' in detail) {
      return detail as CloseBlockedDetail;
    }
    return null;
  }

  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (!(err instanceof HttpErrorResponse)) return fallback;
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
}
