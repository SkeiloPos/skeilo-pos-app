import { normalizeVariantName, VARIANT_NAME_MESSAGE } from './variant-name.validator';

/**
 * Vectores de `specs/099-nombre-tamano-variante/contracts/variant-name-rules.md`. El
 * backend (`test_variant_display_name.py::NormalizeVariantNameTests`) recorre los
 * mismos vectores.
 */
const VALID: [string | null | undefined, string][] = [
  [null, ''], // 2
  [undefined, ''],
  ['', ''], // 3
  ['   ', ''], // 4
  ['  Para   compartir  ', 'Para compartir'], // 5
  ['Para compartir', 'Para compartir'], // 1
  ['a'.repeat(60), 'a'.repeat(60)], // 6
  ['<b>x</b>', '<b>x</b>'], // 7 — se guarda tal cual, se escapa al mostrarse
  ['😀 Ensalada日本語', '😀 Ensalada日本語'], // 10 — sin restricción de alfabeto
];

describe('normalizeVariantName', () => {
  for (const [input, expected] of VALID) {
    it(`acepta ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      expect(normalizeVariantName(input)).toEqual({ value: expected });
    });
  }

  it('rechaza 61 caracteres (Escenario 8)', () => {
    expect(normalizeVariantName('a'.repeat(61))).toEqual({ error: VARIANT_NAME_MESSAGE });
  });

  it('mide la longitud antes de recortar (61 "a" + espacios en los extremos)', () => {
    expect(normalizeVariantName('  ' + 'a'.repeat(61) + '  ')).toEqual({
      error: VARIANT_NAME_MESSAGE,
    });
  });
});
