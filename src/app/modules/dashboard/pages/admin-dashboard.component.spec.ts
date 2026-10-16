import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserRole } from '../../../core/interfaces/user.interface';

/** Doble liviano de `AuthService`: la real arrastra `PushRegistrationService`
 *  → `SwPush`, que este banco de pruebas no provee (spec 122, FR-001/FR-010). */
function fakeAuthService(user: User | null = {
  id: 'u1',
  name: 'María Pérez',
  email: 'maria@acme.com',
  role: UserRole.ADMIN,
  tenantId: 1,
  isSuperAdmin: false,
  mustChangePassword: false,
}) {
  return { currentUser: signal(user) };
}

describe('AdminDashboardComponent — sin temática de heladería ni SVG artesanal (spec 082)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: AuthService, useValue: fakeAuthService() },
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
    // spec 122: la tarjeta "Órdenes activas" (ícono receipt_long) se retira como
    // tarjeta aparte -- su dato se incorpora a la fila de 4 indicadores (FR-003),
    // que no lleva ícono por celda. Las tarjetas "Usuarios" (ícono group) y
    // "Productos" conservadas se retiraron del Dashboard a pedido del negocio.
    expect(ligaduras).toEqual(
      expect.arrayContaining(['shopping_bag', 'payments', 'point_of_sale', 'receipt', 'table_restaurant']),
    );
  });
});

const cashBase = `${environment.apiBaseUrl}/cash`;
const reportsBase = `${environment.apiBaseUrl}/reports`;

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
        { provide: AuthService, useValue: fakeAuthService() },
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

    // spec 122 (FR-003): fila de 4 indicadores en vez de las 3 app-stat-tile de antes.
    expect(el.textContent).toContain('Ventas');
    expect(el.textContent).toContain('Órdenes');
    expect(el.textContent).toContain('Ticket promedio');
    expect(el.textContent).toContain('Órdenes activas');
  });
});

describe('AdminDashboardComponent — saludo, accesos rápidos e indicadores (spec 122, US1)', () => {
  function crear(user: User | null = null) {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: AuthService, useValue: fakeAuthService(user ?? undefined) },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());
    return { fixture, el: fixture.nativeElement as HTMLElement, http };
  }

  it('el saludo usa el nombre real de currentUser() (FR-001/FR-010)', () => {
    const { el } = crear();
    const h1 = el.querySelector('h1')!.textContent!;
    expect(h1).toContain('María Pérez');
    expect(h1).toMatch(/^Buenos días|^Buenas tardes|^Buenas noches/);
    expect(el.textContent).toContain('Esto es lo que pasa hoy en tu negocio.');
  });

  it('los accesos rápidos aparecen antes de "Reporte operativo" en el documento (FR-002)', () => {
    const { el } = crear();
    const texto = el.textContent ?? '';
    expect(texto.indexOf('Accesos rápidos')).toBeGreaterThanOrEqual(0);
    expect(texto.indexOf('Accesos rápidos')).toBeLessThan(texto.indexOf('Reporte operativo'));
  });

  it('las tarjetas "Usuarios"/"Productos" ya no se muestran (retiradas a pedido del negocio)', () => {
    const { el } = crear();
    expect(el.textContent).not.toContain('Usuarios');
    expect(el.textContent).not.toContain('en el sistema');
  });

  it('las 4 tarjetas de indicadores muestran los valores del período (FR-003)', async () => {
    const { fixture, el } = crear();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('Total del período');
    expect(text).toContain('Por orden');
    expect(text).toContain('En cocina');
  });
});

