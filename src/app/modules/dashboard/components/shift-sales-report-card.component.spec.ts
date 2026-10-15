import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ShiftSalesReportCardComponent } from './shift-sales-report-card.component';
import { CashService } from '../../cash-register/services/cash.service';
import { ShiftReportsService } from '../services/shift-reports.service';
import { ShiftSummary } from '../../cash-register/interfaces/cash.interface';
import { ShiftSalesReport } from '../interfaces/shift-reports.interface';

// spec 119 (T077, FR-014/SC-006): turno sin ventas -> estado vacío claro, sin "NaN".
describe('ShiftSalesReportCardComponent — turno sin ventas (spec 119, US5)', () => {
  const TURNO: ShiftSummary = {
    id: 's1',
    cash_register_id: 'r1',
    register_name: 'Caja 1',
    opening_amount: '50000',
    opened_at: '2026-10-14T22:00:00',
    closed_at: '2026-10-14T22:05:00',
    status: 'closed',
    expected: '50000',
  };

  const REPORTE_VACIO: ShiftSalesReport = {
    shift_id: 's1',
    cash_register_id: 'r1',
    cash_register_name: 'Caja 1',
    status: 'closed',
    is_live: false,
    opened_at: '2026-10-14T22:00:00',
    closed_at: '2026-10-14T22:05:00',
    total_sales: '0.00',
    order_count: 0,
    avg_ticket: '0.00',
    top_products: [],
    categories: [],
    active_orders_count: null,
  };

  async function crear() {
    TestBed.configureTestingModule({
      imports: [ShiftSalesReportCardComponent],
      providers: [
        {
          provide: CashService,
          useValue: { listShifts: vi.fn().mockResolvedValue({ items: [TURNO] }) },
        },
        {
          provide: ShiftReportsService,
          useValue: { getShiftSalesReport: vi.fn().mockResolvedValue(REPORTE_VACIO) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ShiftSalesReportCardComponent);
    fixture.detectChanges();
    // `ngOnInit` es async y sin zone.js no hay `whenStable` que lo espere.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el estado vacío de productos y categorías con su texto', async () => {
    const el = await crear();

    expect(el.textContent).toContain('Este turno no registró ventas');
    expect(el.textContent).toContain('Sin ventas por categoría en este turno');
  });

  it('muestra ventas, órdenes y ticket promedio en 0, sin "NaN" ni "undefined"', async () => {
    const el = await crear();

    const textos = Array.from(el.querySelectorAll('app-stat-tile p')).map((p) => p.textContent?.trim());
    expect(textos).toEqual(['Ventas totales', '$ 0', 'Órdenes', '0', 'Ticket promedio', '$ 0']);
    expect(el.textContent).not.toContain('NaN');
    expect(el.textContent).not.toContain('undefined');
  });
});
