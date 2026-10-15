import { Pipe, PipeTransform } from '@angular/core';

/**
 * Convierte una hora de 24 horas ("HH:mm", ya resuelta en la zona horaria del
 * tenant vía `tenantDate`) a formato de 12 horas en español ("11:08 a. m."),
 * mismo convenio ya usado en `promotions-page.component.ts::fmtTime`.
 *
 * Uso encadenado: `{{ order.created_at | tenantDate: 'HH:mm' | to12HourTime }}`.
 */
@Pipe({ name: 'to12HourTime', standalone: true, pure: true })
export class To12HourTimePipe implements PipeTransform {
  transform(hhmm: string | null | undefined): string {
    if (!hhmm) return '';
    const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
    const period = h >= 12 ? 'p. m.' : 'a. m.';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }
}
