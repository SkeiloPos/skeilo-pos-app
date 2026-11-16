import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserListFilters, UserListItem, UserStatus } from '../interfaces/admin-user.interface';
import { SuperAdminUsersService } from '../services/super-admin-users.service';
import { PlanService } from '../services/plan.service';
import { displayName, initialOf } from '../../../shared/person-display';

const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  blocked_security: 'Bloqueado por seguridad',
  pending_activation: 'Pendiente de activación',
  invitation_pending: 'Invitación pendiente',
  anonymized: 'Anonimizado',
};

const STATUS_BADGE_CLASSES: Record<UserStatus, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700',
  blocked_security: 'bg-red-100 text-red-700',
  pending_activation: 'bg-blue-100 text-blue-700',
  invitation_pending: 'bg-gray-100 text-gray-500',
  anonymized: 'bg-gray-200 text-gray-600',
};

type SortableColumn = NonNullable<UserListFilters['sort_by']>;

/** Fila de referencia para los filtros de UI -- un item más que `UserListFilters`
 * para los controles de formulario (`select`/`input`), reemplazado por el valor
 * `undefined` correspondiente al enviarse al servicio. */
interface FilterFormState {
  search: string;
  status: UserStatus | '';
  roleId: string;
  planId: string;
  registeredFrom: string;
  registeredTo: string;
}

const EMPTY_FILTER_FORM: FilterFormState = {
  search: '',
  status: '',
  roleId: '',
  planId: '',
  registeredFrom: '',
  registeredTo: '',
};

