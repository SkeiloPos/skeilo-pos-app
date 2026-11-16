import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { SuperAdminUsersService } from './super-admin-users.service';

const baseUrl = `${environment.apiBaseUrl}/super-admin/users`;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('SuperAdminUsersService', () => {
  let service: SuperAdminUsersService;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        SuperAdminUsersService, provideHttpClient(), provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    service = TestBed.inject(SuperAdminUsersService);
    http = TestBed.inject(HttpTestingController);

    await tick();
    TestBed.tick();
    http
      .expectOne((r) => r.url === baseUrl && r.params.has('sort_by'))
      .flush({ items: [], total: 0, page: 1, size: 20, pages: 0, empty_reason: 'no_data' });
    http
      .expectOne((r) => r.url === `${baseUrl}/stats`)
      .flush({ total: 0, active: 0, suspended: 0, new_this_month: 0 });
  });

  afterEach(() => http.verify());

  // `refreshListAndStats()` ya está cubierto end-to-end con un componente
  // real en `super-admin-users-page.component.spec.ts` (el refetch de
  // `injectQuery`/`injectPagedQuery` necesita un árbol de componentes para
  // asentar vía `detectChanges()`, no solo `TestBed.tick()` sobre el servicio
  // aislado) -- no se duplica aquí.

  it('loadRoles() carga el catálogo de roles', async () => {
    const promise = service.loadRoles();
    http
      .expectOne(`${environment.apiBaseUrl}/super-admin/roles`)
      .flush([{ id: 'r1', name: 'ADMIN' }]);
    await promise;

    expect(service.roles()).toEqual([{ id: 'r1', name: 'ADMIN' }]);
  });
});
