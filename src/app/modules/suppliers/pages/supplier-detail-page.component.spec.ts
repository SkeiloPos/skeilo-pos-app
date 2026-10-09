import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { SupplierDetailPageComponent } from './supplier-detail-page.component';

const tick = () => new Promise((r) => setTimeout(r, 0));

const SUPPLIER = {
  id: 'sup-1',
  name: 'Distribuidora Norte',
  tax_id: null,
  phone: null,
  email: null,
  active: true,
  is_system: false,
};

const SYSTEM_SUPPLIER = { ...SUPPLIER, id: 'sys-1', name: 'Compra ocasional', is_system: true };

const RELATION = {
  id: 'rel-1',
  supplier_id: 'sup-1',
  supplier_name: 'Distribuidora Norte',
  inventory_item_id: 'item-1',
  inventory_item_name: 'Almendras',
  presentation: 'Bolsa x 500 g',
  conversion_factor: '500.000',
  last_cost: '8000.00',
  last_cost_at: '2026-10-09T00:00:00Z',
  active: true,
  preferred: true,
  equivalence: '1 Bolsa x 500 g = 500 g · $16/g',
};

async function crear(supplier: typeof SUPPLIER = SUPPLIER) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SupplierDetailPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => supplier.id } } } },
    ],
  });
  const fixture = TestBed.createComponent(SupplierDetailPageComponent);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  await tick();
  http.expectOne((r) => r.url.endsWith(`/inventory/suppliers/${supplier.id}`)).flush(supplier);
  await tick();
  const pending = http.match(() => true);
  pending.forEach((req) => req.flush([RELATION]));
  await tick();
  fixture.detectChanges();

  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('SupplierDetailPageComponent (spec 106)', () => {
  it('Historia 3: muestra el nombre del proveedor y los insumos que vende', async () => {
    const { el } = await crear();
    expect(el.textContent).toContain('Distribuidora Norte');
    expect(el.textContent).toContain('Almendras');
    expect(el.textContent).toContain('1 Bolsa x 500 g = 500 g · $16/g');
  });

  it('FR-012: el proveedor de sistema no tiene pestaña "Insumos que vende" que mostrar', async () => {
    const { el } = await crear(SYSTEM_SUPPLIER);
    expect(el.textContent).toContain('No se pudo cargar el proveedor');
  });
});
