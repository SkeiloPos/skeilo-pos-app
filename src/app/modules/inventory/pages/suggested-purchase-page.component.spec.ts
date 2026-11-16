import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { SuggestedPurchasePageComponent } from './suggested-purchase-page.component';

const BASE = `${environment.apiBaseUrl}/inventory/purchases/suggested`;
const ITEMS_BASE = `${environment.apiBaseUrl}/inventory/items`;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** `injectPagedQuery` (TanStack Query) tarda más de un ciclo de microtareas en asentar
 *  `isFetching()`/`data()` tras un `flush()` en este harness -- varias vueltas de
 *  macrotarea + `TestBed.tick()` + `detectChanges()` hasta que se estabiliza. */
async function settle(fixture: ReturnType<typeof TestBed.createComponent>, rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await tick();
    TestBed.tick();
    fixture.detectChanges();
  }
}

function makeLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    inventory_item_id: 'item-1',
    code: '0001',
    name: 'Almendras',
    current_stock: '10.000000',
    min_stock: '500.000',
    deficit: '490.000',
    base_unit_abbreviation: 'g',
    supplier_item_id: 'rel-1',
    supplier_id: 'sup-1',
    supplier_name: 'Agro Sur',
    purchase_unit_label: 'Bolsa x 500 g',
    conversion_factor: '500.000',
    unit_price: '8000.00',
    suggested_quantity: '1',
    is_preselected: true,
    missing_supplier_reason: null,
    ...overrides,
  };
}

const LINE_SIN_PROVEEDOR = makeLine({
  inventory_item_id: 'item-2', code: '0002', name: 'Agua bolsa x 300 ml',
  deficit: '10.000', supplier_item_id: null, supplier_id: null, supplier_name: null,
  purchase_unit_label: null, conversion_factor: null, unit_price: null,
  is_preselected: false, missing_supplier_reason: 'Sin proveedor configurado. Elige uno.',
});

async function crear() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SuggestedPurchasePageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
    ],
  });
  const fixture = TestBed.createComponent(SuggestedPurchasePageComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  await tick();
  return { fixture, http };
}

async function cargarConDosFilas(http: HttpTestingController, fixture: ReturnType<typeof TestBed.createComponent>) {
  http.expectOne((r) => r.url === BASE).flush({
    items: [makeLine(), LINE_SIN_PROVEEDOR], total: 2, page: 1, size: 20, pages: 1,
  });
  await settle(fixture);
}

