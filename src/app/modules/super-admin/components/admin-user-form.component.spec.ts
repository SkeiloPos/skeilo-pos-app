import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { AdminUserFormComponent } from './admin-user-form.component';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { UserDetail } from '../interfaces/admin-user.interface';
import { FULL_NAME_MESSAGES } from '../../../shared/validators/full-name.validator';
import { environment } from '../../../../environments/environment';

const API = environment.apiBaseUrl;
const tick = () => new Promise<void>(r => setTimeout(r, 0));

const user: UserDetail = {
  id: 'u1',
  name: 'Ana Gómez',
  email: 'ana@acme.co',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
};

describe('AdminUserFormComponent — edición con confirmación (spec 159, Historia 4)', () => {
  let http: HttpTestingController;
  let confirm: ConfirmService;

  async function crear() {
    TestBed.configureTestingModule({
      imports: [AdminUserFormComponent, HttpClientTestingModule],
      providers: [
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    confirm = TestBed.inject(ConfirmService);
    const fixture = TestBed.createComponent(AdminUserFormComponent);
    fixture.componentInstance.user = user;
    fixture.componentInstance.ngOnInit();
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    await tick();
    TestBed.tick();

    // Drena las cargas de catálogo disparadas por ngOnInit, y la carga
    // reactiva del listado/indicadores que dispara `SuperAdminUsersService`
    // (inyectado para `roles()`/`refreshListAndStats()`) al construirse.
    http.match(`${API}/super-admin/roles`).forEach(req => req.flush([]));
    http.match(`${API}/super-admin/tenants`).forEach(req => req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }));
    http.match(r => r.url === `${API}/super-admin/users` && r.params.has('sort_by'))
      .forEach(req => req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0, empty_reason: 'no_data' }));
    http.match(`${API}/super-admin/users/stats`)
      .forEach(req => req.flush({ total: 0, active: 0, suspended: 0, new_this_month: 0 }));

    return fixture;
  }

  /** Drena el refetch de listado+indicadores que `refreshListAndStats()`
   * dispara tras un guardado exitoso (FR-009). */
  async function drainRefresh() {
    await tick();
    TestBed.tick();
    http.match(r => r.url === `${API}/super-admin/users` && r.params.has('sort_by'))
      .forEach(req => req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0, empty_reason: 'no_data' }));
    http.match(`${API}/super-admin/users/stats`)
      .forEach(req => req.flush({ total: 0, active: 0, suspended: 0, new_this_month: 0 }));
  }

  afterEach(() => http.verify());

  it('validación de nombre bloquea el envío con un formato inválido', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.patchValue({ name: 'Ana3' });

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(FULL_NAME_MESSAGES.format);
    http.expectNone(`${API}/super-admin/users/u1`);
  });

  it('pide confirmación antes de guardar y envía solo los campos cambiados', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.patchValue({ name: 'Ana Maria Gómez' });

    const submit = fixture.componentInstance.onSubmit();
    await Promise.resolve();
    confirm.respond(true);
    await Promise.resolve();

    const req = http.expectOne(`${API}/super-admin/users/u1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Ana Maria Gómez' });
    req.flush({ ...user, name: 'Ana Maria Gómez' });
    await submit;
    await drainRefresh();
  });

  it('cancelar la confirmación no envía la petición', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.patchValue({ name: 'Otro Nombre' });

    const submit = fixture.componentInstance.onSubmit();
    await Promise.resolve();
    confirm.respond(false);
    await submit;

    http.expectNone(`${API}/super-admin/users/u1`);
  });

  it('exige elegir negocio y rol de membresía juntos', async () => {
    const fixture = await crear();
    fixture.componentInstance.form.patchValue({ membership_tenant_id: 1 });

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(fixture.componentInstance.membershipError()).toContain('juntos');
    http.expectNone(`${API}/super-admin/users/u1`);
  });
});
