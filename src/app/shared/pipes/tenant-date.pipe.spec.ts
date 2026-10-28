import { TestBed } from '@angular/core/testing';
import { TenantInfoService, TenantInfo } from '../../core/tenant/tenant-info.service';
import { TenantDatePipe } from './tenant-date.pipe';

const tenantInfoFixture: TenantInfo = {
  id: 1,
  name: 'Heladería de prueba',
  host: 'prueba.skeilopos.com',
  logo_url: null,
  receipt_message: null,
  timezone: 'America/Bogota',
};

describe('TenantDatePipe', () => {
  let pipe: TenantDatePipe;
  let tenantInfo: TenantInfoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    tenantInfo = TestBed.inject(TenantInfoService);
    pipe = TestBed.runInInjectionContext(() => new TenantDatePipe());
  });

  it('formatea en la zona horaria del tenant, no en la del navegador (A-50)', () => {
    tenantInfo.info.set({ ...tenantInfoFixture, timezone: 'America/Bogota' });
    // 2026-08-24T12:53:07Z = 2026-08-24 07:53 hora de Bogotá (UTC-5).
    const resultado = pipe.transform('2026-08-24T12:53:07.000Z', 'dd/MM/yyyy HH:mm');
    expect(resultado).toBe('24/08/2026 07:53');
  });

  it('usa America/Bogota como respaldo si el tenant aún no cargó', () => {
    tenantInfo.info.set(null);
    const resultado = pipe.transform('2026-08-24T12:53:07.000Z', 'HH:mm');
    expect(resultado).toBe('07:53');
  });

  // `formatDate` de Angular no entiende nombres IANA y cae a la zona del navegador: estas
  // pruebas usan zonas DISTINTAS de la del equipo de desarrollo (Bogotá) para detectarlo.
  describe('zona horaria IANA del tenant, independiente de la del navegador', () => {
    const formatear = (timezone: string, iso: string, format: string) => {
      tenantInfo.info.set({ ...tenantInfoFixture, timezone });
      return pipe.transform(iso, format);
    };

    it('Asia/Tokyo (UTC+9, sin horario de verano)', () => {
      expect(formatear('Asia/Tokyo', '2026-08-24T12:53:07.000Z', 'dd/MM/yyyy HH:mm')).toBe(
        '24/08/2026 21:53',
      );
    });

    it('America/New_York respeta el horario de verano de cada instante (EDT en julio, EST en enero)', () => {
      expect(formatear('America/New_York', '2026-07-15T12:00:00.000Z', 'HH:mm')).toBe('08:00');
      expect(formatear('America/New_York', '2026-01-15T12:00:00.000Z', 'HH:mm')).toBe('07:00');
    });

    it('zonas con desfase de media hora (Asia/Kolkata, UTC+5:30)', () => {
      expect(formatear('Asia/Kolkata', '2026-08-24T12:53:07.000Z', 'HH:mm')).toBe('18:23');
    });

    it('formato de 12 horas con AM/PM y cambio de día respecto de UTC', () => {
      // 01:05 UTC del 16/10 = 08:05 p. m. del 15/10 en Bogotá.
      expect(formatear('America/Bogota', '2026-10-16T01:05:00.000Z', 'dd/MM/yyyy hh:mm a')).toBe(
        '15/10/2026 08:05 PM',
      );
      expect(formatear('America/Bogota', '2026-10-15T14:05:00.000Z', 'hh:mm a')).toBe('09:05 AM');
      expect(formatear('America/Bogota', '2026-10-15T05:00:00.000Z', 'hh:mm a')).toBe('12:00 AM');
      expect(formatear('America/Bogota', '2026-10-15T17:30:00.000Z', 'hh:mm a')).toBe('12:30 PM');
    });

    it('acepta `UTC` como zona', () => {
      expect(formatear('UTC', '2026-10-16T01:05:00.000Z', 'dd/MM/yyyy HH:mm')).toBe('16/10/2026 01:05');
    });

    it('un nombre de zona inválido no lanza error (cae al comportamiento de `formatDate`)', () => {
      expect(() => formatear('No/Existe', '2026-10-16T01:05:00.000Z', 'HH:mm')).not.toThrow();
      expect(formatear('No/Existe', '2026-10-16T01:05:00.000Z', 'HH:mm')).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  it('devuelve null para un valor nulo o vacío', () => {
    tenantInfo.info.set(tenantInfoFixture);
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
  });
  // spec 138: zona explícita como 3.er parámetro (lista de tenants de Super Admin).
  describe('zona explícita (tercer parámetro)', () => {
    const INSTANTE = '2026-10-25T23:30:00.000Z';

    it('el mismo instante se ve distinto según la zona pedida', () => {
      tenantInfo.info.set({ ...tenantInfoFixture, timezone: 'America/Bogota' });
      expect(pipe.transform(INSTANTE, 'HH:mm', 'Asia/Tokyo')).toBe('08:30');
      expect(pipe.transform(INSTANTE, 'HH:mm', 'America/Mexico_City')).toBe('17:30');
      expect(pipe.transform(INSTANTE, 'HH:mm', 'Europe/Madrid')).toBe('00:30');
    });

    it('la zona explícita gana a la del tenant actual', () => {
      tenantInfo.info.set({ ...tenantInfoFixture, timezone: 'Asia/Tokyo' });
      expect(pipe.transform(INSTANTE, 'HH:mm', 'America/Mexico_City')).toBe('17:30');
    });

    it('sin zona explícita usa la del tenant actual', () => {
      tenantInfo.info.set({ ...tenantInfoFixture, timezone: 'America/Mexico_City' });
      expect(pipe.transform(INSTANTE, 'HH:mm')).toBe('17:30');
    });

    it('sin zona explícita ni tenant cargado usa el respaldo de Bogotá', () => {
      tenantInfo.info.set(null);
      expect(pipe.transform(INSTANTE, 'HH:mm')).toBe('18:30');
    });

    it('una zona explícita vacía o nula se trata como ausente', () => {
      tenantInfo.info.set({ ...tenantInfoFixture, timezone: 'America/Mexico_City' });
      expect(pipe.transform(INSTANTE, 'HH:mm', '')).toBe('17:30');
      expect(pipe.transform(INSTANTE, 'HH:mm', undefined)).toBe('17:30');
    });

    it('el cambio de día de Tokio respecto de UTC (fecha de vencimiento de un plan)', () => {
      // 16:00Z del 1/nov = 01:00 del 2/nov en Tokio, aunque el navegador esté en Bogotá.
      expect(pipe.transform('2026-11-01T16:00:00+00:00', 'dd/MM/yyyy', 'Asia/Tokyo')).toBe('02/11/2026');
      expect(pipe.transform('2026-11-01T16:00:00+00:00', 'dd/MM/yyyy', 'America/Bogota')).toBe('01/11/2026');
    });
  });
});
