/**
 * Texto de un error de validación del API (FastAPI 422) sin el prefijo
 * `Value error, ` que Pydantic antepone al mensaje de un `ValueError` (spec 091).
 */
export function stripValueErrorPrefix(message: string): string {
  return message.replace(/^Value error,\s*/, '');
}
