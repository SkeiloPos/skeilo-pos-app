import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { PlanSummaryService } from '../services/plan-summary.service';

const RESOURCE_LABEL: Record<string, string> = {
  mesas: 'Mesas',
  cajas: 'Cajas',
  usuarios: 'Usuarios',
  productos: 'Productos',
  metodos_pago_activos: 'Métodos de pago activos',
};

const MODULE_LABEL: Record<string, string> = {
  inventario: 'Inventario',
  compras: 'Compras',
  promociones: 'Promociones',
};

/** "Mi plan" del Tenant Admin (spec 033, Historia de Usuario 6, FR-013):
 * nombre del plan, consumo de cada límite, estado de cada módulo, y
 * vencimiento — todo en una sola pantalla, sin ayuda de soporte (SC-004).
 * Accesible a cualquier usuario autenticado del dashboard, no solo ADMIN
 * (mismo criterio que `mi-cuenta`). */
@Component({
  selector: 'app-plan-summary-page',
  standalone: true,
  imports: [TenantDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Mi plan</h1>
        <p class="text-gray-500 text-sm mt-1">Límites, accesos y vencimiento de tu plan actual</p>
      </div>

      @if (planSummaryService.loading()) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (planSummaryService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ planSummaryService.error() }}
        </div>
      } @else if (summary(); as s) {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-gray-400 uppercase tracking-wide">Plan</p>
              <p class="text-lg font-semibold text-gray-900">{{ s.plan_name }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-400 uppercase tracking-wide">Vence</p>
              @if (s.plan_vence_en) {
                <p class="text-sm font-medium" [class.text-red-600]="s.vencido" [class.text-gray-700]="!s.vencido">
                  {{ s.plan_vence_en | tenantDate: 'mediumDate' }}
                  @if (s.vencido) {
                    <span class="block text-xs text-red-500">Venció — contacta al Super Admin</span>
                  }
                </p>
              } @else {
                <p class="text-sm font-medium text-gray-700">Sin vencimiento</p>
              }
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 class="text-sm font-semibold text-gray-700 mb-3">Límites</h2>
          <dl class="space-y-3 text-sm">
            @for (key of resourceKeys(); track key) {
              <div class="flex justify-between gap-3">
                <dt class="text-gray-500">{{ resourceLabel(key) }}</dt>
                <dd class="font-medium text-gray-900">
                  @if (s.resources[key].limit === null) {
                    <span>Ilimitado</span>
                  } @else {
                    <span>{{ s.resources[key].used }} de {{ s.resources[key].limit }}</span>
                  }
                </dd>
              </div>
            }
          </dl>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 class="text-sm font-semibold text-gray-700 mb-3">Módulos</h2>
          <dl class="space-y-3 text-sm">
            @for (key of moduleKeys(); track key) {
              <div class="flex justify-between gap-3">
                <dt class="text-gray-500">{{ moduleLabel(key) }}</dt>
                <dd>
                  <span
                    class="text-xs font-medium px-2.5 py-0.5 rounded-full"
                    [class.bg-green-50]="s.modules[key]"
                    [class.text-green-700]="s.modules[key]"
                    [class.bg-gray-100]="!s.modules[key]"
                    [class.text-gray-500]="!s.modules[key]"
                  >
                    {{ s.modules[key] ? 'Incluido' : 'No incluido' }}
                  </span>
                </dd>
              </div>
            }
          </dl>
        </div>
      }
    </div>
  `,
})
export class PlanSummaryPageComponent implements OnInit {
  readonly planSummaryService = inject(PlanSummaryService);
  readonly summary = this.planSummaryService.summary;

  readonly resourceKeys = computed(() => Object.keys(this.summary()?.resources ?? {}));
  readonly moduleKeys = computed(
    () => Object.keys(this.summary()?.modules ?? {}) as ('inventario' | 'compras' | 'promociones')[],
  );

  ngOnInit(): void {
    this.planSummaryService.load();
  }

  resourceLabel(key: string): string {
    return RESOURCE_LABEL[key] ?? key;
  }

  moduleLabel(key: string): string {
    return MODULE_LABEL[key] ?? key;
  }
}
