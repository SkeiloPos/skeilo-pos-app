import { TestBed } from '@angular/core/testing';
import { ProductListCardComponent } from './product-list-card.component';
import { Product } from '../interfaces/product.interface';

const BASE: Product = {
  id: 'p1',
  category_id: 'c1',
  category_name: 'Postres fríos',
  name: 'Fresa boom',
  image_url: null,
  preparation_type: 'prepared',
  active: true,
  available: true,
  available_changed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  price_display: null,
  price_from: false,
};

function crear(product: Product) {
  TestBed.configureTestingModule({ imports: [ProductListCardComponent] });
  const fixture = TestBed.createComponent(ProductListCardComponent);
  fixture.componentRef.setInput('product', product);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ProductListCardComponent — precio resumido (spec 152, US3, FR-005/FR-006)', () => {
  it('muestra el precio exacto cuando price_from es false', () => {
    const el = crear({ ...BASE, price_display: '12000.00', price_from: false });
    expect(el.textContent).toContain('$ 12.000');
    expect(el.textContent).not.toContain('Desde');
  });

  it('antepone "Desde" cuando price_from es true', () => {
    const el = crear({ ...BASE, price_display: '9000.00', price_from: true });
    expect(el.textContent).toContain('Desde $ 9.000');
  });

  it('muestra "Sin precio" cuando price_display es null', () => {
    const el = crear({ ...BASE, price_display: null, price_from: false });
    expect(el.textContent).toContain('Sin precio');
  });
});

describe('ProductListCardComponent — marcador "Sin imagen" (FR-007)', () => {
  it('renderiza el ícono image-off cuando image_url es null', () => {
    const el = crear({ ...BASE, image_url: null });
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('hide_image');
    expect(el.querySelector('img')).toBeNull();
  });

  it('renderiza la imagen cuando image_url está presente', () => {
    const el = crear({ ...BASE, image_url: 'https://example.invalid/copa.jpg' });
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.invalid/copa.jpg');
  });
});

describe('ProductListCardComponent — categoría sin resolver (edge case data-model.md)', () => {
  it('muestra "Sin categoría" cuando category_name es null', () => {
    const el = crear({ ...BASE, category_name: null });
    expect(el.textContent).toContain('Sin categoría');
  });
});
