import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CashSessionStore, mapVentasPorMetodo } from './cash-session.store';
import { CashService } from './cash.service';
import { AuthService } from '../../../core/services/auth.service';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { Reconciliation, SalesByMethod } from '../interfaces/cash.interface';

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
