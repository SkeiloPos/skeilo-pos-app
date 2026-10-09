import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { SupplierItemFormComponent } from './supplier-item-form.component';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('SupplierItemFormComponent', () => {
  function crear(mode: 'item' | 'supplier' = 'item', knownUnitAbbr: string | null = null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SupplierItemFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTanStackQuery(new QueryClient())],
    });
    const fixture = TestBed.createComponent(SupplierItemFormComponent);
    fixture.componentRef.setInput('mode', mode);
    fixture.componentRef.setInput('fixedId', 'item-1');
    fixture.componentRef.setInput('fixedLabel', 'Almendras');
    fixture.componentRef.setInput('knownUnitAbbr', knownUnitAbbr);
    fixture.detectChanges();
    return fixture;
  }

  it('FR-018: la etiqueta del factor muestra la unidad base conocida (mode="item")', () => {
    const fixture = crear('item', 'g');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('¿Cuántos g trae 1 presentación?');
  });

  it('sin presentación ni factor, no se puede enviar', () => {
    const fixture = crear('item');
    expect(fixture.componentInstance.canSubmit()).toBe(false);
  });

  it('con presentación y factor > 0, y un proveedor elegido, se puede enviar', () => {
    const fixture = crear('item');
    const c = fixture.componentInstance;
    c.presentation.set('Bolsa x 500 g');
    c.conversionFactor.set(500);
    c.supplierId.set('sup-1');
    expect(c.canSubmit()).toBe(true);
  });

  it('un factor <= 0 no se puede enviar (FR-002, lo valida el backend con el mensaje dinámico)', () => {
    const fixture = crear('item');
    const c = fixture.componentInstance;
    c.presentation.set('Bolsa x 500 g');
    c.conversionFactor.set(0);
    c.supplierId.set('sup-1');
    expect(c.canSubmit()).toBe(false);
  });

  it('FR-018: la equivalencia se recalcula en vivo antes de guardar', () => {
    const fixture = crear('item', 'g');
    const c = fixture.componentInstance;
    c.presentation.set('Bolsa x 500 g');
    c.conversionFactor.set(500);
    c.lastCost.set(8000);
    expect(c.equivalencePreview()).toBe('1 Bolsa x 500 g = 500 g · $16/g');
  });

  it('regresión: elegir un proveedor del buscador sí lo deja seleccionado (visible en el botón)', async () => {
    const fixture = crear('item', 'g');
    const el = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);

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

  it('al editar, muestra el nombre fijo del otro lado en vez del buscador', () => {
    const fixture = crear('item');
    fixture.componentRef.setInput('initial', {
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
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Distribuidora Norte');
    expect(fixture.nativeElement.querySelector('app-searchable-select')).toBeNull();
  });
});
