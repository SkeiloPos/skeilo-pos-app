import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductSelectPosComponent } from './product-select-pos.component';
import {
  MenuOption, MenuOptionGroup, MenuProduct, MenuVariant,
} from '../../products/interfaces/product.interface';
import { simulateTranslation } from '../../../testing/simulate-translation';

function makeVariant(partial: Partial<MenuVariant> = {}): MenuVariant {
  return { id: 'v1', name: 'Única', price: 15000, available: true, option_groups: [], ...partial };
}

function makeOption(partial: Partial<MenuOption> = {}): MenuOption {
  return { id: 'o1', name: 'Opción', extra_price: 0, available: true, ...partial };
}

function makeGroup(partial: Partial<MenuOptionGroup> = {}): MenuOptionGroup {
  return {
    id: 'g1', name: 'Grupo', min_select: 0, max_select: 1, consume: false,
    selection_mode: 'conteo', max_quantity_per_option: null, max_total_quantity: null,
    options: [],
    ...partial,
  };
}

function makeProduct(partial: Partial<MenuProduct> = {}): MenuProduct {
  return {
    id: 'p1', name: 'Producto', description: null, image_url: null,
    variants: [makeVariant()], option_groups: [], available: true,
    ...partial,
  };
}

/**
 * Spec 134 (US5, FR-021, nivel B). Este componente no tenía spec propio: solo
 * cubre el botón de confirmar, la etiqueta alternante que más se ve en el POS
 * ("Agregar · total" ↔ "Elige una presentación"). El resto de su comportamiento
 * lo ejercitan las specs de la Terminal y de la orden manual.
 */
describe('ProductSelectPosComponent — botón de confirmar con la página alterada (spec 134)', () => {
  let fixture: ComponentFixture<ProductSelectPosComponent>;
  let component: ProductSelectPosComponent;

  function create(product: MenuProduct): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductSelectPosComponent] });
    fixture = TestBed.createComponent(ProductSelectPosComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('product', product);
    // `openToken` es lo que reinicia la selección (ngOnChanges): se sube como lo hace la Terminal al abrir.
    fixture.componentRef.setInput('openToken', 1);
    fixture.detectChanges();
  }

  const boton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button.w-full.h-14') as HTMLButtonElement;
  const texto = (): string => (boton().textContent ?? '').replace(/\s+/g, ' ').trim();
  const dinero = (n: string): RegExp => new RegExp('^Agregar\\s*\\$\\s*' + n + '$');

  it('sin traductor, el botón dice "Agregar" y el total de la selección', () => {
    create(makeProduct({ variants: [makeVariant({ price: 4000 })] }));

    expect(texto()).toMatch(dinero('4\\.000'));

    component.quantity.set(3);
    fixture.detectChanges();
    expect(texto()).toMatch(dinero('12\\.000'));
  });

  it('con la página alterada, el botón sigue el total real y alterna entre lo que falta y "Agregar + total"', () => {
    create(
      makeProduct({
        variants: [
          makeVariant({ id: 'v1', name: 'Chica', price: 4000 }),
          makeVariant({ id: 'v2', name: 'Grande', price: 6000 }),
        ],
      }),
    );
    const traduccion = simulateTranslation(fixture.nativeElement);
    const boton = (): HTMLButtonElement =>
      fixture.nativeElement.querySelector('button.w-full.h-14') as HTMLButtonElement;
    const texto = (): string => (boton().textContent ?? '').replace(/\s+/g, ' ').trim();
    const dinero = (n: string): RegExp => new RegExp('^Agregar\\s*\\$\\s*' + n + '$');
    const cambiar = (fn: () => void): void => {
      fn();
      fixture.detectChanges();
      traduccion.refresh(); // el traductor sigue activo: traduce lo recién pintado
    };

    // Ya hay una presentación elegida: el botón muestra "Agregar" + total, y el traductor lo envuelve.
    expect(texto()).toMatch(dinero('4\\.000'));

    for (let i = 0; i < 3; i++) {
      // El total sigue a la cantidad aunque el texto ya esté traducido (nivel B).
      cambiar(() => component.quantity.set(3));
      expect(texto(), `×3 #${i}`).toMatch(dinero('12\\.000'));

      // Cambia de rama: lo que falta ↔ "Agregar + total", sin acumular el texto anterior.
      cambiar(() => component.variantId.set(null));
      expect(texto(), `sin presentación #${i}`).toBe('Elige una presentación');

      cambiar(() => component.variantId.set('v2'));
      expect(texto(), `v2 ×3 #${i}`).toMatch(dinero('18\\.000'));

      cambiar(() => component.variantId.set('v1'));
      expect(texto(), `v1 ×3 #${i}`).toMatch(dinero('12\\.000'));

      cambiar(() => component.quantity.set(1));
      expect(texto(), `v1 ×1 #${i}`).toMatch(dinero('4\\.000'));
    }
    expect(texto()).not.toContain('Elige una presentación');
    traduccion.revert();
  });
});

