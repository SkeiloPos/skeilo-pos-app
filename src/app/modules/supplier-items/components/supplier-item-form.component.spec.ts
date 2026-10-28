import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { SupplierItemFormComponent } from './supplier-item-form.component';
import { SupplierItem } from '../interfaces/supplier-item.interface';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const UNIT_BASE = `${environment.apiBaseUrl}/unit-measures`;
const INVENTORY_BASE = `${environment.apiBaseUrl}/inventory`;

const UNIDAD = {
  id: 'unit-base', name: 'UNIDAD', abbreviation: 'und', factor_to_base: '1.000000',
  active: true, group_id: 'group-conteo', is_base: true, created_at: '2026-01-01T00:00:00Z',
};
const PACA = {
  id: 'unit-paca', name: 'PACA', abbreviation: 'pca', factor_to_base: '24.000000',
  active: true, group_id: 'group-conteo', is_base: false, created_at: '2026-01-01T00:00:00Z',
};
const OTRO_GRUPO = {
  id: 'unit-gr', name: 'GR', abbreviation: 'gr', factor_to_base: '1.000000',
  active: true, group_id: 'group-masa', is_base: true, created_at: '2026-01-01T00:00:00Z',
};

interface CrearOptions {
  mode?: 'item' | 'supplier';
  knownUnitMeasureId?: string | null;
  initial?: Partial<SupplierItem> | null;
}

async function crear(opts: CrearOptions = {}) {
  const { mode = 'item', knownUnitMeasureId = null, initial = null } = opts;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SupplierItemFormComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideTanStackQuery(new QueryClient())],
  });
  const fixture = TestBed.createComponent(SupplierItemFormComponent);
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('fixedId', 'item-1');
  fixture.componentRef.setInput('fixedLabel', 'Almendras');
  fixture.componentRef.setInput('knownUnitMeasureId', knownUnitMeasureId);
  if (initial) fixture.componentRef.setInput('initial', initial);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  await tick();
  http.match((r) => r.url === UNIT_BASE).forEach((req) => req.flush([UNIDAD, PACA, OTRO_GRUPO]));
  if (knownUnitMeasureId) {
    http.match((r) => r.url === `${UNIT_BASE}/${knownUnitMeasureId}`).forEach((req) => req.flush(UNIDAD));
  }
  if (!knownUnitMeasureId && initial) {
    http.match((r) => r.url === `${INVENTORY_BASE}/items/${initial.inventory_item_id}`).forEach((req) =>
      req.flush({
        id: initial.inventory_item_id, code: 'INS-1', name: initial.inventory_item_name,
        unit_measure_id: 'unit-base', type: 'raw_material', current_stock: '0', min_stock: '0',
        unit_cost: '0', active: true, created_at: '2026-01-01T00:00:00Z', updated_at: null,
        preferred_supplier_name: null,
      }),
    );
    await tick();
    http.match((r) => r.url === `${UNIT_BASE}/unit-base`).forEach((req) => req.flush(UNIDAD));
  }
  await tick();
  fixture.detectChanges();
  return { fixture, http };
}

