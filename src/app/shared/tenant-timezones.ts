/**
 * Las siete zonas horarias del selector de «Nuevo Tenant» (spec 138, FR-010; data-model.md §3).
 *
 * Es una lista curada y estática, duplicada en el backend (`app/core/timezone.py::ZONAS_CURADAS`): el alta de
 * tenant ofrece solo estas zonas para que nadie escriba un nombre IANA a mano. Si la lista cambia en un lado,
 * `tenant-timezones.parity.spec.ts` y `test_zonas_curadas.py` obligan a cambiarla en el otro (mismo mecanismo
 * que `reserved-slugs.parity.spec.ts`, spec 091). `value` es la zona IANA que viaja al backend; `label`, el
 * nombre en español que ve el Super Admin.
 */
export interface TenantTimezoneOption {
  value: string;
  label: string;
}

export const TENANT_TIMEZONE_OPTIONS: TenantTimezoneOption[] = [
  { value: 'America/Bogota', label: 'Bogotá (Colombia)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México' },
  { value: 'America/Lima', label: 'Lima (Perú)' },
  { value: 'America/Santiago', label: 'Santiago (Chile)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (Argentina)' },
  { value: 'Europe/Madrid', label: 'Madrid (España)' },
  { value: 'Asia/Tokyo', label: 'Tokio (Japón)' },
];
