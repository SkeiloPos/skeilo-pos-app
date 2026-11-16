/** Mirrors `shared.users.status` plus the `invitation_pending` projection of a
 * pending `UserInvitation` in the unified listing (spec 159, research.md
 * Decisiones 2 y 3). */
export type UserStatus =
  | 'active'
  | 'suspended'
  | 'blocked_security'
  | 'pending_activation'
  | 'invitation_pending'
  | 'anonymized';

/** One row of `GET /super-admin/users/{id}/memberships` (spec 159, FR-014). */
export interface UserMembership {
  tenant_id: number;
  tenant_name: string;
  tenant_status: 'active' | 'suspended';
  plan_name: string | null;
  role_name: string;
  member_since: string;
}

/** Body de `PATCH /super-admin/users/{id}` (spec 159, FR-016/FR-017).
 * `membership_tenant_id`/`membership_role_id` deben enviarse juntos. */
export interface UserUpdatePayload {
  name?: string;
  role_id?: string;
  membership_tenant_id?: number;
  membership_role_id?: string;
}

/** Body de `POST /super-admin/users/{id}/suspend` (spec 159, FR-019). */
export interface SuspendUserPayload {
  reason: string;
  revoke_sessions: boolean;
}

/** One row of the unified `GET /super-admin/users` listing (spec 159, FR-001 a
 * FR-007). `status='invitation_pending'` rows come from a `UserInvitation`
 * (research.md Decisión 3): they always carry `memberships_count=0` and
 * `last_login_at=null`. */
export interface UserListItem {
  id: string;
  name: string | null;
  email: string;
  role_name: string | null;
  status: UserStatus;
  memberships_count: number;
  memberships_preview: string | null;
  plan_name: string | null;
  last_login_at: string | null;
  /** Derivado, no es `status` (spec 159 Edge case "Sin actividad reciente"). */
  is_inactive_recently: boolean;
  created_at: string;
}

/** `GET /super-admin/users/{id}` -- pestaña "información general" (spec 159, FR-011). */
export interface UserDetail {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

/** Una sesión activa, pestaña "Seguridad" (spec 159, FR-013/FR-028). */
export interface UserSessionItem {
  id: string;
  device_label: string | null;
  browser: string | null;
  ip_address: string | null;
  created_at: string;
  last_seen_at: string;
}

/** `GET /super-admin/users/{id}/security` (spec 159, FR-013/FR-028/FR-029). */
export interface UserSecurity {
  active_sessions: UserSessionItem[];
  failed_login_attempts: number;
  security_blocked_at: string | null;
}

/** Una fila de `GET /super-admin/audit-logs` o de la actividad de un usuario
 * (spec 159, FR-033 a FR-038). `tenant_name` solo viene resuelto desde el
 * endpoint de auditoría (join con `Tenant`) -- `null` en la pestaña de
 * actividad de un usuario, que no lo necesita. */
export interface AdminAuditLogItem {
  id: string;
  actor_type: 'admin' | 'system';
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  affected_user_id: string | null;
  affected_user_email_snapshot: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

/** Combinable query params de `GET /super-admin/audit-logs` (spec 159, FR-036). */
export interface AuditLogFilters {
  affected_user_id?: string | null;
  actor_user_id?: string | null;
  tenant_id?: number | null;
  action?: string | null;
  date_from?: string | null;
  date_to?: string | null;
}

/** `GET /super-admin/roles` -- catálogo global y fijo (spec 159, FR-005). */
export interface RoleOption {
  id: string;
  name: string;
}

/** `GET /super-admin/users/stats` -- 4 indicadores resumidos (spec 159, FR-008/FR-009). */
export interface UserStats {
  total: number;
  active: number;
  suspended: number;
  new_this_month: number;
}

/** Cuerpo del `409` de `DELETE /super-admin/users/{id}` cuando hay una
 * obligación de retención vigente (spec 159, FR-024, User Story 5). */
export interface RetentionBlockedDetail {
  reason: string;
  retention_tenants: { tenant_id: number; tenant_name: string }[];
}

/** Combinable query params of `GET /super-admin/users` (FR-005/FR-006). */
export interface UserListFilters {
  search?: string;
  status?: UserStatus[];
  role_id?: string | null;
  plan_id?: string | null;
  registered_from?: string | null;
  registered_to?: string | null;
  sort_by?: 'name' | 'last_login_at' | 'created_at';
  sort_dir?: 'asc' | 'desc';
}
