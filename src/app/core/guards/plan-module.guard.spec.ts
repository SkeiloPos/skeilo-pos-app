import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { planModuleGuard } from './plan-module.guard';
import { PlanSummaryService } from '../../modules/plan/services/plan-summary.service';
import { PlanSummary } from '../../modules/plan/interfaces/plan-summary.interface';
import { ToastService } from '../../shared/feedback/toast.service';
import { MODULE_NOT_IN_PLAN_MESSAGE } from '../module-access/module-access.messages';

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

/** Spec 141 (FR-015, FR-017, US4): la guardia avisa cuando bloquea por módulo y calla cuando bloquea por plan vencido. */
describe('planModuleGuard (spec 141)', () => {
  let toast: { error: ReturnType<typeof vi.fn> };
  let planService: { fetch: ReturnType<typeof vi.fn>; hydrate: ReturnType<typeof vi.fn> };
  let router: { createUrlTree: ReturnType<typeof vi.fn> };

  function setup(fetchResult: Observable<PlanSummary>) {
    toast = { error: vi.fn() };
    planService = { fetch: vi.fn(() => fetchResult), hydrate: vi.fn() };
    router = { createUrlTree: vi.fn((commands: unknown[]) => ({ commands }) as unknown as UrlTree) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PlanSummaryService, useValue: planService },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
      ],
    });
  }

  async function run(moduleKey: 'inventario' | 'promociones'): Promise<unknown> {
    const result = TestBed.runInInjectionContext(() =>
      planModuleGuard(moduleKey)({} as never, {} as never),
    );
    return isObservable(result) ? firstValueFrom(result) : result;
  }

  it('módulo ausente → redirige al inicio Y muestra «Esta funcionalidad no está incluida en tu plan»', async () => {
    setup(of(makeSummary({ modules: { inventario: false, promociones: true, cocina: false } })));

    const result = await run('inventario');

    expect(result).toEqual({ commands: ['/dashboard'] });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(MODULE_NOT_IN_PLAN_MESSAGE);
    expect(MODULE_NOT_IN_PLAN_MESSAGE).toBe('Esta funcionalidad no está incluida en tu plan');
  });

  it('el aviso aplica a todos los módulos (Promociones también)', async () => {
    setup(of(makeSummary({ modules: { inventario: true, promociones: false, cocina: false } })));

    const result = await run('promociones');

    expect(result).toEqual({ commands: ['/dashboard'] });
    expect(toast.error).toHaveBeenCalledWith(MODULE_NOT_IN_PLAN_MESSAGE);
  });

  it('plan vencido → vuelta al inicio SIN el aviso de módulo (FR-017, US4.4)', async () => {
    setup(of(makeSummary({ vencido: true, modules: { inventario: true, promociones: true, cocina: false } })));

    const result = await run('inventario');

    expect(result).toEqual({ commands: ['/dashboard'] });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('plan vencido y además sin el módulo → sigue sin aviso: `vencido` gana', async () => {
    setup(of(makeSummary({ vencido: true, modules: { inventario: false, promociones: false, cocina: false } })));

    const result = await run('inventario');

    expect(result).toEqual({ commands: ['/dashboard'] });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('módulo incluido y plan vigente → deja pasar, sin aviso (US4.5)', async () => {
    setup(of(makeSummary()));

    const result = await run('inventario');

    expect(result).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('si GET /plan falla, deja pasar (fail-open conservado) y sin aviso', async () => {
    setup(throwError(() => new Error('sin red')));

    const result = await run('inventario');

    expect(result).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(planService.hydrate).not.toHaveBeenCalled();
  });

  it('hidrata PlanSummaryService con el resumen que acaba de pedir (research D8)', async () => {
    const resumen = makeSummary({ modules: { inventario: false, promociones: true, cocina: false } });
    setup(of(resumen));

    await run('inventario');

    expect(planService.hydrate).toHaveBeenCalledWith(resumen);
  });

  it('también hidrata cuando deja pasar', async () => {
    const resumen = makeSummary();
    setup(of(resumen));

    await run('promociones');

    expect(planService.hydrate).toHaveBeenCalledWith(resumen);
  });

  it('la guardia expone el módulo que gobierna (para la prueba de rutas)', () => {
    expect((planModuleGuard('inventario') as unknown as { moduleKey: string }).moduleKey).toBe('inventario');
    expect((planModuleGuard('promociones') as unknown as { moduleKey: string }).moduleKey).toBe('promociones');
  });
});
