import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FALLBACK_TIMEZONE,
  businessToday,
  formatInZone,
  zonedParts,
} from './date-format.util';

/**
 * Spec 138 (FR-008, FR-009): un único módulo de presentación. Estas pruebas usan zonas
 * DISTINTAS de la del equipo (Bogotá) y se corren además con `TZ=Asia/Tokyo` y `TZ=UTC`:
 * lo que devuelven no puede depender de la zona del sistema.
 */
describe('date-format.util', () => {
  afterEach(() => vi.useRealTimers());

  it('FALLBACK_TIMEZONE es America/Bogota (la única zona de respaldo del frontend)', () => {
    expect(FALLBACK_TIMEZONE).toBe('America/Bogota');
  });

  describe('zonedParts', () => {
    // 2026-10-26T00:30Z: Bogotá 19:30 del 25/10 (UTC−5), Ciudad de México 18:30 del 25/10 (UTC−6) y
    // Madrid 01:30 del 26/10 (UTC+1: el horario de verano terminó el domingo 25/10).
    const INSTANTE = '2026-10-26T00:30:00+00:00';

    it('Bogotá: día y hora de pared del tenant', () => {
      const p = zonedParts(INSTANTE, 'America/Bogota')!;
      expect(p.ymd).toBe('2026-10-25');
      expect(p.hhmm).toBe('19:30');
      expect([p.year, p.month, p.day, p.hour, p.minute, p.second]).toEqual([2026, 10, 25, 19, 30, 0]);
    });

    it('Ciudad de México', () => {
      const p = zonedParts(INSTANTE, 'America/Mexico_City')!;
      expect(p.ymd).toBe('2026-10-25');
      expect(p.hhmm).toBe('18:30');
    });

    it('Madrid cruza al día siguiente respecto de las otras dos', () => {
      const p = zonedParts(INSTANTE, 'Europe/Madrid')!;
      expect(p.ymd).toBe('2026-10-26');
      expect(p.hhmm).toBe('01:30');
    });

    it('weekday: 0 = lunes … 6 = domingo (igual que el backend)', () => {
      // 25/10/2026 es domingo y 26/10/2026 es lunes.
      expect(zonedParts(INSTANTE, 'America/Bogota')!.weekday).toBe(6);
      expect(zonedParts(INSTANTE, 'Europe/Madrid')!.weekday).toBe(0);
      // 28/10/2026 a mediodía UTC = miércoles en cualquier zona.
      expect(zonedParts('2026-10-28T12:00:00Z', 'Asia/Tokyo')!.weekday).toBe(2);
    });

    it('la medianoche es hora 0, no 24', () => {
      // 05:00Z = 00:00 en Bogotá.
      const p = zonedParts('2026-10-25T05:00:00Z', 'America/Bogota')!;
      expect(p.hour).toBe(0);
      expect(p.hhmm).toBe('00:00');
    });

    it('acepta Date y timestamp además de texto', () => {
      const d = new Date('2026-10-26T00:30:00Z');
      expect(zonedParts(d, 'America/Bogota')!.hhmm).toBe('19:30');
      expect(zonedParts(d.getTime(), 'America/Bogota')!.hhmm).toBe('19:30');
    });

    it('devuelve null si el valor no es una fecha', () => {
      expect(zonedParts('no es una fecha', 'America/Bogota')).toBeNull();
      expect(zonedParts(Number.NaN, 'America/Bogota')).toBeNull();
      expect(zonedParts(new Date('x'), 'America/Bogota')).toBeNull();
    });

    it('una zona inválida no lanza: cae a la de respaldo', () => {
      expect(zonedParts(INSTANTE, 'No/Existe')!.hhmm).toBe('19:30');
    });
  });

  describe('formatInZone', () => {
    const OPCIONES: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    };

    it('formatea en la zona pedida aunque la del sistema sea otra', () => {
      const instante = '2026-10-25T23:30:00Z';
      expect(formatInZone(instante, 'America/Mexico_City', OPCIONES)).toBe('17:30');
      expect(formatInZone(instante, 'America/Bogota', OPCIONES)).toBe('18:30');
      expect(formatInZone(instante, 'Asia/Tokyo', OPCIONES)).toBe('08:30');
    });

    it('respeta el locale pedido', () => {
      const texto = formatInZone('2026-10-25T23:30:00Z', 'Asia/Tokyo', { month: 'long' }, 'es-CO');
      expect(texto).toBe('octubre');
    });

    it('devuelve cadena vacía si el valor no es una fecha', () => {
      expect(formatInZone('basura', 'America/Bogota', OPCIONES)).toBe('');
    });
  });

  describe('businessToday', () => {
    it('devuelve YYYY-MM-DD del día local de la zona', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-26T00:30:00Z'));
      expect(businessToday('America/Bogota')).toBe('2026-10-25');
      expect(businessToday('America/Mexico_City')).toBe('2026-10-25');
      expect(businessToday('Europe/Madrid')).toBe('2026-10-26');
      expect(businessToday('America/Bogota')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
