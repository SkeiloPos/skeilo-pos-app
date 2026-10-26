import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CashMovementModalComponent } from './cash-movement-modal.component';
import { CashSessionStore } from '../services/cash-session.store';

describe('CashMovementModalComponent', () => {
  function fakeStoreFactory(overrides: Record<string, unknown> = {}) {
    return {
      categoriasModal: signal<string[]>([]),
      closeModal: vi.fn(),
      confirmarMovimiento: vi.fn(),
      error: signal<string | null>(null),
      formCategoria: signal(''),
      formMonto: signal(''),
      formNota: signal(''),
      isSubmitting: signal(false),
      modalTitulo: signal('Nuevo movimiento'),
      movimientoDisabled: signal(false),
      esIngreso: signal(false),
      puedeAgregarSegundoMetodo: signal(false),
      formSegundaLinea: signal(false),
      formPaymentMethodId: signal(''),
      formSegundoMetodo: signal(''),
      formSegundoMonto: signal(''),
      metodosLinea1: signal([]),
      metodosLinea2: signal([]),
      agregarSegundoMetodo: vi.fn(),
      quitarSegundoMetodo: vi.fn(),
      ...overrides,
    };
  }

  function crear(overrides: Record<string, unknown> = {}) {
    const fakeStore = fakeStoreFactory(overrides);
    TestBed.configureTestingModule({
      imports: [CashMovementModalComponent],
      providers: [{ provide: CashSessionStore, useValue: fakeStore }],
    });
    const fixture = TestBed.createComponent(CashMovementModalComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, store: fakeStore };
  }

  it('ya no renderiza el ícono de cerrar como SVG artesanal', () => {
    const { el } = crear();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el botón de cerrar con el nuevo componente de ícono (ligadura "close")', () => {
    const { el } = crear();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon).toBeTruthy();
    expect(icon!.textContent?.trim()).toBe('close');
  });

  // ── Selector de método de pago para "Ingreso" (spec 135, US2/US3) ────────

  it('no muestra el selector de método ni "Agregar otro método" para egreso/retiro (solo queda el de categoría)', () => {
    const { el } = crear({ esIngreso: signal(false) });
    expect(el.querySelectorAll('select').length).toBe(1); // el de "Categoría", sin cambios
    const botones = Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(botones).not.toContain('Agregar otro método');
  });

  it('muestra el selector de método (además del de categoría) cuando el tipo es "Ingreso"', () => {
    const { el } = crear({
      esIngreso: signal(true),
      metodosLinea1: signal([{ id: 'pm-cash', name: 'Efectivo', is_cash: true }]),
    });
    const selects = el.querySelectorAll('select');
    expect(selects.length).toBe(2);
    const metodoSelect = selects[1];
    expect(metodoSelect.querySelector('option[value="pm-cash"]')?.textContent?.trim()).toBe('Efectivo');
  });

  it('muestra "Agregar otro método" solo cuando el tenant tiene ≥ 2 métodos activos (FR-013)', () => {
    const { el } = crear({ esIngreso: signal(true), puedeAgregarSegundoMetodo: signal(true) });
    const boton = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Agregar otro método',
    );
    expect(boton).toBeTruthy();
  });

  it('con una segunda línea activa, muestra su selector y su "Quitar" (US3)', () => {
    const { el, store } = crear({
      esIngreso: signal(true),
      formSegundaLinea: signal(true),
      metodosLinea2: signal([{ id: 'pm-nequi', name: 'Nequi', is_cash: false }]),
    });
    // Categoría + método línea 1 + método línea 2.
    const selects = el.querySelectorAll('select');
    expect(selects.length).toBe(3);
    const quitar = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Quitar');
    quitar!.dispatchEvent(new Event('click'));
    expect((store as { quitarSegundoMetodo: () => void }).quitarSegundoMetodo).toHaveBeenCalled();
  });
});
