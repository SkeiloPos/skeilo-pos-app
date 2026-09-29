import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CartItemOptionsComponent } from './cart-item-options.component';
import { CartOptionLine } from '../services/pos-terminal.store';

describe('CartItemOptionsComponent', () => {
  let fixture: ComponentFixture<CartItemOptionsComponent>;
  let component: CartItemOptionsComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CartItemOptionsComponent] });
    fixture = TestBed.createComponent(CartItemOptionsComponent);
    component = fixture.componentInstance;
  });

  function setInputs(options: CartOptionLine[], notes: string | null = null): void {
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('notes', notes);
    fixture.detectChanges();
  }

  it('sin opciones ni nota no muestra nada', () => {
    setInputs([]);
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('agrupa las opciones por el nombre de su grupo', () => {
    setInputs([
      { groupLabel: 'Sabores', text: 'Chicle' },
      { groupLabel: 'Sabores', text: 'Combinado' },
      { groupLabel: 'Toppings', text: 'Bombum' },
    ]);

    expect(component.optionGroups()).toEqual([
      { label: 'Sabores', items: ['Chicle', 'Combinado'] },
      { label: 'Toppings', items: ['Bombum'] },
    ]);
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Sabores:');
    expect(texto).toContain('Chicle, Combinado');
    expect(texto).toContain('Toppings:');
    expect(texto).toContain('Bombum');
  });

  it('los componentes de un combo (sin grupo) van juntos, sin etiqueta', () => {
    setInputs([
      { groupLabel: null, text: '1x Cono sencillo' },
      { groupLabel: null, text: '1x Gaseosa' },
    ]);

    expect(component.optionGroups()).toEqual([
      { label: null, items: ['1x Cono sencillo', '1x Gaseosa'] },
    ]);
    expect(fixture.nativeElement.textContent).toContain('1x Cono sencillo, 1x Gaseosa');
  });

  // La caja que agrupa sabores/toppings es un `<div>` con esquinas de 8px;
  // la nota es un `<span data-testid="item-note">` aparte -- selectores
  // distintos para no confundir una con otra (las dos tienen clase `border`).
  const box = (): HTMLElement | null => fixture.nativeElement.querySelector('div[class*="rounded-[8px]"]');

  it('con opciones y nota, la nota se ve dentro de la misma caja', () => {
    setInputs([{ groupLabel: 'Sabores', text: 'Fresa' }], 'sin azucar por favor');

    const caja = box();
    expect(caja).toBeTruthy();
    expect(caja!.textContent).toContain('Fresa');
    expect(caja!.textContent).toContain('Nota:');
    expect(caja!.textContent).toContain('sin azucar por favor');
  });

  it('sin opciones pero con nota, la nota se ve suelta (sin caja)', () => {
    setInputs([], 'para llevar');

    expect(box()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Nota:');
    expect(fixture.nativeElement.textContent).toContain('para llevar');
  });

  // ── spec 087, FR-017 (US11): nota por producto legible, con un único estilo ──

  const notas = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[data-testid="item-note"]'));

  it('FR-017: la nota se renderiza una sola vez, con y sin opciones', () => {
    setInputs([{ groupLabel: 'Sabores', text: 'Fresa' }], 'sin azúcar');
    expect(notas().length).toBe(1);

    setInputs([], 'sin azúcar');
    expect(notas().length).toBe(1);
  });

  it('FR-017: la nota lleva texto de 16px, semibold, fondo de alto contraste y sin cursiva', () => {
    setInputs([{ groupLabel: 'Sabores', text: 'Fresa' }], 'sin azúcar');

    const clases = notas()[0].classList;
    expect(clases.contains('text-base')).toBe(true);
    expect(clases.contains('font-semibold')).toBe(true);
    expect(clases.contains('italic')).toBe(false);
    expect(clases.contains('rounded-full')).toBe(false);
    expect(clases.contains('rounded-lg')).toBe(true);
    expect(clases.contains('bg-amber-100')).toBe(true);
    expect(clases.contains('text-amber-900')).toBe(true);
    expect(notas()[0].textContent).toContain('Nota:');
    expect(notas()[0].textContent).toContain('sin azúcar');
  });

  it('FR-017: sin nota no hay contenedor de nota, con o sin opciones', () => {
    setInputs([{ groupLabel: 'Sabores', text: 'Fresa' }], null);
    expect(notas().length).toBe(0);

    setInputs([], null);
    expect(notas().length).toBe(0);
  });

  it('FR-017: una nota larga conserva el ajuste de línea (no desborda la tarjeta)', () => {
    setInputs([], 'sin azúcar, poco hielo, servir en vaso grande y entregar primero en la mesa cuatro por favor');

    const clases = notas()[0].classList;
    expect(clases.contains('break-words')).toBe(true);
    expect(clases.contains('whitespace-pre-wrap')).toBe(true);
    expect(clases.contains('w-full')).toBe(true);
  });
});
