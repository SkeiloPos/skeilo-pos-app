import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { ModuleAccessLostService } from './module-access-lost.service';
import { MODULE_NOT_IN_PLAN_MESSAGE } from './module-access.messages';
import { PlanSummaryService } from '../../modules/plan/services/plan-summary.service';
import { PlanSummary } from '../../modules/plan/interfaces/plan-summary.interface';
import { ToastService } from '../../shared/feedback/toast.service';

function makeSummary(partial: Partial<PlanSummary> = {}): PlanSummary {
  return {
    plan_name: 'Pro',
    ciclo_facturacion: null,
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, promociones: true, cocina: false },
    ...partial,
  };
}

/** Spec 141 (US5, FR-016, SC-003; contrato `frontend-acceso-modulos.md` §3 y §8). */
describe('ModuleAccessLostService (spec 141)', () => {
  let summary: ReturnType<typeof signal<PlanSummary | null>>;
  let load: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let service: ModuleAccessLostService;
  /** Resuelve el refresco de `GET /plan` (por defecto inmediato). */
  let resolverRefresco: () => void;

  function setup(initial: PlanSummary | null = makeSummary(), opciones?: { refrescoManual?: boolean; refrescoFalla?: boolean }) {
    summary = signal<PlanSummary | null>(initial);
    load = vi.fn(() => {
      if (opciones?.refrescoFalla) return Promise.reject(new Error('sin red'));
      if (opciones?.refrescoManual) return new Promise<void>((r) => (resolverRefresco = r));
      return Promise.resolve();
    });
    navigateByUrl = vi.fn(() => Promise.resolve(true));
    toastError = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PlanSummaryService,
          useValue: {
            summary,
            load,
            markModuleMissing: (m: 'inventario' | 'promociones') =>
              summary.update((cur) => (cur === null ? cur : { ...cur, modules: { ...cur.modules, [m]: false } })),
          },
        },
        { provide: ToastService, useValue: { error: toastError } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    service = TestBed.inject(ModuleAccessLostService);
  }

  it('1 rechazo → 1 aviso + 1 navegación a /dashboard + 1 refresco forzado del plan', async () => {
    setup();

    await service.handle('inventario');

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(MODULE_NOT_IN_PLAN_MESSAGE);
    expect(navigateByUrl).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ force: true });
  });

  it('el menú se corrige en el acto: el módulo queda marcado ANTES de que el refresco termine', async () => {
    setup(makeSummary(), { refrescoManual: true });

    const atencion = service.handle('inventario');

    expect(summary()!.modules.inventario).toBe(false); // síncrono
    expect(summary()!.modules.promociones).toBe(true); // no toca otros módulos
    resolverRefresco();
    await atencion;
  });

  it('5 rechazos simultáneos → 1 aviso y 1 redirección (US5.6, SC-003)', async () => {
    setup(makeSummary(), { refrescoManual: true });

    const todos = Promise.all([
      service.handle('inventario'),
      service.handle('inventario'),
      service.handle('inventario'),
      service.handle('inventario'),
      service.handle('inventario'),
    ]);
    resolverRefresco();
    await todos;

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('un rechazo tardío con el resumen ya «sin módulo» no avisa ni redirige', async () => {
    setup(makeSummary({ modules: { inventario: false, promociones: true, cocina: false } }));

    await service.handle('inventario');

    expect(toastError).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('un rechazo que llega después de terminar la atención (resumen ya corregido) tampoco repite nada', async () => {
    setup();
    await service.handle('inventario');

    await service.handle('inventario');

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledTimes(1);
  });

  it('si el refresco del plan falla, el menú queda corregido igualmente y la bandera se libera', async () => {
    setup(makeSummary(), { refrescoFalla: true });

    await service.handle('inventario');

    expect(summary()!.modules.inventario).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);

    // la bandera «en curso» se liberó: una pérdida distinta se atiende
    await service.handle('promociones');
    expect(toastError).toHaveBeenCalledTimes(2);
    expect(summary()!.modules.promociones).toBe(false);
  });

  it('si la navegación falla, igual se libera la bandera', async () => {
    setup();
    navigateByUrl.mockRejectedValueOnce(new Error('navegación cancelada'));

    await service.handle('inventario');
    await service.handle('promociones');

    expect(toastError).toHaveBeenCalledTimes(2);
  });

  it('dos pérdidas sucesivas separadas en el tiempo → 2 atenciones', async () => {
    setup();
    await service.handle('inventario');
    expect(toastError).toHaveBeenCalledTimes(1);

    // el Super Admin reasigna el plan con el módulo y el cliente lo recupera
    summary.set(makeSummary());
    await service.handle('inventario');

    expect(toastError).toHaveBeenCalledTimes(2);
    expect(navigateByUrl).toHaveBeenCalledTimes(2);
  });

  it('`module` ausente o desconocido: aviso + inicio + refresco, sin marcar nada', async () => {
    for (const modulo of [undefined, 'modulo-que-no-existe']) {
      setup();

      await service.handle(modulo);

      expect(toastError).toHaveBeenCalledTimes(1);
      expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
      expect(load).toHaveBeenCalledWith({ force: true });
      expect(summary()!.modules).toEqual({ inventario: true, promociones: true, cocina: false });
      expect(Object.keys(summary()!.modules)).toEqual(['inventario', 'promociones', 'cocina']);
    }
  });

  it('con el resumen aún desconocido (null) también avisa y redirige, y no revienta', async () => {
    setup(null);

    await service.handle('inventario');

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledTimes(1);
    expect(summary()).toBeNull();
  });
});
