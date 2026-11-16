import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AdminAuditLogItem,
  UserDetail,
  UserMembership,
  UserSecurity,
  UserStatus,
} from '../interfaces/admin-user.interface';
import { SuperAdminUserDetailService } from '../services/super-admin-user-detail.service';
import { UserSecurityTabComponent } from '../components/user-security-tab.component';
import { AdminUserFormComponent } from '../components/admin-user-form.component';
import { SuspendUserModalComponent } from '../components/suspend-user-modal.component';
import { ConfirmSensitiveActionModalComponent } from '../components/confirm-sensitive-action-modal.component';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { displayName } from '../../../shared/person-display';
import { RetentionBlockedDetail } from '../interfaces/admin-user.interface';

type SensitiveAction = 'anonymize' | 'delete';

/** Acciones de administración disponibles por estado (spec 159, FR-018/
 * FR-019/FR-021/FR-027): un usuario `anonymized` no tiene ninguna acción
 * sensible disponible -- editar/enviar recuperación dejan de tener sentido. */
function actionsFor(status: UserStatus): {
  canEdit: boolean;
  canSuspend: boolean;
  canReset: boolean;
  canAnonymize: boolean;
  activateLabel: string | null;
} {
  switch (status) {
    case 'active':
      return { canEdit: true, canSuspend: true, canReset: true, canAnonymize: true, activateLabel: null };
    case 'suspended':
      return { canEdit: true, canSuspend: false, canReset: true, canAnonymize: true, activateLabel: 'Reactivar' };
    case 'blocked_security':
      return { canEdit: true, canSuspend: false, canReset: true, canAnonymize: true, activateLabel: 'Desbloquear' };
    case 'pending_activation':
      return { canEdit: true, canSuspend: false, canReset: true, canAnonymize: true, activateLabel: 'Activar' };
    default:
      return { canEdit: false, canSuspend: false, canReset: false, canAnonymize: false, activateLabel: null };
  }
}

type TabId = 'general' | 'activity' | 'security' | 'memberships';

const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  blocked_security: 'Bloqueado por seguridad',
  pending_activation: 'Pendiente de activación',
  invitation_pending: 'Invitación pendiente',
  anonymized: 'Anonimizado',
};

/** Mismos colores que la tabla del listado (super-admin-users-page) -- aquí
 * distingue sobre todo "Bloqueado por seguridad" de "Suspendido" (ambos con
 * `active=false` en el backend, pero estados distintos, User Story 6). */
const STATUS_BADGE_CLASSES: Record<UserStatus, string> = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-700',
  blocked_security: 'bg-red-100 text-red-700',
  pending_activation: 'bg-blue-100 text-blue-700',
  invitation_pending: 'bg-gray-100 text-gray-500',
  anonymized: 'bg-gray-200 text-gray-600',
};

const EMPTY_SECURITY: UserSecurity = {
  active_sessions: [],
  failed_login_attempts: 0,
  security_blocked_at: null,
};

/** Ficha individual de usuario (spec 159, User Story 3, FR-010 a FR-015).
 * Cada pestaña carga sus datos de forma perezosa, al activarse por primera
 * vez -- no hay fetch reactivo en segundo plano (nota de memoria del
 * proyecto: solo cargar al abrir/editar o ante una acción explícita). */
