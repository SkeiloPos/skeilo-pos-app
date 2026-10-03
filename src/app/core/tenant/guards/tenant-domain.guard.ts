import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { TenantContextService } from '../tenant-context.service';

/**
 * Allows activation only when the resolved context is a tenant subdomain.
 * Access from the platform (`admin`) or an unrecognized host is redirected to login.
 *
 * Compose alongside `authGuard` — this guard checks domain coherence, not auth.
 */
export const tenantDomainGuard: CanActivateFn = () => {
  const tenant = inject(TenantContextService);
  const router = inject(Router);

  if (tenant.isTenant()) return true;
  return router.createUrlTree(['/login']);
};
