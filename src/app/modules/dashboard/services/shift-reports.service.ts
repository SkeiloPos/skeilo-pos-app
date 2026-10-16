import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ActiveOrderSummary,
  PeriodSalesReport,
  ShiftSalesReport,
} from '../interfaces/shift-reports.interface';

/** Parámetros de `GET /cash/reports/period` (spec 119, contracts/shift-sales-report-api.md). */
export type PeriodReportParams =
  | { period: 'day' | 'week' | 'month'; date?: string; cashRegisterId?: string }
  | { period: 'range'; dateFrom: string; dateTo: string; cashRegisterId?: string };

/**
 * Transporte de los endpoints nuevos de reporte operativo por turno
 * (`/api/v1/cash/shifts/{id}/sales-report`, `/cash/reports/current`,
 * `/cash/reports/period`, `/cash/active-orders`) — mismo patrón de
 * `CashService` (Promise + `firstValueFrom`), módulo propio porque estos
 * endpoints son consumidos únicamente por el panel de administración
 * (`admin-dashboard.component.ts`), no por el módulo de caja real.
 */
@Injectable({ providedIn: 'root' })
export class ShiftReportsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/cash`;

  /** Reporte de UN turno puntual (US1/US4/US5) -- vivo o snapshot. */
  getShiftSalesReport(shiftId: string): Promise<ShiftSalesReport> {
    return firstValueFrom(
      this.http.get<ShiftSalesReport>(`${this.baseUrl}/shifts/${shiftId}/sales-report`),
    );
  }

  /** Reporte agregado del/de los turno(s) actualmente abiertos (US4, FR-012). */
  getCurrentShiftReport(cashRegisterId?: string): Promise<PeriodSalesReport> {
    const params: Record<string, string> = {};
    if (cashRegisterId) params['cash_register_id'] = cashRegisterId;
    return firstValueFrom(
      this.http.get<PeriodSalesReport>(`${this.baseUrl}/reports/current`, { params }),
    );
  }

  /** Reporte agregado por día/semana/mes/rango (US2, FR-005/FR-006/FR-017). */
  getPeriodReport(params: PeriodReportParams): Promise<PeriodSalesReport> {
    const query: Record<string, string> = { period: params.period };
    if (params.period === 'range') {
      query['date_from'] = params.dateFrom;
      query['date_to'] = params.dateTo;
    } else if (params.date) {
      query['date'] = params.date;
    }
    if (params.cashRegisterId) query['cash_register_id'] = params.cashRegisterId;
    return firstValueFrom(
      this.http.get<PeriodSalesReport>(`${this.baseUrl}/reports/period`, { params: query }),
    );
  }

  /** Pedidos activos que bloquearían cualquier intento de cierre (US3/US4). */
  listActiveOrders(): Promise<ActiveOrderSummary[]> {
    return firstValueFrom(this.http.get<ActiveOrderSummary[]>(`${this.baseUrl}/active-orders`));
  }
}
