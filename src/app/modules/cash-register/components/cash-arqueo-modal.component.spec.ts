import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CashArqueoModalComponent } from './cash-arqueo-modal.component';
import { CashSessionStore } from '../services/cash-session.store';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { ActiveOrderSummary } from '../../dashboard/interfaces/shift-reports.interface';
import { CatalogoEstado, Denomination } from '../interfaces/cash-session.interface';

/** Una fila del arqueo tal como la entrega el store (spec 121: con tipo). */
function fila(value: number, kind: 'billete' | 'moneda'): Denomination {
  return {
    value,
    label: `$ ${value}`,
    kind,
    kindLabel: kind === 'billete' ? 'Billete' : 'Moneda',
    cantidad: 0,
    subtotal: 0,
    subtotalFmt: '$ 0',
  };
}

describe('CashArqueoModalComponent', () => {
  function crear(
    bloqueantes: ActiveOrderSummary[] = [],
    opts: {
      estado?: CatalogoEstado;
      catalogoError?: boolean;
      filas?: Denomination[];
      requiereObservacion?: boolean;
      contadoIngresado?: boolean;
    } = {},
  ) {
    const fakeStore = {
      activeOrdersBlocking: signal<ActiveOrderSummary[]>(bloqueantes),
      arqueoDisabled: signal(opts.catalogoError ?? false),
      arqueoObservacion: signal(''),
      catalogoError: signal(opts.catalogoError ?? false),
      catalogoEstado: signal<CatalogoEstado>(opts.estado ?? 'listo'),
      closeModal: vi.fn(),
      confirmarArqueoYCerrar: vi.fn(),
      contadoIngresado: signal(opts.contadoIngresado ?? false),
      denominaciones: signal<Denomination[]>(
        opts.filas ?? [fila(100000, 'billete'), fila(50000, 'billete'), fila(500, 'moneda')],
      ),
      diferenciaLive: signal(0),
      diffClass: () => '',
      diffLabel: () => '',
      efectivoEsperado: signal(0),
      error: signal<string | null>(null),
      fmt: (n: number) => `$ ${n}`,
      isSubmitting: signal(false),
      reintentarCatalogo: vi.fn(),
      requiereObservacion: signal(opts.requiereObservacion ?? false),
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
    const el = fixture.nativeElement as HTMLElement;
    return Object.assign(el, { fakeStore });
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

describe('CashArqueoModalComponent — catálogo, estimación y observación (spec 121)', () => {
  // `crear` está dentro del describe anterior; se redefine un montaje mínimo aquí.
  function montar(opts: {
    estado?: CatalogoEstado;
    catalogoError?: boolean;
    filas?: Denomination[];
    requiereObservacion?: boolean;
    contadoIngresado?: boolean;
  }) {
    const fakeStore = {
      activeOrdersBlocking: signal<ActiveOrderSummary[]>([]),
      arqueoDisabled: signal(opts.catalogoError ?? false),
      arqueoObservacion: signal(''),
      catalogoError: signal(opts.catalogoError ?? false),
      catalogoEstado: signal<CatalogoEstado>(opts.estado ?? 'listo'),
      closeModal: vi.fn(),
      confirmarArqueoYCerrar: vi.fn(),
      contadoIngresado: signal(opts.contadoIngresado ?? false),
      denominaciones: signal<Denomination[]>(
        opts.filas ?? [fila(100000, 'billete'), fila(50000, 'billete'), fila(500, 'moneda')],
      ),
      diferenciaLive: signal(-5000),
      diffClass: () => '',
      diffLabel: () => 'Faltante',
      efectivoEsperado: signal(115000),
      error: signal<string | null>(null),
      fmt: (n: number) => `$ ${n}`,
      isSubmitting: signal(false),
      reintentarCatalogo: vi.fn(),
      requiereObservacion: signal(opts.requiereObservacion ?? false),
      setDenom: vi.fn(),
      stepDenom: vi.fn(),
      totalContado: signal(110000),
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
    return { el: fixture.nativeElement as HTMLElement, fakeStore, fixture };
  }

  it('renderiza una fila por denominación del catálogo, con su tipo', () => {
    const { el } = montar({});

    const textos = Array.from(el.querySelectorAll('.grid > div')).map((d) => d.textContent ?? '');
    expect(textos.length).toBe(3);
    expect(textos[0]).toContain('$ 100000');
    expect(textos[0]).toContain('Billete');
    expect(textos[2]).toContain('$ 500');
    expect(textos[2]).toContain('Moneda');
  });

  it('no hay lista fija: sin filas del store no se renderiza ninguna', () => {
    const { el } = montar({ filas: [] });
    expect(el.querySelectorAll('.grid > div').length).toBe(0);
  });

  it('rotula el total y la diferencia como «(estimado)» y explica que el servidor calcula los oficiales', () => {
    const { el } = montar({ contadoIngresado: true });

    expect(el.textContent).toContain('Total contado (estimado)');
    expect(el.textContent).toContain('Diferencia (estimado)');
    expect(el.textContent).toContain('el servidor suma el conteo');
  });

  it('la observación está SIEMPRE visible; opcional cuando no hay diferencia (FR-025)', () => {
    const { el } = montar({ requiereObservacion: false });

    expect(el.querySelector('textarea')).toBeTruthy();
    expect(el.textContent).toContain('Observación (opcional)');
    expect(el.textContent).not.toContain('requerida por diferencia');
  });

  it('la observación sigue visible y pasa a «requerida por diferencia» cuando hay diferencia', () => {
    const { el } = montar({ requiereObservacion: true, contadoIngresado: true });

    expect(el.querySelector('textarea')).toBeTruthy();
    expect(el.textContent).toContain('Observación (requerida por diferencia)');
  });

  it('mientras el catálogo carga muestra «Cargando denominaciones…» y no la rejilla', () => {
    const { el } = montar({ estado: 'cargando', filas: [] });

    expect(el.textContent).toContain('Cargando denominaciones…');
    expect(el.querySelectorAll('.grid > div').length).toBe(0);
  });

  it('con error del catálogo muestra el mensaje y «Reintentar», sin rejilla y con confirmar deshabilitado', () => {
    const { el, fakeStore } = montar({ estado: 'error', catalogoError: true, filas: [] });

    expect(el.textContent).toContain('No se pudieron cargar las denominaciones');
    expect(el.querySelectorAll('.grid > div').length).toBe(0);
    const reintentar = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Reintentar',
    );
    expect(reintentar).toBeTruthy();
    reintentar!.click();
    expect(fakeStore.reintentarCatalogo).toHaveBeenCalledTimes(1);

    const confirmar = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar arqueo'),
    ) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
  });

  it('un catálogo vacío (estado «listo» con error) también ofrece «Reintentar»', () => {
    const { el } = montar({ estado: 'listo', catalogoError: true, filas: [] });
    expect(
      Array.from(el.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Reintentar'),
    ).toBe(true);
  });
});
