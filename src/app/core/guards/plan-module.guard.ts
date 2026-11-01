import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { PlanSummaryService } from '../../modules/plan/services/plan-summary.service';
import { ModuleAccess } from '../../modules/plan/interfaces/plan-summary.interface';
import { ToastService } from '../../shared/feedback/toast.service';
import { MODULE_NOT_IN_PLAN_MESSAGE } from '../module-access/module-access.messages';

/** Bloquea una ruta cuando el plan vigente del tenant no incluye el módulo,
 * O cuando el tenant está vencido (spec 033, Historias de Usuario 4 y 5) —
 * `vencido` gana sin importar lo que digan los flags de módulo
 * individuales. Mismo patrón que `role.guard.ts`, pero la fuente de verdad
 * es `GET /plan`, no el usuario autenticado.
 *
 * Spec 141 (FR-015, FR-017): al bloquear **por módulo** también avisa con
 * «Esta funcionalidad no está incluida en tu plan» (el mismo texto y el mismo
 * deduplicado del `ToastService` que usa el aviso global de módulo perdido);
 * al bloquear **por plan vencido** vuelve al inicio sin ese aviso. Además hidrata
 * `PlanSummaryService` con el resumen que de todos modos acaba de pedir, así el
 * menú y las demás pantallas ven el mismo plan sin otra petición. */
export const planModuleGuard = (moduleKey: keyof ModuleAccess): CanActivateFn => {
  const guard: CanActivateFn = () => {
    const planSummaryService = inject(PlanSummaryService);
    const router = inject(Router);
    const toast = inject(ToastService);

    return planSummaryService.fetch().pipe(
      map((summary) => {
        planSummaryService.hydrate(summary);
        if (summary.vencido) return router.createUrlTree(['/dashboard']);
        if (!summary.modules[moduleKey]) {
          toast.error(MODULE_NOT_IN_PLAN_MESSAGE);
          return router.createUrlTree(['/dashboard']);
        }
        return true;
      }),
      // Si `GET /plan` falla (red, 401 ya manejado por el interceptor, etc.),
      // no dejamos la ruta bloqueada indefinidamente — se deja pasar y el
      // propio endpoint de destino, si corresponde, devolverá su 403 real.
      catchError(() => of(true)),
    );
  };

  // Expone qué módulo gobierna la guardia: lo lee `routes.spec.ts` para fijar la tabla de rutas.
  return Object.assign(guard, { moduleKey });
};