describe('AdminDashboardComponent — "Más vendidos": alternar cantidad/ingresos (spec 122, US3)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: AuthService, useValue: fakeAuthService() },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(
      periodReportFixture({
        top_products: [
          { product_variant_id: 'p1', name: 'Granizado de mango', units: 10, revenue: '50000.00' },
          { product_variant_id: 'p2', name: 'Té de burbujas', units: 40, revenue: '30000.00' },
        ],
      }),
    );
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('por defecto ordena "Más vendidos" por cantidad', () => {
    const { el } = crear();
    const btnCantidad = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cantidad',
    )!;
    expect(btnCantidad.getAttribute('aria-pressed')).toBe('true');
  });

  it('alternar a "Ingresos" cambia el criterio activo (FR-005)', () => {
    const { fixture, el } = crear();
    const btnIngresos = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Ingresos',
    )!;
    btnIngresos.click();
    fixture.detectChanges();

    expect(btnIngresos.getAttribute('aria-pressed')).toBe('true');
    const btnCantidad = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cantidad',
    )!;
    expect(btnCantidad.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('AdminDashboardComponent — "Estadísticas de ventas": tendencia reciente (spec 122, US2)', () => {
  async function crear(byDay: { day: string; total: string; count: number }[] = [
    { day: '2026-10-14', total: '100000.00', count: 4 },
    { day: '2026-10-15', total: '200000.00', count: 6 },
  ]) {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: AuthService, useValue: fakeAuthService() },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());
    http.expectOne((r) => r.url === `${reportsBase}/sales`).flush({ by_day: byDay });
    // `loadTrend()` resuelve el `firstValueFrom(...)` en un microtask aparte
    // (mismo cuidado que `cash.service.spec.ts`/`CashService.loadRegisters()`).
    await Promise.resolve().then(() => Promise.resolve());
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, http };
  }

  it('muestra el total de "Ventas" por defecto y el gráfico día a día (FR-004)', async () => {
    const { fixture, el } = await crear();
    expect(el.textContent).toContain('Estadísticas de ventas');
    expect(el.textContent).toContain('$ 300.000'); // 100.000 + 200.000
    // El gráfico se dibuja en un <canvas> (Chart.js), sin texto accesible por
    // DOM -- se verifican las etiquetas/valores que recibe, no el render.
    expect(fixture.componentInstance.trendLabels()).toEqual(['14/10', '15/10']);
    expect(fixture.componentInstance.trendValues()).toEqual([100000, 200000]);
  });

  it('alternar a "Órdenes" cambia el total grande sin afectar el período del reporte operativo (FR-004)', async () => {
    const { fixture, el } = await crear();
    const periodoAntes = (el.querySelector('select') as HTMLSelectElement).value;

    const btnOrdenes = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Órdenes',
    )!;
    btnOrdenes.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('10'); // 4 + 6 órdenes
    expect((el.querySelector('select') as HTMLSelectElement).value).toBe(periodoAntes);
  });

  it('una ventana sin ventas muestra el gráfico vacío, sin inventar barras', async () => {
    const { el } = await crear([]);
    expect(el.textContent).toContain('Sin ventas en los días más recientes');
  });
});

