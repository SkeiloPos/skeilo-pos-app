import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { vi } from 'vitest';
import { CashOpenComponent } from './cash-open.component';
import { CashSessionStore } from '../services/cash-session.store';

/**
 * Casos 1, 2 y 4 de contracts/cash-open-form.md (spec 113, User Stories 1 y
 * 3). La fórmula de `aperturaDisabled` en sí ya está cubierta contra el
 * store real en cash-session.store.spec.ts; aquí el store es un doble con
 * un `computed` equivalente, para verificar el cableado del componente
 * (mensaje + atributo `disabled` + clic) sin duplicar esa prueba.
 */
describe('CashOpenComponent — validación de saldo inicial > 0 (spec 113)', () => {
  function crear() {
    const openingAmount = signal(0);
    const selectedRegisterId = signal('reg-1');
    const isSubmitting = signal(false);
    const abrirCaja = vi.fn();
    const fakeStore = {
      error: signal<string | null>(null),
      registers: signal([{ id: 'reg-1', name: 'Caja 1', active: true }]),
      isAdmin: signal(false),
      newRegisterName: signal(''),
      isSubmitting,
      selectedRegisterId,
      cajero: signal('Ana'),
      openingAmount,
      aperturaDisabled: computed(
        () => isSubmitting() || !selectedRegisterId() || openingAmount() <= 0,
      ),
      createRegister: vi.fn(),
      abrirCaja,
    };
    TestBed.configureTestingModule({
      imports: [CashOpenComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashOpenComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, store: fakeStore, abrirCaja };
  }

  function mensaje(el: HTMLElement): HTMLElement | null {
    return (
      Array.from(el.querySelectorAll('p')).find((p) =>
        p.textContent?.includes('El saldo inicial debe ser mayor a cero'),
      ) ?? null
    );
  }

  function boton(el: HTMLElement): HTMLButtonElement {
    return el.querySelector('button') as HTMLButtonElement;
  }

  function escribirSaldo(fixture: ReturnType<typeof TestBed.createComponent>, texto: string): void {
    const input = fixture.nativeElement.querySelector('app-money-input input') as HTMLInputElement;
    input.value = texto;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('caso 1: render inicial con una caja seleccionada, sin tocar el saldo -> mensaje visible y botón deshabilitado', () => {
    const { el } = crear();

    expect(mensaje(el)).toBeTruthy();
    expect(boton(el).disabled).toBe(true);
  });

  it('caso 2: escribir y luego borrar el campo -> mismo resultado que el caso 1', () => {
    const { fixture, el } = crear();

    escribirSaldo(fixture, '50000');
    expect(mensaje(el)).toBeNull();
    expect(boton(el).disabled).toBe(false);

    escribirSaldo(fixture, ''); // (ngModelChange) normaliza el null resultante a 0

    expect(mensaje(el)).toBeTruthy();
    expect(boton(el).disabled).toBe(true);
  });

  it('caso 4: caja seleccionada + saldo inicial válido + clic -> invoca store.abrirCaja()', () => {
    const { fixture, el, abrirCaja } = crear();

    escribirSaldo(fixture, '50000');
    expect(boton(el).disabled).toBe(false);

    boton(el).click();
    fixture.detectChanges();

    expect(abrirCaja).toHaveBeenCalledTimes(1);
  });
});
