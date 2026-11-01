import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PlanSummaryService } from '../../modules/plan/services/plan-summary.service';
import { ModuleAccess } from '../../modules/plan/interfaces/plan-summary.interface';
import { ToastService } from '../../shared/feedback/toast.service';
import { MODULE_NOT_IN_PLAN_MESSAGE } from './module-access.messages';

/**
 * Atiende la pérdida de un módulo mientras la sesión está abierta (spec 141, US5, FR-016, SC-003): el
 * servidor respondió `MODULE_NOT_IN_PLAN` a una acción del usuario. Da **un solo** aviso y hace **una sola**
 * redirección al inicio, y corrige el menú **sin recargar**, aunque varias peticiones sean rechazadas a la
 * vez o en sucesión. Los datos del negocio no se tocan (el servidor solo dejó de servirlos).
 *
 * Contrato: `specs/141-modulo-inventario-unificado/contracts/frontend-acceso-modulos.md` §3.
 */
@Injectable({ providedIn: 'root' })
export class ModuleAccessLostService {
  private readonly planSummary = inject(PlanSummaryService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Hay una atención en curso: los rechazos que lleguen mientras tanto no repiten aviso ni redirección. */
  private handling = false;

  async handle(module: string | undefined): Promise<void> {
    // 1. N rechazos simultáneos (o en sucesión inmediata) → una sola atención.
    if (this.handling) return;

    // 2. Rechazo tardío de una petición que ya iba en vuelo cuando se atendió la pérdida: el resumen ya
    //    dice «sin módulo», no hay nada nuevo que avisar. Un módulo ausente o desconocido no es una clave
    //    del resumen: se atiende igual (aviso + inicio + refresco), sin marcar nada.
    const summary = this.planSummary.summary();
    const key: keyof ModuleAccess | null =
      summary !== null && module !== undefined && module in summary.modules
        ? (module as keyof ModuleAccess)
        : null;
    if (key !== null && summary?.modules[key] === false) return;

    // 3-7. Marcar, avisar, volver al inicio y confirmar contra el servidor; liberar siempre.
    this.handling = true;
    try {
      // El menú se corrige en el acto (síncrono), antes de esperar al servidor.
      if (key !== null) this.planSummary.markModuleMissing(key);
      this.toast.error(MODULE_NOT_IN_PLAN_MESSAGE);
      await Promise.allSettled([
        this.router.navigateByUrl('/dashboard'),
        this.planSummary.load({ force: true }),
      ]);
    } finally {
      this.handling = false;
    }
  }
}
