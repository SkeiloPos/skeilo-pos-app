import { environment as production } from '../../../environments/environment';
import { environment as development } from '../../../environments/environment.development';

/**
 * Paridad con el backend (`app/core/reserved_hosts.py`, spec 091 / A-101): si la lista
 * cambia en un lado, esta prueba y `test_reserved_hosts.py` obligan a cambiarla en el otro.
 */
const RESERVED = ['www', 'app', 'admin', 'assets', 'api', 'docs'];

describe('reservedSlugs (paridad con el backend)', () => {
  for (const [name, env] of [
    ['environment.ts', production],
    ['environment.development.ts', development],
  ] as const) {
    it(`${name} lleva la lista literal de reservados y platformSlug "admin"`, () => {
      expect([...env.reservedSlugs].sort()).toEqual([...RESERVED].sort());
      expect(env.platformSlug).toBe('admin');
    });
  }
});
