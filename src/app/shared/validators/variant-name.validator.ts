/**
 * Regla del nombre propio de una variante de producto (spec 099). Definición única en
 * `specs/099-nombre-tamano-variante/contracts/variant-name-rules.md`; el backend
 * (`app/core/variant_name.py`) la replica y ambas suites recorren los mismos vectores.
 *
 * A diferencia del nombre completo (`full-name.validator.ts`), este campo es opcional
 * (sin error "required") y sin restricción de alfabeto -- solo valida la longitud
 * máxima, antes de recortar y colapsar espacios internos.
 */
export const VARIANT_NAME_MESSAGE = 'El nombre admite hasta 60 caracteres';

export const VARIANT_NAME_MAX_LENGTH = 60;

const WHITESPACE = /\s+/g;

/**
 * Recorta, colapsa espacios internos y valida la longitud máxima. Devuelve el valor a
 * guardar (puede ser `''`, nunca `null`/`undefined`) o el mensaje de error si la
 * entrada, tal como se escribió (antes de recortar), supera los 60 caracteres.
 */
export function normalizeVariantName(
  value: string | null | undefined,
): { value: string } | { error: string } {
  const raw = value ?? '';

  // `Array.from` cuenta puntos de código, no unidades UTF-16 -- igual que el backend.
  if (Array.from(raw).length > VARIANT_NAME_MAX_LENGTH) {
    return { error: VARIANT_NAME_MESSAGE };
  }

  return { value: raw.trim().replace(WHITESPACE, ' ') };
}
