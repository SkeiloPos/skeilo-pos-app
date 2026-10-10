import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PurchaseFormComponent } from './purchase-form.component';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';

const BASE = `${environment.apiBaseUrl}/inventory`;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('PurchaseFormComponent', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [PurchaseFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTanStackQuery(new QueryClient())],
    });
    const fixture = TestBed.createComponent(PurchaseFormComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('ya no renderiza ningún ícono de cerrar/quitar como SVG artesanal', () => {
    const el = crear().nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
  });

  it('renderiza el botón de cerrar de la cabecera con el nuevo componente de ícono', () => {
    const el = crear().nativeElement as HTMLElement;
    const iconos = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map((n) =>
      n.textContent?.trim(),
    );
    expect(iconos).toContain('close');
  });

  it('renderiza el botón de quitar renglón (fila inicial) con el nuevo componente de ícono', () => {
    const el = crear().nativeElement as HTMLElement;
    const closeIcons = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).filter(
      (n) => n.textContent?.trim() === 'close',
    );
    // Cabecera + al menos una fila inicial = al menos 2 íconos "close".
    expect(closeIcons.length).toBeGreaterThanOrEqual(2);
  });

  it('el selector de insumo de una línea busca en el servidor: encuentra un insumo aunque no esté en la lista ya cargada (spec 098)', async () => {
    const fixture = crear();
    const http = TestBed.inject(HttpTestingController);

    const picker = fixture.debugElement.query(By.directive(SearchableSelectComponent));
    expect(picker).toBeTruthy();
    const searchFn = picker!.componentInstance.search as
      | ((q: string) => Promise<{ id: string; label: string }[]>)
      | undefined;
    expect(searchFn).toBeTruthy();

    const promise = searchFn!('mozar');

    const req = http.expectOne(
      (r) => r.url === `${BASE}/items` && r.params.get('search') === 'mozar',
    );
    req.flush({
      items: [
        {
          id: 'i-105',
          name: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS',
          unit_measure_id: 'um-1',
          type: 'insumo',
          current_stock: '1',
          min_stock: '0',
          unit_cost: '0',
          active: true,
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
    });

    // Las unidades aún no llegaron en este test (no se flushea esa petición): la
    // etiqueta cae al nombre solo, mismo fallback que ya usa `itemOptions()` hoy.
    const resultado = await promise;
    expect(resultado).toEqual([{ id: 'i-105', label: 'QUESO MOZARELA BLOQUE X 2500 GRAMOS' }]);
  });

  // spec 107: comprar en la presentación real, no en la unidad base.
  it('sin proveedor elegido, ninguna fila muestra selector de presentación', () => {
    const fixture = crear();
    const el = fixture.nativeElement as HTMLElement;
    const selects = el.querySelectorAll('select');
    // El único <select> esperado sin proveedor es el de "Proveedor" mismo (sin filas con
    // presentación todavía, porque supplierId() está vacío).
    expect(selects.length).toBe(1);
  });

  it('con proveedor elegido y una presentación activa para el insumo, aparece el selector y queda disponible para elegir', async () => {
    const fixture = crear();
    const http = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance;

    component.onSupplierChange('sup-1');
    component.updateRow(0, 'inventory_item_id', 'item-1');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === `${BASE}/items/item-1/suppliers`);
    await tick();
    req.flush([
      {
        id: 'rel-1', supplier_id: 'sup-1', supplier_name: 'Distribuidora Norte',
        inventory_item_id: 'item-1', inventory_item_name: 'Azúcar',
        presentation: 'Bolsa x 500 g', conversion_factor: '500.000',
        last_cost: '4000.00', last_cost_at: '2026-10-09T00:00:00Z',
        active: true, preferred: false, equivalence: '1 Bolsa x 500 g = 500 g · $8/g',
      },
    ]);
    await tick();
    fixture.detectChanges();

    expect(component.presentationsFor(0).length).toBe(1);
    const el = fixture.nativeElement as HTMLElement;
    const selects = Array.from(el.querySelectorAll('select'));
    const presentationSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.textContent?.includes('Bolsa x 500 g')),
    );
    expect(presentationSelect).toBeTruthy();

    component.onPresentationChange(0, 'rel-1');
    fixture.detectChanges();
    expect(component.selectedPresentation(0)?.id).toBe('rel-1');
  });
});
