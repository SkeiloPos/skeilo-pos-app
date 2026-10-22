import { ChangeDetectionStrategy, Component, Input, isDevMode } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LUCIDE_ICON_CATALOG, LUCIDE_ICON_FALLBACK } from './icon-lucide.catalog';

/**
 * Ícono estilo `lucide` (SVG inline), exclusivo de los flujos rediseñados de
 * la Terminal de Mesas — ver specs/131-rediseno-terminal-mesas/research.md
 * punto 3. No sustituye a `app-mi-icon` (Material) en el resto de la
 * aplicación: ambos componentes conviven, cada uno en su propio alcance.
 *
 * Uso: `<app-lucide-icon name="plus" [size]="16" />`. El contenido SVG sale
 * de `LUCIDE_ICON_CATALOG`, una constante propia del código (nunca de
 * entrada de usuario), por lo que `bypassSecurityTrustHtml` es seguro aquí.
 */
@Component({
  selector: 'app-lucide-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center justify-center shrink-0' },
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.aria-hidden]="ariaLabel ? null : 'true'"
      [attr.role]="ariaLabel ? 'img' : null"
      [attr.aria-label]="ariaLabel ?? null"
      [innerHTML]="svgContent"
    ></svg>
  `,
})
export class IconLucideComponent {
  @Input({ required: true }) name!: string;
  @Input() ariaLabel?: string;
  @Input() size = 20;

  constructor(private readonly sanitizer: DomSanitizer) {}

  /** `bypassSecurityTrustHtml` es seguro aquí: el marcado nunca viene de
   *  entrada de usuario, solo de `LUCIDE_ICON_CATALOG` (constante del código,
   *  sin interpolación dinámica). El sanitizador por defecto de Angular
   *  recorta atributos SVG como `rx`/`points` que estos íconos necesitan. */
  get svgContent(): SafeHtml {
    const raw = LUCIDE_ICON_CATALOG[this.name];
    if (raw === undefined) {
      if (isDevMode()) {
        console.warn(`[app-lucide-icon] "${this.name}" no está en LUCIDE_ICON_CATALOG — usando info.`);
      }
      return this.sanitizer.bypassSecurityTrustHtml(LUCIDE_ICON_FALLBACK);
    }
    return this.sanitizer.bypassSecurityTrustHtml(raw);
  }
}
