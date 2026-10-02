import { Route } from '@angular/router';
import { routes } from '../../app.routes';
import { authGuard } from '../guards/auth.guard';
import { superAdminDomainGuard } from './guards/super-admin-domain.guard';
import { tenantDomainGuard } from './guards/tenant-domain.guard';

/**
 * spec 091, T040: las rutas públicas del comensal no dependen del contexto de host
 * (el token firmado lleva el negocio), así que siguen funcionando en un host UNRECOGNIZED.
 */
function guardsAlong(target: string, list: Route[], inherited: unknown[] = []): unknown[] | null {
  for (const route of list) {
    const guards = [...inherited, ...(route.canActivate ?? [])];
    if (route.path === target) return guards;
    if (route.children) {
      const found = guardsAlong(target, route.children, guards);
      if (found) return found;
    }
  }
  return null;
}

describe('rutas públicas del comensal', () => {
  for (const path of ['menu/t/:token', 'menu/t/:token/checkout']) {
    it(`"${path}" no pasa por guards de dominio ni de sesión de staff`, () => {
      const guards = guardsAlong(path, routes);
      expect(guards).not.toBeNull();
      expect(guards).not.toContain(tenantDomainGuard);
      expect(guards).not.toContain(superAdminDomainGuard);
      expect(guards).not.toContain(authGuard);
    });
  }
});
