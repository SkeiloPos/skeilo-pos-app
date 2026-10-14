import { ChartOptions, TooltipItem } from 'chart.js';
import { formatMoney } from '../money';

/**
 * Paleta categórica de las gráficas, **verificada con el validador de la guía de
 * visualización**, no elegida a ojo. Arranca en el `indigo-600` que ya es el
 * acento de la app y se completa con pasos de Tailwind:
 *
 *   [PASS] banda de luminosidad · [PASS] croma mínimo · [PASS] contraste ≥ 3:1
 *   [PASS] separación CVD        peor par adyacente ΔE 12.5 (protan)  — objetivo ≥ 8
 *   [PASS] visión normal         peor par adyacente ΔE 20.0           — mínimo 15
 *
 * El primer intento (indigo/cyan/amber-500/rose/emerald) **falló**: emerald↔rose
 * daban ΔE 5.8 en deuteranopia y el amber-500 no llegaba a 3:1 contra el blanco
 * de las tarjetas. Si se toca un color, hay que volver a pasar el validador.
 *
 * El orden es fijo y **no se cicla**: una novena serie no inventa un color, se
 * agrupa en «Otros». La app es solo clara (cero clases `dark:`), así que no hay
 * columna oscura.
 */
export const CHART_COLORS = [
  '#4f46e5', // indigo-600 — el acento de la app
  '#0d9488', // teal-600
  '#d97706', // amber-600
  '#be123c', // rose-700
  '#7c3aed', // violet-600
] as const;

/** Color de la serie `index`, o gris si se pasa del orden fijo. */
export function seriesColor(index: number): string {
  return CHART_COLORS[index] ?? '#94a3b8'; // slate-400 = "Otros"
}

/** La serie única de la app: siempre el acento. */
export const PRIMARY_SERIES = CHART_COLORS[0];

// Texto y rejilla recesivos: la tinta nunca compite con las marcas.
const INK = '#374151'; // gray-700
const MUTED = '#9ca3af'; // gray-400
const GRID = '#f3f4f6'; // gray-100

export type PanelTheme = 'light' | 'dark';

/**
 * Colores de ejes/rejilla/tooltip de Chart.js por tema (research.md R19): un
 * `<canvas>` no tiene cascada CSS para lo que dibuja dentro, así que la
 * técnica de variable de R16 no alcanza estos valores — tienen que pasar por
 * aquí como JavaScript. Segundo juego de valores oscuros, verificado contra
 * `--panel-color-surface-card` oscuro (#1E293B, el fondo real tras el que
 * `app-chart-card` termina pintando la gráfica en dark — su `bg-white`
 * se repinta con esa variable, research R16), no contra `--panel-color-canvas`
 * a ojo:
 *
 *   ink (#F8FAFC)    13.98:1 — --panel-color-text-primary oscuro
 *   muted (#94A3B8)   5.71:1 — --panel-color-text-muted oscuro
 *
 * `tooltipBg` no cambia con el tema: es una ficha flotante oscura con texto
 * blanco por defecto de Chart.js (nunca gris-900-sobre-blanco), así que ya
 * funciona igual de bien en ambos temas — no es una superficie del panel.
 * `segmentBorder` (el hueco de 2px entre segmentos de `app-share-bar-chart`)
 * sí cambia: debe fundirse con la tarjeta real tras la gráfica, blanco en
 * claro, `--panel-color-surface-card` oscuro — si se dejara blanco se vería
 * como una línea brillante en vez de un hueco.
 */
export function axisColors(theme: PanelTheme): {
  ink: string;
  muted: string;
  grid: string;
  tooltipBg: string;
  segmentBorder: string;
} {
  if (theme === 'dark') {
    return {
      ink: '#f8fafc',
      muted: '#94a3b8',
      grid: '#334155',
      tooltipBg: '#111827',
      segmentBorder: '#1e293b',
    };
  }
  return { ink: INK, muted: MUTED, grid: GRID, tooltipBg: '#111827', segmentBorder: '#ffffff' };
}

/** Formatea el valor de un punto según el tipo de dato de la gráfica. */
export type ValueKind = 'money' | 'units';

export function formatValue(value: number, kind: ValueKind): string {
  return kind === 'money' ? formatMoney(value) : `${Math.round(value)} u`;
}

/**
 * Opciones comunes: sin leyenda (las gráficas de serie única se nombran por el
 * título de su tarjeta), tooltip siempre presente y ejes discretos.
 */
export function baseOptions(kind: ValueKind, theme: PanelTheme): ChartOptions<'bar'> {
  const { muted, grid, tooltipBg } = axisColors(theme);
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tooltipBg,
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        titleFont: { weight: 'bold' },
        callbacks: {
          label: (item: TooltipItem<'bar'>) =>
            formatValue(item.parsed.y ?? item.parsed.x ?? 0, kind),
        },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: muted } },
      y: {
        grid: { color: grid },
        border: { display: false },
        ticks: { color: muted, maxTicksLimit: 5 },
      },
    },
  };
}

export const CHART_INK = INK;
export const CHART_MUTED = MUTED;
