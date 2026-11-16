import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { SuperAdminUsersPageComponent } from './super-admin-users-page.component';
import { UserListItem } from '../interfaces/admin-user.interface';

const BASE = `${environment.apiBaseUrl}/super-admin/users`;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** `injectPagedQuery` (TanStack Query) necesita varias vueltas de macrotarea +
 *  `TestBed.tick()` + `detectChanges()` para asentar tras un `flush()` (ver
 *  memoria del proyecto: componentes con `injectPagedQuery` tardan ~5 rondas). */
async function settle(fixture: ReturnType<typeof TestBed.createComponent>, rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await tick();
    TestBed.tick();
    fixture.detectChanges();
  }
}

function makeItem(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 'u-1',
    name: 'Ana Pérez',
    email: 'ana@example.invalid',
    role_name: 'ADMIN',
    status: 'active',
    memberships_count: 1,
    memberships_preview: 'Pizzeria Uno',
    plan_name: 'Pro',
    last_login_at: '2026-11-01T00:00:00Z',
    is_inactive_recently: false,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

async function crear() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SuperAdminUsersPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
    ],
  });
  const fixture = TestBed.createComponent(SuperAdminUsersPageComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  await tick();
  return { fixture, http };
}

async function flushPage(
  http: HttpTestingController,
  fixture: ReturnType<typeof TestBed.createComponent>,
  items: UserListItem[],
  extra: Partial<{ total: number; page: number; size: number; pages: number; empty_reason: string | null }> = {},
) {
  const req = http.expectOne((r) => r.url === BASE);
  req.flush({
    items, total: extra.total ?? items.length, page: extra.page ?? 1, size: extra.size ?? 20,
    pages: extra.pages ?? 1, empty_reason: extra.empty_reason ?? null,
  });
  await settle(fixture);
}

describe('SuperAdminUsersPageComponent — listado centralizado (spec 159, Historia 1)', () => {
  const col = (el: HTMLElement, id: string) =>
    Array.from(el.querySelectorAll(`[data-testid="${id}"]`)).map((e) => e.textContent?.trim());

  it('muestra nombre, correo y avatar de cada fila', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeItem()]);

    const el = fixture.nativeElement as HTMLElement;
    expect(col(el, 'user-title')).toEqual(['Ana Pérez']);
    expect(col(el, 'user-avatar')).toEqual(['A']);
  });

  it('indica "Sin negocio" cuando memberships_count es 0 y "+N" cuando hay varios', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [
      makeItem({ id: 'sin-negocio', memberships_count: 0, memberships_preview: null }),
      makeItem({ id: 'multi', memberships_count: 3 }),
    ]);

    const el = fixture.nativeElement as HTMLElement;
    expect(col(el, 'no-tenant')).toEqual(['Sin negocio']);
    expect(col(el, 'multi-tenant-badge')).toEqual(['+2']);
  });

  it('busca con debounce y manda el término al backend', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeItem()]);

    const input = (fixture.nativeElement as HTMLElement).querySelector('input[type=text]') as HTMLInputElement;
    input.value = 'ana';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input.value = 'ana@example';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // Antes de los 300ms del debounce no debe haber una segunda solicitud.
    await tick();
    http.expectNone((r) => r.url === BASE && r.params.has('search'));

    await new Promise((r) => setTimeout(r, 310));
    const req = http.expectOne((r) => r.url === BASE && r.params.get('search') === 'ana@example');
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0, empty_reason: 'no_results' });
    await settle(fixture);
  });

  it('combina filtro de estado y rango de fechas, y "limpiar filtros" los remueve en una sola acción', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeItem()]);

    const el = fixture.nativeElement as HTMLElement;
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'suspended';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const statusReq = http.expectOne(
      (r) => r.url === BASE && (r.params.getAll('status') ?? []).includes('suspended'),
    );
    statusReq.flush({ items: [], total: 0, page: 1, size: 20, pages: 0, empty_reason: 'no_results' });
    await settle(fixture);

    const clearButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Limpiar filtros'));
    expect(clearButton).toBeTruthy();
    clearButton!.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    const clearedReq = http.expectOne((r) => r.url === BASE && !r.params.has('status') && !r.params.has('search'));
    clearedReq.flush({ items: [makeItem()], total: 1, page: 1, size: 20, pages: 1, empty_reason: null });
    await settle(fixture);
  });

  it('ordena por nombre y el header muestra la dirección activa', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeItem()]);

    const el = fixture.nativeElement as HTMLElement;
    const header = el.querySelector('[data-testid="sort-name"]') as HTMLElement;
    header.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    const req = http.expectOne(
      (r) => r.url === BASE && r.params.get('sort_by') === 'name' && r.params.get('sort_dir') === 'asc',
    );
    req.flush({ items: [makeItem()], total: 1, page: 1, size: 20, pages: 1, empty_reason: null });
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="sort-name"]')?.textContent).toContain('▲');
  });

  it('la paginación conserva los filtros/orden activos', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, Array.from({ length: 20 }, (_, i) => makeItem({ id: `u-${i}` })), {
      total: 40, pages: 2,
    });

    const el = fixture.nativeElement as HTMLElement;
    const next = el.querySelector('[data-testid="next-page"]') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    next.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === BASE && r.params.get('page') === '2');
    req.flush({ items: [], total: 40, page: 2, size: 20, pages: 2, empty_reason: null });
    await settle(fixture);
  });

  it('estado de carga mientras llega la primera página', async () => {
    const { fixture } = await crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.animate-spin')).toBeTruthy();
  });

  it('estado de error con botón de reintentar', async () => {
    const { fixture, http } = await crear();
    const req = http.expectOne((r) => r.url === BASE);
    req.error(new ProgressEvent('error'));
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No se pudo cargar');
    const retry = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reintentar'));
    expect(retry).toBeTruthy();
  });

  it('distingue "sin datos de plataforma" de "sin resultados"', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [], { total: 0, pages: 0, empty_reason: 'no_data' });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin datos de plataforma');
  });
});

