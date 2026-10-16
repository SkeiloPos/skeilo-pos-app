import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { CashSessionStore, mapVentasPorMetodo } from './cash-session.store';
import { CashService } from './cash.service';
import { AuthService } from '../../../core/services/auth.service';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import {
  CashMovement,
  CashShift,
  CatalogDenomination,
  Reconciliation,
  SalesByMethod,
  ShiftReport,
} from '../interfaces/cash.interface';
import { ActiveOrderSummary } from '../../dashboard/interfaces/shift-reports.interface';

/** Catálogo COP por defecto del negocio (spec 121, FR-009): 6 billetes y 5 monedas. */
const CATALOGO: CatalogDenomination[] = [
  { denomination: '100000.00', kind: 'billete' },
  { denomination: '50000.00', kind: 'billete' },
  { denomination: '20000.00', kind: 'billete' },
  { denomination: '10000.00', kind: 'billete' },
  { denomination: '5000.00', kind: 'billete' },
  { denomination: '2000.00', kind: 'billete' },
  { denomination: '1000.00', kind: 'moneda' },
  { denomination: '500.00', kind: 'moneda' },
  { denomination: '200.00', kind: 'moneda' },
  { denomination: '100.00', kind: 'moneda' },
  { denomination: '50.00', kind: 'moneda' },
];

function recon(sales: SalesByMethod[]): Reconciliation {
  return {
    cash_shift_id: 's1',
    status: 'open',
    opening_amount: '50000',
    ventas_efectivo: '17500',
    ventas_tarjeta: '0',
    ventas_transferencia: '4000',
    cambio_entregado: '0',
    sales_by_method: sales,
    ingresos: '0',
    egresos: '0',
    retiros: '0',
    expected: '67500',
  };
}

describe('mapVentasPorMetodo', () => {
  it('convierte los importes que llegan como string', () => {
    const ventas = mapVentasPorMetodo(
      recon([
        {
          method_id: 'pm1',
          method_name: 'Efectivo',
          method_type: 'cash',
          total: '17500',
          count: 3,
        },
      ]),
    );

    expect(ventas).toEqual([
      { id: 'pm1', name: 'Efectivo', type: 'cash', total: 17500, count: 3 },
    ]);
  });

  it('conserva los métodos sin ventas que manda el backend', () => {
    // Es el caso reportado: la tarjeta existía pero no aparecía en el arqueo.
    const ventas = mapVentasPorMetodo(
      recon([
        { method_id: 'pm1', method_name: 'Efectivo', method_type: 'cash', total: '17500', count: 3 },
        { method_id: 'pm2', method_name: 'Tarjeta', method_type: 'card', total: '0', count: 0 },
      ]),
    );

    expect(ventas.map((v) => v.name)).toEqual(['Efectivo', 'Tarjeta']);
    expect(ventas[1].total).toBe(0);
    expect(ventas[1].count).toBe(0);
  });

  it('respeta el orden del backend, con el efectivo primero', () => {
    const ventas = mapVentasPorMetodo(
      recon([
        { method_id: 'pm1', method_name: 'Efectivo', method_type: 'cash', total: '1', count: 1 },
        { method_id: 'pm3', method_name: 'Nequi', method_type: 'transfer', total: '2', count: 1 },
        { method_id: 'pm2', method_name: 'Tarjeta', method_type: 'card', total: '3', count: 1 },
      ]),
    );

    expect(ventas.map((v) => v.id)).toEqual(['pm1', 'pm3', 'pm2']);
  });

  it('devuelve una lista vacía sin arqueo cargado', () => {
    expect(mapVentasPorMetodo(null)).toEqual([]);
  });
});

