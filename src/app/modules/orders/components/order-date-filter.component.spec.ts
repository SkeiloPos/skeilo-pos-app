import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OrderDateFilterComponent } from './order-date-filter.component';

/**
 * spec 121 (US2, FR-003/FR-004, research.md §2): regresión del bug donde el
 * texto del botón se quedaba fijo en "Hoy" después de elegir otra fecha,
 * porque `label` (un `computed()`) leía `this.from` como propiedad de
 * instancia normal en vez de como signal -- un `computed()` solo se reevalúa
 * cuando lee un cambio de una signal real, así que nunca se refrescaba.
 *
 * `TenantDatePipe` (inyectado por el propio componente) cae a
 * `America/Bogota` porque `TenantInfoService.info()` nunca se hidrata en este
 * test -- no hace falta: el valor elegido (`'2020-01-15'`) nunca coincide con
 * "hoy" ni "ayer" en ninguna fecha real de ejecución de la suite.
 */
describe('OrderDateFilterComponent', () => {
  let fixture: ComponentFixture<OrderDateFilterComponent>;

  function triggerButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OrderDateFilterComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(OrderDateFilterComponent);
  });

  it('sin `from` (o vacío) el botón muestra "Hoy"', () => {
    fixture.detectChanges();
    expect(triggerButton().textContent).toContain('Hoy');
  });

  it('al cambiar `from` DESPUÉS del render inicial, el botón refleja la nueva fecha, no se queda en "Hoy"', () => {
    fixture.detectChanges(); // primer render: from = '' → "Hoy"
    expect(triggerButton().textContent).toContain('Hoy');

    fixture.componentRef.setInput('from', '2020-01-15');
    fixture.componentRef.setInput('to', '2020-01-15');
    fixture.detectChanges();

    const text = triggerButton().textContent ?? '';
    expect(text).toContain('15 ene 2020');
    expect(text).not.toContain('Hoy');
  });

  it('cambiar `from`/`to` dos veces seguidas (como al re-elegir otra fecha) actualiza el botón cada vez', () => {
    fixture.detectChanges();

    fixture.componentRef.setInput('from', '2020-01-15');
    fixture.componentRef.setInput('to', '2020-01-15');
    fixture.detectChanges();
    expect(triggerButton().textContent).toContain('15 ene 2020');

    fixture.componentRef.setInput('from', '2020-03-02');
    fixture.componentRef.setInput('to', '2020-03-02');
    fixture.detectChanges();
    const text = triggerButton().textContent ?? '';
    expect(text).toContain('2 mar 2020');
    expect(text).not.toContain('15 ene 2020');
  });

  it('con un rango (`from` distinto de `to`), el botón muestra ambas fechas', () => {
    fixture.detectChanges();

    fixture.componentRef.setInput('from', '2020-01-10');
    fixture.componentRef.setInput('to', '2020-01-20');
    fixture.detectChanges();

    const text = triggerButton().textContent ?? '';
    expect(text).toContain('10 ene 2020');
    expect(text).toContain('20 ene 2020');
  });
});
