import { TestBed } from '@angular/core/testing';
import { UserRole } from '../../../core/interfaces/user.interface';
import { AdminUserFormComponent } from './admin-user-form.component';
import { SuperAdminUsersService } from '../services/super-admin-users.service';
import { TenantService } from '../services/tenant.service';
import { AdminUser } from '../interfaces/admin-user.interface';
import { FULL_NAME_MESSAGES } from '../../../shared/validators/full-name.validator';

describe('AdminUserFormComponent — nombre completo (spec 091, Historia 6)', () => {
  let createUser: ReturnType<typeof vi.fn>;
  let updateUser: ReturnType<typeof vi.fn>;

  function crear(user: AdminUser | null = null) {
    createUser = vi.fn(async () => undefined);
    updateUser = vi.fn(async () => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AdminUserFormComponent],
      providers: [
        {
          provide: SuperAdminUsersService,
          useValue: { createUser, updateUser, error: Object.assign(() => null, { set: () => undefined }), isSubmitting: () => false },
        },
        { provide: TenantService, useValue: { tenants: () => [], loadTenants: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserFormComponent);
    fixture.componentInstance.user = user;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    return fixture;
  }

  const base = { email: 'ana@acme.co', password: 'Clave123', role: UserRole.ADMIN, tenant_id: 1 };
  const sinNombre: AdminUser = {
    id: 'u1', email: 'ana@acme.co', name: null, role: UserRole.ADMIN, tenant_id: 1, active: true, created_at: '',
  };

  // ── Crear: obligatorio ───────────────────────────────────────────────────

  const invalidos: [string, string][] = [
    ['', FULL_NAME_MESSAGES.required],
    ['   ', FULL_NAME_MESSAGES.required],
    ['A', FULL_NAME_MESSAGES.length],
    ['a'.repeat(101), FULL_NAME_MESSAGES.length],
    ['Ana3', FULL_NAME_MESSAGES.format],
  ];

  for (const [nombre, mensaje] of invalidos) {
    it(`al crear bloquea el envío con ${JSON.stringify(nombre.slice(0, 8))} y muestra "${mensaje}"`, async () => {
      const fixture = crear();
      fixture.componentInstance.form.patchValue({ ...base, name: nombre });

      await fixture.componentInstance.onSubmit();
      fixture.detectChanges();

      expect(createUser).not.toHaveBeenCalled();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(mensaje);
    });
  }

  it('al crear con nombre válido lo envía recortado', async () => {
    const fixture = crear();
    fixture.componentInstance.form.patchValue({ ...base, name: '  María Pérez ' });

    await fixture.componentInstance.onSubmit();

    expect(createUser).toHaveBeenCalledOnce();
    expect(createUser.mock.calls[0][0].name).toBe('María Pérez');
  });

  // ── Editar: opcional pero válido si se escribe ───────────────────────────

  it('al editar un usuario sin nombre propio, guardar sin tocar el nombre no se bloquea', async () => {
    const fixture = crear(sinNombre);

    await fixture.componentInstance.onSubmit();

    expect(updateUser).toHaveBeenCalledOnce();
    expect(updateUser.mock.calls[0][1].name).toBe('');
  });

  it('al editar, un nombre escrito inválido sí bloquea y uno válido se envía recortado', async () => {
    const fixture = crear(sinNombre);

    fixture.componentInstance.form.patchValue({ name: 'Ana3' });
    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    expect(updateUser).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(FULL_NAME_MESSAGES.format);

    fixture.componentInstance.form.patchValue({ name: ' Ana Gómez ' });
    await fixture.componentInstance.onSubmit();
    expect(updateUser).toHaveBeenCalledOnce();
    expect(updateUser.mock.calls[0][1].name).toBe('Ana Gómez');
  });
});
