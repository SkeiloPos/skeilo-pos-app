/**
 * spec 092 (FR-003, FR-006, research.md D11) — la **única** composición de la
 * cadena del conteo de productos del checkout.
 *
 * FR-006 exige que el bloque de total del paso de datos de pago y el
 * `<summary>` del resumen muestren "el mismo número y la misma palabra", para
 * que el comensal nunca vea dos conteos distintos del mismo pedido en la misma
 * pantalla (RN-004). Si cada uno armara la cadena por su cuenta, nada impediría
 * que terminaran distintas; que los dos salgan de aquí lo cierra por
 * construcción.
 *
 * Vive en una función aparte, y no como propiedad del componente compartido,
 * porque el bloque de total (US1) debe poder entregarse **antes** de que ese
 * componente exista (Principio VI). Es un desvío menor respecto a
 * `plan.md` → *Project Structure*, trazado en `implementation-notes.md`.
 *
 * Pluralización con un condicional, sin `@angular/localize` ni `i18nPlural`:
 * FR-003 pide una cadena, no un sistema de localización, y el proyecto no tiene
 * i18n configurado (cero dependencias nuevas, Principio IX).
 *
 * El conteo son **unidades** de producto (`DiningCartService.count()`, que ya
 * suma cantidades), no líneas. El umbral del colapso sí se mide en líneas
 * (FR-008): son dos medidas distintas a propósito y solo esta se le muestra al
 * comensal.
 */
export function formatProductCount(count: number): string {
  return count === 1 ? '1 producto' : `${count} productos`;
}