describe('CashSessionStore — aperturaDisabled (spec 113, contracts/cash-open-form.md)', () => {
  function crearStore(): CashSessionStore {
    TestBed.configureTestingModule({
      providers: [
        CashSessionStore,
        { provide: CashService, useValue: { registers: signal([]), shift: signal(null) } },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: TenantDatePipe, useValue: { transform: () => '' } },
        { provide: TenantInfoService, useValue: { businessName: () => '' } },
      ],
    });
    return TestBed.inject(CashSessionStore);
  }

  it('caso 1: openingAmount en 0 (valor inicial, sin interacción) -> aperturaDisabled es true', () => {
    const store = crearStore();
    store.selectedRegisterId.set('reg-1');

    expect(store.openingAmount()).toBe(0);
    expect(store.aperturaDisabled()).toBe(true);
  });

  it('caso 2: borrar el campo tras haber tenido otro valor -> aperturaDisabled sigue true', () => {
    const store = crearStore();
    store.selectedRegisterId.set('reg-1');
    store.openingAmount.set(50000);
    expect(store.aperturaDisabled()).toBe(false);

    store.openingAmount.set(0); // simula borrar el campo (ngModelChange normaliza null a 0)

    expect(store.aperturaDisabled()).toBe(true);
  });

  it('caso 3: openingAmount válido con caja seleccionada -> aperturaDisabled es false', () => {
    const store = crearStore();
    store.selectedRegisterId.set('reg-1');

    store.openingAmount.set(50000);

    expect(store.aperturaDisabled()).toBe(false);
  });

  it('caso 5: openingAmount válido sin caja seleccionada -> aperturaDisabled sigue true', () => {
    const store = crearStore();

    store.openingAmount.set(50000);

    expect(store.selectedRegisterId()).toBe('');
    expect(store.aperturaDisabled()).toBe(true);
  });
});

