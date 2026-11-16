import { TestBed } from '@angular/core/testing';
import { UserSecurityTabComponent } from './user-security-tab.component';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { TokenStorageService } from '../../../core/auth/token-storage.service';
import { UserSecurity } from '../interfaces/admin-user.interface';

function base64Url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeToken(sid: string | undefined): string {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64Url({
    user: { email: 'admin@acme.co', uid: 'admin-1', tenant_id: null, is_super_admin: true, role: 'SUPER_ADMIN' },
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'jti-1',
    refresh: false,
    ...(sid ? { sid } : {}),
  });
  return `${header}.${payload}.signature`;
}

const SECURITY_WITH_SESSIONS: UserSecurity = {
  active_sessions: [
    { id: 'sess-mine', device_label: 'Chrome en Windows', browser: 'Chrome', ip_address: '1.1.1.1', created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-01-01T00:00:00Z' },
    { id: 'sess-other', device_label: 'Safari en iOS', browser: 'Safari', ip_address: '2.2.2.2', created_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-01-01T00:00:00Z' },
  ],
  failed_login_attempts: 0,
  security_blocked_at: null,
};

const EMPTY_SECURITY: UserSecurity = {
  active_sessions: [],
  failed_login_attempts: 3,
  security_blocked_at: '2026-01-02T10:00:00Z',
};

describe('UserSecurityTabComponent (spec 159, User Story 6, FR-013/FR-028 a FR-030)', () => {
  let confirm: ConfirmService;
  let tokenStorage: TokenStorageService;

  function crear(security: UserSecurity, ownSid?: string) {
    TestBed.configureTestingModule({ imports: [UserSecurityTabComponent] });
    confirm = TestBed.inject(ConfirmService);
    tokenStorage = TestBed.inject(TokenStorageService);
    if (ownSid !== undefined) tokenStorage.setTokens(fakeToken(ownSid));
    const fixture = TestBed.createComponent(UserSecurityTabComponent);
    fixture.componentRef.setInput('security', security);
    fixture.detectChanges();
    return fixture;
  }

  function click(fixture: ReturnType<typeof crear>, testid: string, index = 0) {
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(`[data-testid="${testid}"]`)[index].click();
  }

  afterEach(() => {
    tokenStorage?.clear();
  });

  it('deshabilita "revocar todas" cuando no hay sesiones activas', () => {
    const fixture = crear(EMPTY_SECURITY);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="revoke-all-sessions"]',
    )!;
    expect(button.disabled).toBe(true);
  });

  it('muestra el aviso de bloqueo por seguridad cuando security_blocked_at está presente', () => {
    const fixture = crear(EMPTY_SECURITY);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="blocked-security-notice"]'),
    ).not.toBeNull();
  });

  it('revocar todas, confirmado, emite revokeAll', async () => {
    const fixture = crear(SECURITY_WITH_SESSIONS, 'sess-other-no-match');
    const revokeAll = vi.fn();
    fixture.componentInstance.revokeAll.subscribe(revokeAll);

    click(fixture, 'revoke-all-sessions');
    await Promise.resolve();
    confirm.respond(true);
    await Promise.resolve();

    expect(revokeAll).toHaveBeenCalled();
  });

  it('revocar todas, cancelado, no emite nada', async () => {
    const fixture = crear(SECURITY_WITH_SESSIONS, 'sess-other-no-match');
    const revokeAll = vi.fn();
    fixture.componentInstance.revokeAll.subscribe(revokeAll);

    click(fixture, 'revoke-all-sessions');
    await Promise.resolve();
    confirm.respond(false);
    await Promise.resolve();

    expect(revokeAll).not.toHaveBeenCalled();
  });

  it('advierte que se cerrará también la propia sesión cuando está entre las activas', async () => {
    const fixture = crear(SECURITY_WITH_SESSIONS, 'sess-mine');

    click(fixture, 'revoke-all-sessions');
    await Promise.resolve();

    expect(confirm.state()?.message).toContain('tú mismo');
    confirm.respond(true);
  });

  it('no advierte sobre la propia sesión cuando no coincide ninguna', async () => {
    const fixture = crear(SECURITY_WITH_SESSIONS, 'sess-que-no-existe');

    click(fixture, 'revoke-all-sessions');
    await Promise.resolve();

    expect(confirm.state()?.message).not.toContain('tú mismo');
    confirm.respond(true);
  });

  it('revocar una sola sesión, confirmado, emite revokeOne con su id', async () => {
    const fixture = crear(SECURITY_WITH_SESSIONS, 'sess-other-no-match');
    const revokeOne = vi.fn();
    fixture.componentInstance.revokeOne.subscribe(revokeOne);

    click(fixture, 'revoke-session', 0);
    await Promise.resolve();
    confirm.respond(true);
    await Promise.resolve();

    expect(revokeOne).toHaveBeenCalledWith('sess-mine');
  });

  it('marca la sesión propia con "(esta sesión)"', () => {
    const fixture = crear(SECURITY_WITH_SESSIONS, 'sess-mine');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('(esta sesión)');
  });
});
