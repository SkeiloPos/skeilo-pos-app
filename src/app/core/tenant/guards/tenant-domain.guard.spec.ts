import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { tenantDomainGuard } from './tenant-domain.guard';
import { superAdminDomainGuard } from './super-admin-domain.guard';
import { TenantContextService } from '../tenant-context.service';
import { TenantContext, TenantKind } from '../tenant-context.model';

function run(guard: typeof tenantDomainGuard, context: TenantContext): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  TestBed.inject(TenantContextService).initialize(context);
  return TestBed.runInInjectionContext(() => guard({} as never, {} as never)) as boolean | UrlTree;
}

describe('tenantDomainGuard (spec 091)', () => {
  it('deja pasar solo en un negocio', () => {
    expect(run(tenantDomainGuard, { kind: TenantKind.Tenant, slug: 'acme', hostname: 'acme.x' })).toBe(true);
  });

  it('redirige a /login en un host no reconocido', () => {
    const result = run(tenantDomainGuard, { kind: TenantKind.Unrecognized, hostname: 'x.org' });
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('redirige a /login en la plataforma', () => {
    const result = run(tenantDomainGuard, { kind: TenantKind.SuperAdmin, hostname: 'admin.x' });
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});

describe('superAdminDomainGuard (sin cambio)', () => {
  it('deja pasar solo en la plataforma', () => {
    expect(run(superAdminDomainGuard, { kind: TenantKind.SuperAdmin, hostname: 'admin.x' })).toBe(true);
    expect(run(superAdminDomainGuard, { kind: TenantKind.Tenant, slug: 'a', hostname: 'a.x' })).toBeInstanceOf(UrlTree);
    expect(run(superAdminDomainGuard, { kind: TenantKind.Unrecognized, hostname: 'x' })).toBeInstanceOf(UrlTree);
  });
});
