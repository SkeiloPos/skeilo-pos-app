import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { ShiftReportsService } from './shift-reports.service';
import { PeriodSalesReport, ShiftSalesReport } from '../interfaces/shift-reports.interface';

const base = `${environment.apiBaseUrl}/cash`;

function shiftReport(partial: Partial<ShiftSalesReport> = {}): ShiftSalesReport {
  return {
    shift_id: 's1',
    cash_register_id: 'r1',
    cash_register_name: 'Caja 1',
    status: 'open',
    is_live: true,
    opened_at: '2026-10-12T22:00:00Z',
    total_sales: '0.00',
    order_count: 0,
    avg_ticket: '0.00',
    top_products: [],
    categories: [],
    ...partial,
  };
}

function periodReport(partial: Partial<PeriodSalesReport> = {}): PeriodSalesReport {
  return {
    period: 'day',
    date_from: '2026-10-13',
    date_to: '2026-10-13',
    shift_ids: [],
    is_live: false,
    total_sales: '0.00',
    order_count: 0,
    avg_ticket: '0.00',
    top_products: [],
    categories: [],
    ...partial,
  };
}

describe('ShiftReportsService (spec 119)', () => {
  let service: ShiftReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ShiftReportsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShiftReportsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getShiftSalesReport pide GET /cash/shifts/{id}/sales-report', async () => {
    const p = service.getShiftSalesReport('s1');
    const req = http.expectOne(`${base}/shifts/s1/sales-report`);
    expect(req.request.method).toBe('GET');
    req.flush(shiftReport());
    expect((await p).shift_id).toBe('s1');
  });

  it('getCurrentShiftReport sin caja no manda cash_register_id', async () => {
    const p = service.getCurrentShiftReport();
    const req = http.expectOne((r) => r.url === `${base}/reports/current`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('cash_register_id')).toBe(false);
    req.flush(periodReport({ period: 'current_shift' }));
    expect((await p).period).toBe('current_shift');
  });

  it('getCurrentShiftReport con caja manda cash_register_id', async () => {
    const p = service.getCurrentShiftReport('r1');
    const req = http.expectOne((r) => r.url === `${base}/reports/current`);
    expect(req.request.params.get('cash_register_id')).toBe('r1');
    req.flush(periodReport({ period: 'current_shift', cash_register_id: 'r1' }));
    await p;
  });

  it('getPeriodReport("day") manda period y, si se pasa, date/cash_register_id', async () => {
    const p = service.getPeriodReport({ period: 'day', date: '2026-10-13', cashRegisterId: 'r1' });
    const req = http.expectOne((r) => r.url === `${base}/reports/period`);
    expect(req.request.params.get('period')).toBe('day');
    expect(req.request.params.get('date')).toBe('2026-10-13');
    expect(req.request.params.get('cash_register_id')).toBe('r1');
    expect(req.request.params.has('date_from')).toBe(false);
    req.flush(periodReport());
    await p;
  });

  it('getPeriodReport("range") manda date_from/date_to, no date', async () => {
    const p = service.getPeriodReport({
      period: 'range', dateFrom: '2026-10-01', dateTo: '2026-10-07',
    });
    const req = http.expectOne((r) => r.url === `${base}/reports/period`);
    expect(req.request.params.get('period')).toBe('range');
    expect(req.request.params.get('date_from')).toBe('2026-10-01');
    expect(req.request.params.get('date_to')).toBe('2026-10-07');
    expect(req.request.params.has('date')).toBe(false);
    req.flush(periodReport({ period: 'range', date_from: '2026-10-01', date_to: '2026-10-07' }));
    await p;
  });

  it('listActiveOrders pide GET /cash/active-orders', async () => {
    const p = service.listActiveOrders();
    const req = http.expectOne(`${base}/active-orders`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'o1', order_type: 'DINE_IN', status: 'abierta',
        dining_table_id: 't1', table_number: 4, customer_name: null,
        created_at: '2026-10-13T01:40:00Z',
      },
    ]);
    expect((await p)[0].table_number).toBe(4);
  });
});
