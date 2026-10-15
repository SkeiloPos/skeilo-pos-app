import { To12HourTimePipe } from './to-12-hour-time.pipe';

describe('To12HourTimePipe', () => {
  const pipe = new To12HourTimePipe();

  it('convierte horas de la mañana (incluida medianoche → 12 a. m.)', () => {
    expect(pipe.transform('00:00')).toBe('12:00 a. m.');
    expect(pipe.transform('06:27')).toBe('6:27 a. m.');
    expect(pipe.transform('11:59')).toBe('11:59 a. m.');
  });

  it('convierte horas de la tarde/noche (incluido mediodía → 12 p. m.)', () => {
    expect(pipe.transform('12:00')).toBe('12:00 p. m.');
    expect(pipe.transform('18:27')).toBe('6:27 p. m.');
    expect(pipe.transform('23:05')).toBe('11:05 p. m.');
  });

  it('valores ausentes devuelven cadena vacía', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
