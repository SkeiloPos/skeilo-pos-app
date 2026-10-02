import { resolveTenantContext, TenantResolverConfig } from './tenant-resolver';
import { TenantKind } from './tenant-context.model';

const config: TenantResolverConfig = {
  rootDomain: 'skeilopos.com',
  platformSlug: 'admin',
  reservedSlugs: ['www', 'app', 'admin', 'assets', 'api', 'docs'],
};

/**
 * Tabla de `specs/091-admin-subdominio-nombre-completo/contracts/tenant-context-resolution.md`.
 * A-99: el dominio raíz, `localhost`/`127.0.0.1`, `www`/`app` y los hosts desconocidos dejan de ser SUPER_ADMIN
 * (antes lo eran); `admin` pasa de TENANT a SUPER_ADMIN.
 */
describe('resolveTenantContext', () => {
  interface Case {
    hostname: string;
    kind: TenantKind;
    slug?: string;
  }

  const cases: Case[] = [
    // Plataforma
    { hostname: 'admin.skeilopos.com', kind: TenantKind.SuperAdmin },
    { hostname: 'admin.localhost', kind: TenantKind.SuperAdmin },
    // Sin "modo local": la plataforma solo se alcanza con la URL con `admin` (aclaración 2026-10-02)
    { hostname: 'localhost', kind: TenantKind.Unrecognized },
    { hostname: '127.0.0.1', kind: TenantKind.Unrecognized },
    // Negocios
    { hostname: 'acme.skeilopos.com', kind: TenantKind.Tenant, slug: 'acme' },
    { hostname: 'acme.localhost', kind: TenantKind.Tenant, slug: 'acme' },
    // Dominio raíz
    { hostname: 'skeilopos.com', kind: TenantKind.Unrecognized },
    // Reservados distintos de admin
    ...['www', 'app', 'assets', 'api', 'docs'].flatMap(
      (label): Case[] => [
        { hostname: `${label}.skeilopos.com`, kind: TenantKind.Unrecognized },
        { hostname: `${label}.localhost`, kind: TenantKind.Unrecognized },
      ],
    ),
    // Hosts ajenos
    { hostname: '192.168.1.10', kind: TenantKind.Unrecognized },
    { hostname: 'proyecto.pages.dev', kind: TenantKind.Unrecognized },
    { hostname: 'unknown-host.example.org', kind: TenantKind.Unrecognized },
    // Multinivel: se toma la primera etiqueta
    { hostname: 'x.admin.skeilopos.com', kind: TenantKind.Tenant, slug: 'x' },
  ];

  for (const c of cases) {
    it(`resuelve "${c.hostname}" a ${c.kind}${c.slug ? ` (slug=${c.slug})` : ''}`, () => {
      const result = resolveTenantContext(c.hostname, config);
      expect(result.kind).toBe(c.kind);
      if (c.kind === TenantKind.Tenant) {
        expect(result.kind === TenantKind.Tenant && result.slug).toBe(c.slug);
      }
    });
  }

  it('normaliza mayúsculas y espacios', () => {
    const tenant = resolveTenantContext('  Acme.SKEILOPOS.com  ', config);
    expect(tenant.kind).toBe(TenantKind.Tenant);
    expect(tenant.kind === TenantKind.Tenant && tenant.slug).toBe('acme');

    expect(resolveTenantContext(' ADMIN.Skeilopos.COM ', config).kind).toBe(TenantKind.SuperAdmin);
  });

  it('un host desconocido ya no cae en SUPER_ADMIN', () => {
    expect(resolveTenantContext('otro.example.org', config).kind).not.toBe(TenantKind.SuperAdmin);
  });

  it('con el entorno de desarrollo (rootDomain "localhost") solo admin.localhost es plataforma', () => {
    const dev = { ...config, rootDomain: 'localhost' };
    expect(resolveTenantContext('localhost', dev).kind).toBe(TenantKind.Unrecognized);
    expect(resolveTenantContext('127.0.0.1', dev).kind).toBe(TenantKind.Unrecognized);
    expect(resolveTenantContext('admin.localhost', dev).kind).toBe(TenantKind.SuperAdmin);
    expect(resolveTenantContext('acme.localhost', dev).kind).toBe(TenantKind.Tenant);
  });
});
