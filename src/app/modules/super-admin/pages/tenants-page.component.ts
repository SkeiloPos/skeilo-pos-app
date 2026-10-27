import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Tenant } from '../interfaces/tenant.interface';
import { TenantService } from '../services/tenant.service';
import { TenantFormComponent } from '../components/tenant-form.component';
import { TenantPlanFormComponent } from '../components/tenant-plan-form.component';

@Component({
  selector: 'app-tenants-page',
  standalone: true,
  imports: [TenantFormComponent, TenantPlanFormComponent, TenantDatePipe],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Tenants</h1>
          <p class="text-gray-500 text-sm mt-1">Gestiona los negocios de la plataforma</p>
        </div>
        <button
          (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <span>+</span> Nuevo Tenant
        </button>
      </div>

      <!-- Error banner -->
      @if (tenantService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ tenantService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (loading() && tenants().length === 0) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (tenants().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">🏢</div>
              <p class="text-gray-600 font-medium">Aún no hay tenants</p>
              <p class="text-gray-400 text-sm mt-1">Crea el primer tenant para comenzar</p>
              <button
                (click)="openCreate()"
                class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Crear tenant
              </button>
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Nombre
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                  >
                    Schema
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                  >
                    Host
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Plan
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                  >
                    Vence
                  </th>
                  <th class="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (t of tenants(); track t.id) {
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div
                          class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-lg shrink-0"
                        >
                          🏢
                        </div>
                        <span class="text-sm font-medium">{{ t.name }}</span>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500 font-mono">{{ t.schema }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500 font-mono">{{ t.host }}</span>
                    </td>
                    <td class="px-5 py-4">
                      <span class="text-sm text-gray-600">{{ t.plan_name ?? '—' }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">
                        {{ t.plan_vence_en ? (t.plan_vence_en | tenantDate: 'mediumDate' : t.timezone) : 'Sin vencimiento' }}
                      </span>
                    </td>
                    <td class="px-5 py-4 text-right">
                      <button
                        (click)="openChangePlan(t)"
                        class="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Cambiar / renovar plan
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

    <!-- Modal -->
    @if (showForm()) {
      <app-tenant-form (saved)="onSaved()" (cancelled)="onCancelled()" />
    }
    @if (changingPlanFor(); as tenant) {
      <app-tenant-plan-form [tenant]="tenant" (saved)="onPlanChanged()" (cancelled)="onPlanChangeCancelled()" />
    }
  `,
})
export class TenantsPageComponent implements OnInit {
  readonly tenantService = inject(TenantService);
  readonly tenants = signal<Tenant[]>([]);
  readonly loading = signal(false);
  readonly showForm = signal(false);
  readonly changingPlanFor = signal<Tenant | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.tenantService.error.set(null);
    this.tenantService.loadTenants().subscribe({
      next: (response) => {
        this.tenants.set(response.items);
        this.loading.set(false);
      },
      error: () => {
        this.tenantService.error.set('No se pudieron cargar los tenants.');
        this.loading.set(false);
      },
    });
  }

  openCreate(): void {
    this.showForm.set(true);
  }

  onSaved(): void {
    this.showForm.set(false);
    this.reload();
  }

  onCancelled(): void {
    this.showForm.set(false);
  }

  openChangePlan(tenant: Tenant): void {
    this.tenantService.error.set(null);
    this.changingPlanFor.set(tenant);
  }

  onPlanChanged(): void {
    this.changingPlanFor.set(null);
    this.reload();
  }

  onPlanChangeCancelled(): void {
    this.changingPlanFor.set(null);
  }
}
