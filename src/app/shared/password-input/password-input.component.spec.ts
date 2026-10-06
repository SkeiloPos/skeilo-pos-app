import { TestBed } from '@angular/core/testing';
import { PasswordInputComponent } from './password-input.component';

/**
 * Spec 095 — el ojo de la contraseña vive en este componente compartido, así que
 * aquí es donde se protege su accesibilidad: alcanzable por teclado (FR-040,
 * WCAG 2.1.1) y anunciando **la acción** que ejecuta, no solo su estado (FR-016).
 * Lo usan las cinco pantallas que montan `app-password-input`.
 */
describe('PasswordInputComponent — accesibilidad del control de visibilidad', () => {
  function crear() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PasswordInputComponent] });
    const fixture = TestBed.createComponent(PasswordInputComponent);
    fixture.detectChanges();
    return fixture;
  }

  function ojo(fixture: ReturnType<typeof crear>): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector('button')!;
  }

  it('el botón del ojo es alcanzable por teclado: no lleva tabindex="-1" (FR-040, R9)', () => {
    const boton = ojo(crear());
    expect(boton.getAttribute('tabindex')).toBeNull();
    // Un `<button>` sin tabindex negativo es enfocable por definición.
    expect(boton.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it('con la contraseña oculta anuncia la acción "Mostrar contraseña" (FR-016, A4)', () => {
    const fixture = crear();
    const boton = ojo(fixture);
    expect(boton.getAttribute('aria-label')).toBe('Mostrar contraseña');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
  });

  it('con la contraseña visible anuncia la acción contraria, "Ocultar contraseña" (FR-016)', () => {
    const fixture = crear();
    fixture.componentInstance.toggle();
    fixture.detectChanges();
    const boton = ojo(fixture);
    expect(boton.getAttribute('aria-label')).toBe('Ocultar contraseña');
    expect(boton.getAttribute('aria-pressed')).toBe('true');
  });

  it('activarlo alterna el tipo del campo entre password y text', () => {
    const fixture = crear();
    const campo = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    expect(campo.type).toBe('password');

    ojo(fixture).click();
    fixture.detectChanges();
    expect(campo.type).toBe('text');
  });

  it('focus() lleva el foco al <input> interno, que el padre no puede alcanzar (FR-013, R8)', () => {
    const fixture = crear();
    const campo = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    // El fixture tiene que estar en el documento para que `document.activeElement`
    // refleje el foco real.
    document.body.appendChild(fixture.nativeElement as HTMLElement);

    fixture.componentInstance.focus();

    expect(document.activeElement).toBe(campo);
  });
});
