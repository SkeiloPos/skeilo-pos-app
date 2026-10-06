/**
 * Shape that both `environment.ts` (prod) and `environment.development.ts` must
 * satisfy. Centralizing the type prevents config drift between the two files.
 */
export interface AppEnvironment {
  readonly production: boolean;

  /**
   * Logical root domain for tenant resolution.
   * - Production: `skeilopos.com`
   * - Development: `localhost`
   * Only `admin.<rootDomain>` resolves to the platform (Super Admin) — there is no
   * "local mode" for bare `localhost`; a `<slug>.<rootDomain>` hostname resolves to a tenant; the root
   * domain itself is not a valid access (UNRECOGNIZED).
   */
  readonly rootDomain: string;

  /**
   * Subdomain label of the platform (Super Admin) context: `admin.<rootDomain>`.
   * It is also the value sent in `X-Tenant-Host` for platform requests.
   */
  readonly platformSlug: string;

  /**
   * Subdomain labels that cannot be a tenant (spec 091). Same list as the
   * backend `RESERVED_SUBDOMAINS`: `admin` is the platform, the rest are not
   * accessible and resolve to UNRECOGNIZED.
   */
  readonly reservedSlugs: readonly string[];

  /** HTTP header used to propagate the tenant slug to the backend. */
  readonly tenantHeaderName: string;

  /** Base URL of the own multi-tenant backend API (e.g. `http://localhost:8000/api/v1`). */
  readonly apiBaseUrl: string;

  /**
   * Public marketing site, linked from the auth screens: the privacy policy in the
   * footer and the "go to the SkeiloPOS site" link shown on an unrecognized host.
   *
   * Deliberately NOT derived from `rootDomain`: that would yield
   * `http://localhost/privacidad` in development. The public site is the same one
   * wherever the app runs, so both environment files carry the same value.
   */
  readonly publicSiteUrl: string;
}
