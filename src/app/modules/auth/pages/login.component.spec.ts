import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';

type Ctx = 'SUPER_ADMIN' | 'TENANT' | 'UNRECOGNIZED';

describe('LoginComponent', () => {
  let login: ReturnType<typeof vi.fn>;
  let user: Record<string, unknown> | null;

  function crear(ctx: Ctx = 'TENANT') {
    login = vi.fn(async () => ({}));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login, currentUser: () => user } },
        // Evita "TenantContextService read before initialization" (necesita
        // provideTenantInitializer() al arranque real) — mismo patrón que
        // sidebar.component.spec.ts.
        {
          provide: TenantContextService,
          useValue: {
            isSuperAdmin: () => ctx === 'SUPER_ADMIN',
            isTenant: () => ctx === 'TENANT',
            isUnrecognized: () => ctx === 'UNRECOGNIZED',
            tenantSlug: () => (ctx === 'TENANT' ? 'acme' : null),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    user = null;
  });

  it('el spinner de carga ya no es un SVG artesanal (spec 082)', () => {
    const fixture = crear();
    fixture.componentInstance.isLoading.set(true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const boton = el.querySelector('button[type="submit"]')!;
    const icon = boton.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('autorenew');
  });

  it('el ícono del spinner conserva la animación de giro', () => {
    const fixture = crear();
    fixture.componentInstance.isLoading.set(true);
    fixture.detectChanges();
    const boton = (fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]')!;
    const host = boton.querySelector('app-mi-icon');
    expect(host?.className).toContain('animate-spin');
  });

  // ── spec 091 (A-99) ─────────────────────────────────────────────────────

  it('en la plataforma muestra la insignia "Acceso Super Admin" y el formulario', () => {
    const el = crear('SUPER_ADMIN').nativeElement as HTMLElement;
    expect(el.textContent).toContain('Acceso Super Admin');
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('en un negocio muestra el slug y el formulario', () => {
    const el = crear('TENANT').nativeElement as HTMLElement;
    expect(el.textContent).toContain('acme');
    expect(el.textContent).not.toContain('Acceso Super Admin');
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('tras el login de un Super Admin en la plataforma navega al panel, no a /dashboard/admin', async () => {
    const fixture = crear('SUPER_ADMIN');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    user = { role: 'super_admin', mustChangePassword: false, isSuperAdmin: true };

    fixture.componentInstance.form.setValue({ email: 'root@plataforma.co', password: 'Clave1234!' });
    await fixture.componentInstance.submit();

    expect(login).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/super-admin']);
  });

  it('en un host no reconocido muestra el aviso, sin formulario y sin llamadas al API', async () => {
    const fixture = crear('UNRECOGNIZED');
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="unrecognized-host"]')?.textContent).toContain(
      'Esta dirección no corresponde a ningún acceso',
    );
    expect(el.querySelector('form')).toBeNull();

    fixture.componentInstance.form.setValue({ email: 'a@b.co', password: 'x' });
    await fixture.componentInstance.submit();
    expect(login).not.toHaveBeenCalled();
  });
});
