import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ProductDetailPageComponent } from './product-detail-page.component';

const tick = () => new Promise((r) => setTimeout(r, 0));

const PRODUCT_DETAIL = {
  id: 'p1',
  category_id: 'c1',
  name: 'Fresa boom',
  description: 'Helado de fresa con topping',
  preparation_type: 'prepared',
  image_url: null,
  active: true,
  available: true,
  available_changed_at: null,
  available_changed_by_name: null,
  tracks_inventory: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  variants: [
    { id: 'v1', product_id: 'p1', sku: null, price: '18000', active: true, presentation_id: 'pr1', presentation_name: '1 litro' },
  ],
};

async function crear() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductDetailPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProductDetailPageComponent);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  await tick();
  http.match(() => true).forEach((req) => req.flush(PRODUCT_DETAIL));

  const el = fixture.nativeElement as HTMLElement;
  const start = Date.now();
  while (!el.textContent?.includes('Fresa boom') && Date.now() - start < 1000) {
    await tick();
    fixture.detectChanges();
  }

  return el;
}

describe('ProductDetailPageComponent (spec 093, escenario 9)', () => {
  it('renderiza los campos de solo lectura: nombre, descripción, presentación y precio', async () => {
    const el = await crear();
    expect(el.textContent).toContain('Fresa boom');
    expect(el.textContent).toContain('Helado de fresa con topping');
    expect(el.textContent).toContain('1 litro');
    expect(el.textContent).toContain('$');
    expect(el.textContent).toContain('18.000');
  });

  it('no renderiza costo, receta ni datos de inventario', async () => {
    const el = await crear();
    const text = el.textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('costo');
    expect(text).not.toContain('receta');
    expect(text).not.toContain('inventario');
    expect(text).not.toContain('insumo');
  });

  it('el interruptor "Agotado" está presente y habilitado para un producto activo', async () => {
    const el = await crear();
    const toggle = el.querySelector('button[role="switch"]') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.disabled).toBe(false);
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
  });
});