// ── spec 148 (T103, US6.7/FR-017): disponibilidad en vivo a nivel de opción ──

describe('ProductSelectPosComponent — disponibilidad en vivo de la opción', () => {
  let fixture: ComponentFixture<ProductSelectPosComponent>;
  let component: ProductSelectPosComponent;

  function create(product: MenuProduct): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ProductSelectPosComponent] });
    fixture = TestBed.createComponent(ProductSelectPosComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('product', product);
    fixture.componentRef.setInput('openToken', 1);
    fixture.detectChanges();
  }

  it('un cambio kind:"option" agota ese sabor/salsa sin afectar a las demás opciones del grupo', () => {
    const mora = makeOption({ id: 'o1', name: 'Mora', available: true });
    const fresa = makeOption({ id: 'o2', name: 'Fresa', available: true });
    const group = makeGroup({ id: 'g1', name: 'Sabor', selection_mode: 'conteo', max_select: 1, options: [mora, fresa] });
    const producto = makeProduct({ variants: [makeVariant({ option_groups: [group] })] });
    create(producto);

    // Estado inicial: ambas opciones aparecen entre las seleccionables, ninguna en "Agotados".
    let options = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="conteo-option"]'),
    ) as HTMLElement[];
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Mora'), expect.stringContaining('Fresa')]),
    );
    expect(fixture.nativeElement.textContent).not.toContain('Agotados');

    // Llega availability.changed kind:'option' que agota "Mora" -- el padre
    // reasigna una nueva copia inmutable del producto (misma mecánica de T022).
    const parchado = makeProduct({
      variants: [
        makeVariant({
          option_groups: [
            { ...group, options: [{ ...mora, available: false }, fresa] },
          ],
        }),
      ],
    });
    fixture.componentRef.setInput('product', parchado);
    fixture.detectChanges();

    // "Mora" pasa a la lista de Agotados; "Fresa" sigue entre las seleccionables.
    expect(fixture.nativeElement.textContent).toContain('Agotados');
    options = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="conteo-option"]'),
    ) as HTMLElement[];
    expect(options.length).toBe(1);
    expect(options[0].textContent).toContain('Fresa');
    const agotados = fixture.nativeElement.querySelectorAll('.line-through');
    expect(Array.from(agotados).some((el) => (el as HTMLElement).textContent?.includes('Mora'))).toBe(true);
  });

  it('una opción que vuelve a estar disponible se rehabilita sola', () => {
    const mora = makeOption({ id: 'o1', name: 'Mora', available: false });
    const fresa = makeOption({ id: 'o2', name: 'Fresa', available: true });
    const group = makeGroup({ id: 'g1', name: 'Sabor', selection_mode: 'conteo', max_select: 1, options: [mora, fresa] });
    create(makeProduct({ variants: [makeVariant({ option_groups: [group] })] }));

    expect(fixture.nativeElement.textContent).toContain('Agotados');

    fixture.componentRef.setInput('product', makeProduct({
      variants: [
        makeVariant({
          option_groups: [{ ...group, options: [{ ...mora, available: true }, fresa] }],
        }),
      ],
    }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Agotados');
    const options = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="conteo-option"]'),
    ) as HTMLElement[];
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Mora'), expect.stringContaining('Fresa')]),
    );
  });
});
