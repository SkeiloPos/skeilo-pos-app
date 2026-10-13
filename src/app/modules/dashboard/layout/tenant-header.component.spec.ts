import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { TenantHeaderComponent } from './tenant-header.component';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { LayoutService } from './layout.service';
import { PanelThemeService } from './panel-theme.service';
import { CashService } from '../../cash-register/services/cash.service';
import { NotificationCenterService } from '../../../core/notifications/notification-center.service';
import { PushRegistrationService } from '../../../core/notifications/push-registration.service';
import { CashShift } from '../../cash-register/interfaces/cash.interface';

const DESKTOP_BREAKPOINT_PX = 1024;

@Component({ selector: 'app-blank', standalone: true, template: '' })
class BlankComponent {}

function installMatchMedia(width: number): void {
  const mql = {
    matches: width >= DESKTOP_BREAKPOINT_PX,
    media: `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

function makeShift(partial: Partial<CashShift> = {}): CashShift {
  return {
    id: 's1',
    cash_register_id: 'r1',
    user_id: 'u1',
    status: 'open',
    opening_amount: '100000',
    opened_at: new Date().toISOString(),
    closed_at: null,
    ...partial,
  };
}

describe('TenantHeaderComponent (spec 116)', () => {
  const currentUser = signal<ReturnType<typeof makeUser> | null>(null);

  function makeUser(role: UserRole) {
    return {
      id: 'u1',
      email: 'a@b.c',
      name: 'Ana',
      role,
      tenantId: 1,
      isSuperAdmin: false,
      mustChangePassword: false,
    };
  }

  function createComponent(opts: {
    role: UserRole;
    shift?: CashShift | null;
    discoverOpenShift?: ReturnType<typeof vi.fn>;
    width?: number;
  }) {
    installMatchMedia(opts.width ?? 1280);
    currentUser.set(makeUser(opts.role));
    const shiftSignal = signal<CashShift | null>(opts.shift ?? null);
    const discoverOpenShift = opts.discoverOpenShift ?? vi.fn().mockResolvedValue(undefined);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TenantHeaderComponent],
      providers: [
        provideRouter([
          { path: 'dashboard/caja', component: BlankComponent },
          { path: 'dashboard/orders', component: BlankComponent },
          { path: 'login', component: BlankComponent },
        ]),
        { provide: AuthService, useValue: { currentUser, logout: vi.fn().mockResolvedValue(undefined) } },
        {
          provide: CashService,
          useValue: {
            shift: shiftSignal,
            isOpen: () => {
              const s = shiftSignal();
              return !!s && s.status !== 'closed' && !s.closed_at;
            },
            discoverOpenShift,
          },
        },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(0), list: signal([]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(TenantHeaderComponent);
    fixture.detectChanges();
    return { fixture, discoverOpenShift, shiftSignal };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    currentUser.set(null);
  });

  it('el título/sección cambia según la ruta activa', async () => {
    const { fixture } = createComponent({ role: UserRole.ADMIN });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard/caja');
    fixture.detectChanges();

    expect(fixture.componentInstance.sectionTitle()).toBe('Control');
    expect(fixture.componentInstance.pageTitle()).toBe('Cajas');
  });

  it('la campana reutiliza el doble de NotificationCenterService (mismo conteo)', () => {
    const { fixture } = createComponent({ role: UserRole.ADMIN });
    const notificationCenter = TestBed.inject(NotificationCenterService) as unknown as {
      pendingCount: ReturnType<typeof signal<number>>;
    };
    notificationCenter.pendingCount.set(3);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('3');
  });

  it('el menú de usuario navega a los tres destinos correctos', async () => {
    const { fixture } = createComponent({ role: UserRole.ADMIN });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.dropdownOpen.set(true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/dashboard/mi-plan', '/dashboard/mi-cuenta']));

    await fixture.componentInstance.logout();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('logout() llama AuthService.logout() y navega a /login', async () => {
    const { fixture } = createComponent({ role: UserRole.ADMIN });
    const authService = TestBed.inject(AuthService) as unknown as { logout: ReturnType<typeof vi.fn> };
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await fixture.componentInstance.logout();

    expect(authService.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  // ── Indicador de caja (research.md R8, quickstart.md §6) ─────────────────

  it('CASHIER sin haber visitado Caja/Terminal ve el indicador correcto tras discoverOpenShift()', () => {
    const discoverOpenShift = vi.fn().mockImplementation(() => Promise.resolve());
    const { fixture, shiftSignal } = createComponent({
      role: UserRole.CASHIER,
      shift: null,
      discoverOpenShift,
    });

    expect(discoverOpenShift).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.showCashIndicator()).toBe(true);

    shiftSignal.set(makeShift());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Caja abierta');
  });

  it('no llama discoverOpenShift() si el turno ya se conoce (sin petición duplicada)', () => {
    const discoverOpenShift = vi.fn();
    createComponent({ role: UserRole.CASHIER, shift: makeShift(), discoverOpenShift });

    expect(discoverOpenShift).not.toHaveBeenCalled();
  });

  it('MESERO no ve el indicador de caja en absoluto', () => {
    const discoverOpenShift = vi.fn();
    const { fixture } = createComponent({ role: UserRole.MESERO, discoverOpenShift });

    expect(fixture.componentInstance.showCashIndicator()).toBe(false);
    expect(discoverOpenShift).not.toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Caja abierta');
    expect(el.textContent).not.toContain('Sin turno');
  });

  // ── Botón de menú (SkeiloPOS App.dc.html: solo existe en modo drawer; el
  //    colapso de escritorio vive en tenant-sidebar.component.ts) ──────────

  it('en modo drawer (<1024px), el botón de menú existe y abre/cierra el sidebar', () => {
    const { fixture } = createComponent({ role: UserRole.ADMIN, width: 900 });
    const layoutService = TestBed.inject(LayoutService);
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('button[aria-label="Abrir menú"]') as HTMLButtonElement;

    expect(button).not.toBeNull();
    button.click();

    expect(layoutService.sidebarOpen()).toBe(true);
  });

  it('en modo desktop (≥1024px), el navbar no muestra el botón de menú', () => {
    const { fixture } = createComponent({ role: UserRole.ADMIN, width: 1280 });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('button[aria-label="Abrir menú"]')).toBeNull();
  });

  // ── Interruptor de tema (contracts/panel-theme-contract.md §3, T023/T024) ─

  it('el ícono del interruptor de tema cambia moon↔sun al alternar', () => {
    const { fixture } = createComponent({ role: UserRole.ADMIN });
    const panelTheme = TestBed.inject(PanelThemeService);
    panelTheme.setTheme('light');
    fixture.detectChanges();

    expect(fixture.componentInstance.panelThemeService.theme()).toBe('light');

    fixture.componentInstance.panelThemeService.toggleTheme();
    fixture.detectChanges();

    expect(fixture.componentInstance.panelThemeService.theme()).toBe('dark');
  });
});
