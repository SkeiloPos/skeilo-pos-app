import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CashArqueoModalComponent } from './cash-arqueo-modal.component';
import { CashSessionStore } from '../services/cash-session.store';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { ActiveOrderSummary } from '../../dashboard/interfaces/shift-reports.interface';

describe('CashArqueoModalComponent', () => {
  function crear(bloqueantes: ActiveOrderSummary[] = []) {
    const fakeStore = {
      activeOrdersBlocking: signal<ActiveOrderSummary[]>(bloqueantes),
      arqueoDisabled: signal(false),
      arqueoObservacion: signal(''),
      closeModal: vi.fn(),
      confirmarArqueoYCerrar: vi.fn(),
      contadoIngresado: signal(false),
      denominaciones: signal<Array<{ label: string; value: number; qty: number }>>([]),
      diferenciaLive: signal(0),
      diffClass: signal(''),
      diffLabel: signal(''),
      efectivoEsperado: signal(0),
      error: signal<string | null>(null),
      fmt: (n: number) => `$ ${n}`,
      isSubmitting: signal(false),
      requiereObservacion: signal(false),
      setDenom: vi.fn(),
      stepDenom: vi.fn(),
      totalContado: signal(0),
    };
    TestBed.configureTestingModule({
      imports: [CashArqueoModalComponent],
      providers: [
        provideRouter([]),
        { provide: CashSessionStore, useValue: fakeStore },
        { provide: TenantInfoService, useValue: { info: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(CashArqueoModalComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza el ícono de cerrar como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el botón de cerrar con el nuevo componente de ícono (ligadura "close")', () => {
    const el = crear();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon).toBeTruthy();
    expect(icon!.textContent?.trim()).toBe('close');
  });

  // spec 119 (FR-007/FR-008): el cierre queda bloqueado mientras existan pedidos activos.
  describe('bloqueo de cierre por pedidos activos', () => {
    const PEDIDOS: ActiveOrderSummary[] = [
      {
        id: 'o1',
        order_type: 'DINE_IN',
        status: 'abierta',
        dining_table_id: 't1',
        table_number: 4,
        customer_name: null,
        created_at: '2026-10-15T18:00:00',
      },
      {
        id: 'o2',
        order_type: 'TAKEAWAY',
        status: 'recibida',
        dining_table_id: null,
        table_number: null,
        customer_name: 'Ana',
        created_at: '2026-10-15T18:05:00',
      },
    ];

    it('con 2 pedidos renderiza el conteo, un elemento por pedido y los enlaces al detalle', () => {
      const el = crear(PEDIDOS);

      expect(el.textContent).toContain('hay 2 pedido(s) activo(s)');
      const items = el.querySelectorAll('ul > li');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('Mesa 4');
      expect(items[1].textContent).toContain('Ana');
      const enlaces = Array.from(el.querySelectorAll('ul a')).map((a) => a.getAttribute('href'));
      expect(enlaces).toEqual(['/dashboard/orders/o1', '/dashboard/orders/o2']);
    });

    it('con la lista vacía no renderiza el bloque ámbar', () => {
      const el = crear([]);

      expect(el.textContent).not.toContain('pedido(s) activo(s)');
      expect(el.querySelector('.bg-amber-50')).toBeNull();
      expect(el.querySelectorAll('ul > li').length).toBe(0);
    });
  });
});