describe('CashSessionStore — cierre bloqueado por pedidos activos (spec 119, FR-007/FR-008)', () => {
  const ORDEN_MESA: ActiveOrderSummary = {
    id: 'o1',
    order_type: 'DINE_IN',
    status: 'abierta',
    dining_table_id: 't1',
    table_number: 4,
    customer_name: null,
    created_at: '2026-10-15T18:00:00',
  };
  const ORDEN_LLEVAR: ActiveOrderSummary = {
    id: 'o2',
    order_type: 'TAKEAWAY',
    status: 'recibida',
    dining_table_id: null,
    table_number: null,
    customer_name: 'Ana',
    created_at: '2026-10-15T18:05:00',
  };

  /** Imita `CashService.extractError`: `detail` string del cuerpo, o el respaldo. */
  const extractError = (err: unknown, fallback: string): string => {
    if (err instanceof HttpErrorResponse) {
      const detail = (err.error as { detail?: unknown } | null)?.detail;
      if (typeof detail === 'string') return detail;
    }
    return fallback;
  };

  async function crear() {
    const reporte = {
      shift: { id: 's1', status: 'closed' } as CashShift,
      reconciliation: recon([]),
      movements: [],
    };
    const api = {
      registers: signal([]),
      shift: signal({ id: 's1', status: 'open' } as CashShift | null),
      closeShift: vi.fn(),
      getReport: vi.fn().mockResolvedValue(reporte),
      getDenominations: vi.fn().mockResolvedValue(CATALOGO),
      extractError,
    };
    TestBed.configureTestingModule({
      providers: [
        CashSessionStore,
        { provide: CashService, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: TenantDatePipe, useValue: { transform: () => '' } },
        { provide: TenantInfoService, useValue: { businessName: () => '' } },
      ],
    });
    const store = TestBed.inject(CashSessionStore);
    // spec 121: las filas salen del catálogo, que se carga antes de contar.
    await store.cargarCatalogo();
    // Efectivo contado + observación: deja `arqueoDisabled()` en false.
    store.setDenom(100000, '1');
    store.arqueoObservacion.set('Sobrante de prueba');
    expect(store.arqueoDisabled()).toBe(false);
    return { store, api, reporte };
  }

  it('un 409 con `active_orders` plano deja la lista bloqueante y el mensaje del backend', async () => {
    const { store, api } = await crear();
    api.closeShift.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: {
          detail: 'No se puede cerrar el turno: hay 2 pedidos activos sin cobrar.',
          active_orders: [ORDEN_MESA, ORDEN_LLEVAR],
        },
      }),
    );

    await store.confirmarArqueoYCerrar();

    expect(store.activeOrdersBlocking()).toEqual([ORDEN_MESA, ORDEN_LLEVAR]);
    expect(store.error()).toBe('No se puede cerrar el turno: hay 2 pedidos activos sin cobrar.');
    expect(store.isSubmitting()).toBe(false);
    expect(store.screen()).toBe('apertura'); // no navega al reporte
    expect(api.getReport).not.toHaveBeenCalled();
  });

  it('un 409 sin `active_orders` (turno ya cerrado) no activa el bloqueo y usa el mensaje genérico o el del backend', async () => {
    const { store, api } = await crear();
    api.closeShift.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { detail: 'El turno ya está cerrado' } }),
    );

    await store.confirmarArqueoYCerrar();

    expect(store.activeOrdersBlocking()).toEqual([]);
    expect(store.error()).toBe('El turno ya está cerrado');
    expect(store.isSubmitting()).toBe(false);
  });

  it('un 500 deja la lista vacía y el mensaje genérico', async () => {
    const { store, api } = await crear();
    api.closeShift.mockRejectedValue(new HttpErrorResponse({ status: 500, error: null }));

    await store.confirmarArqueoYCerrar();

    expect(store.activeOrdersBlocking()).toEqual([]);
    expect(store.error()).toBe('No se pudo cerrar el turno.');
    expect(store.isSubmitting()).toBe(false);
  });

  it('un reintento exitoso tras un bloqueo limpia la lista y pasa a la pantalla de reporte', async () => {
    const { store, api, reporte } = await crear();
    api.closeShift.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 409,
        error: { detail: 'hay pedidos', active_orders: [ORDEN_MESA] },
      }),
    );
    await store.confirmarArqueoYCerrar();
    expect(store.activeOrdersBlocking().length).toBe(1);

    api.closeShift.mockResolvedValueOnce({ id: 's1', status: 'closed' });
    await store.confirmarArqueoYCerrar();

    expect(store.activeOrdersBlocking()).toEqual([]);
    expect(store.error()).toBeNull();
    expect(store.screen()).toBe('report');
    expect(store.report()).toBe(reporte);
  });

  it('cerrar el modal descarta la lista bloqueante', async () => {
    const { store, api } = await crear();
    api.closeShift.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: { detail: 'hay pedidos', active_orders: [ORDEN_MESA] },
      }),
    );
    await store.confirmarArqueoYCerrar();

    store.closeModal();

    expect(store.activeOrdersBlocking()).toEqual([]);
  });
});

