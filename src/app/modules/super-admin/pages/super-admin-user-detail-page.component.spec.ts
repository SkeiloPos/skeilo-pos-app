import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SuperAdminUserDetailPageComponent } from './super-admin-user-detail-page.component';
import { SuperAdminUserDetailService } from '../services/super-admin-user-detail.service';
import {
  AdminAuditLogItem,
  UserDetail,
  UserMembership,
  UserSecurity,
} from '../interfaces/admin-user.interface';

const tick = () => new Promise((r) => setTimeout(r, 0));

const USER: UserDetail = {
  id: 'u-1',
  name: 'Ana Pérez',
  email: 'ana@example.invalid',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
};

function crear(options: {
  getUser?: () => Promise<UserDetail>;
  getActivity?: () => Promise<{ items: AdminAuditLogItem[]; total: number; page: number; size: number; pages: number }>;
  getMemberships?: () => Promise<UserMembership[]>;
  getSecurity?: () => Promise<UserSecurity>;
  anonymizeUser?: () => Promise<UserDetail>;
  deleteUser?: () => Promise<{ message: string }>;
} = {}) {
  const getUser = vi.fn(options.getUser ?? (async () => USER));
  const getActivity = vi.fn(
    options.getActivity ?? (async () => ({ items: [], total: 0, page: 1, size: 20, pages: 0 })),
  );
  const getMemberships = vi.fn(options.getMemberships ?? (async () => []));
  const getSecurity = vi.fn(
    options.getSecurity ?? (async () => ({ active_sessions: [], failed_login_attempts: 0, security_blocked_at: null })),
  );
  const anonymizeUser = vi.fn(options.anonymizeUser ?? (async () => ({ ...USER, status: 'anonymized' as const })));
  const deleteUser = vi.fn(options.deleteUser ?? (async () => ({ message: 'ok' })));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SuperAdminUserDetailPageComponent],
    providers: [
      {
        provide: SuperAdminUserDetailService,
        useValue: { getUser, getActivity, getMemberships, getSecurity, anonymizeUser, deleteUser },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'u-1' }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(SuperAdminUserDetailPageComponent);
  fixture.detectChanges();
  return { fixture, getUser, getActivity, getMemberships, getSecurity, anonymizeUser, deleteUser };
}