describe('SupplierItemFormComponent', () => {
  it('sin unidad elegida, no se puede enviar', async () => {
    const { fixture } = await crear({ knownUnitMeasureId: 'unit-base' });
    expect(fixture.componentInstance.canSubmit()).toBe(false);
  });

  it('con unidad elegida y un proveedor elegido, se puede enviar', async () => {
    const { fixture } = await crear({ knownUnitMeasureId: 'unit-base' });
    const c = fixture.componentInstance;
    c.unitMeasureId.set('unit-paca');
    c.supplierId.set('sup-1');
    expect(c.canSubmit()).toBe(true);
  });

  it('las opciones de unidad son las del mismo grupo que la base del insumo (incluida la base)', async () => {
    const { fixture } = await crear({ knownUnitMeasureId: 'unit-base' });
    const ids = fixture.componentInstance.unitOptions().map((u) => u.id);
    expect(ids.sort()).toEqual(['unit-base', 'unit-paca']);
    expect(ids).not.toContain('unit-gr');
  });

  it('la equivalencia se recalcula en vivo antes de guardar, con el factor de la unidad elegida', async () => {
    const { fixture } = await crear({ knownUnitMeasureId: 'unit-base' });
    const c = fixture.componentInstance;
    c.unitMeasureId.set('unit-paca');
    c.lastCost.set(12000);
    expect(c.equivalencePreview()).toBe('1 PACA = 24 und · $500/und');
  });

  it('factorLocked deshabilita el selector de unidad', async () => {
    const { fixture } = await crear({ knownUnitMeasureId: 'unit-base' });
    fixture.componentRef.setInput('factorLocked', true);
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select');
    expect(select?.disabled).toBe(true);
  });

  it('regresión: elegir un proveedor del buscador sí lo deja seleccionado (visible en el botón)', async () => {
    const { fixture, http } = await crear({ knownUnitMeasureId: 'unit-base' });
    const el = fixture.nativeElement as HTMLElement;

    // Abre el selector y escribe en el buscador.
    (el.querySelector('app-searchable-select button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const filterInput = el.querySelector('app-searchable-select input') as HTMLInputElement;
    filterInput.value = 'norte';
    filterInput.dispatchEvent(new Event('input'));

    // Debounce de 300ms (searchable-select.component.ts) + respuesta HTTP.
    await tick(320);
    http.expectOne((r) => r.url.includes('/inventory/suppliers')).flush([
      { id: 'sup-1', name: 'Distribuidora Norte', tax_id: null, phone: null, email: null, active: true, is_system: false },
    ]);
    await tick();
    fixture.detectChanges();

    const option = Array.from(el.querySelectorAll('app-searchable-select li')).find((li) =>
      li.textContent?.includes('Distribuidora Norte'),
    ) as HTMLElement | undefined;
    expect(option).toBeTruthy();
    option!.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    expect(fixture.componentInstance.supplierId()).toBe('sup-1');
    const toggle = el.querySelector('app-searchable-select button span') as HTMLElement;
    expect(toggle.textContent?.trim()).toBe('Distribuidora Norte');
  });

  it('al editar, muestra el nombre fijo del otro lado en vez del buscador, y precarga la unidad vinculada', async () => {
    const { fixture } = await crear({
      knownUnitMeasureId: 'unit-base',
      initial: {
        id: 'rel-1',
        supplier_id: 'sup-1',
        supplier_name: 'Distribuidora Norte',
        inventory_item_id: 'item-1',
        inventory_item_name: 'Almendras',
        unit_measure_id: 'unit-paca',
        presentation: 'PACA',
        conversion_factor: 24,
        last_cost: 12000,
        last_cost_at: '2026-10-09T00:00:00Z',
        active: true,
        preferred: false,
        equivalence: '1 PACA = 24 und · $500/und',
        was_preferred: false,
      },
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Distribuidora Norte');
    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeNull();
    expect(fixture.componentInstance.unitMeasureId()).toBe('unit-paca');
  });

  it('al editar una relación legada (sin unit_measure_id todavía), la unidad queda sin elegir', async () => {
    const { fixture } = await crear({
      mode: 'supplier',
      knownUnitMeasureId: null,
      initial: {
        id: 'rel-legacy',
        supplier_id: 'item-1',
        supplier_name: 'Distribuidora Norte',
        inventory_item_id: 'item-legacy',
        inventory_item_name: 'Harina',
        unit_measure_id: null,
        presentation: 'Bolsa x 500 g',
        conversion_factor: 500,
        last_cost: 8000,
        last_cost_at: '2026-10-09T00:00:00Z',
        active: true,
        preferred: false,
        equivalence: '1 Bolsa x 500 g = 500 g · $16/g',
        was_preferred: false,
      },
    });

    expect(fixture.componentInstance.unitMeasureId()).toBe('');
    expect(fixture.componentInstance.canSubmit()).toBe(false);
  });
});