describe('CashSessionStore — arqueo desde el catálogo de denominaciones (spec 121, FR-009 a FR-013)', () => {
  /** Imita `CashService.extractError`. */
  const extractError = (err: unknown, fallback: string): string => {
    if (err instanceof HttpErrorResponse) {
      const detail = (err.error as { detail?: unknown } | null)?.detail;
      if (typeof detail === 'string') return detail;
    }
    return fallback;
  };

  function crear(catalogo: () => Promise<CatalogDenomination[]> = () => Promise.resolve(CATALOGO)) {
    const api = {
      registers: signal([]),
      shift: signal({ id: 's1', status: 'open' } as CashShift | null),
      closeShift: vi.fn(),
      getReport: vi.fn().mockResolvedValue({
        shift: { id: 's1', status: 'closed' } as CashShift,
        reconciliation: recon([]),
        movements: [],
        denominations: [],
      }),
      getDenominations: vi.fn(catalogo),
      extractError,
    };
    TestBed.configureTestingModule({
      providers: [
        CashSessionStore,
        { provide: CashService, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: TenantDatePipe, useValue: { transform: () => '' } },
        { provide: TenantInfoService, useValue: { businessName: () => '' } },
      ],
    });
    return { store: TestBed.inject(CashSessionStore), api };
  }

  it('no tiene lista fija: antes de cargar el catálogo no hay filas y el estado es «cargando»', () => {
    const { store } = crear();

    expect(store.denominaciones()).toEqual([]);
    expect(store.catalogoEstado()).toBe('cargando');
    expect(store.arqueoDisabled()).toBe(true);
  });

  it('abrir el arqueo consulta el catálogo cada vez (sin caché entre aperturas)', async () => {
    const { store, api } = crear();

    store.openArqueo();
    await vi.waitFor(() => expect(store.catalogoEstado()).toBe('listo'));
    store.closeModal();
    store.openArqueo();
    await vi.waitFor(() => expect(api.getDenominations).toHaveBeenCalledTimes(2));

    expect(store.modal()).toBe('arqueo');
  });

  it('con el catálogo cargado hay una fila por denominación, con su tipo, de mayor a menor', async () => {
    const { store } = crear();
    await store.cargarCatalogo();

    const filas = store.denominaciones();
    expect(filas.length).toBe(11);
    expect(filas.map((f) => f.value)).toEqual([
      100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50,
    ]);
    expect(filas[0]).toMatchObject({ kind: 'billete', kindLabel: 'Billete' });
    expect(filas[10]).toMatchObject({ kind: 'moneda', kindLabel: 'Moneda' });
    expect(filas.filter((f) => f.kind === 'billete').length).toBe(6);
  });

  it('el total contado es una estimación derivada del catálogo y las cantidades', async () => {
    const { store } = crear();
    await store.cargarCatalogo();

    store.setDenom(100000, '1');
    store.setDenom(10000, '1');
    store.stepDenom(5000, 1);

    expect(store.totalContado()).toBe(115000);
    expect(store.contadoIngresado()).toBe(true);
  });

  it('mientras el catálogo carga, el arqueo no se puede confirmar', async () => {
    let resolver!: (c: CatalogDenomination[]) => void;
    const { store } = crear(() => new Promise((r) => (resolver = r)));

    const carga = store.cargarCatalogo();
    expect(store.catalogoEstado()).toBe('cargando');
    expect(store.arqueoDisabled()).toBe(true);

    resolver(CATALOGO);
    await carga;
    expect(store.catalogoEstado()).toBe('listo');
  });

  it('si el catálogo falla: estado «error», arqueo bloqueado y NINGUNA petición de cierre', async () => {
    const { store, api } = crear(() => Promise.reject(new HttpErrorResponse({ status: 500 })));
    await store.cargarCatalogo();

    expect(store.catalogoEstado()).toBe('error');
    expect(store.catalogoError()).toBe(true);
    expect(store.denominaciones()).toEqual([]);
    expect(store.arqueoDisabled()).toBe(true);

    await store.confirmarArqueoYCerrar();
    expect(api.closeShift).not.toHaveBeenCalled();
  });

  it('un catálogo vacío se trata como error: arqueo bloqueado y sin lista de respaldo', async () => {
    const { store, api } = crear(() => Promise.resolve([]));
    await store.cargarCatalogo();

    expect(store.catalogoEstado()).toBe('listo');
    expect(store.catalogoError()).toBe(true);
    expect(store.arqueoDisabled()).toBe(true);
    await store.confirmarArqueoYCerrar();
    expect(api.closeShift).not.toHaveBeenCalled();
  });

  it('«Reintentar» recupera el catálogo tras un fallo', async () => {
    const { store, api } = crear();
    api.getDenominations.mockRejectedValueOnce(new HttpErrorResponse({ status: 503 }));
    await store.cargarCatalogo();
    expect(store.catalogoError()).toBe(true);

    await store.reintentarCatalogo();

    expect(store.catalogoEstado()).toBe('listo');
    expect(store.catalogoError()).toBe(false);
    expect(store.denominaciones().length).toBe(11);
  });

  it('descarta la respuesta de una consulta superada por otra más reciente', async () => {
    const resolvers: Array<(c: CatalogDenomination[]) => void> = [];
    const { store } = crear(() => new Promise((r) => resolvers.push(r)));

    const primera = store.cargarCatalogo();
    const segunda = store.cargarCatalogo();
    resolvers[1]([{ denomination: '1000.00', kind: 'moneda' }]);
    await segunda;
    resolvers[0](CATALOGO); // llega tarde: no debe pisar a la más reciente
    await primera;

    expect(store.denominaciones().map((d) => d.value)).toEqual([1000]);
  });

  it('con todas las cantidades en cero el arqueo sigue deshabilitado (US3-7)', async () => {
    const { store } = crear();
    await store.cargarCatalogo();

    expect(store.contadoIngresado()).toBe(false);
    expect(store.arqueoDisabled()).toBe(true);

    store.setDenom(100000, '0');
    expect(store.arqueoDisabled()).toBe(true);

    store.setDenom(100000, '1');
    store.arqueoObservacion.set('nota');
    expect(store.arqueoDisabled()).toBe(false);
  });

  it('la petición de cierre lleva solo las líneas con cantidad > 0 y NO envía counted_amount (D-1)', async () => {
    const { store, api } = crear();
    api.closeShift.mockResolvedValue({ id: 's1', status: 'closed' });
    await store.cargarCatalogo();
    store.setDenom(100000, '1');
    store.setDenom(50000, '0');
    store.setDenom(10000, '1');
    store.setDenom(5000, '1');
    store.arqueoObservacion.set('  Faltan $5.000  ');

    await store.confirmarArqueoYCerrar();

    expect(api.closeShift).toHaveBeenCalledTimes(1);
    const [shiftId, payload] = api.closeShift.mock.calls[0];
    expect(shiftId).toBe('s1');
    expect(payload).toEqual({
      denominations: [
        { denomination: 100000, quantity: 1 },
        { denomination: 10000, quantity: 1 },
        { denomination: 5000, quantity: 1 },
      ],
      close_note: 'Faltan $5.000',
    });
    expect('counted_amount' in payload).toBe(false);
  });

  it('un 422 de denominación deja el modal abierto, conserva las cantidades y muestra el mensaje del servidor (US3-4)', async () => {
    const { store, api } = crear();
    api.closeShift.mockRejectedValue(
      new HttpErrorResponse({
        status: 422,
        error: { detail: 'La denominación $3.000 no está registrada para este negocio.' },
      }),
    );
    store.openArqueo();
    await vi.waitFor(() => expect(store.catalogoEstado()).toBe('listo'));
    store.setDenom(100000, '2');
    store.arqueoObservacion.set('nota');

    await store.confirmarArqueoYCerrar();

    expect(store.modal()).toBe('arqueo');
    expect(store.denomCounts()[100000]).toBe('2');
    expect(store.arqueoObservacion()).toBe('nota');
    expect(store.error()).toBe('La denominación $3.000 no está registrada para este negocio.');
    expect(store.isSubmitting()).toBe(false);
  });

  it('un 422 por observación faltante deja el modal abierto y permite escribirla (US3-8)', async () => {
    const { store, api } = crear();
    api.closeShift.mockRejectedValue(
      new HttpErrorResponse({
        status: 422,
        error: { detail: 'El arqueo no cuadra: la observación (close_note) es obligatoria' },
      }),
    );
    store.openArqueo();
    await vi.waitFor(() => expect(store.catalogoEstado()).toBe('listo'));
    // Estimación en $0 de diferencia (esperado 0 en este doble): no exige observación localmente.
    store.setDenom(100000, '1');
    store.arqueoObservacion.set('x');

    await store.confirmarArqueoYCerrar();

    expect(store.modal()).toBe('arqueo');
    expect(store.error()).toContain('observación');
    store.arqueoObservacion.set('Explicación del faltante');
    expect(store.arqueoObservacion()).toBe('Explicación del faltante');
  });

  it('un cierre exitoso cierra el modal y lleva al reporte', async () => {
    const { store, api } = crear();
    api.closeShift.mockResolvedValue({ id: 's1', status: 'closed' });
    store.openArqueo();
    await vi.waitFor(() => expect(store.catalogoEstado()).toBe('listo'));
    store.setDenom(100000, '1');
    store.arqueoObservacion.set('nota');

    await store.confirmarArqueoYCerrar();

    expect(store.modal()).toBeNull();
    expect(store.screen()).toBe('report');
  });
});

