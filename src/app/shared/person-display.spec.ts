import { displayName, initialOf } from './person-display';

describe('displayName', () => {
  it('devuelve el nombre recortado', () => {
    expect(displayName('  María Pérez ', 'maria@x.co')).toBe('María Pérez');
  });

  it('devuelve el correo si el nombre es vacío, nulo o solo espacios', () => {
    expect(displayName('', 'ana@x.co')).toBe('ana@x.co');
    expect(displayName(null, 'ana@x.co')).toBe('ana@x.co');
    expect(displayName(undefined, 'ana@x.co')).toBe('ana@x.co');
    expect(displayName('   ', 'ana@x.co')).toBe('ana@x.co');
  });

  it('devuelve el correo si el nombre es igual al correo (cuentas anteriores)', () => {
    expect(displayName('ana@x.co', 'ana@x.co')).toBe('ana@x.co');
    expect(displayName(' Ana@X.co ', 'ana@x.co')).toBe('ana@x.co');
  });
});

describe('initialOf', () => {
  it('devuelve la primera letra en mayúscula', () => {
    expect(initialOf('María Pérez', 'maria@x.co')).toBe('M');
    expect(initialOf('ñandú', 'x@x.co')).toBe('Ñ');
  });

  it('usa el correo cuando no hay nombre propio', () => {
    expect(initialOf('ana@x.co', 'ana@x.co')).toBe('A');
    expect(initialOf(null, 'ana@x.co')).toBe('A');
  });

  it('toma el primer punto de código sin partir un emoji', () => {
    expect(initialOf('😀 Ana', 'ana@x.co')).toBe('😀');
  });
});
