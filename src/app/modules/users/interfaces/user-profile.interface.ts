/** Rol asignable a un usuario del tenant por un admin (`RoleName` del backend). */
export type RoleName = 'ADMIN' | 'CASHIER' | 'MESERO';

/** Envoltura de paginación devuelta por el backend (`Page[UserResponse]`). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Usuario del tenant tal como lo devuelve la API (`UserResponse`). */
export interface TenantUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  role_name: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Campos capturados por el formulario "Invitar usuario": nombre completo (spec 091), correo
 * y rol, sin contraseña (FR-001): dar de alta un usuario interno ocurre solo por invitación. */
export interface InvitationForm {
  name: string;
  email: string;
  role: RoleName | '';
}

/** Cuerpo para `POST /invitations` (`InvitationCreate`). */
export interface InvitationCreatePayload {
  name: string;
  email: string;
  role: RoleName;
}

/** Invitación pendiente tal como la devuelve la API (`InvitationResponse`). */
export interface PendingInvitation {
  id: string;
  /** Nombre completo capturado al invitar; `null` en las invitaciones anteriores a la spec 091. */
  name: string | null;
  email: string;
  role_name: string;
  sent_at: string;
}

/** Cuerpo para `PATCH /users/{user_id}/role` (`UserRoleUpdate`). */
export interface TenantUserRoleUpdatePayload {
  role: RoleName;
}

/** Cuerpo para `PATCH /users/{user_id}/status` (`UserStatusUpdate`). */
export interface TenantUserStatusUpdatePayload {
  active: boolean;
}
