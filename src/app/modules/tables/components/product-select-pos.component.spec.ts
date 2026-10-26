import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductSelectPosComponent } from './product-select-pos.component';
import { MenuProduct, MenuVariant } from '../../products/interfaces/product.interface';
import { simulateTranslation } from '../../../testing/simulate-translation';

function makeVariant(partial: Partial<MenuVariant> = {}): MenuVariant {
  return { id: 'v1', name: 'Única', price: 15000, available: true, option_groups: [], ...partial };
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
