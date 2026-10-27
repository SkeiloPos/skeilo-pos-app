import { formatDate } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';
import { TenantInfoService } from '../../core/tenant/tenant-info.service';
import { FALLBACK_TIMEZONE } from '../date-format.util';

/**
 * Desfase (`+hhmm` / `-hhmm`) de una zona horaria IANA en un instante concreto, o `null` si
 * el nombre no es una zona válida (p. ej. ya es un desfase o `UTC`).
 *
 * `formatDate` de Angular NO entiende nombres IANA como `America/Bogota`: solo desfases
 * (`-0500`), `UTC` y abreviaturas de EE. UU.; ante cualquier otro valor cae en silencio a la
 * zona del navegador. Por eso se resuelve aquí con `Intl`, instante por instante (así respeta
 * el horario de verano de zonas como `America/New_York`).
 */
function ianaOffset(timeZone: string, date: Date): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const localAsUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour') % 24,
      part('minute'),
      part('second'),
    );
    const instant = Math.floor(date.getTime() / 1000) * 1000;
    const minutes = Math.round((localAsUtc - instant) / 60000);
    const sign = minutes < 0 ? '-' : '+';
    const abs = Math.abs(minutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `${sign}${hh}${mm}`;
  } catch {
    return null; // nombre de zona no válido: se deja a `formatDate`
  }
}

/**
 * `{{ venta.sold_at | tenantDate:'dd/MM/yyyy HH:mm' }}` → hora del negocio, no
 * la del navegador (spec 030, FR-002/A-50).
 *
 * Tercer parámetro opcional (spec 138): `{{ t.plan_vence_en | tenantDate:'mediumDate':t.timezone }}`
 * formatea en la zona de OTRO tenant (la lista de Super Admin). Precedencia: zona explícita >
 * zona del tenant actual > `FALLBACK_TIMEZONE`.
 *
 * Envuelve `formatDate` de `@angular/common` (la misma función que usa el
 * `DatePipe` nativo por dentro) pasándole la zona horaria del tenant —
 * mecanismo único, usable en plantilla (este pipe) e inyectable directo en
 * stores/servicios (`transform()` es un método normal).
 */
@Pipe({ name: 'tenantDate', standalone: true, pure: false })
export class TenantDatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);
  private readonly tenantInfo = inject(TenantInfoService);

  transform(
    value: string | number | Date | null | undefined,
    format = 'medium',
    timezone?: string,
  ): string | null {
    if (value === null || value === undefined || value === '') return null;
    const zone = timezone || this.tenantInfo.info()?.timezone || FALLBACK_TIMEZONE;
    const instant = new Date(value);
    const offset = Number.isNaN(instant.getTime()) ? null : ianaOffset(zone, instant);
    return formatDate(value, format, this.locale, offset ?? zone);
  }
}
