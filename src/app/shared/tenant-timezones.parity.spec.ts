import { describe, expect, it } from 'vitest';
import { TENANT_TIMEZONE_OPTIONS } from './tenant-timezones';

/**
 * Paridad con el backend (`app/core/timezone.py::ZONAS_CURADAS`, spec 138 / data-model.md §3): si la lista
 * cambia en un lado, esta prueba y `test_zonas_curadas.py` obligan a cambiarla en el otro. Es EL MISMO literal
 * (IANA, nombre en el selector) que repite `LITERAL_ZONAS_CURADAS` del backend.
 */
const LITERAL_ZONAS_CURADAS: [string, string][] = [
  ['America/Bogota', 'Bogotá (Colombia)'],
  ['America/Mexico_City', 'Ciudad de México'],
  ['America/Lima', 'Lima (Perú)'],
  ['America/Santiago', 'Santiago (Chile)'],
  ['America/Argentina/Buenos_Aires', 'Buenos Aires (Argentina)'],
  ['Europe/Madrid', 'Madrid (España)'],
  ['Asia/Tokyo', 'Tokio (Japón)'],
];

describe('TENANT_TIMEZONE_OPTIONS (paridad con el backend)', () => {
  it('lleva exactamente las siete zonas del literal acordado, en el mismo orden', () => {
    expect(TENANT_TIMEZONE_OPTIONS.map((o) => [o.value, o.label])).toEqual(LITERAL_ZONAS_CURADAS);
  });

  it('cada `value` es una zona IANA que el navegador reconoce', () => {
    for (const { value } of TENANT_TIMEZONE_OPTIONS) {
      expect(() => new Intl.DateTimeFormat('es-CO', { timeZone: value })).not.toThrow();
    }
  });

  it('ninguna etiqueta ni valor se repite', () => {
    const valores = TENANT_TIMEZONE_OPTIONS.map((o) => o.value);
    const etiquetas = TENANT_TIMEZONE_OPTIONS.map((o) => o.label);
    expect(new Set(valores).size).toBe(valores.length);
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });
});
