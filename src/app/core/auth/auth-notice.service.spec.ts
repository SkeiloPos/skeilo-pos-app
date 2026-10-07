import { TestBed } from '@angular/core/testing';
import { AuthNoticeService } from './auth-notice.service';

/**
 * Spec 095 (FR-031, R12) — el aviso "Contraseña actualizada" cruza de
 * `/reset-password` a `/login`. Vive en memoria y **no** en la URL, para que no
 * se pueda fabricar desde fuera, y se lee **una sola vez**, para que una recarga
 * de `/login` no lo repita.
 */
describe('AuthNoticeService', () => {
  let service: AuthNoticeService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AuthNoticeService] });
    service = TestBed.inject(AuthNoticeService);
  });

  it('sin aviso fijado, consume() devuelve null', () => {
    expect(service.consume()).toBeNull();
  });

  it('lo que se fija con set() se lee con consume()', () => {
    service.set('password-updated');
    expect(service.consume()).toBe('password-updated');
  });

  it('es de un solo uso: la segunda lectura ya no devuelve nada (R12)', () => {
    service.set('password-updated');

    expect(service.consume()).toBe('password-updated');
    expect(service.consume()).toBeNull();
    expect(service.consume()).toBeNull();
  });

  it('se puede volver a fijar después de consumirlo', () => {
    service.set('password-updated');
    service.consume();

    service.set('password-updated');
    expect(service.consume()).toBe('password-updated');
  });
});
