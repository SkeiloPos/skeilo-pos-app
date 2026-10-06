import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES,
  cumplePolitica,
} from './password-policy';
import { ResetPasswordComponent } from './pages/reset-password.component';
import { AuthService } from '../../core/services/auth.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthNoticeService } from '../../core/auth/auth-notice.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

/**
 * Spec 095 — el invariante que hace útil a este módulo: **la lista visible y el
 * validador del formulario no pueden discrepar**. Si alguien endurece uno y
 * olvida el otro, el usuario ve "cumplido" en una regla que el formulario
 * rechaza. Es un test, no una convención (R13; FR-027, FR-029).
 */
describe('password-policy', () => {
  it('la política vigente son exactamente dos reglas de longitud', () => {
    expect(PASSWORD_RULES).toHaveLength(2);
    expect(PASSWORD_RULES.map((r) => r.label)).toEqual([
      'Mínimo 8 caracteres',
      'Máximo 12 caracteres',
    ]);
  });

  it('la regla del máximo existe y se puede incumplir (D4)', () => {
    const maxima = PASSWORD_RULES[1];
    expect(maxima.test('a'.repeat(PASSWORD_MAX_LENGTH))).toBe(true);
    expect(maxima.test('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });

  it('la regla del mínimo marca la frontera en 8', () => {
    const minima = PASSWORD_RULES[0];
    expect(minima.test('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(minima.test('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
  });

  it('ninguna regla exige mayúsculas, números ni símbolos (FR-029, D4)', () => {
    // Doce minúsculas, sin nada más: cumple la política vigente entera.
    expect(cumplePolitica('abcdefghijkl')).toBe(true);
    for (const regla of PASSWORD_RULES) {
      expect(regla.test('abcdefghijkl')).toBe(true);
    }
  });

  it('ninguna regla dice "distinta de la actual": el cliente no puede evaluarlo (FR-033)', () => {
    const etiquetas = PASSWORD_RULES.map((r) => r.label.toLowerCase()).join(' ');
    expect(etiquetas).not.toContain('actual');
    expect(etiquetas).not.toContain('distinta');
  });

  // ── El invariante ────────────────────────────────────────────────────────

  describe('la lista y el validador no discrepan', () => {
    function formulario() {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [ResetPasswordComponent],
        providers: [
          provideRouter([]),
          AuthNoticeService,
          { provide: AuthService, useValue: { clearSession: vi.fn(), resetPassword: vi.fn() } },
          { provide: AuthApiService, useValue: { validateResetToken: vi.fn() } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: { get: () => null } } },
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
      const fixture = TestBed.createComponent(ResetPasswordComponent);
      fixture.detectChanges();
      return fixture.componentInstance.form;
    }

    const valores = [
      '',
      'a',
      'abcdefg', // 7 — incumple el mínimo
      'abcdefgh', // 8 — frontera inferior
      'abcdefghij', // 10
      'abcdefghijkl', // 12 — frontera superior
      'abcdefghijklm', // 13 — incumple el máximo
      'a'.repeat(40),
      'Clave123',
      '  espacios ',
    ];

    it.each(valores)('con %j, form.valid ⟺ todas las reglas cumplidas', (valor) => {
      const form = formulario();
      // La confirmación se iguala para aislar la regla de longitud del campo nuevo.
      form.setValue({ new_password: valor, confirm_password: valor });

      expect(form.controls.new_password.valid).toBe(cumplePolitica(valor));
      expect(form.valid).toBe(cumplePolitica(valor));
    });
  });
});