describe('CashSessionStore — «Desglose del conteo» del reporte (spec 121, FR-020 a FR-022)', () => {
  function crear() {
    const api = {
      registers: signal([]),
      shift: signal(null as CashShift | null),
    };
    TestBed.configureTestingModule({
      providers: [
        CashSessionStore,
        { provide: CashService, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: TenantDatePipe, useValue: { transform: () => '' } },
        { provide: TenantInfoService, useValue: { businessName: () => '' } },
      ],
    });
    return { store: TestBed.inject(CashSessionStore), api };
  }

  function reporte(denominations: ShiftReport['denominations'], shift: Partial<CashShift> = {}): ShiftReport {
    return {
      shift: { id: 's1', status: 'closed', ...shift } as CashShift,
      reconciliation: recon([]),
      movements: [],
      denominations,
    };
  }

  const LINEAS: ShiftReport['denominations'] = [
    { denomination: '100000.00', kind: 'billete', quantity: 1, subtotal: '100000.00' },
    { denomination: '10000.00', kind: 'billete', quantity: 1, subtotal: '10000.00' },
    { denomination: '500.00', kind: 'moneda', quantity: 3, subtotal: '1500.00' },
  ];

  it('desgloseView formatea las filas con el tipo como «Billete»/«Moneda»', () => {
    const { store } = crear();
    store.report.set(reporte(LINEAS));

    const filas = store.desgloseView();
    expect(filas.length).toBe(3);
    expect(filas[0]).toEqual({
      denominacionFmt: store.fmt(100000),
      tipoLabel: 'Billete',
      cantidad: 1,
      subtotalFmt: store.fmt(100000),
    });
    expect(filas[2]).toEqual({
      denominacionFmt: store.fmt(500),
      tipoLabel: 'Moneda',
      cantidad: 3,
      subtotalFmt: store.fmt(1500),
    });
  });

  it('desgloseTotal es la suma de los subtotales de las líneas', () => {
    const { store } = crear();
    store.report.set(reporte(LINEAS));

    expect(store.desgloseTotal()).toBe(111500);
  });

  it('sinDesglose es true sin líneas (o sin reporte) y false con líneas', () => {
    const { store } = crear();
    expect(store.sinDesglose()).toBe(true);

    store.report.set(reporte([]));
    expect(store.sinDesglose()).toBe(true);
    expect(store.desgloseView()).toEqual([]);
    expect(store.desgloseTotal()).toBe(0);

    store.report.set(reporte(LINEAS));
    expect(store.sinDesglose()).toBe(false);
  });

  it('contadoPor devuelve quien cerró, o null en un turno histórico (no se infiere de la apertura)', () => {
    const { store, api } = crear();
    expect(store.contadoPor()).toBeNull();

    api.shift.set({ id: 's1', user_name: 'Ana', closed_by_user_name: 'Luis' } as CashShift);
    expect(store.contadoPor()).toBe('Luis');

    api.shift.set({ id: 's2', user_name: 'Ana', closed_by_user_name: null } as CashShift);
    expect(store.contadoPor()).toBeNull();

    api.shift.set({ id: 's3', user_name: 'Ana' } as CashShift);
    expect(store.contadoPor()).toBeNull();
  });
});

