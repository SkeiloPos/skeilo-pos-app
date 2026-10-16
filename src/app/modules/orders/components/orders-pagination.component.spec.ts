import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersPaginationComponent } from './orders-pagination.component';

/**
 * spec 121 (US3, FR-005/FR-006, data-model.md §4): paginador propio de la
 * lista de Órdenes, con el rango "X–Y de Z" que `PaginationBarComponent`
 * (compartido con otras 8 pantallas, sin tocar por Clarification) no muestra.
 */
describe('OrdersPaginationComponent', () => {
  let fixture: ComponentFixture<OrdersPaginationComponent>;
  let component: OrdersPaginationComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [OrdersPaginationComponent] });
    fixture = TestBed.createComponent(OrdersPaginationComponent);
    component = fixture.componentInstance;
  });

  it('con total 0 no se muestra nada', () => {
    component.total = 0;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('calcula el rango de una página completa', () => {
    component.page = 2;
    component.size = 4;
    component.total = 7;
    fixture.detectChanges();
    // página 2 de tamaño 4 sobre 7 resultados: "5–7 de 7" (última página parcial)
    expect(fixture.nativeElement.textContent).toContain('5–7 de 7');
  });

  it('última página parcial: "9–10 de 10", no "9–12 de 10"', () => {
    component.page = 3;
    component.size = 4;
    component.total = 10;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('9–10 de 10');
    expect(fixture.nativeElement.textContent).not.toContain('9–12');
  });

  it('primera página completa: "1–4 de 7"', () => {
    component.page = 1;
    component.size = 4;
    component.total = 7;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1–4 de 7');
  });

  it('muestra "Página A de B"', () => {
    component.page = 1;
    component.size = 4;
    component.total = 7;
    component.totalPages = 2;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 2');
  });

  it('cambiar el <select> de cantidad por página emite (sizeChange)', () => {
    component.total = 7;
    component.size = 4;
    fixture.detectChanges();
    const emitted = vi.fn();
    component.sizeChange.subscribe(emitted);

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));

    expect(emitted).toHaveBeenCalled();
  });

  it('con una sola página, los controles de anterior/siguiente no se muestran', () => {
    component.page = 1;
    component.total = 3;
    component.totalPages = 1;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(0);
  });

  it('en la primera página, "anterior" está deshabilitado; en la última, "siguiente" lo está', () => {
    component.page = 1;
    component.total = 10;
    component.size = 4;
    component.totalPages = 3;
    fixture.detectChanges();

    let buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(true); // anterior
    expect(buttons[1].disabled).toBe(false); // siguiente

    // mutación DESPUÉS del primer detectChanges(): con OnPush hace falta
    // `setInput` (no basta con reasignar la propiedad) para que se note el cambio.
    fixture.componentRef.setInput('page', 3);
    fixture.detectChanges();
    buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect(buttons[0].disabled).toBe(false); // anterior
    expect(buttons[1].disabled).toBe(true); // siguiente
  });

  it('presionar "anterior"/"siguiente" emite (pageChange) con page-1/page+1', () => {
    component.page = 2;
    component.total = 10;
    component.size = 4;
    component.totalPages = 3;
    fixture.detectChanges();

    const emitted = vi.fn();
    component.pageChange.subscribe(emitted);

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[1].click(); // siguiente
    expect(emitted).toHaveBeenLastCalledWith(3);

    buttons[0].click(); // anterior
    expect(emitted).toHaveBeenLastCalledWith(1);
  });
});
