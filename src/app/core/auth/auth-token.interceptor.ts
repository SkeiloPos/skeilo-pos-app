import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TokenStorageService } from './token-storage.service';
import { AuthService } from '../services/auth.service';
import { DinerTokenStore } from '../../modules/tables/services/diner-token.store';

const LOGIN_PATH = '/auth/login';
const REFRESH_PATH = '/auth/refresh-token';

/**
 * Rutas públicas del comensal: se autentican con el `session_token` firmado
 * (cabecera `x-session-token`), nunca con el Bearer del staff.
 */
const DINER_PATHS = ['/cart', '/menu/qr-token'];

function isDinerPublicPath(url: string): boolean {
  const path = url.slice(environment.apiBaseUrl.length);
  return DINER_PATHS.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

/**
 * For requests to the own backend (`{apiBaseUrl}`):
 *  - adds `X-Tenant-Host` (tenant slug, or `admin` for the platform) and `Authorization: Bearer <access_token>`
 *    (login is public; refresh sets its own bearer explicitly);
 *  - on a `401`, refreshes the access token once (shared) and retries;
 *    if the refresh fails, forces logout.
 *
 * Las rutas del comensal quedan **fuera de ese camino**: llevan
 * `x-session-token` en vez de Bearer y su `401` se deja propagar. Para el
 * comensal un `401` es rutina (mesa cobrada, sesión cerrada, TTL agotado) y
 * significa "vuelve a escanear el QR" — pasarlo por el refresh de staff lo
 * expulsaría a la pantalla de login, y arrastraría el Bearer de un empleado
 * logueado en el mismo navegador.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  if (isDinerPublicPath(req.url)) {
    const dinerToken = inject(DinerTokenStore).token();
    const dinerReq = dinerToken
      ? req.clone({ setHeaders: { 'x-session-token': dinerToken } })
      : req;
    return next(dinerReq);
  }

  const tokenStorage = inject(TokenStorageService);
  const tenant = inject(TenantContextService);
  const auth = inject(AuthService);

  const isAuthEndpoint = req.url.includes(LOGIN_PATH) || req.url.includes(REFRESH_PATH);
  const authedReq = decorate(req, tokenStorage.getAccessToken(), tenant.tenantHostHeader(), isAuthEndpoint);

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      const is401 = err instanceof HttpErrorResponse && err.status === 401;
      if (!is401 || isAuthEndpoint) {
        return throwError(() => err);
      }
      return from(auth.tryRefresh()).pipe(
        switchMap(ok => {
          if (!ok) {
            auth.forceLogout();
            return throwError(() => err);
          }
          const retried = decorate(req, tokenStorage.getAccessToken(), tenant.tenantHostHeader(), false);
          return next(retried);
        })
      );
    })
  );
};

function decorate(
  req: HttpRequest<unknown>,
  accessToken: string | null,
  tenantHost: string | null,
  isAuthEndpoint: boolean
): HttpRequest<unknown> {
  const setHeaders: Record<string, string> = {};
  // Slug del negocio, `admin` en la plataforma; nada en un host no reconocido (spec 091).
  if (tenantHost) {
    setHeaders[environment.tenantHeaderName] = tenantHost;
  }
  if (accessToken && !isAuthEndpoint) {
    setHeaders['Authorization'] = `Bearer ${accessToken}`;
  }
  return Object.keys(setHeaders).length ? req.clone({ setHeaders }) : req;
}
