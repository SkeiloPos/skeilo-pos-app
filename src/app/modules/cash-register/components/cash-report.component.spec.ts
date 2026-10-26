import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CashReportComponent } from './cash-report.component';
import { CashSessionStore } from '../services/cash-session.store';
import { DesgloseRow, Indicadores } from '../interfaces/cash-session.interface';

const FILAS: DesgloseRow[] = [
  { denominacionFmt: '$ 100.000', tipoLabel: 'Billete', cantidad: 1, subtotalFmt: '$ 100.000' },
  { denominacionFmt: '$ 10.000', tipoLabel: 'Billete', cantidad: 1, subtotalFmt: '$ 10.000' },
  { denominacionFmt: '$ 500', tipoLabel: 'Moneda', cantidad: 3, subtotalFmt: '$ 1.500' },
];

describe('CashReportComponent — ícono de turno cerrado (spec 082)', () => {
  function crear() {
    const indicadoresVacios: Indicadores = {
      ventas: [],
      cambioEntregado: 0,
      ingresos: 0,
      egresos: 0,
      retiros: 0,
      efectivoEsperado: 0,
      countIngresos: 0,
      countEgresos: 0,
      countRetiros: 0,
      ingresosDigitales: 0,
      countIngresosDigitales: 0,
    };
    const fakeStore = {
      aperturaFmt: signal(''),
      backToHistory: vi.fn(),
      cajaLabel: signal(''),
      cajero: signal(''),
      cierreFmt: signal(''),
      contadoPor: signal<string | null>(null),
      desgloseTotal: signal(0),
      desgloseView: signal<DesgloseRow[]>([]),
      diffClass: signal(''),
      diffLabel: signal(''),
      efectivoEsperado: signal(0),
      fmt: (n: number) => `$ ${n}`,
      imprimirReporte: vi.fn(),
      indicadores: signal(indicadoresVacios),
      movimientosView: signal<Array<Record<string, unknown>>>([]),
      num: (n: number | null | undefined) => n ?? 0,
      nuevoTurno: vi.fn(),
      reconciliation: signal(null),
      report: signal(null),
      reportContext: signal<'history' | 'live'>('live'),
      shift: signal(null),
      sinDesglose: signal(true),
      sinMovimientos: signal(true),
      tagClass: () => '',
    };
    TestBed.configureTestingModule({
      imports: [CashReportComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashReportComponent);
    fixture.detectChanges();
    return Object.assign(fixture.nativeElement as HTMLElement, { fakeStore, fixture });
  }

  it('ya no renderiza el candado como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el ícono de "Turno cerrado" con el nuevo componente', () => {
    const el = crear();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('lock');
  });
});

describe('CashReportComponent — «Desglose del conteo» (spec 121, FR-020 a FR-023)', () => {
  function montar(opts: {
    filas?: DesgloseRow[];
    total?: number;
    contadoPor?: string | null;
    contexto?: 'live' | 'history';
  }) {
    const indicadores: Indicadores = {
      ventas: [],
      cambioEntregado: 0,
      ingresos: 0,
      egresos: 0,
      retiros: 0,
      efectivoEsperado: 0,
      countIngresos: 0,
      countEgresos: 0,
      countRetiros: 0,
      ingresosDigitales: 0,
      countIngresosDigitales: 0,
    };
    const filas = opts.filas ?? [];
    const fakeStore = {
      aperturaFmt: signal(''),
      backToHistory: vi.fn(),
      cajaLabel: signal(''),
      cajero: signal(''),
      cierreFmt: signal(''),
      contadoPor: signal<string | null>(opts.contadoPor ?? null),
      desgloseTotal: signal(opts.total ?? 0),
      desgloseView: signal<DesgloseRow[]>(filas),
      diffClass: signal(''),
      diffLabel: signal(''),
      efectivoEsperado: signal(0),
      fmt: (n: number) => `$ ${n}`,
      imprimirReporte: vi.fn(),
      indicadores: signal(indicadores),
      movimientosView: signal<Array<Record<string, unknown>>>([]),
      num: (n: number | null | undefined) => n ?? 0,
      nuevoTurno: vi.fn(),
      reconciliation: signal(null),
      report: signal(null),
      reportContext: signal<'history' | 'live'>(opts.contexto ?? 'live'),
      shift: signal(null),
      sinDesglose: signal(filas.length === 0),
      sinMovimientos: signal(true),
      tagClass: () => '',
    };
    TestBed.configureTestingModule({
      imports: [CashReportComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashReportComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** La tabla del desglose es la que tiene encabezado «Denominación». */
  function tablaDesglose(el: HTMLElement): HTMLTableElement | null {
    return (
      Array.from(el.querySelectorAll('table')).find((t) =>
        t.textContent?.includes('Denominación'),
      ) ?? null
    );
  }

  it('con líneas renderiza la tabla Denominación · Tipo · Cantidad · Subtotal, una fila por línea y la fila «Total»', () => {
    const el = montar({ filas: FILAS, total: 111500 });

    const tabla = tablaDesglose(el)!;
    expect(tabla).toBeTruthy();
    const encabezados = Array.from(tabla.querySelectorAll('thead th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(encabezados).toEqual(['Denominación', 'Tipo', 'Cantidad', 'Subtotal']);
    const filas = Array.from(tabla.querySelectorAll('tbody tr'));
    expect(filas.length).toBe(3);
    expect(filas[0].textContent).toContain('Billete');
    expect(filas[2].textContent).toContain('Moneda');
    const total = tabla.querySelector('tfoot tr')!.textContent!;
    expect(total).toContain('Total');
    expect(total).toContain('$ 111500');
    expect(el.textContent).not.toContain('No se registró desglose');
  });

  it('sin líneas muestra exactamente «No se registró desglose para este turno» y no hay tabla', () => {
    const el = montar({ filas: [] });

    expect(el.textContent).toContain('Desglose del conteo');
    expect(el.textContent).toContain('No se registró desglose para este turno');
    expect(tablaDesglose(el)).toBeNull();
  });

  it('«Contado por: Luis» aparece solo si contadoPor tiene valor', () => {
    const el = montar({ filas: FILAS, total: 111500, contadoPor: 'Luis' });
    expect(el.textContent).toContain('Contado por: Luis');
  });

  it('un turno histórico sin quién cerró no deja rastro de la línea ni un marcador vacío (US5-4)', () => {
    const el = montar({ filas: [], contadoPor: null, contexto: 'history' });

    expect(el.textContent).not.toContain('Contado por');
    expect(el.textContent).not.toContain('null');
    expect(el.textContent).not.toContain('undefined');
  });

  it('la misma sección se renderiza en el reporte inmediato y en el abierto desde el histórico (FR-023)', () => {
    for (const contexto of ['live', 'history'] as const) {
      TestBed.resetTestingModule();
      const el = montar({ filas: FILAS, total: 111500, contadoPor: 'Luis', contexto });
      expect(el.textContent, contexto).toContain('Desglose del conteo');
      expect(tablaDesglose(el), contexto).toBeTruthy();
      expect(el.textContent, contexto).toContain('Contado por: Luis');
    }
  });

  it('la sección va entre «Arqueo de caja» y «Movimientos del turno»', () => {
    const el = montar({ filas: FILAS, total: 111500 });
    const t = el.textContent!;
    const arqueo = t.indexOf('Arqueo de caja');
    const desglose = t.indexOf('Desglose del conteo');
    const movimientos = t.indexOf('Movimientos del turno');
    expect(arqueo).toBeGreaterThan(-1);
    expect(desglose).toBeGreaterThan(arqueo);
    expect(movimientos).toBeGreaterThan(desglose);
  });
});
