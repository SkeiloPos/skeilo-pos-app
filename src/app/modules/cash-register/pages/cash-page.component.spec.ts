import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CashPageComponent } from './cash-page.component';
import { CashSessionStore } from '../services/cash-session.store';
import { Indicadores } from '../interfaces/cash-session.interface';

describe('CashPageComponent — ícono de duración del turno (spec 082)', () => {
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
      // Usados por CashPageComponent
      isAdmin: signal(false),
      screen: signal<'overview' | 'open' | 'dashboard' | 'history' | 'report'>('dashboard'),
      backToOverview: vi.fn(),
      cajaLabel: signal(''),
      turnoDuracion: signal('01:00:00'),
      cajero: signal('Ana'),
      loading: signal(false),
      modal: signal<string | null>(null),
      init: vi.fn(),
      stop: vi.fn(),
      // Usados por CashDashboardComponent (hijo cuando screen === 'dashboard')
      efectivoEsperado: signal(0),
      error: signal<string | null>(null),
      fmt: (n: number) => `$ ${n}`,
      num: (n: number | null | undefined) => n ?? 0,
      indicadores: signal(indicadoresVacios),
      movimientosView: signal<Array<Record<string, unknown>>>([]),
      openArqueo: vi.fn(),
      openMovimiento: vi.fn(),
      setVista: vi.fn(),
      shift: signal<{ opening_amount: number } | null>(null),
      sinMovimientos: signal(true),
      tagClass: () => '',
      vista: signal<'tabla' | 'timeline'>('tabla'),
    };
    TestBed.overrideComponent(CashPageComponent, {
      set: { providers: [{ provide: CashSessionStore, useValue: fakeStore }] },
    });
    TestBed.configureTestingModule({ imports: [CashPageComponent] });
    const fixture = TestBed.createComponent(CashPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ya no renderiza el reloj como SVG artesanal', () => {
    const el = crear();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el ícono de duración del turno con el nuevo componente', () => {
    const el = crear();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toContain('schedule');
  });
});
