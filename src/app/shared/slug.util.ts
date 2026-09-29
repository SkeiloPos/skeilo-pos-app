/**
 * Convierte un texto libre a un slug apto para nombre de archivo (spec 087,
 * FR-003): minúsculas, sin tildes ni eñes, espacios como guiones, cualquier
 * otro carácter no alfanumérico eliminado, guiones repetidos colapsados, sin
 * guion al inicio ni al final.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
