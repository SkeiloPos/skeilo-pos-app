import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { HeaderComponent } from './header.component';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationCenterService } from '../../../core/notifications/notification-center.service';
import { PushRegistrationService } from '../../../core/notifications/push-registration.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { NotificationItem } from '../../../core/notifications/notification.model';
import { UserRole } from '../../../core/interfaces/user.interface';

describe('HeaderComponent — íconos estandarizados (spec 082)', () => {
  function crear() {
    const currentUser = signal({
      id: 'u1',
      email: 'a@b.c',
      name: 'Ana',
      role: UserRole.ADMIN,
      tenantId: 1,
      isSuperAdmin: false,
      mustChangePassword: false,
    });
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser } },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(0), list: signal([]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('el menú hamburguesa y la campana de notificaciones ya no son SVG artesanales', () => {
    const fixture = crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['menu', 'notifications']));
  });

  it('el menú desplegable de usuario (chevron, mi plan, cambiar contraseña, cerrar sesión) usa el nuevo componente', () => {
    const fixture = crear();
    fixture.componentInstance.dropdownOpen.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(
      expect.arrayContaining(['expand_more', 'layers', 'settings', 'logout']),
    );
  });
});

// spec 138 (FR-008): la hora de cada notificación sale en la zona del NEGOCIO, no en la del navegador.
describe('HeaderComponent — hora de las notificaciones en la zona del negocio (spec 138)', () => {
  // 2026-10-25T23:30Z = 18:30 Bogotá · 17:30 Ciudad de México · 08:30 del 26/10 Tokio
  const NOTIFICACION: NotificationItem = {
    id: 'n1',
    event_type: 'payment.completed',
    related_entity_type: 'sale',
    related_entity_id: 's1',
    payload: {},
    created_at: '2026-10-25T23:30:00+00:00',
    attended_at: null,
    attended_by_user_id: null,
  };

  function horaMostrada(timezone: string): string {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: signal({
              id: 'u1', email: 'a@b.c', name: 'Ana', role: UserRole.ADMIN, tenantId: 1,
              isSuperAdmin: false, mustChangePassword: false,
            }),
          },
        },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(1), list: signal([NOTIFICACION]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
        { provide: TenantInfoService, useValue: { info: () => ({ timezone }) } },
      ],
    });
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.componentInstance.notificationsOpen.set(true);
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).querySelector('li p.text-xs')?.textContent ?? '').trim();
  }

  it('Ciudad de México muestra las 5:30 p. m., no la hora del navegador', () => {
    expect(horaMostrada('America/Mexico_City')).toMatch(/5:30/);
  });

  it('Tokio muestra las 8:30 del día siguiente', () => {
    const texto = horaMostrada('Asia/Tokyo');
    expect(texto).toMatch(/8:30/);
    expect(texto).toMatch(/26/);
  });

  it('Bogotá muestra las 6:30 (sin cambio)', () => {
    expect(horaMostrada('America/Bogota')).toMatch(/6:30/);
  });
});