@Component({
  selector: 'app-super-admin-users-page',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p class="text-gray-500 text-sm mt-1">Listado centralizado de todos los usuarios de la plataforma</p>
        </div>
      </div>

      <!-- Indicadores generales (FR-008/FR-009) -->
      @if (usersService.stats(); as stats) {
        <div data-testid="stats-widget" class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Total</p>
            <p data-testid="stat-total" class="text-2xl font-bold text-gray-900 mt-1">{{ stats.total }}</p>
          </div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Activos</p>
            <p data-testid="stat-active" class="text-2xl font-bold text-green-600 mt-1">{{ stats.active }}</p>
          </div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Suspendidos</p>
            <p data-testid="stat-suspended" class="text-2xl font-bold text-amber-600 mt-1">{{ stats.suspended }}</p>
          </div>
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Nuevos del mes</p>
            <p data-testid="stat-new-this-month" class="text-2xl font-bold text-indigo-600 mt-1">{{ stats.new_this_month }}</p>
          </div>
        </div>
      }

      <!-- Filtros (FR-004/FR-005) -->
      <div class="flex gap-3 flex-wrap items-end">
        <div class="flex-1 min-w-48">
          <input
            type="text"
            [ngModel]="formState().search"
            (ngModelChange)="onSearchInput($event)"
            placeholder="Buscar por nombre, correo o negocio..."
            class="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <select
          [ngModel]="formState().status"
          (ngModelChange)="onStatusChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">Todos los estados</option>
          @for (status of statusOptions; track status) {
            <option [value]="status">{{ statusLabel(status) }}</option>
          }
        </select>
        <select
          [ngModel]="formState().roleId"
          (ngModelChange)="onRoleChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">Todos los roles</option>
          @for (role of usersService.roles(); track role.id) {
            <option [value]="role.id">{{ role.name }}</option>
          }
        </select>
        <select
          [ngModel]="formState().planId"
          (ngModelChange)="onPlanChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="">Todos los planes</option>
          @for (plan of planService.plans(); track plan.id) {
            <option [value]="plan.id">{{ plan.name }}</option>
          }
        </select>
        <input
          type="date"
          [ngModel]="formState().registeredFrom"
          (ngModelChange)="onRegisteredFromChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          type="date"
          [ngModel]="formState().registeredTo"
          (ngModelChange)="onRegisteredToChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        @if (hasActiveFilters()) {
          <button
            (click)="onClearFilters()"
            class="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Limpiar filtros
          </button>
        }
      </div>

      @if (usersService.listHasError()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>No se pudo cargar el listado de usuarios.</span>
          <button
            (click)="usersService.retryList()"
            class="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      } @else if (usersService.isListInitialLoading()) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (usersService.listItems().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">👥</div>
              @if (usersService.emptyReason() === 'no_results') {
                <p class="text-gray-600 font-medium">Sin resultados</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar la búsqueda o los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Sin datos de plataforma</p>
                <p class="text-gray-400 text-sm mt-1">Todavía no hay usuarios registrados</p>
              }
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th
                    data-testid="sort-name"
                    (click)="onSort('name')"
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 cursor-pointer select-none"
                  >
                    Usuario {{ sortIndicator('name') }}
                  </th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                    Rol
                  </th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                    Negocio
                  </th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">
                    Plan
                  </th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">
                    Estado
                  </th>
                  <th
                    data-testid="sort-last-login"
                    (click)="onSort('last_login_at')"
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 cursor-pointer select-none"
                  >
                    Último acceso {{ sortIndicator('last_login_at') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (u of usersService.listItems(); track u.id) {
                  <tr
                    data-testid="user-row"
                    (click)="onRowClick(u)"
                    class="hover:bg-gray-50 transition-colors"
                    [class.cursor-pointer]="u.status !== 'invitation_pending'">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div
                          data-testid="user-avatar"
                          class="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0"
                        >
                          {{ initial(u) }}
                        </div>
                        <div class="min-w-0">
                          <p data-testid="user-title" class="text-sm font-medium truncate text-gray-900">
                            {{ displayName(u.name, u.email) }}
                          </p>
                          @if (displayName(u.name, u.email) !== u.email) {
                            <p class="text-xs text-gray-500 truncate">{{ u.email }}</p>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-600">{{ u.role_name ?? '—' }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      @if (u.memberships_count === 0) {
                        <span data-testid="no-tenant" class="text-sm text-gray-400 italic">Sin negocio</span>
                      } @else {
                        <span class="text-sm text-gray-600">{{ u.memberships_preview }}</span>
                        @if (u.memberships_count > 1) {
                          <span
                            data-testid="multi-tenant-badge"
                            class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700"
                          >
                            +{{ u.memberships_count - 1 }}
                          </span>
                        }
                      }
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-600">{{ u.plan_name ?? '—' }}</span>
                    </td>
                    <td class="px-5 py-4">
                      <span
                        data-testid="status-badge"
                        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                        [class]="statusBadgeClass(u.status)"
                      >
                        {{ statusLabel(u.status) }}
                      </span>
                      @if (u.is_inactive_recently) {
                        <span data-testid="inactive-badge" class="ml-1 text-xs text-gray-400 italic">Sin actividad reciente</span>
                      }
                    </td>
                    <td class="px-5 py-4">
                      <span class="text-sm text-gray-600">{{ u.last_login_at ? (u.last_login_at | date: 'short') : '—' }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>

            <!-- Paginación -->
            <div class="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <span class="text-xs text-gray-500">
                Página {{ usersService.page() }} de {{ usersService.listTotalPages() }} ({{ usersService.listTotal() }} usuarios)
              </span>
              <div class="flex gap-2">
                <button
                  data-testid="prev-page"
                  [disabled]="usersService.page() <= 1"
                  (click)="usersService.setPage(usersService.page() - 1)"
                  class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  data-testid="next-page"
                  [disabled]="usersService.page() >= usersService.listTotalPages()"
                  (click)="usersService.setPage(usersService.page() + 1)"
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
export class SuperAdminUsersPageComponent implements OnInit, OnDestroy {
  readonly usersService = inject(SuperAdminUsersService);
  readonly planService = inject(PlanService);
  private readonly router = inject(Router);

  readonly statusOptions: UserStatus[] = [
    'active', 'suspended', 'blocked_security', 'pending_activation', 'invitation_pending', 'anonymized',
  ];

  // Espejo local del formulario de filtros -- la búsqueda se envía al servicio
  // con debounce (300ms, mismo patrón que `products-page.component.ts`); el
  // resto de los filtros se envía de inmediato al cambiar.
  readonly formState = signal<FilterFormState>({ ...EMPTY_FILTER_FORM });
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  readonly hasActiveFilters = computed(() => {
    const f = this.formState();
    return !!(f.search || f.status || f.roleId || f.planId || f.registeredFrom || f.registeredTo);
  });

  ngOnInit(): void {
    // Catálogos para poblar los selectores de filtro (FR-005) -- no son
    // parte reactiva del listado, se cargan una sola vez al abrir la página.
    this.usersService.loadRoles();
    this.planService.load();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  onSearchInput(value: string): void {
    this.formState.set({ ...this.formState(), search: value });
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.applyFilters(), 300);
  }

  onStatusChange(value: UserStatus | ''): void {
    this.formState.set({ ...this.formState(), status: value });
    this.applyFilters();
  }

  onRoleChange(value: string): void {
    this.formState.set({ ...this.formState(), roleId: value });
    this.applyFilters();
  }

  onPlanChange(value: string): void {
    this.formState.set({ ...this.formState(), planId: value });
    this.applyFilters();
  }

  onRegisteredFromChange(value: string): void {
    this.formState.set({ ...this.formState(), registeredFrom: value });
    this.applyFilters();
  }

  onRegisteredToChange(value: string): void {
    this.formState.set({ ...this.formState(), registeredTo: value });
    this.applyFilters();
  }

  onClearFilters(): void {
    this.formState.set({ ...EMPTY_FILTER_FORM });
    this.usersService.clearFilters();
  }

  private applyFilters(): void {
    const f = this.formState();
    const current = this.usersService.filters();
    this.usersService.setFilters({
      sort_by: current.sort_by,
      sort_dir: current.sort_dir,
      search: f.search || undefined,
      status: f.status ? [f.status] : undefined,
      role_id: f.roleId || undefined,
      plan_id: f.planId || undefined,
      registered_from: f.registeredFrom || undefined,
      registered_to: f.registeredTo || undefined,
    });
  }

  onSort(column: SortableColumn): void {
    const current = this.usersService.filters();
    const nextDir = current.sort_by === column && current.sort_dir === 'asc' ? 'desc' : 'asc';
    this.usersService.setSort(column, nextDir);
  }

  sortIndicator(column: SortableColumn): string {
    const current = this.usersService.filters();
    if (current.sort_by !== column) return '';
    return current.sort_dir === 'asc' ? '▲' : '▼';
  }

  statusLabel(status: UserStatus): string {
    return STATUS_LABELS[status];
  }

  statusBadgeClass(status: UserStatus): string {
    return STATUS_BADGE_CLASSES[status];
  }

  readonly displayName = displayName;

  initial(user: UserListItem): string {
    return initialOf(user.name, user.email) || '?';
  }

  // Una invitación pendiente no es un `User` real (research.md Decisión 3):
  // su "ficha" solo ofrecería reenviar/cancelar, fuera de alcance aquí, así
  // que su fila no navega.
  onRowClick(user: UserListItem): void {
    if (user.status === 'invitation_pending') return;
    this.router.navigate(['/super-admin/users', user.id]);
  }
}
