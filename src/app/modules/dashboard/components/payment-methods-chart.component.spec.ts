import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaymentMethodsChartComponent } from './payment-methods-chart.component';

describe('PaymentMethodsChartComponent (spec 122, FR-007)', () => {
  let fixture: ComponentFixture<PaymentMethodsChartComponent>;
  let component: PaymentMethodsChartComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PaymentMethodsChartComponent] });
    fixture = TestBed.createComponent(PaymentMethodsChartComponent);
    component = fixture.componentInstance;
  });

  it('crea un dataset por método, con sus valores y el color que recibió cada uno', () => {
    component.labels = ['7 a. m.', '9 a. m.'];
    component.series = [
      { name: 'Efectivo', color: '#4f46e5', values: [1000, 2000] },
      { name: 'Nequi', color: '#0d9488', values: [500, 0] },
    ];
    fixture.detectChanges();

    const datasets = component.data().datasets;
    expect(datasets.length).toBe(2);
    expect(datasets[0].label).toBe('Efectivo');
    expect(datasets[0].data).toEqual([1000, 2000]);
    expect(datasets[0].backgroundColor).toBe('#4f46e5');
    expect(datasets[1].label).toBe('Nequi');
    expect(datasets[1].data).toEqual([500, 0]);
    expect(datasets[1].backgroundColor).toBe('#0d9488');
  });

  it('el color de cada serie es el que recibió como input, no uno recalculado por posición (evita que un método cambie de color al desactivar otro)', () => {
    // Mismo color para "Nequi" tanto si va de primero como si va de segundo --
    // el componente no debe reasignar colores por índice del arreglo filtrado.
    component.labels = ['Lun'];
    component.series = [{ name: 'Nequi', color: '#0d9488', values: [100] }];
    fixture.detectChanges();
    expect(component.data().datasets[0].backgroundColor).toBe('#0d9488');
  });

  it('sin leyenda propia (el tooltip ya nombra el método) y sin apilar (barras agrupadas)', () => {
    component.labels = ['Lun'];
    component.series = [{ name: 'Efectivo', color: '#4f46e5', values: [100] }];
    fixture.detectChanges();

    const options = component.options();
    expect(options.plugins?.legend?.display).toBe(false);
    expect((options.scales as any)?.x?.stacked).not.toBe(true);
    expect((options.scales as any)?.y?.stacked).not.toBe(true);
  });

  it('las etiquetas del eje X son los buckets de tiempo recibidos', () => {
    component.labels = ['7 a. m.', '9 a. m.', '11 a. m.'];
    component.series = [{ name: 'Efectivo', color: '#4f46e5', values: [1, 2, 3] }];
    fixture.detectChanges();

    expect(component.data().labels).toEqual(['7 a. m.', '9 a. m.', '11 a. m.']);
  });
});
