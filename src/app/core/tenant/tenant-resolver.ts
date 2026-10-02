import { TenantContext, TenantKind } from './tenant-context.model';

/** Subset of `AppEnvironment` the pure resolver needs. */
export interface TenantResolverConfig {
  readonly rootDomain: string;
  readonly platformSlug: string;
  readonly reservedSlugs: readonly string[];
}

/**
 * Pure function: maps a hostname to a {@link TenantContext}. No Angular, no
 * globals — trivially unit-testable. Contract:
 * `specs/091-admin-subdominio-nombre-completo/contracts/tenant-context-resolution.md`.
 *
 * Algorithm:
 *  1. Normalize (lowercase, trim; `location.hostname` already excludes the port).
 *  2. Exactly the root domain (and `localhost` / `127.0.0.1` in development) → UNRECOGNIZED:
 *     only `admin.<rootDomain>` reaches the platform login; there is no "local mode".
 *  3. `<slug>.<rootDomain>` or `<slug>.localhost` (first label only):
 *     `platformSlug` → SUPER_ADMIN; reserved slug → UNRECOGNIZED; otherwise TENANT(slug).
 *  4. Anything else → UNRECOGNIZED.
 */
export function resolveTenantContext(
  hostname: string,
  config: TenantResolverConfig
): TenantContext {
  const host = hostname.trim().toLowerCase();
  const rootDomain = config.rootDomain.toLowerCase();

  // 2. The root domain is not an access point.
  if (host === rootDomain) {
    return { kind: TenantKind.Unrecognized, hostname: host };
  }

  // 3. Subdomain of the configured root domain, or a local `*.localhost` one.
  const slug =
    extractLeadingLabel(host, `.${rootDomain}`) ?? extractLeadingLabel(host, '.localhost');
  if (slug !== null) {
    return classifySlug(slug, host, config);
  }

  // 4. Unknown host: no silent fallback to Super Admin.
  return { kind: TenantKind.Unrecognized, hostname: host };
}

/**
 * If `host` ends with `suffix`, return the first label preceding it
 * (e.g. host `conodoble.pos-sistem.com`, suffix `.pos-sistem.com` → `conodoble`).
 * Returns `null` when the suffix does not match or no leading label exists.
 */
function extractLeadingLabel(host: string, suffix: string): string | null {
  if (!host.endsWith(suffix)) return null;
  const prefix = host.slice(0, -suffix.length);
  if (prefix.length === 0) return null;
  // Multi-level subdomains are out of scope: take the first label only.
  const firstLabel = prefix.split('.')[0];
  return firstLabel.length > 0 ? firstLabel : null;
}

function classifySlug(slug: string, host: string, config: TenantResolverConfig): TenantContext {
  if (slug === config.platformSlug) {
    return { kind: TenantKind.SuperAdmin, hostname: host };
  }
  if (config.reservedSlugs.includes(slug)) {
    return { kind: TenantKind.Unrecognized, hostname: host };
  }
  return { kind: TenantKind.Tenant, slug, hostname: host };
}
