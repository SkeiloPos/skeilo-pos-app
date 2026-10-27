import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PendingInvitationsListComponent } from './pending-invitations-list.component';
import { InvitationsService } from '../services/invitations.service';
import { PendingInvitation } from '../interfaces/user-profile.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';

describe('PendingInvitationsListComponent — nombre (spec 091, A-100)', () => {
  function render(items: Partial<PendingInvitation>[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PendingInvitationsListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(InvitationsService);
    service.pendingInvitations.set(
      items.map((i, n) => ({
        id: `${n}`, email: `p${n}@x.co`, role_name: 'CASHIER', sent_at: '2026-10-02T10:00:00', name: null, ...i,
      })),
    );
    service.pendingTotal.set(items.length);
    const fixture = TestBed.createComponent(PendingInvitationsListComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const titulos = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-testid="invitation-title"]')).map((e) => e.textContent?.trim());
  const subtitulos = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-testid="invitation-email"]')).map((e) => e.textContent?.trim());

  it('con nombre lo muestra como título y el correo debajo', () => {
    const el = render([{ name: 'María Pérez', email: 'maria@x.co' }]);
    expect(titulos(el)).toEqual(['María Pérez']);
    expect(subtitulos(el)).toEqual(['maria@x.co']);
  });

  it('con name === null muestra solo el correo', () => {
    const el = render([{ name: null, email: 'vieja@x.co' }]);
    expect(titulos(el)).toEqual(['vieja@x.co']);
    expect(subtitulos(el)).toEqual([]);
  });

  it("muestra O'Brien-Díaz idéntico", () => {
    const el = render([{ name: "O'Brien-Díaz" }]);
    expect(titulos(el)).toEqual(["O'Brien-Díaz"]);
  });

  it('un nombre largo no desborda: título con truncate y contenedor min-w-0', () => {
    const el = render([{ name: 'a'.repeat(100) }]);
    const title = el.querySelector('[data-testid="invitation-title"]') as HTMLElement;
    expect(title.className).toContain('truncate');
    expect((title.parentElement as HTMLElement).className).toContain('min-w-0');
  });
});

// spec 138 (A-148, SC-005): «Enviada el…» con offset `+00:00` se muestra en la zona del negocio. Antes el valor llegaba sin
// offset y el navegador lo leía como hora local (5 h de error en Bogotá).
describe('PendingInvitationsListComponent — «Enviada el» en la zona del negocio (spec 138)', () => {
  function enviadaEl(timezone: string, sentAt: string): string {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PendingInvitationsListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(TenantInfoService).hydrate({
      id: 1, name: 'Heladería', host: 'h.skeilopos.com', logo_url: null, receipt_message: null, timezone,
    });
    const service = TestBed.inject(InvitationsService);
    service.pendingInvitations.set([
      { id: 'i1', email: 'p@x.co', role_name: 'CASHIER', sent_at: sentAt, name: null } as PendingInvitation,
    ]);
    service.pendingTotal.set(1);
    const fixture = TestBed.createComponent(PendingInvitationsListComponent);
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  // 2026-10-02T21:06Z = 16:06 Bogotá · 15:06 Ciudad de México · 06:06 del 03/10 Tokio
  const INSTANTE = '2026-10-02T21:06:00+00:00';

  it('Bogotá: Enviada el 02/10/2026 16:06', () => {
    expect(enviadaEl('America/Bogota', INSTANTE)).toContain('Enviada el 02/10/2026 16:06');
  });

  it('Ciudad de México: 02/10/2026 15:06', () => {
    expect(enviadaEl('America/Mexico_City', INSTANTE)).toContain('Enviada el 02/10/2026 15:06');
  });

  it('Tokio: ya es el 03/10/2026 a las 06:06', () => {
    expect(enviadaEl('Asia/Tokyo', INSTANTE)).toContain('Enviada el 03/10/2026 06:06');
  });
});

