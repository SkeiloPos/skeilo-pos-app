import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Reglas del nombre completo (spec 091). Definición única en
 * `specs/091-admin-subdominio-nombre-completo/contracts/full-name-rules.md`; el backend
 * (`app/core/person_name.py`) la replica y ambas suites recorren los mismos vectores.
 */
export type FullNameError = 'required' | 'length' | 'format';

export const FULL_NAME_MESSAGES: Record<FullNameError, string> = {
  required: 'El nombre es obligatorio',
  length: 'El nombre debe tener entre 2 y 100 caracteres',
  format:
    'El nombre solo puede contener letras, espacios, apóstrofes y guiones, y al menos dos letras',
};

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

// Letra latina con rangos explícitos (no `\p{L}`): excluye × (U+00D7) y ÷ (U+00F7)
// y coincide con el backend.
const LATIN = 'A-Za-zÀ-ÖØ-öø-ÿĀ-ɏḀ-ỿ';
const ALLOWED = new RegExp(`^[${LATIN} '’\\-]+$`);
const LETTER = new RegExp(`[${LATIN}]`, 'g');

/** Recorta, normaliza a NFC y valida; devuelve el valor a enviar o el primer error. */
export function normalizeFullName(
  value: string | null | undefined,
): { value: string } | { error: FullNameError } {
  const text = (value ?? '').trim().normalize('NFC');

  if (text === '') return { error: 'required' };

  // `Array.from` cuenta puntos de código, no unidades UTF-16.
  const length = Array.from(text).length;
  if (length < MIN_LENGTH || length > MAX_LENGTH) return { error: 'length' };

  if (!ALLOWED.test(text) || (text.match(LETTER)?.length ?? 0) < 2) return { error: 'format' };

  return { value: text };
}

/**
 * `optional`: vacío permitido (editar un usuario sin nombre propio); si se escribe
 * algo, debe ser válido.
 */
export function fullNameValidator(options: { optional?: boolean } = {}): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = control.value as string | null | undefined;
    if (options.optional && (raw ?? '').trim() === '') return null;

    const result = normalizeFullName(raw);
    if ('error' in result) {
      return { fullName: { error: result.error, message: FULL_NAME_MESSAGES[result.error] } };
    }
    return null;
  };
}