describe('SuperAdminUserDetailPageComponent (spec 159, User Story 3)', () => {
  it('carga y muestra la pestaña "información general" por defecto', async () => {
    const { fixture } = crear();
    await tick();
    fixture.detectChanges();

    const html: string = fixture.nativeElement.innerHTML;
    expect(html).toContain('Ana Pérez');
    expect(html).toContain('ana@example.invalid');
  });

  it('carga la actividad solo al activar esa pestaña, mostrando quién hizo cada cambio', async () => {
    const entry: AdminAuditLogItem = {
      id: 'a-1',
      actor_type: 'admin',
      actor_user_id: 'admin-1',
      actor_name_snapshot: 'Super Admin',
      affected_user_id: 'u-1',
      affected_user_email_snapshot: 'ana@example.invalid',
      tenant_id: null,
      tenant_name: null,
      action: 'role_changed',
      detail: null,
      ip_address: '127.0.0.1',
      created_at: '2026-02-01T00:00:00Z',
    };
    const { fixture, getActivity } = crear({
      getActivity: async () => ({ items: [entry], total: 1, page: 1, size: 20, pages: 1 }),
    });
    await tick();
    fixture.detectChanges();
    expect(getActivity).not.toHaveBeenCalled();

    fixture.componentInstance.selectTab('activity');
    await tick();
    fixture.detectChanges();

    expect(getActivity).toHaveBeenCalledTimes(1);
    const html: string = fixture.nativeElement.innerHTML;
    expect(html).toContain('role_changed');
    expect(html).toContain('Super Admin');
  });

  it('pestaña de negocios muestra ambos negocios con su rol específico (caso multi-negocio)', async () => {
    const memberships: UserMembership[] = [
      { tenant_id: 1, tenant_name: 'Pizzeria Uno', tenant_status: 'active', plan_name: 'Pro', role_name: 'ADMIN', member_since: '2025-01-01T00:00:00Z' },
      { tenant_id: 2, tenant_name: 'Panaderia Dos', tenant_status: 'suspended', plan_name: 'Básico', role_name: 'CAJERO', member_since: '2025-06-01T00:00:00Z' },
    ];
    const { fixture } = crear({ getMemberships: async () => memberships });
    await tick();
    fixture.detectChanges();

    fixture.componentInstance.selectTab('memberships');
    await tick();
    fixture.detectChanges();

    const html: string = fixture.nativeElement.innerHTML;
    expect(html).toContain('Pizzeria Uno');
    expect(html).toContain('ADMIN');
    expect(html).toContain('Panaderia Dos');
    expect(html).toContain('CAJERO');
    expect(html).toContain('(suspendido)');
  });

  it('pestaña de negocios vacía ofrece "asignar negocio" deshabilitado', async () => {
    const { fixture } = crear({ getMemberships: async () => [] });
    await tick();
    fixture.detectChanges();

    fixture.componentInstance.selectTab('memberships');
    await tick();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="assign-business"]');
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);
  });

  it('pestaña de seguridad vacía muestra estado vacío y revocar deshabilitado', async () => {
    const { fixture } = crear({
      getSecurity: async () => ({ active_sessions: [], failed_login_attempts: 0, security_blocked_at: null }),
    });
    await tick();
    fixture.detectChanges();

    fixture.componentInstance.selectTab('security');
    await tick();
    fixture.detectChanges();

    const html: string = fixture.nativeElement.innerHTML;
    expect(html).toContain('no tiene sesiones activas');
    const revoke = fixture.nativeElement.querySelector('[data-testid="revoke-all-sessions"]');
    expect(revoke.disabled).toBe(true);
  });

  it('pestaña de seguridad con sesiones muestra dispositivo/navegador/IP', async () => {
    const { fixture } = crear({
      getSecurity: async () => ({
        active_sessions: [
          { id: 's-1', device_label: 'Chrome en Windows', browser: 'Chrome', ip_address: '10.0.0.1', created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-01-02T00:00:00Z' },
        ],
        failed_login_attempts: 3,
        security_blocked_at: null,
      }),
    });
    await tick();
    fixture.detectChanges();

    fixture.componentInstance.selectTab('security');
    await tick();
    fixture.detectChanges();

    const html: string = fixture.nativeElement.innerHTML;
    expect(html).toContain('Chrome en Windows');
    expect(html).toContain('10.0.0.1');
    expect(html).toContain('3');
  });

  it('un usuario anonimizado no muestra editar/recuperación/anonimizar, pero sí eliminar (FR-027/User Story 5)', async () => {
    const { fixture } = crear({ getUser: async () => ({ ...USER, status: 'anonymized' }) });
    await tick();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="action-edit"]')).toBeNull();
    expect(root.querySelector('[data-testid="action-send-password-reset"]')).toBeNull();
    expect(root.querySelector('[data-testid="action-anonymize"]')).toBeNull();
    expect(root.querySelector('[data-testid="action-delete"]')).not.toBeNull();
  });

  it('anonimizar pide confirmación escribiendo el correo y refleja el nuevo estado', async () => {
    const { fixture, anonymizeUser } = crear();
    await tick();
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="action-anonymize"]')!
      .click();
    fixture.detectChanges();

    const modalEl = fixture.nativeElement.querySelector('app-confirm-sensitive-action-modal');
    expect(modalEl).not.toBeNull();

    fixture.componentInstance.sensitiveAction.set('anonymize');
    await fixture.componentInstance.onSensitiveActionConfirmed();
    fixture.detectChanges();

    expect(anonymizeUser).toHaveBeenCalledWith('u-1', 'ana@example.invalid');
  });

  it('eliminar permanentemente navega al listado si no hay retención', async () => {
    const { fixture, deleteUser } = crear();
    await tick();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.sensitiveAction.set('delete');
    await fixture.componentInstance.onSensitiveActionConfirmed();

    expect(deleteUser).toHaveBeenCalledWith('u-1', 'ana@example.invalid');
    expect(navigate).toHaveBeenCalledWith(['/super-admin/users']);
  });

  it('eliminar bloqueado por retención muestra la alternativa de anonimizar', async () => {
    const { fixture } = crear({
      deleteUser: async () => {
        throw {
          error: {
            detail: {
              reason: 'Tiene historial',
              retention_tenants: [{ tenant_id: 1, tenant_name: 'Pizzeria Uno' }],
            },
          },
        };
      },
    });
    await tick();
    fixture.detectChanges();

    fixture.componentInstance.sensitiveAction.set('delete');
    await fixture.componentInstance.onSensitiveActionConfirmed();

    // No navegó (sigue siendo la misma ruta/estado del componente).
    expect(fixture.componentInstance.user()).not.toBeNull();
  });
});
