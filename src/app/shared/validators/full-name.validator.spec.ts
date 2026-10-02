import { FormControl } from '@angular/forms';
import {
  FULL_NAME_MESSAGES,
  fullNameValidator,
  normalizeFullName,
} from './full-name.validator';

/**
 * Vectores 1–26 de `specs/091-admin-subdominio-nombre-completo/contracts/full-name-rules.md`.
 * El backend (`test_person_name.py`) recorre los mismos vectores.
 */
const VALID: [string, string][] = [
  ['María Pérez', 'María Pérez'], // 1
  ["José Ñañez O'Brien-Díaz", "José Ñañez O'Brien-Díaz"], // 2
  ['O’Brien', 'O’Brien'], // 3
  ['François', 'François'], // 4
  ['Zoë', 'Zoë'],
  ['Müller', 'Müller'],
  ['Søren', 'Søren'],
  ['Łukasz', 'Łukasz'],
  ['Đorđe', 'Đorđe'],
  ['Nguyễn', 'Nguyễn'],
  ['Al', 'Al'], // 5
  ['a'.repeat(100), 'a'.repeat(100)], // 6
  [' Ana ', 'Ana'], // 7
  ['María   Pérez', 'María   Pérez'], // 8
  ['María', 'María'], // 9 (NFD → NFC)
];

const INVALID: [string | null | undefined, 'required' | 'length' | 'format'][] = [
  [null, 'required'], // 10
  ['', 'required'], // 11
  ['     ', 'required'], // 12
  ['A', 'length'], // 13
  ['-', 'length'], // 14
  ['a'.repeat(101), 'length'], // 15
  ['1'.repeat(101), 'length'], // 16 (el largo gana)
  ['<script>alert(1)</script>', 'format'], // 17
  ['Ana3', 'format'], // 18
  ['Ana@', 'format'],
  ['Ana.', 'format'],
  ['Ana,', 'format'],
  ['Ana 😀', 'format'], // 19
  ['Иван', 'format'], // 20
  ['李雷', 'format'],
  ['محمد', 'format'],
  ['---', 'format'], // 21
  ["''", 'format'], // 22
  ['A-', 'format'], // 23
  ['Ana\tPérez', 'format'], // 24
  ['Ana\nPérez', 'format'],
  ['A×B', 'format'], // 25
  ['😀'.repeat(60), 'format'], // 26 (puntos de código, no unidades UTF-16)
];

describe('normalizeFullName', () => {
  it('tiene los tres mensajes literales', () => {
    expect(FULL_NAME_MESSAGES.required).toBe('El nombre es obligatorio');
    expect(FULL_NAME_MESSAGES.length).toBe('El nombre debe tener entre 2 y 100 caracteres');
    expect(FULL_NAME_MESSAGES.format).toBe(
      'El nombre solo puede contener letras, espacios, apóstrofes y guiones, y al menos dos letras',
    );
  });

  for (const [input, expected] of VALID) {
    it(`acepta ${JSON.stringify(input.length > 30 ? input.slice(0, 12) + '…' : input)}`, () => {
      expect(normalizeFullName(input)).toEqual({ value: expected });
    });
  }

  for (const [input, error] of INVALID) {
    it(`rechaza ${JSON.stringify(typeof input === 'string' && input.length > 30 ? input.slice(0, 12) + '…' : input)} con ${error}`, () => {
      expect(normalizeFullName(input)).toEqual({ error });
    });
  }
});

describe('fullNameValidator', () => {
  const run = (value: string | null, options?: { optional?: boolean }) =>
    fullNameValidator(options)(new FormControl(value));

  it('devuelve null con un nombre válido', () => {
    expect(run('María Pérez')).toBeNull();
  });

  it('devuelve el error y el texto del primer fallo, en el orden obligatorio → longitud → formato', () => {
    expect(run('')).toEqual({ fullName: { error: 'required', message: FULL_NAME_MESSAGES.required } });
    expect(run('A')).toEqual({ fullName: { error: 'length', message: FULL_NAME_MESSAGES.length } });
    expect(run('Ana3')).toEqual({ fullName: { error: 'format', message: FULL_NAME_MESSAGES.format } });
    expect(run('1'.repeat(101))?.['fullName']).toMatchObject({ error: 'length' });
  });

  it('con optional permite vacío o solo espacios', () => {
    expect(run('', { optional: true })).toBeNull();
    expect(run('   ', { optional: true })).toBeNull();
    expect(run(null, { optional: true })).toBeNull();
  });

  it('con optional, si se escribe algo debe ser válido', () => {
    expect(run('Ana3', { optional: true })?.['fullName']).toMatchObject({ error: 'format' });
    expect(run('A', { optional: true })?.['fullName']).toMatchObject({ error: 'length' });
    expect(run('Ana', { optional: true })).toBeNull();
  });
});
