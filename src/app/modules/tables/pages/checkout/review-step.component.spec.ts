import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { ReviewStepComponent } from './review-step.component';
import { CartLine, DiningCartService } from '../../services/dining-cart.service';

/**
 * spec 092 (US4, research.md D10) — **base de no-regresión del paso 1**.
 *
 * Este archivo se escribe **antes** de extraer el resumen a
 * `checkout-order-summary.component.ts`, no después: la extracción es la única
 * parte de la spec 092 con riesgo de regresión sobre una pantalla que hoy
 * funciona, y la idea es hacerla contra una red de tests y no contra una
 * inspección visual. Fija el formato de cada renglón, el orden de las líneas y
 * la fila Total tal como se ven hoy.
 *
 * **Sin el prefijo `"CONGELA comportamiento actual:"` a propósito.** Ese prefijo
 * marca, por el Principio III, comportamiento que no se toca sin una decisión de
 * negocio — y aquí ya hay una: la spec autoriza una diferencia en esta pantalla
 * (la fila "Ahorro", research.md D6, confirmada el 2026-10-02). Congelar algo
 * que el mismo spec va a cambiar obligaría a editar el test en el commit que lo
 * crea, que es justo el anti-patrón que el Principio III existe para evitar.
 */
function buildLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'l1',
    productName: 'Granizado del diablo',
    variantName: 'Vaso',
    optionNames: [],
    quantity: 1,
    notes: null,
    unitPrice: 15000,
    addonsTotal: 0,
    lineTotal: 15000,
    productVariantId: 'v1',
    optionKey: '',
    optionSelections: [],
    ...overrides,
  };
}

describe('ReviewStepComponent', () => {
  let fixture: ComponentFixture<ReviewStepComponent>;
  let cart: {
    lines: ReturnType<typeof signal<CartLine[]>>;
    total: ReturnType<typeof signal<number>>;
    count: ReturnType<typeof signal<number>>;
    grossTotal: ReturnType<typeof signal<number>>;
    savings: ReturnType<typeof signal<number>>;
    isEmpty: ReturnType<typeof computed<boolean>>;
  };
  let navigate: ReturnType<typeof vi.fn>;

  interface CartState {
    lines?: CartLine[];
    total?: number;
    count?: number;
    savings?: number;
  }

  function render(state: CartState = {}): void {
    TestBed.resetTestingModule();
    const lines = signal<CartLine[]>(state.lines ?? []);
    cart = {
      lines,
      total: signal(state.total ?? 0),
      count: signal(state.count ?? 0),
      grossTotal: signal(0),
      savings: signal(state.savings ?? 0),
      isEmpty: computed(() => lines().length === 0),
    };
    navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [ReviewStepComponent],
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'test-token' } } } },
        { provide: DiningCartService, useValue: cart },
      ],
    });
    fixture = TestBed.createComponent(ReviewStepComponent);
    fixture.detectChanges();
  }

  const text = (): string => (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();
  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));
  const continuar = (): HTMLButtonElement =>
    buttons().find((b) => b.textContent?.includes('Elegir método de pago'))!;

  // ── Formato de cada renglón, tal como se ve hoy ────────────────────────────

  it('pinta cantidad, producto, presentación, adicionales, nota y total de línea', () => {
    render({
      lines: [
        buildLine({
          quantity: 2,
          productName: 'Granizado del diablo',
          variantName: 'Vaso',
          optionNames: ['Tocino x2', 'Queso'],
          notes: 'sin sal',
          lineTotal: 33000,
        }),
      ],
      total: 33000,
      count: 2,
    });

    expect(text()).toContain('2×');
    expect(text()).toContain('Granizado del diablo · Vaso');
    expect(text()).toContain('Tocino x2, Queso'); // unidos con ", "
    expect(text()).toContain('"sin sal"'); // entre comillas
    expect(text()).toContain('$ 33.000');
  });

  it('una línea sin adicionales y sin nota no pinta esos dos renglones', () => {
    render({ lines: [buildLine()], total: 15000, count: 1 });

    expect(fixture.nativeElement.querySelectorAll('p.text-gray-400').length).toBe(0);
  });

  it('pinta la nota en cursiva, como hoy', () => {
    render({ lines: [buildLine({ notes: 'sin sal' })], total: 15000, count: 1 });
    const nota = Array.from(
      fixture.nativeElement.querySelectorAll('p') as NodeListOf<HTMLElement>,
    ).find((p) => p.textContent?.includes('sin sal'))!;

    expect(nota.className).toContain('italic');
  });

  it('respeta el orden en que llegan las líneas', () => {
    render({
      lines: [
        buildLine({ id: 'a', productName: 'Primero' }),
        buildLine({ id: 'b', productName: 'Segundo' }),
        buildLine({ id: 'c', productName: 'Tercero' }),
      ],
      total: 45000,
      count: 3,
    });
    const renglones = Array.from(
      fixture.nativeElement.querySelectorAll('p.text-gray-800') as NodeListOf<HTMLElement>,
    ).map((p) => p.textContent ?? '');

    expect(renglones[0]).toContain('Primero');
    expect(renglones[1]).toContain('Segundo');
    expect(renglones[2]).toContain('Tercero');
  });

  // ── La fila Total ─────────────────────────────────────────────────────────

  it('pinta la fila Total con el valor de cart.total() formateado', () => {
    render({ lines: [buildLine()], total: 27000, count: 1 });

    expect(text()).toContain('Total');
    expect(text()).toContain('$ 27.000');
  });

  it('el Total es el vigente que le pasa el servicio, no la suma de las líneas', () => {
    // RN-001: ninguna cifra se calcula en el front. La línea vale 15.000 y el
    // total 27.000 (promoción de pedido): se pinta el 27.000.
    render({ lines: [buildLine({ lineTotal: 15000 })], total: 27000, count: 1 });

    expect(text()).toContain('$ 27.000');
  });

  it('no muestra impuestos ni subtotal (FR-013, SC-007)', () => {
    render({ lines: [buildLine()], total: 15000, count: 1 });

    expect(text()).not.toMatch(/impuesto|iva|subtotal/i);
  });

  // ── El encabezado y la acción de la pantalla, que la extracción conserva ───

  it('conserva el h1 "Tu pedido" y el botón de continuar', () => {
    render({ lines: [buildLine()], total: 15000, count: 1 });

    expect((fixture.nativeElement.querySelector('h1') as HTMLElement).textContent).toContain('Tu pedido');
    expect(continuar()).toBeTruthy();
  });

  it('con el carrito vacío el botón de continuar queda deshabilitado', () => {
    render({ lines: [], total: 0, count: 0 });

    expect(continuar().disabled).toBe(true);
  });

  it('con líneas, continuar lleva al paso de método de pago', () => {
    render({ lines: [buildLine()], total: 15000, count: 1 });

    continuar().click();

    expect(navigate).toHaveBeenCalledWith(['/menu/t', 'test-token', 'checkout', 'method']);
  });
});
