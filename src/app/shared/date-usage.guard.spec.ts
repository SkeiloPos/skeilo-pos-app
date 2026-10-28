import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda de uso de fechas (spec 138, FR-008/FR-009; contracts/frontend-fechas.md §5). Contraparte de
 * `test_instantes_forma_unica.py` del backend.
 *
 * Todo instante que la app muestra o del que deriva un día/hora pasa por **un único módulo** que usa la zona del
 * NEGOCIO (`shared/date-format.util.ts` y `TenantDatePipe`). Quien llame directo a `toLocale*String`,
 * `getHours()`/`getDay()`/…, `DatePipe` o `formatDate` lee la zona del NAVEGADOR: con un negocio fuera de la zona
 * del equipo de desarrollo muestra horas desplazadas, y la línea base lo demostró (los 154 specs de fechas pasaban
 * con el código incorrecto porque no variaban la zona). Sin esta guarda la próxima `toLocaleTimeString` reintroduce
 * el defecto sin que nada falle (el frontend no tiene linter ni CI).
 *
 * Lee los `.ts` (no los `.spec.ts`) y la plantilla `.html` de `src/app` con `node:fs`. Las reglas son expresiones
 * regulares EXACTAS, no subcadenas: `DatePipe` casaría con `TenantDatePipe` y `formatDate(` con los métodos propios
 * `store.formatDate(` que sí usan el tenant.
 *
 * Las excepciones se declaran **por archivo y por texto literal de la línea permitida**, no por archivo completo:
 * un `getHours()` nuevo en `admin-dashboard.component.ts` debe seguir fallando aunque `loadTrend` esté exceptuado.
 */

interface Regla {
  nombre: string;
  patron: RegExp;
}

