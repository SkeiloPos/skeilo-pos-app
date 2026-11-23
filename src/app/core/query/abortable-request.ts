import type { Observable } from 'rxjs';

/**
 * Convierte un `Observable` de `HttpClient` en una promesa cancelable: si
 * `signal` se aborta (p. ej. TanStack Query cancela la query al cambiar su
 * key) se desuscribe, lo que sí corta la petición XHR en curso -- a
 * diferencia de `firstValueFrom`, que no se puede cancelar y deja la
 * petición vieja terminando sola (duplicando filas en conexiones lentas).
 */
export function abortableFirstValueFrom<T>(obs: Observable<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const subscription = obs.subscribe({ next: resolve, error: reject });
    signal?.addEventListener('abort', () => subscription.unsubscribe(), { once: true });
  });
}
