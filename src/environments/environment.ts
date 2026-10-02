import { AppEnvironment } from '../app/core/tenant/app-environment.interface';

export const environment: AppEnvironment = {
  production: true,
  rootDomain: 'skeilopos.com',
  platformSlug: 'admin',
  reservedSlugs: ['www', 'app', 'admin', 'assets', 'api', 'docs'],
  tenantHeaderName: 'X-Tenant-Host',
  apiBaseUrl: 'https://api.skeilopos.com/api/v1',
};
