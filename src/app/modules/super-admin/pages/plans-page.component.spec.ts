import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlansPageComponent } from './plans-page.component';
import { PlanService } from '../services/plan.service';
import { Plan } from '../interfaces/plan.interface';

function makePlan(partial: Partial<Plan>): Plan {
  return {
    id: 'p1',
    name: 'Plan',
    description: null,
    mesas_limit: 5,
    cajas_limit: 1,
    usuarios_limit: 3,
    productos_limit: null,
    metodos_pago_activos_limit: 4,
    inventario_access: false,
    promociones_access: false,
    cocina_access: false,
    precio_mensual: null,
    precio_anual: null,
    created_at: '2026-10-01T00:00:00+00:00',
    ...partial,
  };
}

describe('PlansPageComponent — módulos de cada plan (spec 141, contrato §6)', () => {
  function crear(plans: Plan[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlansPageComponent],
      providers: [
        {
          provide: PlanService,
          useValue: {
            plans: signal(plans),
            loading: signal(false),
            error: signal<string | null>(null),
            isSubmitting: signal(false),
            load: vi.fn(async () => undefined),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlansPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  function modulosPorFila(fixture: ReturnType<typeof crear>): string[] {
    // La 4.ª celda de cada fila es «Módulos» (Nombre, Mesas, Usuarios, Módulos, Precio, acciones).
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map(
      (tr) => tr.querySelectorAll('td')[3].textContent?.trim() ?? '',
    );
  }

  it('muestra «Inventario» y «Promociones» y nunca «Compras»', () => {
    const fixture = crear([
      makePlan({ id: 'a', name: 'Ninguno' }),
      makePlan({ id: 'b', name: 'Solo inventario', inventario_access: true }),
      makePlan({ id: 'c', name: 'Solo promociones', promociones_access: true }),
      makePlan({ id: 'd', name: 'Ambos', inventario_access: true, promociones_access: true }),
    ]);

    expect(modulosPorFila(fixture)).toEqual(['Ninguno', 'Inventario', 'Promociones', 'Inventario, Promociones']);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Compras');
  });
});
