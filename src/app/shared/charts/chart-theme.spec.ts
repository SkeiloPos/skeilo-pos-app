import { CHART_COLORS, axisColors, baseOptions, formatValue, seriesColor } from './chart-theme';

/** Luminancia relativa y contraste WCAG — mismo cálculo que las auditorías
 *  manuales de `--panel-color-*` ya documentadas en research.md R3/R13/R14,
 *  aplicado aquí a los colores de Chart.js (research.md R19: "no a ojo"). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('paleta de gráficas', () => {
  it('asigna el color por posición, en orden fijo', () => {
    expect(seriesColor(0)).toBe(CHART_COLORS[0]);
    expect(seriesColor(4)).toBe(CHART_COLORS[4]);
  });

  it('no cicla: a partir del orden fijo devuelve el gris de «Otros»', () => {
    // La guía prohíbe inventar un tono para la serie N+1 — se agrupa en "Otros".
    expect(seriesColor(5)).toBe('#94a3b8');
    expect(seriesColor(12)).toBe('#94a3b8');
    expect(seriesColor(5)).toBe(seriesColor(9));
  });

  it('arranca en el indigo-600 que ya es el acento de la app', () => {
    expect(CHART_COLORS[0]).toBe('#4f46e5');
  });

  it('mantiene los cinco colores validados', () => {
    // Canario: si alguien toca un color hay que volver a pasar
    // `validate_palette.js` — el par emerald↔rose de un intento anterior fallaba
    // la separación para daltonismo con ΔE 5.8.
    expect([...CHART_COLORS]).toEqual([
      '#4f46e5',
      '#0d9488',
      '#d97706',
      '#be123c',
      '#7c3aed',
    ]);
  });

  it('los cinco son distintos entre sí', () => {
    expect(new Set(CHART_COLORS).size).toBe(CHART_COLORS.length);
  });
});

describe('formatValue', () => {
  it('formatea dinero con el formato único de la app', () => {
    expect(formatValue(17000, 'money')).toBe('$ 17.000');
  });

  it('redondea las unidades: media unidad vendida no existe', () => {
    expect(formatValue(84, 'units')).toBe('84 u');
    expect(formatValue(83.6, 'units')).toBe('84 u');
  });
});

describe('baseOptions', () => {
  it('no dibuja leyenda: las gráficas de una serie las nombra su tarjeta', () => {
    expect(baseOptions('money', 'light').plugins?.legend?.display).toBe(false);
  });

  it('siempre lleva tooltip, que es donde se lee la cifra exacta', () => {
    const tooltip = baseOptions('money', 'light').plugins?.tooltip;
    expect(tooltip).toBeDefined();
    expect(tooltip?.enabled).not.toBe(false);
  });

  it('deja la rejilla vertical fuera para que no compita con las barras', () => {
    expect(baseOptions('units', 'light').scales?.['x']?.grid?.display).toBe(false);
  });

  // research.md R19: baseOptions(kind, theme) -- el segundo juego de colores
  // oscuros se lee de axisColors(theme), no de un literal fijo.
  it('usa los colores de ejes/tooltip del tema activo (claro vs. oscuro)', () => {
    const light = baseOptions('units', 'light');
    const dark = baseOptions('units', 'dark');

    expect(light.scales?.['y']?.ticks?.color).toBe(axisColors('light').muted);
    expect(dark.scales?.['y']?.ticks?.color).toBe(axisColors('dark').muted);
    expect(light.scales?.['y']?.ticks?.color).not.toBe(dark.scales?.['y']?.ticks?.color);
    expect(light.scales?.['y']?.grid?.color).toBe(axisColors('light').grid);
    expect(dark.scales?.['y']?.grid?.color).toBe(axisColors('dark').grid);
  });
});

describe('axisColors (research.md R19, FR-010 ampliado)', () => {
  it('devuelve un juego de colores distinto para cada tema', () => {
    const light = axisColors('light');
    const dark = axisColors('dark');
    expect(light.ink).not.toBe(dark.ink);
    expect(light.muted).not.toBe(dark.muted);
    expect(light.grid).not.toBe(dark.grid);
  });

  it('el separador de segmentos (app-share-bar-chart) se funde con la tarjeta real de cada tema', () => {
    // Blanco en claro (bg-white sin repintar); --panel-color-surface-card
    // oscuro en oscuro (bg-white SÍ repintado por research.md R16) -- un
    // separador blanco en oscuro se vería como una línea, no como un hueco.
    expect(axisColors('light').segmentBorder).toBe('#ffffff');
    expect(axisColors('dark').segmentBorder).toBe('#1e293b');
  });

  it('el fondo del tooltip no cambia con el tema (ficha flotante oscura, texto blanco en ambos)', () => {
    expect(axisColors('light').tooltipBg).toBe(axisColors('dark').tooltipBg);
  });

  // research.md R19: "reverificar que los 5 colores de CHART_COLORS sigan
  // midiendo ≥3:1 contra --panel-color-canvas oscuro" -- no se asume, se mide.
  it('los 5 colores de CHART_COLORS miden ≥3:1 contra --panel-color-canvas oscuro (#090D16)', () => {
    const PANEL_CANVAS_DARK = '#090d16';
    for (const color of CHART_COLORS) {
      expect(contrastRatio(color, PANEL_CANVAS_DARK)).toBeGreaterThanOrEqual(3);
    }
  });
});
