import { ChangeDetectionStrategy, Component, Input, isDevMode } from '@angular/core';
import { ICON_CATALOG, ICON_FALLBACK } from './icon-catalog';

/**
 * Componente de ícono reutilizable del panel de administración, respaldado por
 * la fuente autoalojada Material Icons (variante Outlined) — ver
 * specs/082-estandarizacion-iconos-admin/contracts/icon-component-contract.md.
 *
 * No reemplaza a `app-icon` (src/app/shared/icon/icon.component.ts), que sigue
 * intacto sirviendo al flujo público de menú QR (fuera de alcance de esa spec).
 *
 * Uso: `<app-mi-icon name="table_restaurant" ariaLabel="Mesa">`. El `name` se
 * resuelve contra `ICON_CATALOG` — las plantillas nunca escriben la ligadura de
 * Google directamente. Disponible para cualquier parte de la aplicación, no
 * solo el panel de administración (FR-009) — para un ícono nuevo que no esté
 * en `ICON_CATALOG`, agrega la entrada ahí primero.
 *
 * Tamaño: a diferencia de `app-icon` (SVG que llena su contenedor vía
 * `w-*`/`h-*`), un ícono de fuente se dimensiona por `font-size`. El input
 * `size` (píxeles) traduce el ancho/alto en píxeles que tenía el SVG
 * reemplazado a un tamaño de fuente equivalente, para no perder fidelidad
 * visual al migrar (p. ej. un `<app-icon>` dentro de `w-5 h-5` se migra a
 * `<app-mi-icon size="20">`).
 */
@Component({
  selector: 'app-mi-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center justify-center' },
  template: `
    <span
      class="material-icons-outlined notranslate"
      translate="no"
      [style.font-size.px]="size"
      [attr.aria-hidden]="ariaLabel ? null : 'true'"
      [attr.role]="ariaLabel ? 'img' : null"
      [attr.aria-label]="ariaLabel ?? null"
    >{{ ligature }}</span>
  `,
})
export class IconMiComponent {
  @Input({ required: true }) name!: string;
  @Input() ariaLabel?: string;
  @Input() size = 20;

  get ligature(): string {
    const ligature = ICON_CATALOG[this.name];
    if (ligature === undefined) {
      // Cae a un ícono de reserva en vez de quedar vacío (nunca rompe la
      // pantalla), pero avisa en desarrollo — un `name` que no está en el
      // catálogo suele ser una errata que de otro modo pasaría desapercibida.
      if (isDevMode()) {
        console.warn(`[app-mi-icon] "${this.name}" no está en ICON_CATALOG — usando help_outline.`);
      }
      return ICON_FALLBACK;
    }
    return ligature;
  }
}
