/**
 * Presentación del nombre de una persona (spec 091, D9). Las cuentas anteriores
 * guardan el correo como nombre; aquí se ven como correo, sin migrar datos.
 */
export function displayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === email.trim().toLowerCase()) {
    return email;
  }
  return trimmed;
}

/** Primer punto de código del nombre mostrado, en mayúscula (no parte un emoji). */
export function initialOf(name: string | null | undefined, email: string): string {
  const first = Array.from(displayName(name, email))[0] ?? '';
  return first.toLocaleUpperCase();
}