describe('CashSessionStore — fechas y horas en 12 horas y zona horaria del negocio', () => {
  /** Store con el `TenantDatePipe` REAL y la zona horaria del tenant configurable. */
  function crear(timezone: string | null = 'America/Bogota') {
    const api = {
      registers: signal([]),
      shift: signal(null as CashShift | null),
    };
    TestBed.configureTestingModule({
      providers: [
        CashSessionStore,
        TenantDatePipe,
        { provide: CashService, useValue: api },
        { provide: AuthService, useValue: { currentUser: () => null } },
        {
          provide: TenantInfoService,
          useValue: { businessName: () => '', info: () => (timezone ? { timezone } : null) },
        },
      ],
    });
    return { store: TestBed.inject(CashSessionStore), api };
  }

  // 22:49 UTC = 05:49 p. m. en Bogotá (UTC-5) y 06:49 p. m. en Nueva York (UTC-4, octubre).
  const APERTURA_UTC = '2026-10-15T22:49:20+00:00';
  // 01:05 UTC del 16/10 = 08:05 p. m. del 15/10 en Bogotá: cruza el día respecto de UTC.
  const CIERRE_UTC = '2026-10-16T01:05:00+00:00';

  it('formatDate (historial de cierres) usa 12 horas con AM/PM y la fecha del negocio', () => {
    const { store } = crear();

    expect(store.formatDate(CIERRE_UTC)).toBe('15/10/2026 08:05 PM');
    expect(store.formatDate(APERTURA_UTC)).toBe('15/10/2026 05:49 PM');
  });

  it('el reporte del cierre: aperturaFmt y cierreFmt en 12 horas', () => {
    const { store, api } = crear();
    api.shift.set({ id: 's1', opened_at: APERTURA_UTC, closed_at: CIERRE_UTC } as CashShift);

    expect(store.aperturaFmt()).toBe('15/10/2026 05:49 PM');
    expect(store.cierreFmt()).toBe('15/10/2026 08:05 PM');
  });

  it('la hora de los movimientos del reporte va en 12 horas (mañana = AM, tarde = PM)', () => {
    const { store } = crear();
    const mov = (id: string, occurred_at: string) =>
      ({ id, cash_shift_id: 's1', kind: 'ingreso', amount: '1000', occurred_at }) as CashMovement;
    store.movements.set([
      mov('m1', '2026-10-15T14:05:00+00:00'), // 09:05 a. m. Bogotá
      mov('m2', '2026-10-15T17:30:00+00:00'), // 12:30 p. m. Bogotá
      mov('m3', '2026-10-15T05:00:00+00:00'), // 12:00 a. m. Bogotá (medianoche)
    ]);

    expect(store.movimientosView().map((m) => m.hora)).toEqual(['09:05 AM', '12:30 PM', '12:00 AM']);
  });

  it('respeta la zona horaria del tenant, no la del navegador ni UTC', () => {
    const bogota = crear('America/Bogota');
    expect(bogota.store.formatDate(APERTURA_UTC)).toBe('15/10/2026 05:49 PM');
    TestBed.resetTestingModule();

    const nuevaYork = crear('America/New_York');
    expect(nuevaYork.store.formatDate(APERTURA_UTC)).toBe('15/10/2026 06:49 PM');
    TestBed.resetTestingModule();

    const utc = crear('UTC');
    expect(utc.store.formatDate(CIERRE_UTC)).toBe('16/10/2026 01:05 AM');
  });

  it('sin la información del tenant cargada usa la zona de respaldo (Bogotá)', () => {
    const { store } = crear(null);

    expect(store.formatDate(APERTURA_UTC)).toBe('15/10/2026 05:49 PM');
  });

  it('un valor ausente se muestra como «—»', () => {
    const { store } = crear();

    expect(store.formatDate(null)).toBe('—');
    expect(store.formatDate(undefined)).toBe('—');
    expect(store.aperturaFmt()).toBe('—');
    expect(store.cierreFmt()).toBe('—');
  });
});
