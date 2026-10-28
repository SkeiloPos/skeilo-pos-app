import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PurchaseViewComponent } from './purchase-view.component';
import { environment } from '../../../../environments/environment';

const BASE = `${environment.apiBaseUrl}/inventory`;
const tick = () => new Promise((r) => setTimeout(r, 0));

const ITEM_1 = {
  id: 'item-1', code: 'INS-001', name: 'Azúcar', unit_measure_id: 'unit-1', type: 'raw_material',
  current_stock: '10', min_stock: '0', unit_cost: '1000', active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: null, preferred_supplier_name: null,
};
const ITEM_2 = {
  id: 'item-2', code: 'INS-002', name: 'Harina', unit_measure_id: 'unit-1', type: 'raw_material',
  current_stock: '5', min_stock: '0', unit_cost: '500', active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: null, preferred_supplier_name: null,
};

/** Relación proveedor-insumo del proveedor `sup-1` (forma cruda del backend). */
const REL_ITEM_1 = {
  id: 'rel-1', supplier_id: 'sup-1', supplier_name: 'Distribuidora Norte',
  inventory_item_id: 'item-1', inventory_item_name: 'Azúcar', presentation: 'Bolsa x 500 g',
  conversion_factor: '500.000', last_cost: '4000.00', last_cost_at: '2026-10-09T00:00:00Z',
  active: true, preferred: true, equivalence: '1 Bolsa x 500 g = 500 g · $8/g',
};
const REL_ITEM_2 = {
  id: 'rel-2', supplier_id: 'sup-1', supplier_name: 'Distribuidora Norte',
  inventory_item_id: 'item-2', inventory_item_name: 'Harina', presentation: 'Bulto x 25 kg',
  conversion_factor: '25000.000', last_cost: '90000.00', last_cost_at: '2026-10-09T00:00:00Z',
  active: true, preferred: true, equivalence: null,
};

async function crear() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseViewComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
    ],
  });
  const fixture = TestBed.createComponent(PurchaseViewComponent);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  await tick();
  http.match((r) => r.url === `${BASE}/suppliers`).forEach((req) => req.flush([]));
  http.match((r) => r.url.endsWith('/unit-measures')).forEach((req) => req.flush([]));
  http.match((r) => r.url === `${BASE}/items/low-stock`).forEach((req) => req.flush([]));
  await tick();
  fixture.detectChanges();
  return { fixture, http };
}

/** Elige el proveedor `sup-1` y resuelve su catálogo (`listForSupplier` + `resolveMissingItems`). */
async function elegirProveedor(http: HttpTestingController, component: PurchaseViewComponent) {
  component.onSupplierChange('sup-1');
  await tick();
  http.expectOne((r) => r.url === `${BASE}/suppliers/sup-1/items`).flush([REL_ITEM_1, REL_ITEM_2]);
  await tick();
  http.expectOne((r) => r.url === `${BASE}/items/item-1`).flush(ITEM_1);
  http.expectOne((r) => r.url === `${BASE}/items/item-2`).flush(ITEM_2);
  await tick();
}

