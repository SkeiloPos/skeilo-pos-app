import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthNoticeService } from '../../../core/auth/auth-notice.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';

type Ctx = 'SUPER_ADMIN' | 'TENANT' | 'UNRECOGNIZED';

describe('LoginComponent', () => {
  let login: ReturnType<typeof vi.fn>;
  let user: Record<string, unknown> | null;
  let aviso: AuthNoticeService;

  function crear(ctx: Ctx = 'TENANT') {
    login = vi.fn(async () => ({ error: null }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        AuthNoticeService,
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
    aviso = TestBed.inject(AuthNoticeService);
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = ReturnType<typeof crear>;
  const el = (f: Fixture) => f.nativeElement as HTMLElement;
  const q = (f: Fixture, testid: string) => el(f).querySelector(`[data-testid="${testid}"]`);

  /** Rellena los dos campos como lo haría una persona escribiendo. */
  function rellenar(fixture: Fixture, email = 'cajero@negocioa.co', password = 'Clave1234') {
    fixture.componentInstance.form.setValue({ email, password });
    fixture.detectChanges();
  }

  beforeEach(() => {
    user = null;
  });

  it('el spinner de carga ya no es un SVG artesanal (spec 082)', () => {
    const fixture = crear();
    fixture.componentInstance.isLoading.set(true);
    fixture.detectChanges();
    const boton = q(fixture, 'login-submit')!;
    const icon = boton.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('autorenew');
  });

  it('el ícono del spinner conserva la animación de giro', () => {
    const fixture = crear();
    fixture.componentInstance.isLoading.set(true);
    fixture.detectChanges();
    const boton = q(fixture, 'login-submit')!;
    const host = boton.querySelector('app-mi-icon');
    expect(host?.className).toContain('animate-spin');
  });

  // ── spec 091 (A-99), con los dos literales que la spec 095 cambia (A-109) ──

  it('en la plataforma muestra la insignia "Administración de la plataforma" y el formulario', () => {
    const fixture = crear('SUPER_ADMIN');
    expect(el(fixture).textContent).toContain('Administración de la plataforma');
    expect(el(fixture).querySelector('form')).not.toBeNull();
  });

  it('en un negocio muestra el slug y el formulario', () => {
    const fixture = crear('TENANT');
    expect(el(fixture).textContent).toContain('acme');
    expect(el(fixture).textContent).not.toContain('Administración de la plataforma');
    expect(el(fixture).querySelector('form')).not.toBeNull();
  });

  it('tras el login de un Super Admin en la plataforma navega al panel, no a /dashboard/admin', async () => {
    const fixture = crear('SUPER_ADMIN');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    user = { role: 'super_admin', mustChangePassword: false, isSuperAdmin: true };

    rellenar(fixture, 'root@plataforma.co', 'Clave1234');
    await fixture.componentInstance.submit();

    expect(login).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/super-admin']);
  });

  // ── L10 · host no reconocido ─────────────────────────────────────────────

  it('L10: en un host no reconocido muestra el aviso, sin formulario y sin llamadas al API', async () => {
    const fixture = crear('UNRECOGNIZED');

    expect(q(fixture, 'unrecognized-host')?.textContent).toContain('No encontramos este negocio');
    expect(el(fixture).querySelector('form')).toBeNull();

    fixture.componentInstance.form.setValue({ email: 'a@b.co', password: 'x' });
    await fixture.componentInstance.submit();
    expect(login).not.toHaveBeenCalled();
  });

  // ── L1 · obligatoriedad sin petición (FR-014) ────────────────────────────

  it('L1: enviar con los campos vacíos muestra el error de cada campo y no llama al API', async () => {
    const fixture = crear();

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(login).not.toHaveBeenCalled();
    expect(el(fixture).textContent).toContain('Escribe tu correo electrónico');
    expect(el(fixture).textContent).toContain('Escribe tu contraseña');
  });

  it('L1: un correo con formato inválido tampoco llega al API', async () => {
    const fixture = crear();
    rellenar(fixture, 'esto-no-es-un-correo', 'Clave1234');

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(login).not.toHaveBeenCalled();
    expect(el(fixture).textContent).toContain('Escribe un correo válido');
  });

  // ── L2 · un fallo, un mensaje (FR-012, SC-003) ───────────────────────────

  it('L2: el 401 y el 403 llegan a la pantalla como el mismo literal', async () => {
    const fixture = crear();
    login.mockResolvedValue({ error: 'Credenciales inválidas' });
    rellenar(fixture);

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    const error = q(fixture, 'login-error')!;
    // `toContain` y no `toBe`: el aviso del diseño lleva un ícono delante, y la
    // ligadura de la fuente de íconos también cuenta como texto del nodo.
    expect(error.textContent).toContain('Credenciales inválidas');
    expect(el(fixture).textContent).not.toContain('inactive');
    expect(el(fixture).textContent).not.toContain('desactivada');
  });

  // ── L3 · tras el rechazo (FR-013) ────────────────────────────────────────

  it('L3: tras el rechazo la contraseña queda vacía, el correo se conserva y el foco va al campo', async () => {
    const fixture = crear();
    document.body.appendChild(el(fixture));
    login.mockResolvedValue({ error: 'Credenciales inválidas' });
    rellenar(fixture, 'cajero@negocioa.co', 'malaClave');

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.email.value).toBe('cajero@negocioa.co');
    expect(fixture.componentInstance.form.controls.password.value).toBe('');

    const campo = el(fixture).querySelector('#login-password') as HTMLInputElement;
    expect(document.activeElement).toBe(campo);
  });

  // ── L4 · una sola petición (FR-015, SC-009) ──────────────────────────────

  it('L4: pulsar varias veces durante la petición no produce una segunda llamada', async () => {
    const fixture = crear();
    let resolver!: (v: { error: string | null }) => void;
    login.mockReturnValue(new Promise((r) => (resolver = r)));
    rellenar(fixture);

    const primera = fixture.componentInstance.submit();
    const segunda = fixture.componentInstance.submit();
    const tercera = fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.componentInstance.isLoading()).toBe(true);
    expect((q(fixture, 'login-submit') as HTMLButtonElement).disabled).toBe(true);

    resolver({ error: 'Credenciales inválidas' });
    await Promise.all([primera, segunda, tercera]);

    expect(login).toHaveBeenCalledOnce();
  });

  it('L4: durante la petición el botón muestra el indicador de progreso', () => {
    const fixture = crear();
    fixture.componentInstance.isLoading.set(true);
    fixture.detectChanges();
    expect(q(fixture, 'login-submit')!.textContent).toContain('Ingresando…');
  });

  // ── L5, L6, L7 · destinos (FR-018, FR-019) ───────────────────────────────

  it('L5: con destino previo guardado se navega a ese destino, no al inicio del rol', async () => {
    const fixture = crear();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    user = { role: 'cashier', mustChangePassword: false };
    fixture.componentInstance.redirectTo = '/dashboard/inventario';

    rellenar(fixture);
    await fixture.componentInstance.submit();

    expect(navigate).toHaveBeenCalledWith(['/dashboard/inventario']);
  });

  it('L6: sin destino previo se navega a la pantalla inicial del rol (ROLE_HOME intacto)', async () => {
    const fixture = crear();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    user = { role: 'cashier', mustChangePassword: false };

    rellenar(fixture);
    await fixture.componentInstance.submit();

    expect(navigate).toHaveBeenCalledWith(['/dashboard/caja']);
  });

  it('L7: con contraseña temporal se navega a /change-password', async () => {
    const fixture = crear();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    user = { role: 'admin', mustChangePassword: true };

    rellenar(fixture);
    await fixture.componentInstance.submit();

    expect(navigate).toHaveBeenCalledWith(['/change-password']);
  });

  // ── L8, L9 · el control inerte (FR-019a a FR-019e) ───────────────────────

  it('L8: con la casilla marcada el API recibe exactamente el correo y la contraseña', async () => {
    const fixture = crear();
    user = { role: 'cashier', mustChangePassword: false };
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const casilla = q(fixture, 'login-keep-session') as HTMLInputElement;
    casilla.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.keepSession()).toBe(true);

    rellenar(fixture, 'cajero@negocioa.co', 'Clave1234');
    await fixture.componentInstance.submit();

    expect(login).toHaveBeenCalledWith('cajero@negocioa.co', 'Clave1234');
    expect(login.mock.calls[0]).toHaveLength(2);
  });

  it('L9: la casilla no entra en el FormGroup que se serializa', () => {
    const fixture = crear();
    expect(Object.keys(fixture.componentInstance.form.controls).sort()).toEqual([
      'email',
      'password',
    ]);
  });

  it('L9: la etiqueta de la casilla no menciona recordar ni guardar contraseñas (FR-019e, D3a)', () => {
    const fixture = crear();
    const etiqueta = el(fixture).querySelector('label[for="login-keep-session"]')!;

    expect(etiqueta.textContent?.trim()).toBe('Mantener sesión iniciada');
    expect(el(fixture).textContent).not.toContain('Recordar contraseña');
    expect(el(fixture).textContent).not.toContain('Recordarme');
  });

  // ── L11 · autocompletado del navegador (edge case) ───────────────────────

  it('L11: los campos rellenados por el navegador, sin teclado, dejan el envío habilitado', () => {
    const fixture = crear();
    const correo = q(fixture, 'login-email') as HTMLInputElement;
    const clave = el(fixture).querySelector('#login-password') as HTMLInputElement;

    // El autocompletado fija `value` y dispara `input`, sin eventos de teclado
    // ni `blur` — así que los controles nunca quedan `touched`.
    correo.value = 'cajero@negocioa.co';
    correo.dispatchEvent(new Event('input'));
    clave.value = 'Clave1234';
    clave.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.form.valid).toBe(true);
    expect((q(fixture, 'login-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(el(fixture).textContent).not.toContain('Escribe tu correo electrónico');
    expect(el(fixture).textContent).not.toContain('Escribe tu contraseña');
  });

  // ── Fallo de red (edge case, T025a) ──────────────────────────────────────

  it('un fallo de red deja el botón utilizable y permite reintentar', async () => {
    const fixture = crear();
    login.mockResolvedValue({ error: 'No pudimos procesar la solicitud. Intenta de nuevo.' });
    rellenar(fixture);

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(q(fixture, 'login-error')!.textContent).toContain(
      'No pudimos procesar la solicitud. Intenta de nuevo.',
    );
    expect(fixture.componentInstance.isLoading()).toBe(false);
    expect((q(fixture, 'login-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  // ── Aviso de contraseña actualizada (FR-031, R12) ────────────────────────

  it('muestra "Contraseña actualizada" cuando viene de un cambio exitoso', () => {
    TestBed.resetTestingModule();
    const fixture = crear();
    // Se fija antes de montar, como hace reset-password al navegar.
    aviso.set('password-updated');
    const otra = TestBed.createComponent(LoginComponent);
    otra.detectChanges();

    const notice = (otra.nativeElement as HTMLElement).querySelector(
      '[data-testid="login-notice"]',
    )!;
    expect(notice.textContent).toContain('Contraseña actualizada');
    expect(notice.getAttribute('role')).toBe('status');
    expect(fixture).toBeTruthy();
  });

  it('el aviso no aparece al entrar directo a /login', () => {
    expect(q(crear(), 'login-notice')).toBeNull();
  });

  it('el aviso se consume: una segunda carga de /login ya no lo repite (R12)', () => {
    crear();
    aviso.set('password-updated');

    const primera = TestBed.createComponent(LoginComponent);
    primera.detectChanges();
    expect(
      (primera.nativeElement as HTMLElement).querySelector('[data-testid="login-notice"]'),
    ).not.toBeNull();

    const segunda = TestBed.createComponent(LoginComponent);
    segunda.detectChanges();
    expect(
      (segunda.nativeElement as HTMLElement).querySelector('[data-testid="login-notice"]'),
    ).toBeNull();
  });

  // ── A1, A5 · accesibilidad (FR-038, FR-041) ──────────────────────────────

  it('A1: cada campo tiene su <label for> apuntando al id de su control', () => {
    const fixture = crear();
    const raiz = el(fixture);

    for (const id of ['login-email', 'login-password', 'login-keep-session']) {
      const etiqueta = raiz.querySelector(`label[for="${id}"]`);
      expect(etiqueta, `falta <label for="${id}">`).not.toBeNull();
      expect(raiz.querySelector(`#${id}`), `falta el control #${id}`).not.toBeNull();
    }
  });

  it('A1: los campos declaran su tipo de autocompletado (FR-017)', () => {
    const fixture = crear();
    expect((q(fixture, 'login-email') as HTMLInputElement).getAttribute('autocomplete')).toBe(
      'email',
    );
    expect(
      (el(fixture).querySelector('#login-password') as HTMLInputElement).getAttribute(
        'autocomplete',
      ),
    ).toBe('current-password');
  });

  it('A5: el error va en role="alert" y el aviso en role="status"', async () => {
    const fixture = crear();
    login.mockResolvedValue({ error: 'Credenciales inválidas' });
    rellenar(fixture);

    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(q(fixture, 'login-error')!.getAttribute('role')).toBe('alert');
  });

  it('A2: no se usa ningún tabindex positivo', () => {
    const fixture = crear();
    const positivos = Array.from(el(fixture).querySelectorAll('[tabindex]')).filter(
      (n) => Number(n.getAttribute('tabindex')) > 0,
    );
    expect(positivos).toHaveLength(0);
  });

  // ── Textos del contrato ──────────────────────────────────────────────────

  it('usa los literales del contrato de textos', () => {
    const fixture = crear();
    const texto = el(fixture).textContent ?? '';

    expect(texto).toContain('Bienvenido de nuevo.');
    expect(texto).toContain('Inicia sesión para acceder a tu cuenta.');
    expect(texto).toContain('Correo electrónico');
    expect(texto).toContain('Contraseña');
    expect(texto).toContain('¿Olvidaste tu contraseña?');
    expect(texto).toContain('Iniciar sesión');
    // Prohibido por D1 y D3a.
    expect(texto).not.toContain('Usuario o correo');
    expect(texto).not.toContain('Recordar contraseña');
  });

  it('el enlace de recuperación es relativo al subdominio actual', () => {
    const enlace = q(crear(), 'login-forgot-link') as HTMLAnchorElement;
    expect(enlace.getAttribute('href')).toBe('/forgot-password');
  });
});