describe('SuggestedPurchasePageComponent', () => {
  it('"No hay insumos bajo mínimo" con el botón de generar deshabilitado cuando total=0', async () => {
    const { fixture, http } = await crear();
    http.expectOne((r) => r.url === BASE).flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No hay insumos bajo mínimo');
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Generar órdenes de compra'));
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('fila completa con proveedor: se incluye sola (sin checkbox), con subtotal y equivalencia', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    const row = component.rowState('item-1');
    expect(component.isComplete(row!)).toBe(true);
    expect(component.selectedCount()).toBe(1);
    expect(component.subtotalFor(row!)).toBe(8000);
    expect(component.equivalenceLabel(row!)).toBe('= 500 g');
  });

  it('fila sin proveedor: con el aviso, incompleta, y no cuenta en el resumen', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    const row = component.rowState('item-2');
    expect(row?.missingSupplierReason).toBe('Sin proveedor configurado. Elige uno.');
    expect(component.isComplete(row!)).toBe(false);
  });

  it('quitar una línea la saca del resumen y deja de renderizarse', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    expect(component.selectedCount()).toBe(1);

    const removeButtons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .filter((b) => b.getAttribute('aria-label')?.startsWith('Quitar'));
    (removeButtons[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.rowState('item-1')?.removed).toBe(true);
    expect(component.selectedCount()).toBe(0);
    expect(component.ordersToGenerate()).toBe(0);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Almendras');
  });

  it('resumen: insumos seleccionados, proveedores distintos, órdenes a generar y total estimado', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    expect(component.selectedCount()).toBe(1);
    expect(component.ordersToGenerate()).toBe(1);
    expect(component.totalEstimated()).toBe(8000);
  });

  it('subir la cantidad recalcula subtotal, equivalencia y total estimado de inmediato', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    component.setQuantity('item-1', 6);
    fixture.detectChanges();

    const row = component.rowState('item-1')!;
    expect(component.subtotalFor(row)).toBe(48000);
    expect(component.equivalenceLabel(row)).toBe('= 3000 g');
    expect(component.totalEstimated()).toBe(48000);
  });

  it('cantidad inválida (0 o no numérica) se corrige a 1, nunca se acepta tal cual', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    component.setQuantity('item-1', 0);
    expect(component.rowState('item-1')?.quantity).toBe(1);

    component.setQuantity('item-1', 'texto');
    expect(component.rowState('item-1')?.quantity).toBe(1);
  });

  it('elegir un proveedor alternativo carga su unidad/precio y conserva la cantidad', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    component.setQuantity('item-1', 3);
    const togglePromise = component.toggleSelector('item-1');
    const req = http.expectOne((r) => r.url === `${ITEMS_BASE}/item-1/suppliers`);
    expect(req.request.params.get('include_inactive')).toBe('false');
    req.flush([
      {
        id: 'rel-1', supplier_id: 'sup-1', supplier_name: 'Agro Sur', inventory_item_id: 'item-1',
        inventory_item_name: 'Almendras', unit_measure_id: null, presentation: 'Bolsa x 500 g',
        conversion_factor: '500.000', last_cost: '8000.00', last_cost_at: null, active: true,
        preferred: true, equivalence: null,
      },
      {
        id: 'rel-3', supplier_id: 'sup-2', supplier_name: 'Otro Proveedor', inventory_item_id: 'item-1',
        inventory_item_name: 'Almendras', unit_measure_id: null, presentation: 'Caja x 1 kg',
        conversion_factor: '1000.000', last_cost: '15000.00', last_cost_at: null, active: true,
        preferred: false, equivalence: null,
      },
    ]);
    await togglePromise;
    await settle(fixture);

    component.chooseAlternate('item-1', component.alternatesFor('item-1')[1]);
    const row = component.rowState('item-1')!;
    expect(row.supplierId).toBe('sup-2');
    expect(row.purchaseUnitLabel).toBe('Caja x 1 kg');
    expect(row.unitPrice).toBe(15000);
    expect(row.quantity).toBe(3);
    expect(component.ordersToGenerate()).toBe(1);
  });

  it('editar el precio de una fila no dispara ninguna llamada de actualización de SupplierItem', async () => {
    const { fixture, http } = await crear();
    await cargarConDosFilas(http, fixture);
    const component = fixture.componentInstance;

    component.setPrice('item-1', 9000);
    await tick();

    http.expectNone((r) => r.url.includes('/supplier-items/'));
    expect(component.rowState('item-1')?.unitPrice).toBe(9000);
  });

  describe('generar()', () => {
    it('pide confirmación antes de generar; cancelarla no llama al backend', async () => {
      const { fixture, http } = await crear();
      await cargarConDosFilas(http, fixture);
      const component = fixture.componentInstance;
      const confirm = TestBed.inject(ConfirmService);

      const askSpy = vi.spyOn(confirm, 'ask').mockResolvedValue(false);
      await component.generate();

      expect(askSpy).toHaveBeenCalled();
      http.expectNone(`${BASE}/generate`);
    });

    it('generación exitosa (tras confirmar) muestra confirmación con un enlace por orden creada', async () => {
      const { fixture, http } = await crear();
      await cargarConDosFilas(http, fixture);
      const component = fixture.componentInstance;
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      const genPromise = component.generate();
      await tick();
      const req = http.expectOne(`${BASE}/generate`);
      expect(req.request.body.lines).toEqual([{
        inventory_item_id: 'item-1', supplier_item_id: 'rel-1',
        presentation_quantity: 1, presentation_unit_cost: 8000,
      }]);
      req.flush(
        { purchases: [{ id: 'purchase-1', supplier_id: 'sup-1', invoice_number: null, status: 'draft', is_incomplete: false, total: '8000.00', purchased_at: '2026-11-15T00:00:00', voided_at: null, voided_by: null, items: [] }] },
        { status: 201, statusText: 'Created' },
      );
      await genPromise;
      await settle(fixture);

      expect(component.confirmation()?.length).toBe(1);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Ver orden purchas');
    });

    it('línea inválida resalta la fila con su mensaje y no limpia el formulario', async () => {
      const { fixture, http } = await crear();
      await cargarConDosFilas(http, fixture);
      const component = fixture.componentInstance;
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      const genPromise = component.generate();
      await tick();
      const req = http.expectOne(`${BASE}/generate`);
      req.flush(
        { detail: { message: 'No se pudo generar la compra sugerida', lines: [{ inventory_item_id: 'item-1', reason: 'unit_price_zero' }] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await genPromise;
      await settle(fixture);

      expect(component.lineError('item-1')).toBe('El precio debe ser mayor a 0.');
      expect(component.rowState('item-1')?.removed).toBe(false);
      expect(component.rowState('item-1')?.unitPrice).toBe(8000);
    });

    it('el botón de generar queda deshabilitado mientras la solicitud está en curso', async () => {
      const { fixture, http } = await crear();
      await cargarConDosFilas(http, fixture);
      const component = fixture.componentInstance;
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      expect(component.service.isGenerating()).toBe(false);
      const genPromise = component.generate();
      await tick();
      expect(component.service.isGenerating()).toBe(true);
      fixture.detectChanges();
      const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
        .find((b) => b.textContent?.includes('Generando'));
      expect(button?.hasAttribute('disabled')).toBe(true);

      const req = http.expectOne(`${BASE}/generate`);
      req.flush({ purchases: [] }, { status: 201, statusText: 'Created' });
      await genPromise;
      expect(component.service.isGenerating()).toBe(false);
    });
  });
});
