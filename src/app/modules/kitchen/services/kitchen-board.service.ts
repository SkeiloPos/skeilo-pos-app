import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { KitchenBoardResponse, KitchenCard, KitchenStatus } from '../interfaces/kitchen-board.interface';

interface KitchenErrorBody extends ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: { kitchen_status?: KitchenStatus } | null;
  };
}

/**
 * `GET /orders/kitchen-board` y `POST /orders/{id}/kitchen-status`
 * (contracts/kitchen-board.md, contracts/move-kitchen-status.md).
 */
@Injectable({ providedIn: 'root' })
export class KitchenBoardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/orders`;

  getBoard(): Promise<KitchenBoardResponse> {
    return firstValueFrom(this.http.get<KitchenBoardResponse>(`${this.baseUrl}/kitchen-board`));
  }

  moveCard(orderId: string, kitchenStatus: KitchenStatus, version: number): Promise<KitchenCard> {
    return firstValueFrom(
      this.http.post<KitchenCard>(`${this.baseUrl}/${orderId}/kitchen-status`, {
        kitchen_status: kitchenStatus,
        version,
      }),
    );
  }

  /** Código 409 de dominio (`NOT_IN_KITCHEN`/`KITCHEN_STATUS_CONFLICT`/
   *  `PAYMENT_NOT_PAID`/`ORDER_NOT_ACTIVE`), o `null` si el error no trae uno
   *  (contracts/move-kitchen-status.md §Errores). */
  extractErrorCode(err: unknown): string | null {
    if (!(err instanceof HttpErrorResponse)) return null;
    const body = err.error as KitchenErrorBody | null;
    return body?.error?.code ?? null;
  }

  /** `kitchen_status` vigente que viaja en el 409 `KITCHEN_STATUS_CONFLICT`
   *  (FR-009) -- el tablero lo adopta antes de devolver la tarjeta a su
   *  columna de origen. */
  extractConflictKitchenStatus(err: unknown): KitchenStatus | null {
    if (!(err instanceof HttpErrorResponse)) return null;
    const body = err.error as KitchenErrorBody | null;
    return body?.error?.details?.kitchen_status ?? null;
  }

  extractError(err: unknown, fallback = 'No se pudo completar la operación.'): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? fallback;
    }
    return fallback;
  }
}
