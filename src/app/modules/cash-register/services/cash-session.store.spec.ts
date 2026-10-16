import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { CashSessionStore, mapVentasPorMetodo } from './cash-session.store';
import { CashService } from './cash.service';
import { AuthService } from '../../../core/services/auth.service';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { CashShift, Reconciliation, SalesByMethod } from '../interfaces/cash.interface';
import { ActiveOrderSummary } from '../../dashboard/interfaces/shift-reports.interface';

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

  function crear() {
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
    // Efectivo contado + observación: deja `arqueoDisabled()` en false.
    store.setDenom(100000, '1');
    store.arqueoObservacion.set('Sobrante de prueba');
    expect(store.arqueoDisabled()).toBe(false);
    return { store, api, reporte };
  }

  it('un 409 con `active_orders` plano deja la lista bloqueante y el mensaje del backend', async () => {
    const { store, api } = crear();
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
    const { store, api } = crear();
    api.closeShift.mockRejectedValue(
      new HttpErrorResponse({ status: 409, error: { detail: 'El turno ya está cerrado' } }),
    );

    await store.confirmarArqueoYCerrar();

    expect(store.activeOrdersBlocking()).toEqual([]);
    expect(store.error()).toBe('El turno ya está cerrado');
    expect(store.isSubmitting()).toBe(false);
  });

  it('un 500 deja la lista vacía y el mensaje genérico', async () => {
    const { store, api } = crear();
    api.closeShift.mockRejectedValue(new HttpErrorResponse({ status: 500, error: null }));

    await store.confirmarArqueoYCerrar();

    expect(store.activeOrdersBlocking()).toEqual([]);
    expect(store.error()).toBe('No se pudo cerrar el turno.');
    expect(store.isSubmitting()).toBe(false);
  });

  it('un reintento exitoso tras un bloqueo limpia la lista y pasa a la pantalla de reporte', async () => {
    const { store, api, reporte } = crear();
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
    const { store, api } = crear();
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
