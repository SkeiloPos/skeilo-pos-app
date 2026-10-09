import { TestBed } from '@angular/core/testing';
import { SupplierItemListComponent } from './supplier-item-list.component';
import { SupplierItem } from '../interfaces/supplier-item.interface';

function relation(overrides: Partial<SupplierItem> = {}): SupplierItem {
  return {
    id: 'rel-1',
    supplier_id: 'sup-1',
    supplier_name: 'Distribuidora Norte',
    inventory_item_id: 'item-1',
    inventory_item_name: 'Almendras',
    presentation: 'Bolsa x 500 g',
    conversion_factor: 500,
    last_cost: 8000,
    last_cost_at: '2026-10-09T00:00:00Z',
    active: true,
    preferred: false,
    equivalence: '1 Bolsa x 500 g = 500 g · $16/g',
    was_preferred: false,
    ...overrides,
  };
}

describe('SupplierItemListComponent', () => {
  function crear(items: SupplierItem[], mode: 'item' | 'supplier' = 'item') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SupplierItemListComponent] });
    const fixture = TestBed.createComponent(SupplierItemListComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el nombre del proveedor cuando mode="item"', () => {
    const fixture = crear([relation()], 'item');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Distribuidora Norte');
    expect(text).not.toContain('Almendras');
  });

  it('muestra el nombre del insumo cuando mode="supplier"', () => {
    const fixture = crear([relation()], 'supplier');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Almendras');
  });

  it('muestra la equivalencia y el estado de la relación', () => {
    const fixture = crear([relation({ active: false })]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('1 Bolsa x 500 g = 500 g · $16/g');
    expect(text).toContain('Inactiva');
  });

  it('emite "prefer" al hacer clic en la estrella de una relación activa', () => {
    const fixture = crear([relation()]);
    const emitted: string[] = [];
    fixture.componentInstance.prefer.subscribe((id: string) => emitted.push(id));

    const star = (fixture.nativeElement as HTMLElement).querySelector('button');
    star?.dispatchEvent(new Event('click'));

    expect(emitted).toEqual(['rel-1']);
  });

  it('no permite marcar como preferida una relación inactiva (botón deshabilitado)', () => {
    const fixture = crear([relation({ active: false })]);
    const star = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(star?.hasAttribute('disabled')).toBe(true);
  });

  it('muestra el mensaje vacío correcto por modo cuando no hay relaciones', () => {
    const fixtureItem = crear([], 'item');
    expect((fixtureItem.nativeElement as HTMLElement).textContent).toContain(
      'Ningún proveedor vinculado todavía',
    );

    const fixtureSupplier = crear([], 'supplier');
    expect((fixtureSupplier.nativeElement as HTMLElement).textContent).toContain(
      'Ningún insumo vinculado todavía',
    );
  });
});
