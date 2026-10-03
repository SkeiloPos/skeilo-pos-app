import { Pipe, PipeTransform, inject } from '@angular/core';
import { TenantDatePipe } from './pipes/tenant-date.pipe';

/** Umbral a partir del cual se muestra la fecha absoluta en vez de "hace X" (spec 093,
 *  research.md D13). */
const ABSOLUTE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * `{{ product.available_changed_at | relativeTime }}` → "hace unos segundos" / "hace 5
 * minutos" / "hace 2 horas"; pasado {@link ABSOLUTE_THRESHOLD_MS} cae a la fecha
 * absoluta de {@link TenantDatePipe} (spec 093, escenario 3, research.md D13).
 *
 * `pure: false` como `TenantDatePipe`: el valor de entrada no cambia, pero el texto
 * correcto sí con el paso del tiempo -- debe reevaluarse en cada ciclo de detección de
 * cambios, no solo cuando cambia la referencia de `value`.
 */
@Pipe({ name: 'relativeTime', standalone: true, pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly tenantDate = inject(TenantDatePipe);

  transform(value: string | number | Date | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return null;
    const diffMs = Date.now() - then;

    if (diffMs >= ABSOLUTE_THRESHOLD_MS) {
      return this.tenantDate.transform(value, 'dd/MM/yyyy HH:mm');
    }

    const seconds = Math.max(0, Math.floor(diffMs / 1000));
    if (seconds < 60) return 'desde hace unos segundos';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `desde hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;

    const hours = Math.floor(minutes / 60);
    return `desde hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
}
