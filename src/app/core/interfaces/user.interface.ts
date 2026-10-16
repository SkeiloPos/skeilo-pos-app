export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'admin',
  CASHIER = 'cashier',
  MESERO = 'mesero',
}

export interface User {
  id: string;
  /** Real name when the backend provides it (spec 122); falls back to a
   *  name derived from the email for sessions issued before that change. */
  name?: string;
  email: string;
  role: UserRole;
  /** `null` for super admins, who are not scoped to a tenant. */
  tenantId: number | null;
  isSuperAdmin: boolean;
  /** When `true`, the user must change a temporary password before using the app. */
  mustChangePassword: boolean;
}

const ROLE_VALUES = new Set<string>(Object.values(UserRole));

/**
 * Roles que ya no existen y a qué equivalen hoy.
 *
 * `STAFF` era una invención del frontend —el backend solo emite `ADMIN` y
 * `CASHIER`— y su pantalla de inicio era el tablero de cocina, ya deprecado.
 * Sin esta traducción, un JWT vivo con ese rol daría sesión inválida y echaría
 * al usuario en vez de degradarlo al rol equivalente.
 */
const LEGACY_ROLES: Record<string, UserRole> = {
  staff: UserRole.CASHIER,
};

/**
 * Normalize a backend role (UPPERCASE, e.g. `ADMIN`) to the `UserRole` enum.
 * Returns `null` for unknown roles so callers can treat it as an invalid session.
 */
export function mapBackendRole(role: string): UserRole | null {
  const normalized = role?.toLowerCase();
  if (ROLE_VALUES.has(normalized)) return normalized as UserRole;
  return LEGACY_ROLES[normalized] ?? null;
}

/** Display name fallback when the backend does not provide one: the email local part. */
export function displayNameFromEmail(email: string): string {
  return email.split('@')[0] || email;
}
