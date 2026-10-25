import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { routes } from './app.routes';
import { provideTenantInitializer } from './core/tenant/tenant.initializer';
import { authTokenInterceptor } from './core/auth/auth-token.interceptor';
import { IntegrityAwareErrorHandler } from './core/integrity/integrity-error-handler';
import { pageIntegrityInterceptor } from './core/integrity/page-integrity.interceptor';
import { PageIntegrityService } from './core/integrity/page-integrity.service';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Spec 134 (FR-007): la vigilancia de la página arranca antes del primer
    // pintado y evalúa de inmediato, así una página que ya llega traducida
    // arranca como "alterada". El ErrorHandler le pasa los errores de DOM.
    provideAppInitializer(() => inject(PageIntegrityService).start()),
    { provide: ErrorHandler, useClass: IntegrityAwareErrorHandler },
    provideTenantInitializer(),
    // `pageIntegrityInterceptor` va ANTES que `authTokenInterceptor`: rechazar una
    // acción protegida no debe tocar tokens ni consumir un refresh.
    provideHttpClient(withInterceptors([pageIntegrityInterceptor, authTokenInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    // Registra los controladores de Chart.js una sola vez para toda la app; las
    // gráficas de `shared/charts` asumen que ya está hecho.
    provideCharts(withDefaultRegisterables()),
    provideTanStackQuery(
      new QueryClient({
        defaultOptions: {
          queries: {
            // Sesión de trabajo típica reutiliza caché sin quedar desactualizada
            // entre cajeros/admins concurrentes editando el mismo catálogo.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // Cada servicio paginado es un singleton de sesión completa (un solo
            // observer activo, nunca se destruye): sin esto, cualquier alt-tab
            // re-consulta TODO recurso ya tocado, no solo la vista abierta.
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    ),
    // Spec 077: se registra `push-sw.js` (public/push-sw.js) y no
    // `ngsw-worker.js` directamente — envuelve al Service Worker de Angular
    // (`importScripts`) y le agrega el listener `push` con deduplicación por
    // foco que RF-004/research.md §5 exigen. `SwPush`/`SwUpdate` funcionan
    // igual: siguen hablando con "el Service Worker activo", sin importar
    // el nombre del archivo que lo registró.
    provideServiceWorker('push-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
