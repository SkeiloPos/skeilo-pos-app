import { Injectable, inject, signal } from '@angular/core';
import { DinerTokenStore } from '../../services/diner-token.store';
import { DinerPaymentMethod } from '../../interfaces/diner.interface';
import { DiningOrder } from '../../interfaces/dining.interface';

/**
 * `'cash'` es el paso nuevo del monto en efectivo de un pago mixto (spec 130,
 * entre `'method'` y `'transfer'`) — los otros dos ya modelaba `reviewStep`
 * en el modal retirado.
 */
export type CheckoutStep = 'method' | 'cash' | 'transfer';

interface CheckoutProgressRecord {
  step: CheckoutStep;
  payment_method_id: string | null;
  receipt_file_url: string | null;
  /** Spec 130 (FR-005/FR-006): `null` ⇔ el pago no es mixto. */
  cash_amount: number | null;
  transfer_method_id: string | null;
  saved_at: string;
}

const STORAGE_PREFIX = 'pos.diner.checkout_progress.';

/**
 * Ventana deslizante de la sesión del comensal (spec 007, Assumptions de esta
 * spec: 4h) — no introduce un TTL propio (FR-009): solo evita que un registro
 * sobreviva más que la sesión que lo originó, con el mismo número ya vigente.
 */
const WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Progreso recuperable de la vista de revisión y pago (spec 034), en
 * `localStorage`, con clave por sesión de mesa + participante — leídos del
 * `session_token` (mismos claims `ts`/`s` que ya firma `mint_session_token`,
 * sin decodificar nada nuevo del lado servidor).
 *
 * También sostiene el estado en memoria que las 4 rutas de paso comparten
 * (no sobreviven entre sí como instancias de componente, solo como servicios
 * `providedIn: 'root'`): la lista de métodos de pago ya cargada, y el pedido
 * ya existente que resolvió `checkoutHydrationGuard` para la confirmación.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutProgressStore {
  private readonly tokenStore = inject(DinerTokenStore);

  /** Métodos de pago del tenant, cargados una sola vez por vuelta al checkout. */
  readonly paymentMethods = signal<DinerPaymentMethod[]>([]);
  /** Pedido ya existente (creado por este intento o uno anterior) para la confirmación. */
  readonly activeOrder = signal<DiningOrder | null>(null);

  read(): CheckoutProgressRecord | null {
    const key = this.key();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const record = JSON.parse(raw) as CheckoutProgressRecord;
      if (!this.isValid(record)) {
        this.clear();
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  /**
   * Fusiona con lo ya guardado y refresca `saved_at`.
   *
   * Spec 130 (Clarificación Q6): si el `patch` trae un `cash_amount` distinto
   * al ya guardado, el comprobante ya subido se invalida — cambiar el monto
   * en efectivo cambia cuánto falta por transferir, así que el comprobante
   * (de la porción anterior) ya no corresponde.
   */
  write(patch: Partial<Omit<CheckoutProgressRecord, 'saved_at'>>): void {
    const key = this.key();
    if (!key) return;
    const current = this.read();
    const cashAmountChanged =
      'cash_amount' in patch && patch.cash_amount !== (current?.cash_amount ?? null);
    const next: CheckoutProgressRecord = {
      step: current?.step ?? 'method',
      payment_method_id: current?.payment_method_id ?? null,
      receipt_file_url: current?.receipt_file_url ?? null,
      cash_amount: current?.cash_amount ?? null,
      transfer_method_id: current?.transfer_method_id ?? null,
      ...patch,
      ...(cashAmountChanged && !('receipt_file_url' in patch) ? { receipt_file_url: null } : {}),
      saved_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* modo privado / storage bloqueado: el progreso no sobrevive a la recarga */
    }
  }

  /**
   * Limpia solo el método elegido (FR-010, T015) — al volver a elegir uno
   * distinto, o al descubrir que el guardado ya no está activo, sin tocar el
   * resto del registro.
   */
  clearMethod(): void {
    this.write({
      payment_method_id: null, receipt_file_url: null,
      cash_amount: null, transfer_method_id: null,
    });
  }

  /** Borra el registro completo — al enviar el pedido con éxito (FR-011/T011). */
  clear(): void {
    const key = this.key();
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* nada que limpiar */
    }
  }

  private key(): string | null {
    const claims = this.sessionClaims();
    if (!claims) return null;
    return `${STORAGE_PREFIX}${claims.ts}.${claims.s}`;
  }

  /** Lee `table_session_id` (`ts`) y `participant_id` (`s`) del propio
   *  `session_token` — sin llamar al backend ni validar la firma (eso ya lo
   *  hace cada endpoint); si el token falta o no trae esos claims, no hay
   *  clave donde guardar. */
  private sessionClaims(): { ts: string; s: string } | null {
    const token = this.tokenStore.token();
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(base64UrlDecode(parts[1])) as { ts?: string; s?: string };
      if (!payload.ts || !payload.s) return null;
      return { ts: payload.ts, s: payload.s };
    } catch {
      return null;
    }
  }

  private isValid(record: CheckoutProgressRecord): boolean {
    const savedAt = Date.parse(record.saved_at);
    return Number.isFinite(savedAt) && Date.now() - savedAt <= WINDOW_MS;
  }
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
