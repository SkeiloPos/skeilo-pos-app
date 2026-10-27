import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TenantService } from './tenant.service';
import { Tenant, TenantCreateWithUser } from '../interfaces/tenant.interface';
import { Page } from '../interfaces/page.interface';

const listUrl = `${environment.apiBaseUrl}/super-admin/tenants`;
const createUrl = `${environment.apiBaseUrl}/admin/tenants`;

function tenant(partial: Partial<Tenant>): Tenant {
  return {
    id: 1,
    name: 'Tenant',
    schema: 'tenant',
    host: 'tenant.pos-sistem.com',
    plan_id: 'plan-basic',
    ciclo_facturacion: 'mensual',
    timezone: 'America/Bogota',
    created_at: '2026-01-01',
    ...partial,
  };
}

function page(items: Tenant[]): Page<Tenant> {
  return { items, total: items.length, page: 1, size: 20, pages: 1 };
}

const validPayload: TenantCreateWithUser = {
  tenant_name: 'Nuevo',
  schema_name: 'nuevo',
  host: 'nuevo.pos-sistem.com',
  name: 'Admin',
  email: 'admin@nuevo.com',
  plan_id: 'plan-basic',
  ciclo_facturacion: 'mensual',
};

describe('TenantService', () => {
  let service: TenantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TenantService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TenantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests the paginated tenant list from /super-admin/tenants', async () => {
    const promise = firstValueFrom(service.loadTenants());
    const req = http.expectOne(listUrl);
    expect(req.request.method).toBe('GET');
    req.flush(page([tenant({ id: 2, name: 'Zeta' })]));

    const result = await promise;
    expect(result.items.map((t) => t.name)).toEqual(['Zeta']);
    expect(result.total).toBe(1);
  });

  it('creates a tenant with the user payload via POST /super-admin/tenants', async () => {
    const promise = service.createTenant(validPayload);
    const post = http.expectOne(createUrl);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(validPayload);
    post.flush(null);
    await promise;

    expect(service.error()).toBeNull();
    expect(service.isSubmitting()).toBe(false);
  });

  it('maps a FastAPI 422 (detail as array) to a readable message', async () => {
    const promise = service.createTenant(validPayload);
    http
      .expectOne(createUrl)
      .flush(
        { detail: [{ msg: 'schema ya existe', loc: ['body', 'schema_name'] }] },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await promise;

    expect(service.error()).toBe('schema ya existe');
  });

  it('maps a string detail error', async () => {
    const promise = service.createTenant(validPayload);
    http
      .expectOne(createUrl)
      .flush({ detail: 'No autorizado' }, { status: 403, statusText: 'Forbidden' });
    await promise;

    expect(service.error()).toBe('No autorizado');
  });
});
