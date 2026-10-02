import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UserRole } from '../../../core/interfaces/user.interface';
import { SuperAdminUsersPageComponent } from './super-admin-users-page.component';
import { SuperAdminUsersService } from '../services/super-admin-users.service';
import { TenantService } from '../services/tenant.service';
import { AdminUser } from '../interfaces/admin-user.interface';

describe('SuperAdminUsersPageComponent — nombre y avatar (spec 091, Historia 6)', () => {
  function render(users: Partial<AdminUser>[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SuperAdminUsersPageComponent],
      providers: [
        {
          provide: SuperAdminUsersService,
          useValue: {
            users: signal(
              users.map((u, n) => ({
                id: `${n}`, email: `u${n}@acme.co`, name: null, role: UserRole.ADMIN,
                tenant_id: 1, active: true, created_at: '', ...u,
              })),
            ),
            loading: signal(false),
            error: signal(null),
            loadUsers: () => undefined,
          },
        },
        { provide: TenantService, useValue: { tenants: signal([]), loadTenants: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(SuperAdminUsersPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const col = (el: HTMLElement, id: string) =>
    Array.from(el.querySelectorAll(`[data-testid="${id}"]`)).map((e) => e.textContent?.trim());

  it('muestra nombre e inicial cuando hay nombre propio', () => {
    const el = render([{ name: 'María Pérez', email: 'maria@acme.co' }]);
    expect(col(el, 'user-title')).toEqual(['María Pérez']);
    expect(col(el, 'user-avatar')).toEqual(['M']);
  });

  it('muestra el correo y su inicial si no hay nombre propio (vacío, nulo o igual al correo)', () => {
    const el = render([
      { id: '1', name: null, email: 'ana@acme.co' },
      { id: '2', name: '', email: 'beto@acme.co' },
      { id: '3', name: 'carla@acme.co', email: 'carla@acme.co' },
    ]);
    expect(col(el, 'user-title')).toEqual(['ana@acme.co', 'beto@acme.co', 'carla@acme.co']);
    expect(col(el, 'user-avatar')).toEqual(['A', 'B', 'C']);
  });

  it('el título trunca y el contenedor tiene min-w-0 (100 caracteres no rompen la fila)', () => {
    const el = render([{ name: 'a'.repeat(100) }]);
    const title = el.querySelector('[data-testid="user-title"]') as HTMLElement;
    expect(title.className).toContain('truncate');
    expect((title.parentElement as HTMLElement).className).toContain('min-w-0');
  });
});
