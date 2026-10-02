import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { TenantContextService } from '../tenant-context.service';

/**
 * Allows activation only when the resolved context is the platform
 * (`admin.<rootDomain>`). A Super Admin reaching a tenant subdomain or an
 * unrecognized host is redirected to login.
 *
 * Compose alongside `authGuard` — this guard checks domain coherence, not auth.
 */
export const superAdminDomainGuard: CanActivateFn = () => {
  const tenant = inject(TenantContextService);
  const router = inject(Router);

  if (tenant.isSuperAdmin()) return true;
  return router.createUrlTree(['/login']);
};
