/**
 * Política de contraseñas vigente (spec 031, FR-019), en **una sola fuente**.
 *
 * De aquí salen las dos cosas que tienen que coincidir: la lista de requisitos
 * que el usuario ve mientras escribe (FR-027) y los validadores del formulario
 * (FR-029). Escribirlas por separado es cómo terminan discrepando — una lista
 * que dice "cumplido" junto a un formulario que rechaza (R13).
 *
 * Lo que **no** está aquí, a propósito:
 *
 * - **"Distinta de la actual"** (FR-033): el cliente no conoce la contraseña
 *   actual, así que no puede evaluarla. Mostrarla como requisito sería fingir que
 *   se comprueba un estado que nadie está mirando. La verifica el servidor al
 *   enviar, y llega como error de respuesta.
 * - **Mayúsculas, números o símbolos**: la política vigente no los exige (D4).
 *   Pedirlos aquí obligaría a contraseñas que el servidor no pide.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 12;

export interface PasswordRule {
  /** Texto visible de la regla, tal como aparece en la lista. */
  readonly label: string;
  readonly test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    label: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  {
    // El mockup omite el máximo; D4 obliga a mostrarlo, porque sin él el rechazo
    // a los 13 caracteres es inexplicable.
    label: `Máximo ${PASSWORD_MAX_LENGTH} caracteres`,
    test: (v) => v.length <= PASSWORD_MAX_LENGTH,
  },
];

/** `true` cuando el valor cumple **todas** las reglas de la política. */
export function cumplePolitica(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
