import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { InventoryItemDetailPageComponent } from './inventory-item-detail-page.component';

const tick = () => new Promise((r) => setTimeout(r, 0));

const ITEM = {
  id: 'item-1',
  name: 'Almendras',
  unit_measure_id: 'unit-1',
  type: 'raw_material',
  current_stock: '0',
  min_stock: '0',
  unit_cost: '0',
  active: true,
};

const UNIT = { id: 'unit-1', name: 'Gramo', abbreviation: 'g', active: true, created_at: '2026-01-01T00:00:00Z' };

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
  preferred: false,
  equivalence: '1 Bolsa x 500 g = 500 g · $16/g',
};

async function crear(relations: unknown[] = [RELATION]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [InventoryItemDetailPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'item-1' } } } },
    ],
  });
  const fixture = TestBed.createComponent(InventoryItemDetailPageComponent);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  await tick();
  http.expectOne((r) => r.url.endsWith('/inventory/items/item-1')).flush(ITEM);
  await tick();
  http.expectOne((r) => r.url.endsWith('/unit-measures/unit-1')).flush(UNIT);
  await tick();
  http.expectOne((r) => r.url.includes('/inventory/items/item-1/suppliers')).flush(relations);
  await tick();
  fixture.detectChanges();

  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

describe('InventoryItemDetailPageComponent (spec 106)', () => {
  it('muestra el nombre del insumo, su unidad base y la relación vinculada', async () => {
    const { el } = await crear();
    expect(el.textContent).toContain('Almendras');
    expect(el.textContent).toContain('Unidad base: g');
    expect(el.textContent).toContain('Distribuidora Norte');
    expect(el.textContent).toContain('1 Bolsa x 500 g = 500 g · $16/g');
  });

  it('FR-011: avisa cuando el insumo tiene relaciones pero ninguna preferida', async () => {
    const { el } = await crear([RELATION]); // RELATION.preferred = false
    expect(el.textContent).toContain('Sin proveedor preferido');
  });

  it('no avisa cuando ya hay una relación preferida activa', async () => {
    const { el } = await crear([{ ...RELATION, preferred: true }]);
    expect(el.textContent).not.toContain('Sin proveedor preferido');
  });

  it('tiene el botón "Vincular proveedor"', async () => {
    const { el } = await crear();
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes('Vincular proveedor'))).toBe(true);
  });
});