const REGLAS: Regla[] = [
  {
    nombre: 'importa DatePipe/formatDate de @angular/common',
    patron: /import\s*\{[^}]*\b(DatePipe|formatDate)\b[^}]*\}\s*from\s*'@angular\/common'/g,
  },
  { nombre: 'pipe `| date` en una plantilla', patron: /(?<!\|)\|\s*date\s*[:}\s]/g },
  {
    nombre: 'componente de fecha/hora del navegador',
    patron: /\.(getHours|getMinutes|getSeconds|getDay|getDate|getMonth|getFullYear|toTimeString|toDateString)\(/g,
  },
  { nombre: 'toLocaleDateString/toLocaleTimeString', patron: /\.toLocale(Date|Time)String\(/g },
  { nombre: 'día UTC con toISOString().slice/substring/split', patron: /toISOString\(\)\s*\.(slice|substring|split)/g },
];

/** `.toLocaleString(` solo es una fecha si sus opciones traen componentes de fecha (el de NÚMEROS, que formatea dinero, está permitido). */
const TO_LOCALE_STRING = /\.toLocaleString\(/g;
const OPCIONES_DE_FECHA = /\b(hour|minute|day|month|year|weekday)\b/;
const INTL_DATE_TIME_FORMAT = /Intl\.DateTimeFormat/g;

/** Únicos archivos donde `Intl.DateTimeFormat` es el mecanismo, no un desvío. */
const PERMITE_INTL = new Set(['shared/date-format.util.ts', 'shared/pipes/tenant-date.pipe.ts']);

/**
 * Excepciones: archivo → líneas permitidas (texto literal recortado) con su razón. Cada una es aritmética de calendario
 * sobre una fecha que YA es local (o una fecha que no es un instante del negocio): ninguna convierte un instante.
 */
const EXCEPCIONES: Record<string, { linea: string; motivo: string }[]> = {
  'shared/pipes/tenant-date.pipe.ts': [
    {
      linea: "import { formatDate } from '@angular/common';",
      motivo: 'El propio pipe del tenant envuelve `formatDate` pasándole la zona del negocio (mecanismo único).',
    },
  ],
  'modules/auth/components/auth-shell.component.ts': [
    { linea: 'readonly year = new Date().getFullYear();', motivo: 'Año del pie de página (copyright); no es un instante del negocio.' },
  ],
  'modules/dashboard/pages/admin-dashboard.component.ts': [
    {
      linea:
        "const dateFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;",
      motivo: '`loadTrend`: aritmética de calendario sobre `from`, construido a partir del «hoy» ya expresado en la zona del tenant.',
    },
  ],
  'modules/orders/components/order-date-filter.component.ts': [
    {
      linea: 'return toIso(date.getFullYear(), date.getMonth(), date.getDate());',
      motivo: 'Selector de fechas: arma `YYYY-MM-DD` de una fecha de calendario elegida por el usuario (no un instante).',
    },
    {
      linea: 'const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0',
      motivo: 'Selector de fechas: día de la semana del día 1 de un mes del calendario mostrado.',
    },
    {
      linea: 'const daysInMonth = new Date(y, m + 1, 0).getDate();',
      motivo: 'Selector de fechas: cantidad de días del mes mostrado.',
    },
  ],
  'modules/promotions/pages/promotions-page.component.ts': [
    {
      linea: "return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });",
      motivo: '`fmtDate`: formatea una fecha de calendario `YYYY-MM-DD` creada a mediodía local fijo (no un instante).',
    },
  ],
  'modules/reports/pages/reports-page.component.ts': [
    {
      linea: 'return `${DIAS[fecha.getDay()]} ${d}`;',
      motivo: '`bucketLabel`: día de la semana de una fecha que ya es local (el backend ya la entrega en la zona del negocio).',
    },
  ],
  'modules/reports/services/reports.service.ts': [
    { linea: 'from.setDate(from.getDate() - 6);', motivo: '`getDateRange`: resta días a un «hoy» ya calculado con `businessToday(zona)`.' },
    { linea: 'from.setDate(from.getDate() - 29);', motivo: '`getDateRange`: resta días a un «hoy» ya calculado con `businessToday(zona)`.' },
    { linea: "const fmt = (d: Date) => d.toLocaleDateString('en-CA');", motivo: '`fmt`: serializa a `YYYY-MM-DD` una fecha de calendario construida con año/mes/día (no un instante).' },
  ],
};

export interface Hallazgo {
  linea: number;
  texto: string;
  regla: string;
}

/** Hallazgos de un fuente. `esPlantilla`: archivo `.html` (solo se revisa el pipe `date`). */
export function hallazgosEn(rel: string, fuente: string): Hallazgo[] {
  const lineas = fuente.split('\n');
  const inicios: number[] = [0];
  for (const l of lineas) inicios.push(inicios[inicios.length - 1] + l.length + 1);
  const lineaDe = (pos: number): number => {
    let lo = 0;
    let hi = inicios.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (inicios[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const esComentario = (texto: string) => /^(\/\/|\/\*|\*)/.test(texto);
  const encontrados = new Map<number, Hallazgo>();
  const agregar = (pos: number, regla: string) => {
    const n = lineaDe(pos);
    const texto = lineas[n].trim();
    if (esComentario(texto) || encontrados.has(n)) return;
    encontrados.set(n, { linea: n + 1, texto, regla });
  };

  const reglas = rel.endsWith('.html') ? REGLAS.filter((r) => r.nombre.startsWith('pipe')) : REGLAS;
  for (const { nombre, patron } of reglas) {
    for (const m of fuente.matchAll(new RegExp(patron.source, patron.flags))) agregar(m.index!, nombre);
  }
  if (!rel.endsWith('.html')) {
    for (const m of fuente.matchAll(new RegExp(TO_LOCALE_STRING.source, TO_LOCALE_STRING.flags))) {
      // argumentos hasta el paréntesis que cierra
      let prof = 0;
      let fin = m.index! + m[0].length - 1;
      for (; fin < fuente.length; fin++) {
        if (fuente[fin] === '(') prof++;
        else if (fuente[fin] === ')' && --prof === 0) break;
      }
      if (OPCIONES_DE_FECHA.test(fuente.slice(m.index!, fin + 1))) agregar(m.index!, 'toLocaleString con opciones de fecha');
    }
    if (!PERMITE_INTL.has(rel)) {
      for (const m of fuente.matchAll(new RegExp(INTL_DATE_TIME_FORMAT.source, INTL_DATE_TIME_FORMAT.flags))) {
        agregar(m.index!, 'Intl.DateTimeFormat fuera del módulo único de presentación');
      }
    }
  }
  return [...encontrados.values()].sort((a, b) => a.linea - b.linea);
}

const permitido = (rel: string, texto: string): boolean =>
  (EXCEPCIONES[rel] ?? []).some((e) => e.linea === texto);

// ---------------------------------------------------------------- lectura del árbol real

const RAIZ = join(process.cwd(), 'src', 'app');

function fuentes(dir: string): string[] {
  const resultado: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) resultado.push(...fuentes(ruta));
    else if (entrada.name.endsWith('.html') || (entrada.name.endsWith('.ts') && !entrada.name.endsWith('.spec.ts'))) {
      resultado.push(ruta);
    }
  }
  return resultado;
}

const relativo = (ruta: string): string => relative(RAIZ, ruta).split(sep).join('/');

describe('guarda de uso de fechas (spec 138)', () => {
  const archivos = fuentes(RAIZ);

  it('recorre el código de la app (si no, una guarda rota pasaría en verde)', () => {
    expect(archivos.length).toBeGreaterThan(200);
    expect(archivos.map(relativo)).toContain('shared/date-format.util.ts');
  });

  it('ningún fuente usa la fecha/hora del navegador fuera del módulo único y de las excepciones documentadas', () => {
    const fallos: string[] = [];
    for (const ruta of archivos) {
      const rel = relativo(ruta);
      for (const h of hallazgosEn(rel, readFileSync(ruta, 'utf-8'))) {
        if (!permitido(rel, h.texto)) fallos.push(`${rel}:${h.linea} — ${h.regla}: ${h.texto}`);
      }
    }
    expect(
      fallos,
      'Fecha/hora leída de la zona del NAVEGADOR (FR-008/FR-009): usar `formatInZone`/`zonedParts`/`businessToday` de ' +
        '`shared/date-format.util.ts` o `tenantDate` con la zona del negocio.\n' + fallos.join('\n'),
    ).toEqual([]);
  });

  it('la lista de excepciones no tiene entradas obsoletas (cada línea sigue existiendo y sigue siendo un hallazgo)', () => {
    const obsoletas: string[] = [];
    for (const [rel, entradas] of Object.entries(EXCEPCIONES)) {
      const hallazgos = hallazgosEn(rel, readFileSync(join(RAIZ, rel), 'utf-8')).map((h) => h.texto);
      for (const e of entradas) {
        if (!hallazgos.includes(e.linea)) obsoletas.push(`${rel}: ${e.linea}`);
      }
    }
    expect(obsoletas, 'Excepciones que ya no existen en el código (quitarlas):\n' + obsoletas.join('\n')).toEqual([]);
  });

  it('cada excepción lleva su motivo', () => {
    for (const [rel, entradas] of Object.entries(EXCEPCIONES)) {
      for (const e of entradas) expect(e.motivo.length, `${rel}: ${e.linea}`).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------- sensibilidad: la guarda detecta lo que dice

describe('guarda de uso de fechas — sensibilidad', () => {
  const reglas = (fuente: string, rel = 'modules/x/x.component.ts') => hallazgosEn(rel, fuente).map((h) => h.regla);

  it('detecta toLocaleTimeString / toLocaleDateString', () => {
    expect(reglas('const a = d.toLocaleTimeString();')).toEqual(['toLocaleDateString/toLocaleTimeString']);
    expect(reglas("const a = d.toLocaleDateString('es-CO');")).toEqual(['toLocaleDateString/toLocaleTimeString']);
  });

  it('detecta los componentes de fecha del navegador', () => {
    for (const metodo of ['getHours', 'getMinutes', 'getSeconds', 'getDay', 'getDate', 'getMonth', 'getFullYear', 'toTimeString', 'toDateString']) {
      expect(reglas(`const a = d.${metodo}();`), metodo).toEqual(['componente de fecha/hora del navegador']);
    }
  });

  it('detecta toLocaleString con opciones de fecha, pero NO el de números (dinero)', () => {
    expect(reglas("const a = d.toLocaleString('es-CO', { hour: '2-digit' });")).toEqual(['toLocaleString con opciones de fecha']);
    expect(reglas("const a = d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit' });")).toEqual(['toLocaleString con opciones de fecha']);
    expect(reglas("const a = precio.toLocaleString('es-CO');")).toEqual([]);
    expect(reglas("const a = precio.toLocaleString('es-CO', { minimumFractionDigits: 0 });")).toEqual([]);
  });

  it('detecta el día UTC con toISOString', () => {
    expect(reglas('const a = new Date().toISOString().slice(0, 10);')).toEqual(['día UTC con toISOString().slice/substring/split']);
    expect(reglas("const a = d.toISOString().split('T')[0];")).toEqual(['día UTC con toISOString().slice/substring/split']);
    expect(reglas('const a = new Date().toISOString();')).toEqual([]); // un instante serializado entero es legítimo
  });

  it('detecta DatePipe/formatDate importados de @angular/common, pero NO TenantDatePipe', () => {
    expect(reglas("import { DatePipe } from '@angular/common';")).toEqual(['importa DatePipe/formatDate de @angular/common']);
    expect(reglas("import { DecimalPipe, formatDate } from '@angular/common';")).toEqual(['importa DatePipe/formatDate de @angular/common']);
    expect(reglas("import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';")).toEqual([]);
    expect(reglas("import { DecimalPipe } from '@angular/common';")).toEqual([]);
  });

  it('detecta el pipe `| date` en una plantilla, pero NO `| tenantDate` ni `||`', () => {
    expect(reglas("{{ n.created_at | date: 'short' }}")).toEqual(['pipe `| date` en una plantilla']);
    expect(reglas('{{ x | date }}')).toEqual(['pipe `| date` en una plantilla']);
    expect(reglas("{{ n.created_at | tenantDate: 'short' }}")).toEqual([]);
    expect(reglas('const a = x || date;')).toEqual([]);
    expect(hallazgosEn('app.html', "<p>{{ n.created_at | date: 'short' }}</p>").length).toBe(1);
  });

  it('detecta Intl.DateTimeFormat fuera del módulo único, pero lo permite dentro', () => {
    const uso = "const f = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC' });";
    expect(reglas(uso)).toEqual(['Intl.DateTimeFormat fuera del módulo único de presentación']);
    expect(reglas(uso, 'shared/date-format.util.ts')).toEqual([]);
    expect(reglas(uso, 'shared/pipes/tenant-date.pipe.ts')).toEqual([]);
  });

  it('no confunde los métodos propios `formatDate(` de un store con el de Angular', () => {
    expect(reglas('const t = this.store.formatDate(order.created_at);')).toEqual([]);
  });

  it('ignora los comentarios', () => {
    expect(reglas('// usa d.getHours() y toLocaleTimeString()')).toEqual([]);
    expect(reglas(' * antes: new Date().toISOString().slice(0, 10)')).toEqual([]);
  });

  it('informa la línea y el texto', () => {
    const [h] = hallazgosEn('x.ts', 'const a = 1;\n\n  const b = d.getHours();\n');
    expect(h.linea).toBe(3);
    expect(h.texto).toBe('const b = d.getHours();');
  });

  it('una excepción NO exime a todo el archivo: un `getHours()` nuevo sigue fallando aunque `loadTrend` esté exceptuado', () => {
    const rel = 'modules/dashboard/pages/admin-dashboard.component.ts';
    const lineaPermitida = EXCEPCIONES[rel][0].linea;
    const nueva = 'const hora = new Date().getHours();';
    const fuente = `${lineaPermitida}\n${nueva}\n`;
    const sinPermiso = hallazgosEn(rel, fuente).filter((h) => !permitido(rel, h.texto));
    expect(sinPermiso.map((h) => h.texto)).toEqual([nueva]);
  });
});
