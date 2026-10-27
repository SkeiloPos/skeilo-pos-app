/**
 * Presentación de fechas en la zona horaria del negocio (specs 030 y 137).
 *
 * Es el **único** módulo de la app con acceso a `Intl.DateTimeFormat` para fechas (más el
 * `TenantDatePipe`, que envuelve `formatDate`): nadie llama a `toLocale*String`,
 * `getHours()`/`getDay()`/… ni a `DatePipe`, porque todos leen la zona del navegador y un
 * negocio fuera de la zona del equipo de desarrollo vería horas desplazadas. La guarda
 * `date-usage.guard.spec.ts` lo impide. Sin dependencias de fechas (Principio IX): `Intl` basta.
 */

/** Única zona de respaldo del frontend, mientras `TenantInfoService.info()` no carga. */
export const FALLBACK_TIMEZONE = 'America/Bogota';

/**
 * "Hoy" en la zona horaria del negocio, no en la del calendario del navegador
 * (spec 030, FR-004). Usado por `reports.service.ts::getDateRange` para
 * `'today'`/`'week'`/`'month'`/`'year'` — `'specific-date'` no pasa por aquí,
 * ya usa el string que el usuario eligió (FR-006).
 */
export function businessToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

/** Componentes de pared de un instante en una zona (spec 138, FR-008). */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = lunes … 6 = domingo (igual que el backend). */
  weekday: number;
  /** `YYYY-MM-DD`. */
  ymd: string;
  /** `HH:mm`. */
  hhmm: string;
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, fmt);
  }
  return fmt;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * Día y hora de pared de `instant` en `timezone`, o `null` si el valor no es una fecha válida.
 * Una zona que `Intl` no reconoce cae a `FALLBACK_TIMEZONE` en vez de lanzar: la zona del
 * tenant ya viene validada del backend, y un ticket o un reloj no deben romperse por ello.
 */
export function zonedParts(
  instant: Date | string | number,
  timezone: string,
): ZonedParts | null {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = partsFormatter(timezone).formatToParts(date);
  } catch {
    parts = partsFormatter(FALLBACK_TIMEZONE).formatToParts(date);
  }
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(value('year'));
  const month = Number(value('month'));
  const day = Number(value('day'));
  const hour = Number(value('hour')) % 24;
  const minute = Number(value('minute'));
  const second = Number(value('second'));
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: WEEKDAYS[value('weekday')] ?? 0,
    ymd: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
    hhmm: `${pad(hour)}:${pad(minute)}`,
  };
}

/**
 * `Intl.DateTimeFormat(locale, { ...options, timeZone })`. Único punto con formato de fecha
 * localizado del código de la app. Devuelve `''` si `instant` no es una fecha válida.
 */
export function formatInZone(
  instant: Date | string | number,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  locale: string | string[] = 'es-CO',
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: FALLBACK_TIMEZONE }).format(date);
  }
}
