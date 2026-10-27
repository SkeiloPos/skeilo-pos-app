import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantInfoService } from '../core/tenant/tenant-info.service';
import { RelativeTimePipe } from './relative-time.pipe';
import { TenantDatePipe } from './pipes/tenant-date.pipe';

/**
 * spec 138 (A-148, SC-005): «agotado desde hace…» sin los 5 h de error. Con el instante en UTC con offset
 * (`…+00:00`) el texto relativo es el mismo en cualquier zona del navegador; pasadas 24 h cae a la fecha absoluta
 * EN LA ZONA DEL NEGOCIO. Se corre además con `TZ=Asia/Tokyo` y `TZ=UTC`.
 */
describe('RelativeTimePipe', () => {
  afterEach(() => vi.useRealTimers());

  // Reloj fijado en 2026-10-26T16:00Z (11:00 en Bogotá, 10:00 en México, 01:00 del 27/10 en Tokio).
  const AHORA = '2026-10-26T16:00:00Z';

  function crear(timezone: string): RelativeTimePipe {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(AHORA));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [TenantDatePipe, { provide: TenantInfoService, useValue: { info: () => ({ timezone }) } }],
    });
    return TestBed.runInInjectionContext(() => new RelativeTimePipe());
  }

  it('hace 2 horas, igual con el navegador en Bogotá, Tokio o UTC', () => {
    expect(crear('America/Bogota').transform('2026-10-26T14:00:00+00:00')).toBe('desde hace 2 horas');
  });

  it('hace unos segundos / 1 minuto / 5 minutos / 1 hora', () => {
    const pipe = crear('America/Bogota');
    expect(pipe.transform('2026-10-26T15:59:50+00:00')).toBe('desde hace unos segundos');
    expect(pipe.transform('2026-10-26T15:59:00+00:00')).toBe('desde hace 1 minuto');
    expect(pipe.transform('2026-10-26T15:55:00+00:00')).toBe('desde hace 5 minutos');
    expect(pipe.transform('2026-10-26T15:00:00+00:00')).toBe('desde hace 1 hora');
  });

  it('un instante en el futuro cercano se muestra como «unos segundos», sin números negativos', () => {
    expect(crear('America/Bogota').transform('2026-10-26T16:00:30+00:00')).toBe('desde hace unos segundos');
  });

  it('pasadas 24 h cae a la fecha absoluta en la zona del negocio (Ciudad de México)', () => {
    // 2026-10-24T23:30Z = 17:30 en Ciudad de México.
    expect(crear('America/Mexico_City').transform('2026-10-24T23:30:00+00:00')).toBe('24/10/2026 17:30');
  });

  it('la fecha absoluta cambia de día según la zona del negocio (Tokio)', () => {
    // 2026-10-24T23:30Z = 08:30 del 25/10 en Tokio.
    expect(crear('Asia/Tokyo').transform('2026-10-24T23:30:00+00:00')).toBe('25/10/2026 08:30');
  });

  it('devuelve null para un valor vacío o que no es fecha', () => {
    const pipe = crear('America/Bogota');
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
    expect(pipe.transform('')).toBeNull();
    expect(pipe.transform('no es una fecha')).toBeNull();
  });
});
