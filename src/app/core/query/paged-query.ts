import { injectQuery } from '@tanstack/angular-query-experimental';
import type { Page } from '../interfaces/page.interface';

/**
 * Wrapper delgado sobre `injectQuery` para un endpoint paginado `Page<T>`.
 * `queryKey`/`queryFn`/`enabled` se reevalúan reactivamente cada vez que las
 * signals que leen adentro cambian, así que volver a una combinación de
 * página/filtros ya vista sirve desde caché en vez de repetir la petición.
 * `placeholderData` mantiene las filas de la página anterior visibles
 * mientras carga la nueva, en vez de parpadear a una tabla vacía.
 */
export function injectPagedQuery<T>(config: {
  queryKey: () => readonly unknown[];
  queryFn: (signal: AbortSignal) => Promise<Page<T>>;
  enabled: () => boolean;
}) {
  return injectQuery(() => ({
    queryKey: config.queryKey(),
    // Reenvía el `signal` de TanStack Query al `queryFn` para que un cambio de
    // query key (p. ej. tecleo en el buscador) cancele de verdad la petición
    // HTTP anterior en vuelo, en vez de dejarla terminar sola y duplicar filas
    // en el Network tab en conexiones lentas.
    queryFn: ({ signal }: { signal: AbortSignal }) => config.queryFn(signal),
    enabled: config.enabled(),
    placeholderData: (prev: Page<T> | undefined) => prev,
  }));
}
