import { Route } from '@angular/router';
import { dashboardRoutes } from './routes';

/** Módulo que gobierna cada guardia `planModuleGuard(...)` de una ruta (la guardia lo expone en `moduleKey`). */
function moduloDe(route: Route): string | null {
  const guards = (route.canActivate ?? []) as unknown as { moduleKey?: string }[];
  const gobernadas = guards.map((g) => g.moduleKey).filter((m): m is string => typeof m === 'string');
  return gobernadas[0] ?? null;
}

/** Aplana el árbol de rutas con su camino completo (`ajustes/unidades`, …). */
function aplanar(routes: Route[], prefijo = ''): { path: string; route: Route }[] {
  return routes.flatMap((route) => {
    const camino = [prefijo, route.path ?? ''].filter(Boolean).join('/');
    const propias = route.path === undefined ? [] : [{ path: camino, route }];
    return [...propias, ...aplanar(route.children ?? [], camino)];
  });
}

/**
 * Spec 141 (FR-015, SC-005, US4.1–US4.3): entrar por URL directa a una pantalla de un módulo que el plan no
 * incluye se bloquea. Esta prueba recorre la tabla de rutas del panel y fija qué módulo gobierna cada una;
 * una ruta nueva del módulo sin su guardia se detecta aquí.
 */
describe('Rutas del panel: guardia de módulo por pantalla (spec 141)', () => {
  const rutas = aplanar(dashboardRoutes);
  const porCamino = (camino: string): Route => {
    const r = rutas.find((x) => x.path === camino);
    expect(r, `la ruta «${camino}» ya no existe: ajustar la prueba`).toBeDefined();
    return r!.route;
  };

  const DE_INVENTARIO = [
    'proveedores',
    'proveedores/:id/detalle',
    'inventario',
    'inventario/:id/detalle',
    'inventario/compras/nueva',
    'ajustes/unidades',
  ];

  for (const camino of DE_INVENTARIO) {
    it(`/dashboard/${camino} exige el módulo «inventario»`, () => {
      expect(moduloDe(porCamino(camino))).toBe('inventario');
    });
  }

  it('/dashboard/promotions exige el módulo «promociones»', () => {
    expect(moduloDe(porCamino('promotions'))).toBe('promociones');
  });

  it('/dashboard/cocina exige el módulo «cocina» (spec 151, ajuste post-implementación)', () => {
    expect(moduloDe(porCamino('cocina'))).toBe('cocina');
  });

  it('las pantallas de Proveedores conservan además la restricción por rol Administrador', () => {
    for (const camino of ['proveedores', 'proveedores/:id/detalle']) {
      expect((porCamino(camino).canActivate ?? []).length, camino).toBe(2);
    }
  });

  it('ninguna otra ruta del panel está gobernada por un módulo (ventas, catálogo, pedidos y cobro nunca se bloquean)', () => {
    const permitidas = new Set([...DE_INVENTARIO, 'promotions', 'cocina']);
    const sobrantes = rutas
      .filter((r) => moduloDe(r.route) !== null && !permitidas.has(r.path))
      .map((r) => `${r.path} → ${moduloDe(r.route)}`);

    expect(sobrantes).toEqual([]);
  });

  it('«Grupos de opciones» (catálogo base) no exige ningún módulo: debe cargar en un negocio sin Inventario', () => {
    expect(moduloDe(porCamino('ajustes/grupos-opciones'))).toBeNull();
  });
});
