import { Component, OnInit, inject, signal } from '@angular/core';
import { Plan } from '../interfaces/plan.interface';
import { PlanService } from '../services/plan.service';
import { PlanFormComponent } from '../components/plan-form.component';

function limitLabel(value: number | null): string {
  return value === null ? 'Ilimitado' : String(value);
}

/** Administración del catálogo de planes de suscripción del Super Admin
 * (spec 033, Historia de Usuario 1). Mismo patrón que
 * `payment-method-catalog-page.component.ts`. */
@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [PlanFormComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Planes de suscripción</h1>
          <p class="text-gray-500 text-sm mt-1">
            Límites, accesos de módulo y precios — se asignan a cada tenant desde su ficha
          </p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nuevo plan
        </button>
      </div>

      @if (planService.error() && !showForm()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ planService.error() }}
        </div>
      }

      @if (planService.loading() && plans().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (plans().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">📦</div>
              <p class="text-gray-600 font-medium">Aún no hay planes creados</p>
              <button
                (click)="openCreate()"
                class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Crear el primero
              </button>
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Nombre</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Mesas</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Usuarios</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Módulos</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Precio mensual</th>
                  <th class="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (p of plans(); track p.id) {
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <span class="text-sm font-medium">{{ p.name }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">{{ limitLabel(p.mesas_limit) }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">{{ limitLabel(p.usuarios_limit) }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">{{ moduleSummary(p) }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">{{ p.precio_mensual ?? '—' }}</span>
                    </td>
                    <td class="px-5 py-4 text-right">
                      <button (click)="openEdit(p)" class="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                        Editar
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
    </div>

    @if (showForm()) {
      <app-plan-form [plan]="editing()" (saved)="onSaved()" (cancelled)="onCancelled()" />
    }
  `,
})
export class PlansPageComponent implements OnInit {
  readonly planService = inject(PlanService);
  readonly plans = this.planService.plans;
  readonly showForm = signal(false);
  readonly editing = signal<Plan | null>(null);

  ngOnInit(): void {
    this.planService.load();
  }

  limitLabel = limitLabel;

  moduleSummary(plan: Plan): string {
    const included = [
      plan.inventario_access && 'Inventario',
      plan.promociones_access && 'Promociones',
    ].filter(Boolean);
    return included.length === 0 ? 'Ninguno' : included.join(', ');
  }

  openCreate(): void {
    this.editing.set(null);
    this.showForm.set(true);
  }

  openEdit(plan: Plan): void {
    this.editing.set(plan);
    this.showForm.set(true);
  }

  onSaved(): void {
    this.showForm.set(false);
  }

  onCancelled(): void {
    this.showForm.set(false);
  }
}
