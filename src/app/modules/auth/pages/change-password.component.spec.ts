import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ChangePasswordComponent } from './change-password.component';
import { AuthService } from '../../../core/services/auth.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { UserRole } from '../../../core/interfaces/user.interface';

/**
 * Spec 145 — rediseño visual de `ChangePasswordComponent`. Este componente no
 * tenía tests ("CONGELA comportamiento actual:" congela el flujo de envío
 * vigente antes de tocar el markup).
 */
describe('ChangePasswordComponent', () => {
  let changePassword: ReturnType<typeof vi.fn>;
  let currentUser: { email: string; role: UserRole } | null;

  async function crear() {
    changePassword ??= vi.fn(async () => ({ error: null }));
    currentUser ??= { email: 'cajero@acme.com', role: UserRole.CASHIER };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ChangePasswordComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => currentUser, changePassword },
        },
        {
          provide: TenantInfoService,
          useValue: {
            info: signal({
              id: 1,
              name: 'Granizados Del Sol',
              host: 'h.skeilopos.com',
              logo_url: null,
              receipt_message: null,
              timezone: 'America/Bogota',
            }),
            load: vi.fn(async () => undefined),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            isSuperAdmin: () => false,
            isTenant: () => true,
            isUnrecognized: () => false,
            tenantSlug: () => 'acme',
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(ChangePasswordComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = Awaited<ReturnType<typeof crear>>;
  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const q = (f: Fixture, testid: string) => el(f).querySelector(`[data-testid="${testid}"]`);

  beforeEach(() => {
    changePassword = vi.fn(async () => ({ error: null }));
    currentUser = { email: 'cajero@acme.com', role: UserRole.CASHIER };
  });

  function llenarFormulario(
    fixture: Fixture,
    valores: { current?: string; next?: string; confirm?: string } = {},
  ) {
    const { current = 'Temp1234', next = 'Nueva1234', confirm = next } = valores;
    fixture.componentInstance.form.setValue({
      current_password: current,
      new_password: next,
      confirm_password: confirm,
    });
  }

  // ── User Story 1 · envío exitoso (CONGELA comportamiento actual) ────────

  it('CONGELA comportamiento actual: un envío exitoso llama a AuthService.changePassword con la temporal y la nueva', async () => {
    const fixture = await crear();
    llenarFormulario(fixture, { current: 'Temp1234', next: 'Nueva1234' });

    await fixture.componentInstance.submit();

    expect(changePassword).toHaveBeenCalledWith('Temp1234', 'Nueva1234');
  });

  it('tras un envío exitoso, el componente queda en "Cuenta lista" en vez de navegar de inmediato', async () => {
    const fixture = await crear();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    llenarFormulario(fixture);

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(q(fixture, 'change-password-done')).not.toBeNull();
  });

  it('al pulsar "Iniciar sesión" en "Cuenta lista" navega al login del negocio según el rol', async () => {
    const fixture = await crear();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    llenarFormulario(fixture);
    await fixture.componentInstance.submit();
    fixture.detectChanges();

    (q(fixture, 'change-password-go-login') as HTMLButtonElement).click();

    expect(navigate).toHaveBeenCalledWith(['/dashboard/caja']);
  });

  it('muestra el negocio, el rol y el correo invitado en el encabezado (FR-001)', async () => {
    const fixture = await crear();
    const texto = el(fixture).textContent ?? '';

    expect(texto).toContain('Granizados Del Sol');
    expect(texto).toContain('Cajero');
    expect(texto).toContain('cajero@acme.com');
  });

  it('la pantalla vive dentro del cascarón compartido', async () => {
    const fixture = await crear();
    expect(el(fixture).querySelector('app-auth-shell')).not.toBeNull();
  });

  // ── User Story 2 · checklist en tiempo real (FR-005, SC-002) ─────────────

  it('el checklist no aparece antes de que el usuario escriba la nueva contraseña', async () => {
    const fixture = await crear();

    expect(q(fixture, 'change-password-rules')).toBeNull();
  });

  it('el checklist aparece en cuanto el usuario empieza a escribir la nueva contraseña', async () => {
    const fixture = await crear();

    fixture.componentInstance.form.controls.new_password.setValue('A');
    fixture.detectChanges();

    expect(q(fixture, 'change-password-rules')).not.toBeNull();
  });

  it('una nueva contraseña de 10 caracteres distinta a la temporal marca ambos requisitos como cumplidos', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.controls.current_password.setValue('Temp1234');
    fixture.componentInstance.form.controls.new_password.setValue('Abcdefghij');
    fixture.detectChanges();

    const items = Array.from(q(fixture, 'change-password-rules')!.querySelectorAll('li'));
    expect(items.every((li) => li.textContent?.includes('(cumplido)'))).toBe(true);
  });

  it('una nueva contraseña igual a la temporal deja pendiente solo "Distinta a la contraseña temporal"', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.controls.current_password.setValue('Abcdefghij');
    fixture.componentInstance.form.controls.new_password.setValue('Abcdefghij');
    fixture.detectChanges();

    const items = Array.from(q(fixture, 'change-password-rules')!.querySelectorAll('li'));
    const distinta = items.find((li) => li.textContent?.includes('Distinta a la contraseña temporal'));
    const longitud = items.filter((li) => !li.textContent?.includes('Distinta a la contraseña temporal'));

    expect(distinta?.textContent).toContain('(pendiente)');
    expect(longitud.every((li) => li.textContent?.includes('(cumplido)'))).toBe(true);
  });

  // ── User Story 3 · mensajes de error específicos ─────────────────────────

  it('FR-006: temporal vacía muestra el mensaje específico y no llama al backend', async () => {
    const fixture = await crear();
    llenarFormulario(fixture, { current: '' });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(q(fixture, 'change-password-error')!.textContent).toContain(
      'Escribe la contraseña temporal de tu invitación.',
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('FR-007: una nueva contraseña que no cumple los requisitos muestra el mensaje específico', async () => {
    const fixture = await crear();
    llenarFormulario(fixture, { current: 'Temp1234', next: 'abc', confirm: 'abc' });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(q(fixture, 'change-password-error')!.textContent).toContain(
      'La nueva contraseña no cumple todos los requisitos.',
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('FR-008: una confirmación distinta muestra el mensaje específico', async () => {
    const fixture = await crear();
    llenarFormulario(fixture, { current: 'Temp1234', next: 'Nueva1234', confirm: 'Nueva9999' });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(q(fixture, 'change-password-error')!.textContent).toContain(
      'Las contraseñas no coinciden.',
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('Edge case: el rechazo del backend muestra el mensaje genérico y conserva los datos del formulario', async () => {
    changePassword = vi.fn(async () => ({ error: 'Current password is incorrect' }));
    const fixture = await crear();
    llenarFormulario(fixture, { current: 'Incorrecta1', next: 'Nueva1234' });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(q(fixture, 'change-password-error')!.textContent).toContain(
      'Current password is incorrect',
    );
    expect(fixture.componentInstance.form.controls.current_password.value).toBe('Incorrecta1');
    expect(fixture.componentInstance.form.controls.new_password.value).toBe('Nueva1234');
    expect(q(fixture, 'change-password-done')).toBeNull();
  });
});
