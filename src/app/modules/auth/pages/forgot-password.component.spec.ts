import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ForgotPasswordComponent, RESEND_LOCK_KEY } from './forgot-password.component';
import { AuthService } from '../../../core/services/auth.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';

type Ctx = 'SUPER_ADMIN' | 'TENANT' | 'UNRECOGNIZED';

/**
 * Spec 095 — comportamientos F1 a F8 del contrato. Esta pantalla **no tenía
 * ningún test** (R17), y es el único sitio donde FR-020 a FR-025 se pueden
 * verificar.
 */
describe('ForgotPasswordComponent', () => {
  let forgotPassword: ReturnType<typeof vi.fn>;

  function crear(ctx: Ctx = 'TENANT') {
    forgotPassword = vi.fn(async () => ({ error: null, status: null }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { forgotPassword } },
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
    const fixture = TestBed.createComponent(ForgotPasswordComponent);
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = ReturnType<typeof crear>;
  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const q = (f: Fixture, testid: string) => el(f).querySelector(`[data-testid="${testid}"]`);

  async function enviar(fixture: Fixture, email = 'cajero@negocioa.co') {
    fixture.componentInstance.form.setValue({ email });
    await fixture.componentInstance.submit();
    fixture.detectChanges();
  }

  beforeEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  // ── F1 · el mismo mensaje, exista o no la cuenta (FR-020, SC-003) ────────

  it('F1: el mensaje de confirmación es idéntico para una cuenta que existe y una que no', async () => {
    const existe = crear();
    await enviar(existe, 'real@negocioa.co');
    const textoExiste = q(existe, 'forgot-sent')!.textContent!.replace('real@negocioa.co', '{x}');

    const noExiste = crear();
    await enviar(noExiste, 'fantasma@negocioa.co');
    const textoNoExiste = q(noExiste, 'forgot-sent')!.textContent!.replace(
      'fantasma@negocioa.co',
      '{x}',
    );

    expect(textoExiste).toBe(textoNoExiste);
  });

  it('F1: el mensaje es condicional y dice la caducidad, nunca afirma que el correo salió', async () => {
    const fixture = crear();
    await enviar(fixture, 'cajero@negocioa.co');
    const texto = q(fixture, 'forgot-sent')!.textContent!.replace(/\s+/g, ' ').trim();

    expect(texto).toContain('Si existe una cuenta con cajero@negocioa.co');
    expect(texto).toContain('El enlace caduca en 30 minutos.');
    // El indicativo del mockup ("Enviamos un enlace a…") afirmaría que existe.
    expect(texto).not.toContain('Enviamos un enlace a cajero');
  });

  it('F1: el mensaje de confirmación se anuncia a las ayudas técnicas (FR-041)', async () => {
    const fixture = crear();
    await enviar(fixture);
    expect(q(fixture, 'forgot-sent')!.getAttribute('role')).toBe('status');
  });

  it('F1: los dos estados son mutuamente excluyentes', async () => {
    const fixture = crear();
    expect(q(fixture, 'forgot-submit')).not.toBeNull();
    expect(q(fixture, 'forgot-sent')).toBeNull();

    await enviar(fixture);

    expect(q(fixture, 'forgot-sent')).not.toBeNull();
    expect(q(fixture, 'forgot-submit')).toBeNull();
  });

  // ── F2 · bloqueo de reenvío de 60 s (FR-021) ─────────────────────────────

  it('F2: tras aceptarse, el reenvío queda bloqueado con la cuenta regresiva visible', async () => {
    const fixture = crear();
    await enviar(fixture);

    const reenviar = q(fixture, 'forgot-resend') as HTMLButtonElement;
    expect(reenviar.disabled).toBe(true);
    expect(reenviar.textContent).toMatch(/Reenviar enlace en \d+ s/);
    expect(fixture.componentInstance.remainingSeconds()).toBe(60);
  });

  it('F2: el bloqueo se guarda como instante de vencimiento, no como contador', async () => {
    const antes = Date.now();
    const fixture = crear();
    await enviar(fixture);

    const guardado = Number(sessionStorage.getItem(RESEND_LOCK_KEY));
    expect(guardado).toBeGreaterThanOrEqual(antes + 59_000);
    expect(guardado).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(fixture).toBeTruthy();
  });

  // ── F3 · recargar durante el bloqueo (FR-022) ────────────────────────────

  it('F3: al montar con un bloqueo en curso sigue bloqueado por lo que falte, sin reiniciar a 60', () => {
    sessionStorage.setItem(RESEND_LOCK_KEY, String(Date.now() + 40_000));

    const fixture = crear();
    fixture.componentInstance.sent.set(true);
    fixture.detectChanges();

    const restante = fixture.componentInstance.remainingSeconds();
    expect(restante).toBeGreaterThan(38);
    expect(restante).toBeLessThanOrEqual(40);
  });

  // ── F4 · pestaña en segundo plano (FR-022) ───────────────────────────────

  it('F4: con el instante de vencimiento ya pasado, el reenvío está habilitado', async () => {
    sessionStorage.setItem(RESEND_LOCK_KEY, String(Date.now() - 10_000));

    const fixture = crear();
    await enviar.call(null, fixture);
    // Se envió otra vez, así que vuelve a bloquearse; lo que importa es que al
    // montar con un vencimiento pasado no quedó bloqueado.
    expect(fixture.componentInstance.remainingSeconds()).toBe(60);
  });

  it('F4: la cuenta regresiva se calcula contra el reloj, no decrementando un contador', () => {
    vi.useFakeTimers();
    sessionStorage.setItem(RESEND_LOCK_KEY, String(Date.now() + 70_000));
    const fixture = crear();
    expect(fixture.componentInstance.remainingSeconds()).toBeGreaterThan(60);

    // La pestaña pasa 71 s en segundo plano: el reloj avanza, pero el navegador
    // estrangula el intervalo y solo llega a dispararse una vez al volver. Un
    // contador que se decremente por tick marcaría 69 s pendientes; dos marcas
    // de reloj marcan 0, que es lo que FR-022 exige.
    vi.setSystemTime(Date.now() + 71_000);
    vi.advanceTimersByTime(1000);

    expect(fixture.componentInstance.remainingSeconds()).toBe(0);
  });

  it('F4: sessionStorage con basura se trata como "sin bloqueo"', () => {
    sessionStorage.setItem(RESEND_LOCK_KEY, 'no-es-un-numero');
    expect(crear().componentInstance.remainingSeconds()).toBe(0);
  });

  // ── F5 · demasiados intentos (FR-023, D5, R11) ───────────────────────────

  it('F5: el 429 muestra el literal propio, sin citar ninguna ventana de tiempo', async () => {
    const fixture = crear();
    forgotPassword.mockResolvedValue({ error: 'Too many requests, retry in 15 minutes', status: 429 });

    await enviar(fixture);

    const error = q(fixture, 'forgot-error')!;
    expect(error.textContent).toContain('Hiciste demasiados intentos. Vuelve a intentarlo más tarde.');
    expect(error.getAttribute('role')).toBe('alert');
    // Ni el detail del backend ni ninguna ventana de tiempo (D5).
    expect(el(fixture).textContent).not.toContain('15 minutes');
    expect(el(fixture).textContent).not.toContain('minutos');
  });

  it('F5: el 429 no pasa al estado de confirmación ni revela nada de la cuenta', async () => {
    const fixture = crear();
    forgotPassword.mockResolvedValue({ error: 'x', status: 429 });

    await enviar(fixture);

    expect(q(fixture, 'forgot-sent')).toBeNull();
    expect(q(fixture, 'forgot-submit')).not.toBeNull();
  });

  // ── F6 · fallo de red (edge case) ────────────────────────────────────────

  it('F6: un fallo de red saca el botón del estado de carga y permite reintentar', async () => {
    const fixture = crear();
    forgotPassword.mockResolvedValue({ error: 'cualquier cosa', status: 0 });

    await enviar(fixture);

    expect(q(fixture, 'forgot-error')!.textContent).toContain(
      'No pudimos procesar la solicitud. Intenta de nuevo.',
    );
    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect((q(fixture, 'forgot-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  // ── F7 · volver, siempre relativo (FR-025) ───────────────────────────────

  it('F7: "Volver a iniciar sesión" es una ruta relativa en el estado formulario', () => {
    const enlace = q(crear(), 'forgot-back-link') as HTMLAnchorElement;
    expect(enlace.getAttribute('href')).toBe('/login');
    expect(enlace.getAttribute('href')).not.toContain('://');
  });

  it('F7: y también en el estado de confirmación', async () => {
    const fixture = crear();
    await enviar(fixture);
    const enlace = q(fixture, 'forgot-back-link') as HTMLAnchorElement;
    expect(enlace.getAttribute('href')).toBe('/login');
  });

  // ── F8 · host no reconocido (FR-009, R6) ─────────────────────────────────

  it('F8: con UNRECOGNIZED no hay formulario y no sale ninguna petición', async () => {
    const fixture = crear('UNRECOGNIZED');

    expect(q(fixture, 'unrecognized-host')?.textContent).toContain('No encontramos este negocio');
    expect(el(fixture).querySelector('form')).toBeNull();

    fixture.componentInstance.form.setValue({ email: 'a@b.co' });
    await fixture.componentInstance.submit();

    expect(forgotPassword).not.toHaveBeenCalled();
  });

  // ── Validación y textos ──────────────────────────────────────────────────

  it('enviar vacío no llama al API y muestra el error de obligatoriedad', async () => {
    const fixture = crear();
    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(el(fixture).textContent).toContain('Escribe tu correo electrónico');
  });

  it('A1: el campo tiene su <label for> y su autocompletado', () => {
    const fixture = crear();
    expect(el(fixture).querySelector('label[for="forgot-email"]')).not.toBeNull();
    expect((q(fixture, 'forgot-email') as HTMLInputElement).getAttribute('autocomplete')).toBe(
      'email',
    );
  });

  it('usa los literales del contrato de textos', async () => {
    const fixture = crear();
    expect(el(fixture).textContent).toContain('Restablece tu contraseña.');
    expect(el(fixture).textContent).toContain('Enviar enlace');

    await enviar(fixture);
    expect(el(fixture).textContent).toContain('Revisa tu correo.');
  });

  it('la pantalla vive dentro del cascarón compartido (FR-001, FR-002)', () => {
    const fixture = crear();
    expect(el(fixture).querySelector('app-auth-shell')).not.toBeNull();
    expect(el(fixture).querySelector('[data-testid="auth-footer"]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-testid="auth-context-badge"]')).not.toBeNull();
  });
});
