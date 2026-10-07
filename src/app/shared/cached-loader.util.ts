/**
 * Caché y deduplicación de peticiones para servicios `providedIn: 'root'` cuyo
 * `load()` dispara una petición HTTP para poblar un signal de datos (spec
 * 101). `hasData()` decide si ya hay datos válidos en memoria y `run()` es
 * responsable completa de la petición real (incluyendo sus propios signals
 * `loading`/`error`) — el helper no conoce ninguno de los dos.
 */
export function createCachedLoader<T>(
  hasData: () => boolean,
  run: () => Promise<T>,
): { load(options?: { force?: boolean }): Promise<void> } {
  let pending: Promise<void> | null = null;

  return {
    load(options?: { force?: boolean }): Promise<void> {
      const force = options?.force ?? false;

      if (!force && hasData()) {
        return Promise.resolve();
      }

      if (!force && pending) {
        return pending;
      }

      const request = run().then(() => undefined);
      pending = request;
      request.finally(() => {
        if (pending === request) pending = null;
      });
      return request;
    },
  };
}
