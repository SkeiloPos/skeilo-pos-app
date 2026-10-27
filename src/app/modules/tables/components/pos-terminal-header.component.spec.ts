import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PosTerminalHeaderComponent } from './pos-terminal-header.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { AuthService } from '../../../core/services/auth.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('PosTerminalHeaderComponent — rediseño visual (spec 131)', () => {
  function crear(cashIsOpen: boolean) {
    TestBed.configureTestingModule({
      imports: [PosTerminalHeaderComponent],
      providers: [
        provideRouter([]),
        {
          provide: PosTerminalStore,
          useValue: {
            cashIsOpen: () => cashIsOpen,
            cashShift: () => null,
            realtimeStatus: () => 'connected',
          },
        },
        { provide: AuthService, useValue: { currentUser: () => null } },
        { provide: TenantInfoService, useValue: { timezone: () => 'America/Bogota' } },
      ],
    });
    const fixture = TestBed.createComponent(PosTerminalHeaderComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  // Reescrito para el rediseño visual (spec 131, FR-001): el set de íconos
  // `app-mi-icon` (Material) de esta cabecera se reemplaza por
  // `app-lucide-icon` (SVG estilo lucide, research.md punto 3) — la cabecera
  // sigue exponiendo la misma información (turno/cajero, turno de caja,
  // bloquear terminal), solo cambia el componente de ícono.

  it('renderiza el ícono de turno/cajero y el botón "Turno caja" (caja cerrada)', () => {
    const el = crear(false);
    expect(el.querySelectorAll('app-lucide-icon svg').length).toBeGreaterThanOrEqual(3);
    expect(el.textContent).toContain('Turno caja');
  });

  it('renderiza el ícono de bloquear terminal incluso con caja abierta, y oculta "Turno caja"', () => {
    const el = crear(true);
    expect(el.textContent).toContain('Caja abierta');
    expect(el.textContent).not.toContain('Turno caja');
    expect(el.querySelector('app-lucide-icon svg')).toBeTruthy();
  });
});

describe('PosTerminalHeaderComponent — reloj, fecha y turno en la zona del negocio (spec 138)', () => {
  afterEach(() => vi.useRealTimers());

  /** Texto de la barra con el reloj fijado y la zona del negocio dada (el sistema puede estar en cualquier zona). */
  function barra(timezone: string, ahora: string, usuario: string | null = null): string {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ahora));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosTerminalHeaderComponent],
      providers: [
        provideRouter([]),
        {
          provide: PosTerminalStore,
          useValue: { cashIsOpen: () => false, cashShift: () => null, realtimeStatus: () => 'connected' },
        },
        { provide: AuthService, useValue: { currentUser: () => (usuario ? { name: usuario } : null) } },
        { provide: TenantInfoService, useValue: { timezone: () => timezone } },
      ],
    });
    const fixture = TestBed.createComponent(PosTerminalHeaderComponent);
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  // 2026-10-25T23:30Z = 18:30 Bogotá · 17:30 Ciudad de México · 00:30 del 26/10 Madrid · 08:30 del 26/10 Tokio.
  const INSTANTE = '2026-10-25T23:30:00Z';

  it('Ciudad de México: 05:30 p. m., 25/10/2026 y turno Tarde', () => {
    const texto = barra('America/Mexico_City', INSTANTE, 'Ana');
    expect(texto).toContain('05:30 p. m.');
    expect(texto).toContain('25/10/2026');
    expect(texto).toContain('Turno Tarde: Ana');
  });

  it('Tokio: 08:30 a. m., 26/10/2026 y turno Mañana', () => {
    const texto = barra('Asia/Tokyo', INSTANTE, 'Ana');
    expect(texto).toContain('08:30 a. m.');
    expect(texto).toContain('26/10/2026');
    expect(texto).toContain('Turno Mañana: Ana');
  });

  it('Bogotá: 06:30 p. m. y turno Tarde (sin cambio)', () => {
    const texto = barra('America/Bogota', INSTANTE);
    expect(texto).toContain('06:30 p. m.');
    expect(texto).toContain('Turno Tarde');
  });

  it('Noche: desde las 19:00 locales del negocio', () => {
    // 00:00Z del 26/10 = 19:00 en Bogotá (Noche) pero 18:00 en Ciudad de México (Tarde).
    expect(barra('America/Bogota', '2026-10-26T00:00:00Z')).toContain('Turno Noche');
    expect(barra('America/Mexico_City', '2026-10-26T00:00:00Z')).toContain('Turno Tarde');
  });
});
