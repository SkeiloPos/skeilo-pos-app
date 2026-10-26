import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { ModuleAccess } from '../../plan/interfaces/plan-summary.interface';

interface SettingsTab {
  label: string;
  path: string;
  /** Igual que `NavItem.moduleKey` (sidebar, spec 062): si el plan vigente
   * del tenant no la incluye (o está vencido), la pestaña se oculta. Sin
   * definir = siempre visible. */
  moduleKey?: keyof ModuleAccess;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="ajustes-theme aj-page">
      <div class="flex justify-between items-start gap-4">
        <div>
          <div class="aj-page-title">Ajustes</div>
          <p class="aj-muted mt-1">Configuración del negocio y del catálogo.</p>
        </div>
      </div>

      <!-- Tab nav (pills, design/ajustes.html) -->
      <div role="tablist" aria-label="Secciones de ajustes" class="aj-tablist overflow-x-auto">
        @for (tab of visibleTabs(); track tab.path) {
          <a
            role="tab"
            [routerLink]="tab.path"
            routerLinkActive
            #rla="routerLinkActive"
            class="aj-tab inline-flex items-center"
            [class.aj-tab-active]="rla.isActive"
            [attr.aria-selected]="rla.isActive"
          >
            {{ tab.label }}
          </a>
        }
      </div>

      <!-- Active tab content -->
      <router-outlet />
    </div>
  `,
})
export class SettingsPageComponent {
  private readonly planSummaryService = inject(PlanSummaryService);

  readonly tabs: SettingsTab[] = [
    { label: 'Información básica', path: 'informacion' },
    { label: 'Métodos de pago', path: 'metodos-pago' },
    { label: 'Unidades de medida', path: 'unidades', moduleKey: 'inventario' },
    { label: 'Grupos de opciones', path: 'grupos-opciones' },
  ];

  /** Pestañas visibles: igual que `SidebarComponent.visibleItems`, fail-open
   * mientras el plan todavía no cargó — la ruta ya está protegida por
   * `planModuleGuard`, así que esto es puramente cosmético. */
  readonly visibleTabs = computed<SettingsTab[]>(() => {
    const summary = this.planSummaryService.summary();
    return this.tabs.filter((tab) => {
      if (!tab.moduleKey) return true;
      if (!summary) return true;
      if (summary.vencido) return false;
      return summary.modules[tab.moduleKey];
    });
  });
}
