import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { AdminDashboardComponent } from './admin-dashboard.component';

describe('AdminDashboardComponent — sin temática de heladería ni SVG artesanal (spec 082)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ninguna tarjeta ni acceso rápido renderiza ya el cono de helado (🍦) ni ningún otro emoji funcional', () => {
    const el = crear();
    for (const emoji of ['🍦', '👥', '📋', '💰', '🍽️', '🧾', '🪑']) {
      expect(el.textContent).not.toContain(emoji);
    }
  });

  it('el acceso rápido de productos (/dashboard/products) usa específicamente el ícono neutro shopping_bag (SC-003)', () => {
    const el = crear();
    const accesos = Array.from(el.querySelectorAll('a[href*="/dashboard/products"]'));
    expect(accesos.length).toBeGreaterThan(0);
    const icon = accesos[0].querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('shopping_bag');
  });

  it('ningún ícono se renderiza ya como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(
      expect.arrayContaining(['group', 'shopping_bag', 'receipt_long', 'payments', 'point_of_sale', 'receipt', 'table_restaurant']),
    );
  });
});

const cashBase = `${environment.apiBaseUrl}/cash`;

function periodReportFixture(overrides: Record<string, unknown> = {}) {
  return {
    period: 'day',
    date_from: '2026-10-15',
    date_to: '2026-10-15',
    cash_register_id: null,
    shift_ids: [],
    is_live: false,
    total_sales: '0.00',
    order_count: 0,
    avg_ticket: '0.00',
    top_products: [],
    categories: [],
    ...overrides,
  };
}

describe('AdminDashboardComponent — reporte operativo por turno (spec 119)', () => {
  let http: HttpTestingController;

  function crear() {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('el selector de período ofrece turno actual/específico/día/semana/mes/rango', () => {
    const { el } = crear();
    const select = el.querySelector('select') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['current_shift', 'shift', 'day', 'week', 'month', 'range']);
  });

  it('la tarjeta "Ingresos hoy" (filtrada por toDateString() del navegador) fue reemplazada', () => {
    const { el } = crear();
    expect(el.textContent).not.toContain('Ingresos hoy');
    expect(el.textContent).toContain('Reporte operativo');
  });

  it('por defecto pide el reporte "del día" vía GET /cash/reports/period?period=day', () => {
    crear();
    const req = http.expectOne((r) => r.url === `${cashBase}/reports/period`);
    expect(req.request.params.get('period')).toBe('day');
    req.flush(periodReportFixture());
  });

  it('cambiar el selector a "Turno actual" pide GET /cash/reports/current', () => {
    const { el } = crear();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());

    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'current_shift';
    select.dispatchEvent(new Event('change'));

    const req = http.expectOne((r) => r.url === `${cashBase}/reports/current`);
    req.flush(periodReportFixture({ period: 'current_shift' }));
  });

  it('cambiar el selector a "Turno específico" monta <app-shift-sales-report-card> y oculta el selector de caja', () => {
    const { fixture, el } = crear();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());

    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'shift';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(el.querySelector('app-shift-sales-report-card')).not.toBeNull();
    // El selector de caja del panel (con la opción "Todas las cajas") se
    // oculta -- el único <select> restante, aparte del de período, es el
    // propio del subcomponente para elegir el turno.
    expect(el.textContent).not.toContain('Todas las cajas');
    expect(el.querySelectorAll('select').length).toBe(2);
  });

  it('seleccionar una caja específica repite la consulta con cash_register_id', async () => {
    const { fixture, el } = crear();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());
    http.expectOne(`${cashBase}/registers`).flush([{ id: 'r1', name: 'Caja 1', active: true }]);
    // Deja correr el microtask del `await` dentro de
    // `CashService.loadRegisters()` antes de re-renderizar: sin esto, la
    // opción <option value="r1"> todavía no existe y asignar `.value='r1'`
    // más abajo no tendría ningún efecto (mismo cuidado que
    // `cash.service.spec.ts`).
    await Promise.resolve().then(() => Promise.resolve());
    fixture.detectChanges();

    const cajaSelect = el.querySelectorAll('select')[1] as HTMLSelectElement;
    cajaSelect.value = 'r1';
    cajaSelect.dispatchEvent(new Event('change'));

    const req = http.expectOne((r) => r.url === `${cashBase}/reports/period`);
    expect(req.request.params.get('cash_register_id')).toBe('r1');
    req.flush(periodReportFixture({ cash_register_id: 'r1' }));
  });

  // spec 119 (T077, FR-014/SC-006): un período/turno sin ventas muestra el estado vacío
  // y las cifras en 0, nunca "NaN" ni "undefined".
  it('un reporte sin ventas muestra el estado vacío y ventas/órdenes/ticket promedio en 0', async () => {
    const { fixture, el } = crear();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();

    expect(el.textContent).toContain('Sin ventas en este período');
    expect(el.textContent).toContain('Sin ventas por categoría en este período');
    expect(el.textContent).not.toContain('NaN');
    expect(el.textContent).not.toContain('undefined');

    const textos = Array.from(el.querySelectorAll('app-stat-tile p')).map((p) => p.textContent?.trim());
    expect(textos).toEqual(['Ventas totales', '$ 0', 'Órdenes', '0', 'Ticket promedio', '$ 0']);
  });
});