@Component({
  selector: 'app-super-admin-user-detail-page',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    UserSecurityTabComponent,
    AdminUserFormComponent,
    SuspendUserModalComponent,
    ConfirmSensitiveActionModalComponent,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <a routerLink="/super-admin/users" class="text-sm text-indigo-600 hover:text-indigo-700">← Usuarios</a>
      </div>

      @if (editingUser(); as editUser) {
        <app-admin-user-form
          [user]="editUser"
          (saved)="onEditSaved($event)"
          (cancelled)="editingUser.set(null)"
        />
      }
      @if (suspending()) {
        <app-suspend-user-modal
          (confirmed)="onSuspendConfirmed($event)"
          (cancelled)="suspending.set(false)"
        />
      }
      @if (sensitiveAction(); as action) {
        <app-confirm-sensitive-action-modal
          [userEmail]="user()?.email ?? ''"
          [title]="action === 'anonymize' ? 'Anonimizar usuario' : 'Eliminar permanentemente'"
          [message]="
            action === 'anonymize'
              ? 'Esta acción es irreversible: el nombre y el correo quedarán anonimizados y el usuario no podrá volver a iniciar sesión.'
              : 'Esta acción es irreversible y borra la fila del usuario y sus membresías. Si tiene historial transaccional en algún negocio, se bloqueará.'
          "
          [confirmLabel]="action === 'anonymize' ? 'Anonimizar' : 'Eliminar'"
          (confirmed)="onSensitiveActionConfirmed()"
          (cancelled)="sensitiveAction.set(null)"
        />
      }

      @if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>No se pudo cargar la ficha del usuario.</span>
          <button (click)="loadAll()" class="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
            Reintentar
          </button>
        </div>
      } @else if (loading()) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (user(); as u) {
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <h1 data-testid="detail-name" class="text-2xl font-bold text-gray-900">{{ displayName(u.name, u.email) }}</h1>
              <span
                data-testid="detail-status-badge"
                class="px-2 py-0.5 rounded-full text-xs font-medium"
                [class]="statusBadgeClass(u.status)"
              >
                {{ statusLabel(u.status) }}
              </span>
            </div>
            <p class="text-gray-500 text-sm mt-1">{{ u.email }}</p>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            @if (actions(u.status).canEdit) {
              <button
                type="button"
                data-testid="action-edit"
                (click)="editingUser.set(u)"
                class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Editar
              </button>
            }
            @if (actions(u.status).activateLabel; as label) {
              <button
                type="button"
                data-testid="action-activate"
                (click)="onActivate(label)"
                class="px-3 py-1.5 text-xs font-medium border border-green-200 rounded-lg text-green-700 hover:bg-green-50"
              >
                {{ label }}
              </button>
            }
            @if (actions(u.status).canSuspend) {
              <button
                type="button"
                data-testid="action-suspend"
                (click)="suspending.set(true)"
                class="px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg text-red-700 hover:bg-red-50"
              >
                Suspender
              </button>
            }
            @if (actions(u.status).canReset) {
              <button
                type="button"
                data-testid="action-send-password-reset"
                (click)="onSendPasswordReset()"
                class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Enviar recuperación
              </button>
            }
            @if (actions(u.status).canAnonymize) {
              <button
                type="button"
                data-testid="action-anonymize"
                (click)="sensitiveAction.set('anonymize')"
                class="px-3 py-1.5 text-xs font-medium border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-50"
              >
                Anonimizar
              </button>
            }
            <button
              type="button"
              data-testid="action-delete"
              (click)="sensitiveAction.set('delete')"
              class="px-3 py-1.5 text-xs font-medium border border-red-300 rounded-lg text-red-800 hover:bg-red-50"
            >
              Eliminar permanentemente
            </button>
          </div>
        </div>

        <div class="border-b border-gray-100 flex gap-6">
          <button
            type="button"
            data-testid="tab-general"
            (click)="selectTab('general')"
            [class.font-semibold]="activeTab() === 'general'"
            [class.text-indigo-600]="activeTab() === 'general'"
            [class.border-indigo-600]="activeTab() === 'general'"
            class="pb-3 text-sm text-gray-500 border-b-2 border-transparent"
          >
            Información general
          </button>
          <button
            type="button"
            data-testid="tab-activity"
            (click)="selectTab('activity')"
            [class.font-semibold]="activeTab() === 'activity'"
            [class.text-indigo-600]="activeTab() === 'activity'"
            [class.border-indigo-600]="activeTab() === 'activity'"
            class="pb-3 text-sm text-gray-500 border-b-2 border-transparent"
          >
            Actividad
          </button>
          <button
            type="button"
            data-testid="tab-security"
            (click)="selectTab('security')"
            [class.font-semibold]="activeTab() === 'security'"
            [class.text-indigo-600]="activeTab() === 'security'"
            [class.border-indigo-600]="activeTab() === 'security'"
            class="pb-3 text-sm text-gray-500 border-b-2 border-transparent"
          >
            Seguridad
          </button>
          <button
            type="button"
            data-testid="tab-memberships"
            (click)="selectTab('memberships')"
            [class.font-semibold]="activeTab() === 'memberships'"
            [class.text-indigo-600]="activeTab() === 'memberships'"
            [class.border-indigo-600]="activeTab() === 'memberships'"
            class="pb-3 text-sm text-gray-500 border-b-2 border-transparent"
          >
            Negocios asociados
          </button>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          @switch (activeTab()) {
            @case ('general') {
              <dl data-testid="general-tab" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt class="text-gray-500">Correo</dt>
                  <dd class="text-gray-900 font-medium">{{ u.email }}</dd>
                </div>
                <div>
                  <dt class="text-gray-500">Fecha de registro</dt>
                  <dd class="text-gray-900 font-medium">{{ u.created_at | date: 'medium' }}</dd>
                </div>
                <div>
                  <dt class="text-gray-500">Estado</dt>
                  <dd>
                    <span
                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      [class]="statusBadgeClass(u.status)"
                    >
                      {{ statusLabel(u.status) }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt class="text-gray-500">Último acceso</dt>
                  <dd class="text-gray-900 font-medium">
                    {{ u.last_login_at ? (u.last_login_at | date: 'medium') : 'Sin accesos registrados' }}
                  </dd>
                </div>
              </dl>
            }
            @case ('activity') {
              @if (activityLoading()) {
                <div class="flex justify-center py-8">
                  <div class="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              } @else if (activity().length === 0) {
                <p data-testid="activity-empty" class="text-center py-8 text-sm text-gray-400 italic">
                  Todavía no hay actividad registrada para este usuario.
                </p>
              } @else {
                <ul data-testid="activity-tab" class="divide-y divide-gray-50">
                  @for (entry of activity(); track entry.id) {
                    <li class="py-3 text-sm">
                      <div class="flex items-center justify-between">
                        <span class="font-medium text-gray-900">{{ entry.action }}</span>
                        <span class="text-xs text-gray-400">{{ entry.created_at | date: 'short' }}</span>
                      </div>
                      <p class="text-xs text-gray-500 mt-0.5">
                        {{ entry.actor_type === 'system' ? 'Sistema' : (entry.actor_name_snapshot ?? 'Administrador') }}
                      </p>
                    </li>
                  }
                </ul>
              }
            }
            @case ('security') {
              @if (securityLoading()) {
                <div class="flex justify-center py-8">
                  <div class="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              } @else {
                <app-user-security-tab
                  [security]="security()"
                  (revokeAll)="onRevokeAllSessions()"
                  (revokeOne)="onRevokeSession($event)"
                />
              }
            }
            @case ('memberships') {
              @if (membershipsLoading()) {
                <div class="flex justify-center py-8">
                  <div class="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              } @else if (memberships().length === 0) {
                <div data-testid="memberships-empty" class="text-center py-8">
                  <p class="text-sm text-gray-400 italic mb-3">Este usuario no pertenece a ningún negocio.</p>
                  <button
                    type="button"
                    data-testid="assign-business"
                    disabled
                    title="Disponible próximamente"
                    class="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed"
                  >
                    Asignar negocio
                  </button>
                </div>
              } @else {
                <table data-testid="memberships-tab" class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th class="py-2">Negocio</th>
                      <th class="py-2">Plan</th>
                      <th class="py-2">Rol</th>
                      <th class="py-2">Desde</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    @for (m of memberships(); track m.tenant_id) {
                      <tr>
                        <td class="py-2">
                          {{ m.tenant_name }}
                          @if (m.tenant_status === 'suspended') {
                            <span class="ml-1 text-xs text-amber-600">(suspendido)</span>
                          }
                        </td>
                        <td class="py-2">{{ m.plan_name ?? '—' }}</td>
                        <td class="py-2">{{ m.role_name }}</td>
                        <td class="py-2">{{ m.member_since | date: 'mediumDate' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          }
        </div>
      }
    </div>
  `,
})
export class SuperAdminUserDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly detailService = inject(SuperAdminUserDetailService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  private readonly userId = this.route.snapshot.paramMap.get('id') ?? '';

  readonly user = signal<UserDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly actions = actionsFor;
  readonly editingUser = signal<UserDetail | null>(null);
  readonly suspending = signal(false);
  readonly sensitiveAction = signal<SensitiveAction | null>(null);

  readonly activeTab = signal<TabId>('general');

  readonly activity = signal<AdminAuditLogItem[]>([]);
  readonly activityLoading = signal(false);
  private activityLoaded = false;

  readonly security = signal<UserSecurity>(EMPTY_SECURITY);
  readonly securityLoading = signal(false);
  private securityLoaded = false;

  readonly memberships = signal<UserMembership[]>([]);
  readonly membershipsLoading = signal(false);
  private membershipsLoaded = false;

  readonly displayName = displayName;

  ngOnInit(): void {
    this.loadAll();
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.user.set(await this.detailService.getUser(this.userId));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async selectTab(tab: TabId): Promise<void> {
    this.activeTab.set(tab);
    if (tab === 'activity' && !this.activityLoaded) {
      this.activityLoaded = true;
      this.activityLoading.set(true);
      try {
        const page = await this.detailService.getActivity(this.userId);
        this.activity.set(page.items);
      } finally {
        this.activityLoading.set(false);
      }
    } else if (tab === 'security' && !this.securityLoaded) {
      this.securityLoaded = true;
      this.securityLoading.set(true);
      try {
        this.security.set(await this.detailService.getSecurity(this.userId));
      } finally {
        this.securityLoading.set(false);
      }
    } else if (tab === 'memberships' && !this.membershipsLoaded) {
      this.membershipsLoaded = true;
      this.membershipsLoading.set(true);
      try {
        this.memberships.set(await this.detailService.getMemberships(this.userId));
      } finally {
        this.membershipsLoading.set(false);
      }
    }
  }

  statusLabel(status: UserStatus): string {
    return STATUS_LABELS[status];
  }

  statusBadgeClass(status: UserStatus): string {
    return STATUS_BADGE_CLASSES[status];
  }

  onEditSaved(updated: UserDetail): void {
    this.editingUser.set(null);
    this.user.set(updated);
    this.toast.success('Usuario actualizado.');
    this.activityLoaded = false;
    if (this.activeTab() === 'activity') void this.selectTab('activity');
  }

  async onActivate(label: string): Promise<void> {
    const u = this.user();
    if (!u) return;
    const ok = await this.confirm.ask({
      title: label,
      message: `¿Confirmas que quieres ${label.toLowerCase()} a este usuario?`,
      confirmText: label,
    });
    if (!ok) return;
    try {
      this.user.set(await this.detailService.activateUser(u.id));
      this.toast.success(`Usuario ${label.toLowerCase()}do.`);
    } catch {
      this.toast.error('No se pudo completar la acción.');
    }
  }

  async onSuspendConfirmed(payload: { reason: string; revoke_sessions: boolean }): Promise<void> {
    const u = this.user();
    this.suspending.set(false);
    if (!u) return;
    try {
      this.user.set(await this.detailService.suspendUser(u.id, payload));
      this.toast.success('Usuario suspendido.');
      if (payload.revoke_sessions) {
        this.securityLoaded = false;
        if (this.activeTab() === 'security') void this.selectTab('security');
      }
    } catch {
      this.toast.error('No se pudo suspender al usuario.');
    }
  }

  async onRevokeAllSessions(): Promise<void> {
    const u = this.user();
    if (!u) return;
    try {
      this.security.set(await this.detailService.revokeAllSessions(u.id));
      this.toast.success('Se revocaron todas las sesiones activas.');
      this.activityLoaded = false;
      if (this.activeTab() === 'activity') void this.selectTab('activity');
    } catch {
      this.toast.error('No se pudieron revocar las sesiones.');
    }
  }

  async onRevokeSession(sessionId: string): Promise<void> {
    const u = this.user();
    if (!u) return;
    try {
      this.security.set(await this.detailService.revokeSession(u.id, sessionId));
      this.toast.success('Se revocó la sesión.');
      this.activityLoaded = false;
      if (this.activeTab() === 'activity') void this.selectTab('activity');
    } catch {
      this.toast.error('No se pudo revocar la sesión.');
    }
  }

  async onSendPasswordReset(): Promise<void> {
    const u = this.user();
    if (!u) return;
    const ok = await this.confirm.ask({
      title: 'Enviar recuperación de contraseña',
      message: `¿Confirmas que quieres enviar un enlace de recuperación de contraseña a ${u.email}?`,
      confirmText: 'Enviar',
    });
    if (!ok) return;
    try {
      const { message } = await this.detailService.sendPasswordReset(u.id);
      this.toast.success(message);
      this.activityLoaded = false;
      if (this.activeTab() === 'activity') void this.selectTab('activity');
    } catch {
      this.toast.error('No se pudo enviar la recuperación de contraseña.');
    }
  }

  async onSensitiveActionConfirmed(): Promise<void> {
    const u = this.user();
    const action = this.sensitiveAction();
    this.sensitiveAction.set(null);
    if (!u || !action) return;

    if (action === 'anonymize') {
      try {
        this.user.set(await this.detailService.anonymizeUser(u.id, u.email));
        this.toast.success('Usuario anonimizado.');
        this.activityLoaded = false;
        if (this.activeTab() === 'activity') void this.selectTab('activity');
      } catch {
        this.toast.error('No se pudo anonimizar al usuario.');
      }
      return;
    }

    try {
      await this.detailService.deleteUser(u.id, u.email);
      this.toast.success('El usuario fue eliminado permanentemente.');
      this.router.navigate(['/super-admin/users']);
    } catch (err) {
      const detail = (err as { error?: { detail?: RetentionBlockedDetail } })?.error?.detail;
      if (detail && Array.isArray(detail.retention_tenants) && detail.retention_tenants.length > 0) {
        const tenantNames = detail.retention_tenants.map(t => t.tenant_name).join(', ');
        this.toast.error(
          `No se puede eliminar: tiene historial en ${tenantNames}. Puedes anonimizarlo en su lugar.`,
        );
      } else {
        this.toast.error('No se pudo eliminar al usuario.');
      }
    }
  }
}