describe('AdminDashboardComponent — "Ingresos por método de pago" (spec 122, US4)', () => {
  const pmBase = `${cashBase}/reports/payment-methods`;

  async function crear(rows: { bucket_start: string; payment_method_id: string; payment_method_name: string; amount: string }[] = [
    { bucket_start: '2026-10-15T10:00:00Z', payment_method_id: 'm1', payment_method_name: 'Efectivo', amount: '6000' },
    { bucket_start: '2026-10-15T10:00:00Z', payment_method_id: 'm2', payment_method_name: 'Nequi', amount: '4000' },
  ]) {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: AuthService, useValue: fakeAuthService() },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());
    http.expectOne((r) => r.url === `${reportsBase}/sales`).flush({ by_day: [] });
    http.expectOne((r) => r.url === pmBase).flush({ bucket_unit: 'hour', rows });
    await Promise.resolve().then(() => Promise.resolve());
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, http };
  }

  it('muestra un chip y un total por método, con el porcentaje de participación (FR-007)', async () => {
    const { el } = await crear();
    expect(el.textContent).toContain('Ingresos por método de pago');
    expect(el.textContent).toContain('Efectivo');
    expect(el.textContent).toContain('Nequi');
    expect(el.textContent).toContain('$ 6.000');
    expect(el.textContent).toContain('$ 4.000');
    expect(el.textContent).toContain('60%'); // 6.000 / 10.000
    expect(el.textContent).toContain('40%');
  });

  it('desactivar un chip lo quita del total y de la serie del gráfico, sin mover el % de los demás (FR-007)', async () => {
    const { fixture, el } = await crear();
    const chipEfectivo = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Efectivo',
    )!;
    chipEfectivo.click();
    fixture.detectChanges();

    expect(chipEfectivo.getAttribute('aria-pressed')).toBe('false');
    expect(fixture.componentInstance.pmVisibleSeries().map((s) => s.name)).toEqual(['Nequi']);
    expect(fixture.componentInstance.pmVisibleTotals().map((t) => t.name)).toEqual(['Nequi']);
    // El % de Nequi sigue siendo 40% (contra el total de TODOS los métodos), no 100%.
    expect(fixture.componentInstance.pmVisibleTotals()[0].share).toBe(40);
  });

  it('el subtítulo refleja la granularidad que mandó el backend (FR-007)', async () => {
    const { el } = await crear([
      { bucket_start: '2026-10-15T00:00:00Z', payment_method_id: 'm1', payment_method_name: 'Efectivo', amount: '1000' },
    ]);
    // bucket_unit='hour' en el fixture por defecto -> "Comparación por hora".
    expect(el.textContent).toContain('Comparación por hora');
  });

  it('un período sin pagos muestra el estado vacío de la sección, sin bloquear el resto del Dashboard', async () => {
    const { el } = await crear([]);
    expect(el.textContent).toContain('Sin ingresos en este período');
    // El resto del Dashboard se renderizó con normalidad.
    expect(el.textContent).toContain('Reporte operativo');
  });
});

describe('AdminDashboardComponent — "Stock bajo" (spec 122, US5)', () => {
  const lowStockBase = `${environment.apiBaseUrl}/inventory/items/low-stock`;

  async function crear(items: { id: string; name: string; current_stock: string; min_stock: string }[]) {
    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: AuthService, useValue: fakeAuthService() },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${cashBase}/reports/period`).flush(periodReportFixture());
    http.expectOne((r) => r.url === `${reportsBase}/sales`).flush({ by_day: [] });
    http.expectOne((r) => r.url === `${cashBase}/reports/payment-methods`).flush({ bucket_unit: 'hour', rows: [] });
    http.expectOne((r) => r.url === lowStockBase).flush(items);
    await Promise.resolve().then(() => Promise.resolve());
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement };
  }

  it('lista los insumos bajo mínimo, con su cantidad restante (FR-008)', async () => {
    const { el } = await crear([
      { id: 'i1', name: 'Leche de coco', current_stock: '2', min_stock: '5' },
      { id: 'i2', name: 'Vasos 16 oz', current_stock: '0', min_stock: '20' },
    ]);
    expect(el.textContent).toContain('Stock bajo');
    expect(el.textContent).toContain('Leche de coco');
    expect(el.textContent).toContain('2 restante(s)');
    expect(el.textContent).toContain('Vasos 16 oz');
    expect(el.textContent).toContain('0 restante(s)');
  });

  it('"Ver inventario" enlaza al módulo de Inventario (FR-008)', async () => {
    const { el } = await crear([{ id: 'i1', name: 'Leche de coco', current_stock: '2', min_stock: '5' }]);
    const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Ver inventario');
    expect(link?.getAttribute('href')).toBe('/dashboard/inventario');
  });

  it('sin insumos bajo mínimo, la sección no se muestra (sin lista vacía confusa)', async () => {
    const { el } = await crear([]);
    expect(el.textContent).not.toContain('Stock bajo');
  });
});
