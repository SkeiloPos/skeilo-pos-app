import { AppEnvironment } from '../app/core/tenant/app-environment.interface';

export const environment: AppEnvironment = {
  production: false,
  rootDomain: 'localhost',
  platformSlug: 'admin',
  reservedSlugs: ['www', 'app', 'admin', 'assets', 'api', 'docs'],
  tenantHeaderName: 'X-Tenant-Host',
  apiBaseUrl: 'http://localhost:8000/api/v1',
  // Same value as production on purpose: the public site does not live on
  // `localhost`, and deriving it from `rootDomain` would break the links.
  publicSiteUrl: 'https://skeilopos.com',
};
