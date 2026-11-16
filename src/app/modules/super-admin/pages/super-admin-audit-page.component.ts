import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminAuditLogItem, AuditLogFilters } from '../interfaces/admin-user.interface';
import { Tenant } from '../interfaces/tenant.interface';
import { SuperAdminAuditService } from '../services/super-admin-audit.service';
import { TenantService } from '../services/tenant.service';

const ACTION_LABELS: Record<string, string> = {
  profile_updated: 'Datos actualizados',
  role_changed: 'Rol cambiado',
  activated: 'Activado/reactivado/desbloqueado',
  suspended: 'Suspendido',
  password_reset_sent: 'Recuperación de contraseña enviada',
  blocked_security: 'Bloqueado por seguridad',
  sessions_revoked: 'Sesiones revocadas',
  anonymized: 'Anonimizado',
  deleted: 'Eliminado permanentemente',
};

/** Espejo local del formulario de filtros (mismo patrón que
 * `super-admin-users-page.component.ts`): un item más que `AuditLogFilters`
 * para los controles de formulario, reemplazado por `undefined` al enviarse. */
interface FilterFormState {
  affectedUserId: string;
  actorUserId: string;
  tenantId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTER_FORM: FilterFormState = {
  affectedUserId: '',
  actorUserId: '',
  tenantId: '',
  action: '',
  dateFrom: '',
  dateTo: '',
};

@Component({
  selector: 'app-super-admin-audit-page',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Auditoría y actividad</h1>
        <p class="text-gray-500 text-sm mt-1">
          Registro de toda acción administrativa y evento automático relevante (spec 159, FR-033 a FR-038)
        </p>
      </div>

      <!-- Filtros combinables (FR-036) -->
      <div class="flex gap-3 flex-wrap items-end">
        <input
          type="text"
          [ngModel]="formState().affectedUserId"
          (ngModelChange)="onAffectedUserIdChange($event)"
          placeholder="ID de usuario afectado"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-48"
        />
        <input
          type="text"
          [ngModel]="formState().actorUserId"
          (ngModelChange)="onActorUserIdChange($event)"
          placeholder="ID de administrador"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-48"
        />
        <select
          [ngModel]="formState().tenantId"
          (ngModelChange)="onTenantChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">Todos los negocios</option>
          @for (tenant of tenants(); track tenant.id) {
            <option [value]="tenant.id">{{ tenant.name }}</option>
          }
        </select>
        <select
          [ngModel]="formState().action"
          (ngModelChange)="onActionChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">Todos los tipos de acción</option>
          @for (action of actionOptions; track action) {
            <option [value]="action">{{ actionLabel(action) }}</option>
          }
        </select>
        <input
          type="date"
          [ngModel]="formState().dateFrom"
          (ngModelChange)="onDateFromChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          type="date"
          [ngModel]="formState().dateTo"
          (ngModelChange)="onDateToChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        @if (hasActiveFilters()) {
          <button
            data-testid="clear-filters"
            (click)="onClearFilters()"
            class="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Limpiar filtros
          </button>
        }
      </div>

      @if (auditService.hasError()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>No se pudo cargar la auditoría.</span>
          <button
            (click)="auditService.retry()"
            class="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      } @else if (auditService.isInitialLoading()) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (auditService.items().length === 0) {
            <div data-testid="empty-state" class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">🗒️</div>
              @if (auditService.emptyReason() === 'no_results') {
                <p class="text-gray-600 font-medium">Sin registros que coincidan</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Todavía no hay actividad registrada</p>
              }
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Origen</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Usuario afectado</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Negocio</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Tipo de operación</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Fecha/hora</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">IP</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (log of auditService.items(); track log.id) {
                  <tr data-testid="audit-row" class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      @if (log.actor_type === 'system') {
                        <span data-testid="actor-system" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          ⚙️ Sistema
                        </span>
                      } @else {
                        <span data-testid="actor-admin" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                          👤 {{ log.actor_name_snapshot ?? 'Administrador' }}
                        </span>
                      }
                    </td>
                    <td class="px-5 py-4">
                      @if (log.affected_user_id) {
                        <button
                          data-testid="affected-user-link"
                          (click)="onAffectedUserClick(log)"
                          class="text-sm text-indigo-600 hover:underline"
                        >
                          {{ log.affected_user_email_snapshot ?? '—' }}
                        </button>
                      } @else {
                        <span class="text-sm text-gray-400 italic">{{ log.affected_user_email_snapshot ?? 'Usuario eliminado' }}</span>
                      }
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-600">{{ log.tenant_name ?? '—' }}</span>
                    </td>
                    <td class="px-5 py-4">
                      <span class="text-sm text-gray-600">{{ actionLabel(log.action) }}</span>
                    </td>
                    <td class="px-5 py-4">
                      <span class="text-sm text-gray-600">{{ log.created_at | date: 'short' }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-600">{{ log.ip_address ?? '—' }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <span class="text-xs text-gray-500">
                Página {{ auditService.page() }} de {{ auditService.totalPages() }} ({{ auditService.total() }} registros)
              </span>
              <div class="flex gap-2">
                <button
                  data-testid="prev-page"
                  [disabled]="auditService.page() <= 1"
                  (click)="auditService.setPage(auditService.page() - 1)"
                  class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  data-testid="next-page"
                  [disabled]="auditService.page() >= auditService.totalPages()"
                  (click)="auditService.setPage(auditService.page() + 1)"
                  class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class SuperAdminAuditPageComponent implements OnInit {
  readonly auditService = inject(SuperAdminAuditService);
  private readonly tenantService = inject(TenantService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly actionOptions = Object.keys(ACTION_LABELS);
  readonly tenants = signal<Tenant[]>([]);

  readonly formState = signal<FilterFormState>({ ...EMPTY_FILTER_FORM });

  readonly hasActiveFilters = computed(() => {
    const f = this.formState();
    return !!(f.affectedUserId || f.actorUserId || f.tenantId || f.action || f.dateFrom || f.dateTo);
  });

  async ngOnInit(): Promise<void> {
    // Catálogo de negocios para el selector de filtro -- se carga una sola
    // vez al abrir la página, no es parte reactiva del listado (no proactive
    // background fetches, igual que en `super-admin-users-page.component.ts`).
    try {
      const page = await firstValueFrom(this.tenantService.loadTenants());
      this.tenants.set(page.items);
    } catch {
      // El selector de filtro de negocio simplemente queda vacío.
    }

    // T092: restaura los filtros de auditoría que venían en la URL al volver
    // desde la ficha de un usuario afectado (preserva el contexto).
    const params = this.route.snapshot.queryParamMap;
    const restored: FilterFormState = {
      affectedUserId: params.get('affected_user_id') ?? '',
      actorUserId: params.get('actor_user_id') ?? '',
      tenantId: params.get('tenant_id') ?? '',
      action: params.get('action') ?? '',
      dateFrom: params.get('date_from') ?? '',
      dateTo: params.get('date_to') ?? '',
    };
    if (Object.values(restored).some((v) => v)) {
      this.formState.set(restored);
      this.applyFilters();
    }
  }

  onAffectedUserIdChange(value: string): void {
    this.formState.set({ ...this.formState(), affectedUserId: value });
    this.applyFilters();
  }

  onActorUserIdChange(value: string): void {
    this.formState.set({ ...this.formState(), actorUserId: value });
    this.applyFilters();
  }

  onTenantChange(value: string): void {
    this.formState.set({ ...this.formState(), tenantId: value });
    this.applyFilters();
  }

  onActionChange(value: string): void {
    this.formState.set({ ...this.formState(), action: value });
    this.applyFilters();
  }

  onDateFromChange(value: string): void {
    this.formState.set({ ...this.formState(), dateFrom: value });
    this.applyFilters();
  }

  onDateToChange(value: string): void {
    this.formState.set({ ...this.formState(), dateTo: value });
    this.applyFilters();
  }

  onClearFilters(): void {
    this.formState.set({ ...EMPTY_FILTER_FORM });
    this.auditService.clearFilters();
    this.updateUrl();
  }

  private applyFilters(): void {
    const f = this.formState();
    const filters: AuditLogFilters = {
      affected_user_id: f.affectedUserId || undefined,
      actor_user_id: f.actorUserId || undefined,
      tenant_id: f.tenantId ? Number(f.tenantId) : undefined,
      action: f.action || undefined,
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
    };
    this.auditService.setFilters(filters);
    this.updateUrl();
  }

  /** T092: refleja los filtros activos en la URL (query params), para que
   * volver con el botón "atrás" del navegador tras ver la ficha de un
   * usuario afectado los restaure. */
  private updateUrl(): void {
    const f = this.formState();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        affected_user_id: f.affectedUserId || null,
        actor_user_id: f.actorUserId || null,
        tenant_id: f.tenantId || null,
        action: f.action || null,
        date_from: f.dateFrom || null,
        date_to: f.dateTo || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onAffectedUserClick(log: AdminAuditLogItem): void {
    if (!log.affected_user_id) return;
    this.router.navigate(['/super-admin/users', log.affected_user_id]);
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }
}