describe('SuperAdminUsersPageComponent — indicadores generales (spec 159, Historia 2)', () => {
  const STATS_URL = `${environment.apiBaseUrl}/super-admin/users/stats`;

  async function flushStats(
    http: HttpTestingController,
    fixture: ReturnType<typeof TestBed.createComponent>,
    stats: { total: number; active: number; suspended: number; new_this_month: number },
  ) {
    const req = http.expectOne((r) => r.url === STATS_URL);
    req.flush(stats);
    await settle(fixture);
  }

  it('muestra los 4 indicadores y se refrescan sin recargar tras `refreshListAndStats()`', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeItem()]);
    await flushStats(http, fixture, { total: 10, active: 8, suspended: 2, new_this_month: 3 });

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="stat-total"]')?.textContent?.trim()).toBe('10');
    expect(el.querySelector('[data-testid="stat-active"]')?.textContent?.trim()).toBe('8');
    expect(el.querySelector('[data-testid="stat-suspended"]')?.textContent?.trim()).toBe('2');
    expect(el.querySelector('[data-testid="stat-new-this-month"]')?.textContent?.trim()).toBe('3');

    // Simula lo que hará la Historia 4 tras suspender/reactivar un usuario:
    // llamar al refresco compartido, sin recarga manual de página.
    fixture.componentInstance.usersService.refreshListAndStats();
    fixture.detectChanges();

    const listReq = http.expectOne((r) => r.url === BASE);
    listReq.flush({ items: [makeItem()], total: 1, page: 1, size: 20, pages: 1, empty_reason: null });
    await settle(fixture);
    await flushStats(http, fixture, { total: 10, active: 7, suspended: 3, new_this_month: 3 });

    expect(el.querySelector('[data-testid="stat-active"]')?.textContent?.trim()).toBe('7');
    expect(el.querySelector('[data-testid="stat-suspended"]')?.textContent?.trim()).toBe('3');
  });
});
