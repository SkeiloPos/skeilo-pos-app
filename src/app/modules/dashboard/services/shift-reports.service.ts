import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  ActiveOrderSummary,
  DailySalesPoint,
  PaymentMethodsReport,
  PeriodSalesReport,
  ShiftSalesReport,
} from '../interfaces/shift-reports.interface';

/** Parámetros de `GET /cash/reports/period` (spec 119, contracts/shift-sales-report-api.md). */
export type PeriodReportParams =
  | { period: 'day' | 'week' | 'month'; date?: string; cashRegisterId?: string }
  | { period: 'range'; dateFrom: string; dateTo: string; cashRegisterId?: string };

/** Parámetros de `GET /cash/reports/payment-methods` (spec 122,
 *  contracts/payment-methods-report-api.md) -- mismos 6 tipos de período que
 *  ya usa el reporte operativo. */
export type PaymentMethodsReportParams =
  | { period: 'current_shift'; cashRegisterId?: string }
  | { period: 'shift'; shiftId: string }
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
  private readonly reportsBaseUrl = `${environment.apiBaseUrl}/reports`;

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

  /**
   * Serie diaria de ventas/órdenes de los días más recientes (spec 122,
   * FR-004) -- mismo endpoint ya usado por el módulo de Reportes
   * (`GET /reports/sales`, RF-059), pero una llamada propia con parámetros
   * explícitos por invocación: `ReportsService` (modules/reports/) tiene su
   * propio `period`/`range` global que también gobierna esa pantalla, y
   * mutarlo desde el Dashboard la afectaría (research.md §3).
   */
  getDailySalesTrend(dateFrom: string, dateTo: string): Promise<DailySalesPoint[]> {
    const params = { date_from: dateFrom, date_to: dateTo, group_by: 'day' };
    return firstValueFrom(
      this.http
        .get<{ by_day: DailySalesPoint[] }>(`${this.reportsBaseUrl}/sales`, { params })
        .pipe(map((r) => r.by_day)),
    );
  }

  /** Ingresos por método de pago, con la granularidad que el backend elija
   *  según el período (spec 122, FR-007). */
  getPaymentMethodsReport(params: PaymentMethodsReportParams): Promise<PaymentMethodsReport> {
    const query: Record<string, string> = { period: params.period };
    if (params.period === 'shift') {
      query['shift_id'] = params.shiftId;
    } else if (params.period === 'range') {
      query['date_from'] = params.dateFrom;
      query['date_to'] = params.dateTo;
    } else if (params.period !== 'current_shift' && params.date) {
      query['date'] = params.date;
    }
    if (params.period !== 'shift' && params.cashRegisterId) {
      query['cash_register_id'] = params.cashRegisterId;
    }
    return firstValueFrom(
      this.http.get<PaymentMethodsReport>(`${this.baseUrl}/reports/payment-methods`, { params: query }),
    );
  }
}