describe('PurchaseViewComponent', () => {
  it('no renderiza ningún ícono como SVG artesanal', async () => {
    const { fixture } = await crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
  });

  it('el buscador de insumos está deshabilitado hasta elegir un proveedor', async () => {
    const { fixture } = await crear();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#b-q');
    expect(input?.disabled).toBe(true);
  });

  it('elegir un proveedor habilita el buscador y lo limita a su catálogo (listForSupplier)', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await elegirProveedor(http, component);
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#b-q');
    expect(input?.disabled).toBe(false);

    component.onQueryInput('azu');
    fixture.detectChanges();
    const ids = component.filteredResults().map((r) => r.id);
    expect(ids).toEqual(['item-1']);
  });

  it('al elegir un producto filtrado, precarga la unidad de compra predeterminada y el último costo del proveedor', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await elegirProveedor(http, component);
    component.addItem('item-1');
    fixture.detectChanges();

    expect(component.rows().length).toBe(1);
    const row = component.rows()[0];
    expect(row.supplier_item_id).toBe('rel-1');
    expect(row.unit_cost).toBe(4000);
  });

  it('un insumo ya agregado no vuelve a aparecer en resultados de búsqueda', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await elegirProveedor(http, component);
    component.addItem('item-1');
    fixture.detectChanges();

    component.onQueryInput('ins');
    fixture.detectChanges();

    const ids = component.filteredResults().map((r) => r.id);
    expect(ids).not.toContain('item-1');
    expect(ids).toContain('item-2');
  });

  it('cambiar de proveedor vacía la tabla', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await elegirProveedor(http, component);
    component.addItem('item-1');
    fixture.detectChanges();
    expect(component.rows().length).toBe(1);

    component.onSupplierChange('');
    fixture.detectChanges();

    expect(component.rows().length).toBe(0);
    expect(component.supplierId()).toBe('');
  });

  it('"Registrar compra" sin líneas válidas no llama al backend y muestra el mensaje de validación', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await component.registerPurchase();
    fixture.detectChanges();

    expect(component.mErrOn()).toBe(true);
    http.expectNone((r) => r.url === `${BASE}/purchases`);
  });

  it('"Crear orden de compra" sin líneas válidas no llama al backend', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await component.createOrder();

    http.expectNone((r) => r.url === `${BASE}/purchases/order`);
  });

  it('"Registrar compra" con una línea sin precio (0) no llama al backend -- evita el 422 "La cantidad debe ser mayor que cero" al reabrir un borrador incompleto', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await elegirProveedor(http, component);
    component.addItem('item-1');
    component.updateRow(0, 'unit_cost', 0);
    fixture.detectChanges();

    await component.registerPurchase();
    fixture.detectChanges();

    expect(component.mErrOn()).toBe(true);
    expect(component.mErr()).toContain('precio');
    http.expectNone((r) => r.url === `${BASE}/purchases`);
  });

  it('"Crear orden de compra" con una línea sin precio (0) tampoco llama al backend', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await elegirProveedor(http, component);
    component.addItem('item-1');
    component.updateRow(0, 'unit_cost', 0);
    fixture.detectChanges();

    await component.createOrder();

    http.expectNone((r) => r.url === `${BASE}/purchases/order`);
  });

  it('"Registrar compra" exitoso navega a inventario y deja isSubmitting() en false', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await elegirProveedor(http, component);
    component.addItem('item-1');
    fixture.detectChanges();

    const submit = component.registerPurchase();
    await tick();
    const req = http.expectOne((r) => r.url === `${BASE}/purchases`);
    req.flush({
      id: 'p-1', supplier_id: 'sup-1', invoice_number: null, status: 'received', is_incomplete: false,
      total: '4000', purchased_at: '2026-01-01T00:00:00Z', voided_at: null, voided_by: null, items: [],
    });
    await tick();

    http.match((r) => r.url === `${BASE}/items/low-stock`).forEach((req2) => req2.flush([]));
    http.match((r) => r.url === `${BASE}/purchases` && r.method === 'GET').forEach((req2) =>
      req2.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
    );
    http.match((r) => r.url === `${BASE}/items` && r.method === 'GET').forEach((req2) =>
      req2.flush({ items: [], total: 0, page: 1, size: 100, pages: 0 }),
    );
    await tick();
    await submit;
    await tick();

    expect(component.service.isSubmitting()).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/inventario']);
  });

  it('reintento tras error no duplica la llamada HTTP mientras isSubmitting() sigue en verdadero', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    await elegirProveedor(http, component);
    component.addItem('item-1');
    fixture.detectChanges();

    const submit = component.registerPurchase();
    const req = http.expectOne((r) => r.url === `${BASE}/purchases`);
    expect(component.service.isSubmitting()).toBe(true);

    req.flush({ detail: 'Error de conexión' }, { status: 500, statusText: 'Error' });
    await submit;
    await tick();

    expect(component.service.isSubmitting()).toBe(false);
    expect(component.service.error()).toBeTruthy();
  });

  it('"Guardar borrador" guarda una línea sin costo (unit_cost en 0 no se exige) y no navega', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await elegirProveedor(http, component);
    component.addItem('item-1');
    component.updateRow(0, 'unit_cost', 0);
    fixture.detectChanges();

    const save = component.saveDraft();
    await tick();
    const req = http.expectOne((r) => r.url === `${BASE}/purchases/order`);
    expect(req.request.body.allow_incomplete).toBe(true);
    expect(req.request.body.items[0].presentation_unit_cost).toBeUndefined();
    req.flush({
      id: 'p-draft', supplier_id: 'sup-1', invoice_number: null, status: 'draft', is_incomplete: true,
      total: '0', purchased_at: '2026-01-01T00:00:00Z', voided_at: null, voided_by: null, items: [],
    });
    await tick();

    http.match((r) => r.url === `${BASE}/items/low-stock`).forEach((req2) => req2.flush([]));
    http.match((r) => r.url === `${BASE}/purchases` && r.method === 'GET').forEach((req2) =>
      req2.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
    );
    http.match((r) => r.url === `${BASE}/items` && r.method === 'GET').forEach((req2) =>
      req2.flush({ items: [], total: 0, page: 1, size: 100, pages: 0 }),
    );
    await tick();
    await save;
    await tick();

    expect(component.service.isSubmitting()).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('"Guardar borrador" sin ninguna línea tampoco bloquea el guardado (no exige FR-012)', async () => {
    const { fixture, http } = await crear();
    const component = fixture.componentInstance;

    const save = component.saveDraft();
    await tick();
    const req = http.expectOne((r) => r.url === `${BASE}/purchases/order`);
    expect(req.request.body.items).toEqual([]);
    req.flush({
      id: 'p-draft-empty', supplier_id: null, invoice_number: null, status: 'draft', is_incomplete: true,
      total: '0', purchased_at: '2026-01-01T00:00:00Z', voided_at: null, voided_by: null, items: [],
    });
    await tick();
    http.match((r) => r.url === `${BASE}/items/low-stock`).forEach((req2) => req2.flush([]));
    http.match((r) => r.url === `${BASE}/purchases` && r.method === 'GET').forEach((req2) =>
      req2.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
    );
    http.match((r) => r.url === `${BASE}/items` && r.method === 'GET').forEach((req2) =>
      req2.flush({ items: [], total: 0, page: 1, size: 100, pages: 0 }),
    );
    await tick();
    await save;

    expect(component.mErrOn()).toBe(false);
  });

  it('al reabrir un borrador pasado por estado de navegación, precarga proveedor, factura y líneas', async () => {
    const draft = {
      id: 'p-draft', supplier_id: 'sup-1', invoice_number: 'FC-1', status: 'draft' as const,
      isIncomplete: true, total: 1000, purchased_at: '2026-01-01T00:00:00Z', voided_at: null,
      voided_by: null,
      items: [{
        id: 'pi-1', inventory_item_id: 'item-1', quantity: 2, received_quantity: 0, unit_cost: 500,
        supplier_item_id: null, presentation_quantity: null, presentation_label: null,
        conversion_factor: null, unit_measure_id: 'unit-1', conversion_factor_applied: 1,
        quantity_base: 2, cost_base: 500,
      }],
    };
    history.pushState({ draft }, '');
    try {
      const { fixture, http } = await crear();
      const component = fixture.componentInstance;

      http.expectOne((r) => r.url === `${BASE}/suppliers/sup-1/items`).flush([REL_ITEM_1, REL_ITEM_2]);
      await tick();
      http.expectOne((r) => r.url === `${BASE}/items/item-1`).flush(ITEM_1);
      http.expectOne((r) => r.url === `${BASE}/items/item-2`).flush(ITEM_2);
      await tick();
      const req = http.expectOne((r) => r.url === `${BASE}/items/item-1` && r.method === 'GET');
      req.flush(ITEM_1);
      await tick();
      fixture.detectChanges();

      expect(component.supplierId()).toBe('sup-1');
      expect(component.invoiceNumber()).toBe('FC-1');
      expect(component.rows().length).toBe(1);
      expect(component.rows()[0].name).toBe('Azúcar');
      expect(component.rows()[0].quantity).toBe(2);
    } finally {
      history.pushState({}, '');
    }
  });

  it('reabrir un borrador y "Crear orden de compra" actualiza ESE registro (PUT) en vez de crear uno nuevo', async () => {
    const draft = {
      id: 'p-draft', supplier_id: 'sup-1', invoice_number: 'FC-1', status: 'draft' as const,
      isIncomplete: true, total: 1000, purchased_at: '2026-01-01T00:00:00Z', voided_at: null,
      voided_by: null,
      items: [{
        id: 'pi-1', inventory_item_id: 'item-1', quantity: 2, received_quantity: 0, unit_cost: 500,
        supplier_item_id: null, presentation_quantity: null, presentation_label: null,
        conversion_factor: null, unit_measure_id: 'unit-1', conversion_factor_applied: 1,
        quantity_base: 2, cost_base: 500,
      }],
    };
    history.pushState({ draft }, '');
    try {
      const { fixture, http } = await crear();
      const component = fixture.componentInstance;
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigate');

      http.expectOne((r) => r.url === `${BASE}/suppliers/sup-1/items`).flush([REL_ITEM_1, REL_ITEM_2]);
      await tick();
      http.expectOne((r) => r.url === `${BASE}/items/item-1`).flush(ITEM_1);
      http.expectOne((r) => r.url === `${BASE}/items/item-2`).flush(ITEM_2);
      await tick();
      http.expectOne((r) => r.url === `${BASE}/items/item-1` && r.method === 'GET').flush(ITEM_1);
      await tick();
      fixture.detectChanges();

      expect(component.editingPurchaseId()).toBe('p-draft');

      const submit = component.createOrder();
      await tick();
      const putReq = http.expectOne((r) => r.url === `${BASE}/purchases/p-draft/order` && r.method === 'PUT');
      putReq.flush({
        id: 'p-draft', supplier_id: 'sup-1', invoice_number: 'FC-1', status: 'draft', is_incomplete: false,
        total: '1000', purchased_at: '2026-01-01T00:00:00Z', voided_at: null, voided_by: null, items: [],
      });
      await tick();

      http.match((r) => r.url === `${BASE}/items/low-stock`).forEach((req2) => req2.flush([]));
      http.match((r) => r.url === `${BASE}/purchases` && r.method === 'GET').forEach((req2) =>
        req2.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }),
      );
      http.match((r) => r.url === `${BASE}/items` && r.method === 'GET').forEach((req2) =>
        req2.flush({ items: [], total: 0, page: 1, size: 100, pages: 0 }),
      );
      await tick();
      await submit;

      http.expectNone((r) => r.url === `${BASE}/purchases/order` && r.method === 'POST');
    } finally {
      history.pushState({}, '');
    }
  });
});
