import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserRole } from '../../../core/interfaces/user.interface';
import { AdminUser } from '../interfaces/admin-user.interface';
import { SuperAdminUsersService } from '../services/super-admin-users.service';
import { TenantService } from '../services/tenant.service';
import { AdminUserFormComponent } from '../components/admin-user-form.component';
import { displayName, initialOf } from '../../../shared/person-display';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.MESERO]: 'Mesero',
};

@Component({
  selector: 'app-super-admin-users-page',
  standalone: true,
  imports: [FormsModule, AdminUserFormComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p class="text-gray-500 text-sm mt-1">Administra los usuarios de todos los tenants</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex gap-3 flex-wrap">
        <input
          type="text"
          [(ngModel)]="searchTermValue"
          (ngModelChange)="searchTerm.set($event)"
          placeholder="Buscar por email o nombre..."
          class="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select
          [(ngModel)]="statusFilterValue"
          (ngModelChange)="statusFilter.set($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      <!-- Error banner -->
      @if (usersService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ usersService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (usersService.loading() && usersService.users().length === 0) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (filteredUsers().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <div class="text-5xl mb-4">👥</div>
              @if (searchTerm() || statusFilter() !== 'all') {
                <p class="text-gray-600 font-medium">No hay usuarios que coincidan</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Aún no hay usuarios</p>
                <p class="text-gray-400 text-sm mt-1">Crea el primer usuario para comenzar</p>
                <button
                  (click)="openCreate()"
                  class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Crear usuario
                </button>
              }
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Usuario
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                  >
                    Rol
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                  >
                    Tenant
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Estado
                  </th>
                  <th
                    class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (u of filteredUsers(); track u.id) {
                  <tr [class.opacity-50]="!u.active" class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div
                          data-testid="user-avatar"
                          class="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0"
                        >
                          {{ initial(u) }}
                        </div>
                        <div class="min-w-0">
                          <p
                            data-testid="user-title"
                            class="text-sm font-medium truncate"
                            [class.text-gray-400]="!u.active"
                            [class.text-gray-900]="u.active"
                          >
                            {{ displayName(u.name, u.email) }}
                          </p>
                          @if (displayName(u.name, u.email) !== u.email) {
                            <p class="text-xs text-gray-500 truncate">{{ u.email }}</p>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-600">{{ roleLabel(u.role) }}</span>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-600">{{ tenantName(u.tenant_id) }}</span>
                    </td>
                    <td class="px-5 py-4">
                      @if (u.active) {
                        <span
                          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                        >
                          Activo
                        </span>
                      } @else {
                        <span
                          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500"
                        >
                          Inactivo
                        </span>
                      }
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex items-center justify-end gap-2">
                        <button
                          (click)="openEdit(u)"
                          title="Editar"
                          class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          (click)="onToggle(u)"
                          [title]="u.active ? 'Desactivar' : 'Activar'"
                          class="p-2 rounded-lg transition-colors"
                          [class]="
                            u.active
                              ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                          "
                        >
                          {{ u.active ? '🔴' : '🟢' }}
                        </button>
                      </div>
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
      <app-admin-user-form [user]="editingUser()" (saved)="onSaved()" (cancelled)="onCancelled()" />
    }
  `,
})
export class SuperAdminUsersPageComponent implements OnInit {
  readonly usersService = inject(SuperAdminUsersService);
  readonly tenantService = inject(TenantService);

  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly showForm = signal(false);
  readonly editingUser = signal<AdminUser | null>(null);

  searchTermValue = '';
  statusFilterValue: 'all' | 'active' | 'inactive' = 'all';

  readonly filteredUsers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const status = this.statusFilter();

    return this.usersService.users().filter((u) => {
      const matchesSearch =
        !term ||
        u.email.toLowerCase().includes(term) ||
        (u.name?.toLowerCase().includes(term) ?? false);
      const matchesStatus =
        status === 'all' ||
        (status === 'active' && u.active) ||
        (status === 'inactive' && !u.active);
      return matchesSearch && matchesStatus;
    });
  });

  ngOnInit(): void {
    this.usersService.loadUsers();
    // Tenants are needed to resolve names and to populate the form selector.
    this.tenantService.loadTenants();
  }

  roleLabel(role: UserRole): string {
    return ROLE_LABELS[role] ?? role;
  }

  tenantName(tenantId: number | null): string {
    if (tenantId === null) return '—';
    return this.tenantService.tenants().find((t) => t.id === tenantId)?.name ?? `#${tenantId}`;
  }

  readonly displayName = displayName;

  initial(user: AdminUser): string {
    return initialOf(user.name, user.email) || '?';
  }

  openCreate(): void {
    this.editingUser.set(null);
    this.showForm.set(true);
  }

  openEdit(user: AdminUser): void {
    this.editingUser.set(user);
    this.showForm.set(true);
  }

  async onToggle(user: AdminUser): Promise<void> {
    if (user.active && !confirm(`¿Desactivar al usuario "${user.email}"?`)) return;
    await this.usersService.toggleActive(user.id, user.active);
  }

  onSaved(): void {
    this.showForm.set(false);
    this.editingUser.set(null);
  }

  onCancelled(): void {
    this.showForm.set(false);
    this.editingUser.set(null);
  }
}
