import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthNoticeService } from '../../../core/auth/auth-notice.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';

type Ctx = 'SUPER_ADMIN' | 'TENANT' | 'UNRECOGNIZED';

/**
 * Spec 095 — comportamientos N1 a N9 del contrato. Esta pantalla **no tenía
 * ningún test** (R17).
 */
describe('ResetPasswordComponent', () => {
  let validateResetToken: ReturnType<typeof vi.fn>;
  let resetPassword: ReturnType<typeof vi.fn>;
  let clearSession: ReturnType<typeof vi.fn>;
  let aviso: AuthNoticeService;

  async function crear(opciones: { token?: string | null; ctx?: Ctx } = {}) {
    const { token = 'tok123', ctx = 'TENANT' } = opciones;
    validateResetToken ??= vi.fn(() => of({ valid: true }));
    resetPassword ??= vi.fn(async () => ({ error: null, status: null }));
    clearSession = vi.fn();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        AuthNoticeService,
        { provide: AuthService, useValue: { clearSession, resetPassword } },
        { provide: AuthApiService, useValue: { validateResetToken } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => token } } },
        },
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
    aviso = TestBed.inject(AuthNoticeService);
    const fixture = TestBed.createComponent(ResetPasswordComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = Awaited<ReturnType<typeof crear>>;
  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const q = (f: Fixture, testid: string) => el(f).querySelector(`[data-testid="${testid}"]`);

  beforeEach(() => {
    validateResetToken = vi.fn(() => of({ valid: true }));
    resetPassword = vi.fn(async () => ({ error: null, status: null }));
  });

  // ── N1 · enlace vigente (FR-034) ─────────────────────────────────────────

  it('N1: con un enlace vigente se renderiza el formulario y el enlace no se consume', async () => {
    const fixture = await crear();

    expect(q(fixture, 'reset-new-password')).not.toBeNull();
    expect(q(fixture, 'reset-confirm-password')).not.toBeNull();
    // Validar es un GET sin efecto secundario: una sola llamada, y de validación.
    expect(validateResetToken).toHaveBeenCalledOnce();
    expect(validateResetToken).toHaveBeenCalledWith('tok123');
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('N1: al cargar se limpia cualquier sesión previa', async () => {
    await crear();
    expect(clearSession).toHaveBeenCalled();
  });

  // ── N2 · sin token en la URL (edge case) ─────────────────────────────────

  it('N2: sin ?token= va al estado no válido SIN emitir petición', async () => {
    const fixture = await crear({ token: null });

    expect(q(fixture, 'reset-invalid')).not.toBeNull();
    expect(validateResetToken).not.toHaveBeenCalled();
  });

  // ── N3 · los cuatro motivos colapsan en uno (FR-032) ─────────────────────

  it.each([
    ['vencido', 400, 'expired'],
    ['ya usado', 400, 'used'],
    ['invalidado', 400, 'invalid'],
    ['inexistente', 404, 'invalid'],
  ])('N3: un enlace %s muestra el único mensaje "Este enlace ya no es válido"', async (
    _caso,
    status,
    reason,
  ) => {
    validateResetToken = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status, error: { valid: false, reason } })),
    );
    const fixture = await crear();

    expect(q(fixture, 'reset-invalid')!.textContent).toContain('Este enlace ya no es válido');
    // Los tres textos de hoy desaparecen.
    const texto = el(fixture).textContent ?? '';
    expect(texto).not.toContain('Este enlace caducó');
    expect(texto).not.toContain('ya fue usado');
    expect(texto).not.toContain('No pudimos usar este enlace');
  });

  it('N3: con el enlace no vigente NO existe un <form> en el DOM, no solo está oculto', async () => {
    validateResetToken = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'expired' } })),
    );
    const fixture = await crear();

    expect(el(fixture).querySelector('form')).toBeNull();
    expect(q(fixture, 'reset-submit')).toBeNull();
  });

  it('N3: ofrece pedir un enlace nuevo', async () => {
    validateResetToken = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 400, error: { reason: 'used' } })),
    );
    const fixture = await crear();
    const boton = q(fixture, 'reset-request-new') as HTMLAnchorElement;

    expect(boton.textContent).toContain('Solicitar un enlace nuevo');
    expect(boton.getAttribute('href')).toBe('/forgot-password');
  });

  // ── N4, N5 · validación local sin peticiones ─────────────────────────────

  it('N4: una contraseña que no cumple la política no produce ninguna petición', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.setValue({ new_password: 'corta', confirm_password: 'corta' });

    await fixture.componentInstance.submit();

    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('N4: trece caracteres tampoco pasan (FR-029)', async () => {
    const fixture = await crear();
    const larga = 'a'.repeat(13);
    fixture.componentInstance.form.setValue({ new_password: larga, confirm_password: larga });

    await fixture.componentInstance.submit();

    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('N5: una confirmación distinta muestra el error y no emite la petición', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.setValue({
      new_password: 'Clave1234',
      confirm_password: 'Clave9999',
    });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(resetPassword).not.toHaveBeenCalled();
    expect(el(fixture).textContent).toContain('Las contraseñas no coinciden');
  });

  // ── N6 · el error del servidor, sin inventar texto (FR-033) ──────────────

  it('N6: cuando el servidor rechaza por ser igual a la actual, se muestra su mensaje', async () => {
    const fixture = await crear();
    resetPassword.mockResolvedValue({
      error: 'La nueva contraseña debe ser distinta de la actual',
      status: 400,
    });
    fixture.componentInstance.form.setValue({
      new_password: 'Clave1234',
      confirm_password: 'Clave1234',
    });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    const error = q(fixture, 'reset-error')!;
    expect(error.textContent).toContain('La nueva contraseña debe ser distinta de la actual');
    expect(error.getAttribute('role')).toBe('alert');
  });

  // ── N7 · éxito → /login con el aviso (FR-031) ────────────────────────────

  it('N7: el cambio exitoso fija el aviso y navega a /login', async () => {
    const fixture = await crear();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.form.setValue({
      new_password: 'Clave1234',
      confirm_password: 'Clave1234',
    });

    await fixture.componentInstance.submit();

    expect(resetPassword).toHaveBeenCalledWith('tok123', 'Clave1234');
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(aviso.consume()).toBe('password-updated');
  });

  it('N7: el estado "done" desapareció — el éxito ya no se queda en esta pantalla (A-110)', async () => {
    const fixture = await crear();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.form.setValue({
      new_password: 'Clave1234',
      confirm_password: 'Clave1234',
    });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(el(fixture).textContent).not.toContain('Ya puedes iniciar sesión con tu nueva');
  });

  // ── N8 · la lista de requisitos (FR-027, FR-028, A8) ─────────────────────

  it('N8: la lista muestra las dos reglas de la política vigente', async () => {
    const fixture = await crear();
    const lista = q(fixture, 'reset-policy-list')!;

    expect(lista.textContent).toContain('Mínimo 8 caracteres');
    expect(lista.textContent).toContain('Máximo 12 caracteres');
    expect(lista.textContent).not.toContain('mayúscula');
    expect(lista.textContent).not.toContain('número');
  });

  it('N8: la lista se anuncia al cambiar', async () => {
    const fixture = await crear();
    expect(q(fixture, 'reset-policy-list')!.getAttribute('aria-live')).toBe('polite');
  });

  it('A8: cada regla comunica su estado con ícono Y texto, nunca solo con color', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.controls.new_password.setValue('abc');
    fixture.detectChanges();

    const items = Array.from(q(fixture, 'reset-policy-list')!.querySelectorAll('li'));
    expect(items).toHaveLength(2);

    // "Mínimo 8" pendiente con 3 caracteres; "Máximo 12" ya cumplido.
    expect(items[0].textContent).toContain('(pendiente)');
    expect(items[0].querySelector('.material-icons-outlined')?.textContent?.trim()).toBe('circle');
    expect(items[1].textContent).toContain('(cumplido)');
    expect(items[1].querySelector('.material-icons-outlined')?.textContent?.trim()).toBe('check');
  });

  it('A8: al escribir, el estado de cada regla se actualiza', async () => {
    const fixture = await crear();
    const lista = () => q(fixture, 'reset-policy-list')!.querySelectorAll('li');

    fixture.componentInstance.form.controls.new_password.setValue('abc');
    fixture.detectChanges();
    expect(lista()[0].textContent).toContain('(pendiente)');

    fixture.componentInstance.form.controls.new_password.setValue('abcdefgh');
    fixture.detectChanges();
    expect(lista()[0].textContent).toContain('(cumplido)');

    fixture.componentInstance.form.controls.new_password.setValue('a'.repeat(13));
    fixture.detectChanges();
    expect(lista()[1].textContent).toContain('(pendiente)');
  });

  // ── N9 · host no reconocido (FR-009, R6) ─────────────────────────────────

  it('N9: con UNRECOGNIZED no se llama a la validación del token', async () => {
    const fixture = await crear({ ctx: 'UNRECOGNIZED' });

    expect(validateResetToken).not.toHaveBeenCalled();
    expect(q(fixture, 'unrecognized-host')).not.toBeNull();
    expect(el(fixture).querySelector('form')).toBeNull();
  });

  // ── Fallo de red (edge case, T044a) ──────────────────────────────────────

  it('un fallo de red al validar NO se confunde con "Este enlace ya no es válido"', async () => {
    validateResetToken = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 0 })));
    const fixture = await crear();

    expect(el(fixture).textContent).toContain(
      'No pudimos procesar la solicitud. Intenta de nuevo.',
    );
    expect(q(fixture, 'reset-invalid')).toBeNull();
  });

  it('un fallo de red al enviar deja el botón utilizable y permite reintentar', async () => {
    const fixture = await crear();
    resetPassword.mockResolvedValue({ error: 'lo que sea', status: 0 });
    fixture.componentInstance.form.setValue({
      new_password: 'Clave1234',
      confirm_password: 'Clave1234',
    });

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(q(fixture, 'reset-error')!.textContent).toContain(
      'No pudimos procesar la solicitud. Intenta de nuevo.',
    );
    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect((q(fixture, 'reset-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  // ── Accesibilidad y textos ───────────────────────────────────────────────

  it('A1: los dos campos tienen su <label for> y su autocompletado', async () => {
    const fixture = await crear();
    const raiz = el(fixture);

    for (const id of ['reset-new-password', 'reset-confirm-password']) {
      expect(raiz.querySelector(`label[for="${id}"]`), `falta <label for="${id}">`).not.toBeNull();
      const campo = raiz.querySelector(`#${id}`) as HTMLInputElement;
      expect(campo, `falta el control #${id}`).not.toBeNull();
      expect(campo.getAttribute('autocomplete')).toBe('new-password');
    }
  });

  it('cada campo de contraseña tiene su propio control de visibilidad', async () => {
    const fixture = await crear();
    expect(el(fixture).querySelectorAll('app-password-input')).toHaveLength(2);
  });

  it('usa los literales del contrato de textos', async () => {
    const fixture = await crear();
    const texto = el(fixture).textContent ?? '';

    expect(texto).toContain('Crea tu nueva contraseña.');
    expect(texto).toContain('Nueva contraseña');
    expect(texto).toContain('Confirmar contraseña');
    expect(texto).toContain('Guardar contraseña');
    // Prohibidos por R20 y D4.
    expect(texto).not.toContain('Para la cuenta');
    expect(texto).not.toContain('correo de confirmación');
  });

  it('la pantalla vive dentro del cascarón compartido (FR-001, FR-002)', async () => {
    const fixture = await crear();
    expect(el(fixture).querySelector('app-auth-shell')).not.toBeNull();
    expect(q(fixture, 'auth-footer')).not.toBeNull();
  });
});
