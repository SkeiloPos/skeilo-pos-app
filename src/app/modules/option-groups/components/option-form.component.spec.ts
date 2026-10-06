import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { OptionFormComponent } from './option-form.component';
import { InventoryService } from '../../inventory/services/inventory.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { Option, OptionGroup } from '../../products/interfaces/product.interface';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';

const API = environment.apiBaseUrl;
const GROUPS = `${API}/option-groups`;
const OPTIONS = `${API}/options`;

class FakeInventoryService {
  allItems = signal<unknown[]>([{ id: 'i1', name: 'Fresa', current_stock: 100 }]);
  loadAllItems(): void {}
  /** spec 098: búsqueda remota del picker de insumo — por defecto, sin resultados. */
  searchActiveItems(_query: string): Promise<{ id: string; name: string }[]> {
    return Promise.resolve([]);
  }
}
class FakeUnitMeasureService {
  unitMeasures = signal<unknown[]>([]);
  async loadUnitMeasures(): Promise<void> {}
}

function makeGroup(partial: Partial<OptionGroup> = {}): OptionGroup {
  return {
    id: 'g1',
    name: 'Sabores',
    min_select: 1,
    max_select: 1,
    active: true,
    pricing_type: 'con_recargo',
    selection_mode: 'conteo',
    max_quantity_per_option: null,
    max_total_quantity: null,
    options: [],
    ...partial,
  };
}

function makeOption(partial: Partial<Option> = {}): Option {
  return {
    id: 'o1',
    option_group_id: 'g1',
    name: 'Fresa',
    extra_price: 0,
    inventory_item_id: null,
    item_quantity: 0,
    active: true,
    ...partial,
  };
}

describe('OptionFormComponent', () => {
  let fixture: ComponentFixture<OptionFormComponent>;
  let component: OptionFormComponent;
  let http: HttpTestingController;

  async function create(
    group: OptionGroup | null,
    option: Option | null,
    inventarioIncluido: boolean,
  ): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OptionFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
      ],
    });
    fixture = TestBed.createComponent(OptionFormComponent);
    component = fixture.componentInstance;
    component.group = group;
    component.option = option;
    component.inventarioIncluido = inventarioIncluido;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit
  }

  afterEach(() => http.verify());

  const text = (): string => fixture.nativeElement.textContent as string;
  const priceInput = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('app-money-input');

  // ── FR-002/FR-003: precio bloqueado en grupos "incluido" ──────────────────

  it('grupo "incluido": el campo de precio no aparece, y se avisa que está cubierto por la presentación', async () => {
    await create(makeGroup({ pricing_type: 'incluido' }), null, true);

    expect(priceInput()).toBeNull();
    expect(text()).toContain('Incluido');
    // `.value` excluye controles deshabilitados -- `getRawValue()` es lo que `onSubmit()`
    // realmente usa para construir el payload (ver componente).
    expect(component.form.getRawValue().extra_price).toBe(0);
  });

  it('grupo "con_recargo": el campo de precio aparece editable', async () => {
    await create(makeGroup({ pricing_type: 'con_recargo' }), null, true);

    expect(priceInput()).not.toBeNull();
  });

  it('guardar una opción en un grupo "incluido" siempre envía extra_price=0, sin importar el valor previo del control', async () => {
    await create(makeGroup({ pricing_type: 'incluido' }), null, true);
    component.form.patchValue({ name: 'Fresa' });
    fixture.detectChanges();

    component.onSubmit();
    const req = http.expectOne(`${GROUPS}/g1/options`);
    expect(req.request.body.extra_price).toBe(0);
    req.flush(makeOption());
    await Promise.resolve();
    http.expectOne(GROUPS).flush([]);
  });

  // ── Gating por plan (spec 064, US5): insumo/cantidad ocultos sin módulo ───

  it('sin el módulo Inventario, los campos de insumo y cantidad no aparecen', async () => {
    await create(makeGroup({ pricing_type: 'con_recargo' }), null, false);

    expect(text()).not.toContain('Insumo que consume');
    expect(text()).toContain('no incluye el módulo de inventario');
  });

  it('con el módulo Inventario incluido, el campo de insumo aparece con normalidad', async () => {
    await create(makeGroup({ pricing_type: 'con_recargo' }), null, true);

    expect(text()).toContain('Insumo que consume');
  });

  it('editar una opción que ya tenía insumo, sin el módulo: el insumo se reenvía sin cambios (no se pierde)', async () => {
    await create(
      makeGroup({ pricing_type: 'con_recargo' }),
      makeOption({ inventory_item_id: 'i1', item_quantity: 80 }),
      false,
    );
    component.form.patchValue({ name: 'Fresa (renombrada)' });
    fixture.detectChanges();

    component.onSubmit();
    const req = http.expectOne(`${OPTIONS}/o1`);
    expect(req.request.body.inventory_item_id).toBe('i1');
    expect(req.request.body.item_quantity).toBe(80);
    req.flush(makeOption({ inventory_item_id: 'i1', item_quantity: 80, name: 'Fresa (renombrada)' }));
    await Promise.resolve();
    http.expectOne(GROUPS).flush([]);
  });

  it('con el módulo Inventario, se puede enlazar un insumo nuevo con normalidad', async () => {
    await create(makeGroup({ pricing_type: 'con_recargo' }), null, true);
    component.form.patchValue({ name: 'Fresa', inventory_item_id: 'i1', item_quantity: 80 });
    fixture.detectChanges();

    component.onSubmit();
    const req = http.expectOne(`${GROUPS}/g1/options`);
    expect(req.request.body.inventory_item_id).toBe('i1');
    expect(req.request.body.item_quantity).toBe(80);
    req.flush(makeOption({ inventory_item_id: 'i1', item_quantity: 80 }));
    await Promise.resolve();
    http.expectOne(GROUPS).flush([]);
  });

  it('el selector de insumo busca en el servidor: encuentra un insumo aunque no esté en la lista ya cargada (spec 098)', async () => {
    await create(makeGroup({ pricing_type: 'con_recargo' }), null, true);

    const inventoryService = TestBed.inject(InventoryService) as unknown as FakeInventoryService;
    const insumoLejano = { id: 'i-105', name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS' };
    inventoryService.searchActiveItems = vi.fn().mockResolvedValue([insumoLejano]);

    const picker = fixture.debugElement.query(By.directive(SearchableSelectComponent));
    expect(picker).toBeTruthy();
    const searchFn = picker!.componentInstance.search as
      | ((q: string) => Promise<{ id: string; label: string }[]>)
      | undefined;
    expect(searchFn).toBeTruthy();

    const resultado = await searchFn!('mozar');

    expect(inventoryService.searchActiveItems).toHaveBeenCalledWith('mozar');
    expect(resultado).toEqual([{ id: 'i-105', label: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS' }]);
  });

  it('el botón de cerrar ya no es un SVG artesanal (spec 082)', async () => {
    await create(makeGroup(), null, false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('close');
  });
});
