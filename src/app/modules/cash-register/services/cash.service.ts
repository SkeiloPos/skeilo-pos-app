import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CashMovement,
  CashMovementPayload,
  CashRegister,
  CashShift,
  Page,
  Reconciliation,
  ShiftClosePayload,
  ShiftReport,
  ShiftSummary,
} from '../interfaces/cash.interface';

const REGISTER_STORAGE_KEY = 'cash.register';

/**
 * Transporte del módulo de caja real (`/api/v1/cash/*`). El header de tenant y el
 * Bearer los añade `authTokenInterceptor` a toda petición.
 *
 * Además mantiene el **turno abierto actual** como estado compartido (singleton
 * root): lo consume tanto `CashSessionStore` (pantalla de caja) como el checkout
 * de ventas, que necesita el `cash_shift_id` para cobrar.
 */
@Injectable({ providedIn: 'root' })
export class CashService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/cash`;

  /** Estado compartido del turno abierto (fuente única de verdad entre módulos). */
  readonly registers = signal<CashRegister[]>([]);
  readonly shift = signal<CashShift | null>(null);

  /** True mientras hay un turno abierto (no cerrado). */
  readonly isOpen = computed(() => {
    const s = this.shift();
    return !!s && s.status !== 'closed' && !s.closed_at;
  });

  /** Carga las cajas y actualiza la señal compartida. */
  async loadRegisters(): Promise<CashRegister[]> {
    const regs = await this.listRegisters();
    this.registers.set(regs);
    return regs;
  }

  /**
   * spec 072 (A-69... FR-001 a FR-004, contracts/descubrimiento-turno-abierto.md):
   * descubre el turno de caja realmente abierto hacia la señal compartida `shift`,
   * sin depender de que este navegador ya haya "operado" una caja.
   *
   * Camino rápido: si `localStorage` ya apunta a una caja con turno abierto, se usa
   * sin listar el resto (sin cambio de comportamiento respecto del antiguo
   * `restoreShift()` para ese caso). Si no resuelve nada (clave ausente, o esa caja
   * puntual sin turno), se listan todas las cajas del tenant y se consulta el turno
   * actual de cada una en paralelo — mismo patrón que ya usa
   * `CashSessionStore.loadOverview()`. Exactamente un turno abierto se adopta (y se
   * recuerda en `localStorage` para la próxima vez); cero o más de uno dejan `shift`
   * en `null` — cero porque no hay nada que cobrar (FR-003), más de uno porque
   * elegir al azar arriesgaría atribuir un cobro a la caja equivocada (FR-004).
   */
  async discoverOpenShift(): Promise<void> {
    const regId = localStorage.getItem(REGISTER_STORAGE_KEY);
    if (regId) {
      try {
        this.shift.set(await this.getCurrentShift(regId));
        return;
      } catch {
        // Esa caja puntual no tiene turno abierto — puede que otra sí. Seguir
        // al descubrimiento completo en vez de darse por vencido.
      }
    }

    const regs = await this.listRegisters();
    const results = await Promise.all(
      regs.map(async (r) => {
        try {
          return await this.getCurrentShift(r.id);
        } catch {
          return null; // 404 = sin turno abierto en esa caja
        }
      }),
    );
    const open = results.filter((s): s is CashShift => s !== null);

    if (open.length === 1) {
      this.shift.set(open[0]);
      localStorage.setItem(REGISTER_STORAGE_KEY, open[0].cash_register_id);
    } else {
      this.shift.set(null);
    }
  }

  listRegisters(): Promise<CashRegister[]> {
    return firstValueFrom(this.http.get<CashRegister[]>(`${this.baseUrl}/registers`));
  }

  createRegister(name: string): Promise<CashRegister> {
    return firstValueFrom(this.http.post<CashRegister>(`${this.baseUrl}/registers`, { name }));
  }

  openShift(cashRegisterId: string, openingAmount: number): Promise<CashShift> {
    return firstValueFrom(
      this.http.post<CashShift>(`${this.baseUrl}/shifts/open`, {
        cash_register_id: cashRegisterId,
        opening_amount: openingAmount,
      }),
    );
  }

  /** Turno abierto de una caja; lanza 404 si no hay ninguno. */
  getCurrentShift(cashRegisterId: string): Promise<CashShift> {
    return firstValueFrom(
      this.http.get<CashShift>(`${this.baseUrl}/shifts/current`, {
        params: { cash_register_id: cashRegisterId },
      }),
    );
  }

  addMovement(shiftId: string, payload: CashMovementPayload): Promise<CashMovement> {
    return firstValueFrom(
      this.http.post<CashMovement>(`${this.baseUrl}/shifts/${shiftId}/movements`, payload),
    );
  }

  listMovements(shiftId: string): Promise<CashMovement[]> {
    return firstValueFrom(
      this.http.get<CashMovement[]>(`${this.baseUrl}/shifts/${shiftId}/movements`),
    );
  }

  getReconciliation(shiftId: string): Promise<Reconciliation> {
    return firstValueFrom(
      this.http.get<Reconciliation>(`${this.baseUrl}/shifts/${shiftId}/reconciliation`),
    );
  }

  closeShift(shiftId: string, payload: ShiftClosePayload): Promise<CashShift> {
    return firstValueFrom(
      this.http.post<CashShift>(`${this.baseUrl}/shifts/${shiftId}/close`, payload),
    );
  }

  getReport(shiftId: string): Promise<ShiftReport> {
    return firstValueFrom(this.http.get<ShiftReport>(`${this.baseUrl}/shifts/${shiftId}/report`));
  }

  /** Histórico de turnos (cierres). Admin. `status` por defecto 'closed'. */
  listShifts(opts: {
    status?: string;
    cashRegisterId?: string;
    page?: number;
    size?: number;
  }): Promise<Page<ShiftSummary>> {
    const params: Record<string, string> = {
      status: opts.status ?? 'closed',
      page: String(opts.page ?? 1),
      size: String(opts.size ?? 20),
    };
    if (opts.cashRegisterId) params['cash_register_id'] = opts.cashRegisterId;
    return firstValueFrom(this.http.get<Page<ShiftSummary>>(`${this.baseUrl}/shifts`, { params }));
  }

  /** Extrae un mensaje legible del error HTTP del backend (FastAPI `detail`). */
  extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
