import { slugify } from './slug.util';

describe('slugify (spec 087, FR-003)', () => {
  it('pasa a minúsculas y separa con guiones', () => {
    expect(slugify('Tenant de Prueba')).toBe('tenant-de-prueba');
  });

  it('quita tildes y eñes y elimina símbolos', () => {
    expect(slugify('Café Ñandú & Hijos')).toBe('cafe-nandu-hijos');
  });

  it('colapsa espacios múltiples y guiones repetidos', () => {
    expect(slugify('Heladería   del    Centro')).toBe('heladeria-del-centro');
    expect(slugify('uno --- dos')).toBe('uno-dos');
  });

  it('no deja guion al inicio ni al final', () => {
    expect(slugify('  -Mi Negocio-  ')).toBe('mi-negocio');
    expect(slugify('& Mi Negocio &')).toBe('mi-negocio');
  });

  it('un texto solo de símbolos da cadena vacía (el llamador aplica su fallback)', () => {
    expect(slugify('***')).toBe('');
    expect(slugify('')).toBe('');
  });
});
