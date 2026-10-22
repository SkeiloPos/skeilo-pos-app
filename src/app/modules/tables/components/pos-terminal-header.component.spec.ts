import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PosTerminalHeaderComponent } from './pos-terminal-header.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { AuthService } from '../../../core/services/auth.service';

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
