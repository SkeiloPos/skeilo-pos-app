import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { InvitationFormComponent } from '../components/invitation-form.component';
import { PendingInvitationsListComponent } from '../components/pending-invitations-list.component';
import { UserRoleModalComponent } from '../components/user-role-modal.component';
import { TenantUser } from '../interfaces/user-profile.interface';
import { InvitationsService } from '../services/invitations.service';
import { UsersService } from '../services/users.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { displayName, initialOf } from '../../../shared/person-display';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  CASHIER: 'Cajero',
  MESERO: 'Mesero',
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: 'bg-indigo-100 text-indigo-700',
  CASHIER: 'bg-green-100 text-green-700',
  MESERO: 'bg-amber-100 text-amber-700',
};

const PAGE_SIZES = [10, 20, 50, 100];

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    FormsModule,
    InvitationFormComponent,
    PendingInvitationsListComponent,
    UserRoleModalComponent,
    IconMiComponent,
  ],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p class="text-gray-500 text-sm mt-1">Gestión del personal del tenant</p>
        </div>
        @if (!showForm()) {
          <button
            (click)="openForm()"
            class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <span>+</span> Agregar usuario
          </button>
        }
      </div>

      <!-- Formulario de invitación -->
      @if (showForm()) {
        <app-invitation-form (saved)="onUserSaved()" (cancelled)="showForm.set(false)" />
      }

      <!-- Error global -->
      @if (usersService.error() && !showForm() && !roleModalUser()) {
        <div class="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
          {{ usersService.error() }}
        </div>
      }

      <!-- Skeleton de carga -->
      @if (usersService.loading() && usersService.users().length === 0) {
        <div class="space-y-2">
          @for (i of [1, 2, 3]; track i) {
            <div
              class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse flex items-center gap-4"
            >
              <div class="w-10 h-10 rounded-full bg-gray-200 shrink-0"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 bg-gray-200 rounded w-1/3"></div>
                <div class="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
              <div class="h-6 bg-gray-200 rounded-full w-16"></div>
            </div>
          }
        </div>
      } @else if (usersService.users().length === 0) {
        <div
          class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400"
        >
          <app-mi-icon name="group" [size]="40" class="mb-3 inline-flex" />
          <p class="font-medium">No hay usuarios registrados</p>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {{ usersService.totalCount() }} usuario(s)
            </p>
          </div>
          <div class="divide-y divide-gray-50">
            @for (user of usersService.users(); track user.id) {
              <div
                class="px-5 py-4 flex items-center justify-between gap-3 transition-opacity"
                [class.opacity-50]="!user.active"
              >
                <!-- Avatar + info -->
                <div class="flex items-center gap-3 min-w-0">
                  <div
                    data-testid="user-avatar"
                    class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    [class]="roleBadgeClass(user.role_name)"
                  >
                    {{ initialOf(user.name, user.email) }}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p data-testid="user-title" class="text-sm font-semibold text-gray-800 truncate">
                        {{ displayName(user.name, user.email) }}
                      </p>
                      <span
                        class="w-2 h-2 rounded-full shrink-0"
                        [class]="user.active ? 'bg-green-500' : 'bg-gray-300'"
                        [title]="user.active ? 'Activo' : 'Inactivo'"
                      ></span>
                    </div>
                    <p class="text-xs text-gray-400 truncate">{{ user.email }}</p>
                    @if (user.phone) {
                      <p class="text-xs text-gray-400 truncate">{{ user.phone }}</p>
                    }
                  </div>
                </div>

                <!-- Badges + acciones -->
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class="text-xs px-2.5 py-1 rounded-full font-semibold"
                    [class]="roleBadgeClass(user.role_name)"
                  >
                    {{ roleLabel(user.role_name) }}
                  </span>
                  <span
                    class="text-xs px-2 py-1 rounded-full font-medium"
                    [class]="
                      user.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    "
                  >
                    {{ user.active ? 'Activo' : 'Inactivo' }}
                  </span>

                  @if (user.id !== currentUserId()) {
                    <button
                      (click)="openRoleModal(user)"
                      class="text-xs px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 transition-colors"
                    >
                      Cambiar rol
                    </button>
                    @if (user.active) {
                      <button
                        (click)="onToggleActive(user)"
                        [disabled]="usersService.isSubmitting()"
                        class="text-xs px-3 py-1.5 rounded-xl bg-red-50 text-red-600 font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        Desactivar
                      </button>
                    } @else {
                      <button
                        (click)="onToggleActive(user)"
                        [disabled]="usersService.isSubmitting()"
                        class="text-xs px-3 py-1.5 rounded-xl bg-green-50 text-green-700 font-semibold hover:bg-green-100 disabled:opacity-50 transition-colors"
                      >
                        Activar
                      </button>
                    }
                  }
                </div>
              </div>
            }
          </div>

          <!-- Footer de paginación -->
          <div
            class="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap"
          >
            <div class="flex items-center gap-2 text-xs text-gray-500">
              <span>Por página</span>
              <select
                [ngModel]="usersService.size()"
                (ngModelChange)="onSizeChange($event)"
                [disabled]="usersService.loading()"
                class="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                @for (s of pageSizes; track s) {
                  <option [ngValue]="s">{{ s }}</option>
                }
              </select>
            </div>

            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-500">
                Página {{ usersService.page() }} de {{ usersService.totalPages() || 1 }}
              </span>
              <div class="flex items-center gap-1">
                <button
                  (click)="goToPage(usersService.page() - 1)"
                  [disabled]="usersService.page() <= 1 || usersService.loading()"
                  class="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <button
                  (click)="goToPage(usersService.page() + 1)"
                  [disabled]="
                    usersService.page() >= usersService.totalPages() || usersService.loading()
                  "
                  class="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Invitaciones pendientes (US3) -->
      <app-pending-invitations-list />
    </div>

    <!-- Modal cambiar rol -->
    @if (roleModalUser()) {
      <app-user-role-modal
        [user]="roleModalUser()"
        (saved)="onRoleSaved()"
        (cancelled)="roleModalUser.set(null)"
      />
    }
  `,
})
export class UsersPageComponent implements OnInit {
  readonly usersService = inject(UsersService);
  readonly invitationsService = inject(InvitationsService);
  private readonly authService = inject(AuthService);

  readonly showForm = signal(false);
  readonly roleModalUser = signal<TenantUser | null>(null);
  readonly pageSizes = PAGE_SIZES;

  // Presentación del nombre (spec 091): cuentas anteriores guardan el correo como nombre.
  readonly displayName = displayName;
  readonly initialOf = initialOf;

  readonly currentUserId = computed(() => this.authService.currentUser()?.id);

  ngOnInit(): void {
    this.usersService.loadUsers();
    this.invitationsService.loadPendingInvitations();
  }

  openForm(): void {
    this.usersService.error.set(null);
    this.invitationsService.error.set(null);
    this.showForm.set(true);
  }

  onUserSaved(): void {
    this.showForm.set(false);
    this.invitationsService.loadPendingInvitations(1);
  }

  openRoleModal(user: TenantUser): void {
    this.roleModalUser.set(user);
  }

  onRoleSaved(): void {
    this.roleModalUser.set(null);
  }

  async onToggleActive(user: TenantUser): Promise<void> {
    if (user.active && !confirm(`¿Desactivar al usuario "${displayName(user.name, user.email)}"?`)) return;
    await this.usersService.toggleActive(user.id, !user.active);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.usersService.totalPages()) return;
    this.usersService.loadUsers(page, this.usersService.size());
  }

  onSizeChange(size: number): void {
    this.usersService.loadUsers(1, size);
  }

  roleLabel(roleName: string | null): string {
    const key = roleName?.toUpperCase() ?? '';
    return ROLE_LABELS[key] ?? roleName ?? '—';
  }

  roleBadgeClass(roleName: string | null): string {
    const key = roleName?.toUpperCase() ?? '';
    return ROLE_BADGE_CLASSES[key] ?? 'bg-gray-100 text-gray-500';
  }
}
