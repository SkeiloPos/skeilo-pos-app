import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { OptionGroupsPageComponent } from './option-groups-page.component';
import { InventoryService } from '../../inventory/services/inventory.service';
import { UnitMeasureService } from '../../../core/services/unit-measure.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';

const GROUPS = `${environment.apiBaseUrl}/option-groups`;

function planConInventario(inventario: boolean): PlanSummary {
  return {
    plan_name: 'Plan de prueba',
    ciclo_facturacion: null,
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario, promociones: false, cocina: false },
  };
}

class FakeInventoryService {
  allItems = signal<unknown[]>([]);
  loadAllItems = vi.fn();
  searchActiveItems(): Promise<unknown[]> {
    return Promise.resolve([]);
  }
}
class FakeUnitMeasureService {
  unitMeasures = signal<unknown[]>([]);
  loadUnitMeasures = vi.fn(async () => undefined);
}

/**
 * Spec 141 (FR-014, research H2): la pantalla de Grupos de opciones es del catálogo base y debe cargar en
 * un negocio sin el módulo Inventario. Sus lecturas de `/inventory/items` y `/unit-measures` (solo sirven
 * para nombrar el insumo de cada opción) se condicionan al plan; si no, un 403 de fondo dispararía el aviso
 * global de «módulo perdido» sin que el usuario hubiera hecho nada.
 */
describe('OptionGroupsPageComponent — cargas de fondo según el plan (spec 141)', () => {
  let fixture: ComponentFixture<OptionGroupsPageComponent>;
  let http: HttpTestingController;
  let inventory: FakeInventoryService;
  let unitMeasures: FakeUnitMeasureService;

  async function montar(summary: PlanSummary | null): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OptionGroupsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InventoryService, useClass: FakeInventoryService },
        { provide: UnitMeasureService, useClass: FakeUnitMeasureService },
      ],
    });
    TestBed.inject(PlanSummaryService).summary.set(summary);
    inventory = TestBed.inject(InventoryService) as unknown as FakeInventoryService;
    unitMeasures = TestBed.inject(UnitMeasureService) as unknown as FakeUnitMeasureService;
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OptionGroupsPageComponent);
    fixture.detectChanges(); // ngOnInit
    http.expectOne(GROUPS).flush([]);
    await Promise.resolve().then(() => Promise.resolve());
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('sin el módulo: 0 llamadas a insumos y unidades, y la pantalla carga los grupos', async () => {
    await montar(planConInventario(false));

    expect(inventory.loadAllItems).not.toHaveBeenCalled();
    expect(unitMeasures.loadUnitMeasures).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Grupos de opciones');
  });

  it('con el módulo: insumos y unidades se piden una sola vez', async () => {
    await montar(planConInventario(true));

    expect(inventory.loadAllItems).toHaveBeenCalledTimes(1);
    expect(unitMeasures.loadUnitMeasures).toHaveBeenCalledTimes(1);
  });

  it('con el plan desconocido no se piden; si el resumen llega después de ngOnInit, se piden una vez al llegar', async () => {
    await montar(null);
    expect(inventory.loadAllItems).not.toHaveBeenCalled();
    expect(unitMeasures.loadUnitMeasures).not.toHaveBeenCalled();

    TestBed.inject(PlanSummaryService).summary.set(planConInventario(true));
    fixture.detectChanges();
    await Promise.resolve();

    expect(inventory.loadAllItems).toHaveBeenCalledTimes(1);
    expect(unitMeasures.loadUnitMeasures).toHaveBeenCalledTimes(1);

    // un cambio posterior del resumen no repite las peticiones
    TestBed.inject(PlanSummaryService).summary.set({ ...planConInventario(true), plan_name: 'Otro' });
    fixture.detectChanges();
    await Promise.resolve();
    expect(inventory.loadAllItems).toHaveBeenCalledTimes(1);
    expect(unitMeasures.loadUnitMeasures).toHaveBeenCalledTimes(1);
  });
});
