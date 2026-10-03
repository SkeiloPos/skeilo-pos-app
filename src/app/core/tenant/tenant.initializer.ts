import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { environment } from '../../../environments/environment';
import { resolveTenantContext } from './tenant-resolver';
import { TenantContextService } from './tenant-context.service';

/**
 * Resolves the tenant context from `window.location.hostname` and fixes it in
 * {@link TenantContextService} before the first render, so guards, services and
 * components see a ready context synchronously.
 */
export function provideTenantInitializer(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const tenantContext = inject(TenantContextService);
    const context = resolveTenantContext(window.location.hostname, {
      rootDomain: environment.rootDomain,
      platformSlug: environment.platformSlug,
      reservedSlugs: environment.reservedSlugs,
    });
    tenantContext.initialize(context);
  });
}
