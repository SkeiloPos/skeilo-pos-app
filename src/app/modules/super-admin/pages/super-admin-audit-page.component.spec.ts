import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { SuperAdminAuditPageComponent } from './super-admin-audit-page.component';
import { AdminAuditLogItem } from '../interfaces/admin-user.interface';

const BASE = `${environment.apiBaseUrl}/super-admin/audit-logs`;
const TENANTS_BASE = `${environment.apiBaseUrl}/super-admin/tenants`;
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

function makeLog(overrides: Partial<AdminAuditLogItem> = {}): AdminAuditLogItem {
  return {
    id: 'log-1',
    actor_type: 'admin',
    actor_user_id: 'admin-1',
    actor_name_snapshot: 'Super Admin',
    affected_user_id: 'user-1',
    affected_user_email_snapshot: 'ana@example.invalid',
    tenant_id: 1,
    tenant_name: 'Pizzeria Uno',
    action: 'suspended',
    detail: null,
    ip_address: '127.0.0.1',
    created_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

async function crear() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SuperAdminAuditPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
    ],
  });
  const fixture = TestBed.createComponent(SuperAdminAuditPageComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  await tick();

  // ngOnInit carga el catálogo de negocios (una sola vez, no reactivo).
  const tenantsReq = http.expectOne((r) => r.url === TENANTS_BASE);
  tenantsReq.flush({ items: [{ id: 1, name: 'Pizzeria Uno' }], total: 1, page: 1, size: 20, pages: 1 });
  await tick();

  return { fixture, http };
}

async function flushPage(
  http: HttpTestingController,
  fixture: ReturnType<typeof TestBed.createComponent>,
  items: AdminAuditLogItem[],
  extra: Partial<{ total: number; page: number; size: number; pages: number; empty_reason: string | null }> = {},
) {
  const req = http.expectOne((r) => r.url === BASE);
  req.flush({
    items, total: extra.total ?? items.length, page: extra.page ?? 1, size: extra.size ?? 20,
    pages: extra.pages ?? 1, empty_reason: extra.empty_reason ?? null,
  });
  await settle(fixture);
}

describe('SuperAdminAuditPageComponent — auditoría administrativa (spec 159, Historia 7)', () => {
  const col = (el: HTMLElement, id: string) =>
    Array.from(el.querySelectorAll(`[data-testid="${id}"]`)).map((e) => e.textContent?.trim());

  it('lista las filas con negocio, usuario afectado, tipo y fecha', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeLog()]);

    const el = fixture.nativeElement as HTMLElement;
    expect(col(el, 'audit-row').length).toBe(1);
    expect(col(el, 'affected-user-link')).toEqual(['ana@example.invalid']);
  });

  it('distingue visualmente Sistema de Administrador', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [
      makeLog({ id: 'a', actor_type: 'admin' }),
      makeLog({ id: 'b', actor_type: 'system', actor_name_snapshot: null, action: 'blocked_security' }),
    ]);

    const el = fixture.nativeElement as HTMLElement;
    expect(col(el, 'actor-admin').length).toBe(1);
    expect(col(el, 'actor-system').length).toBe(1);
  });

  it('muestra el estado vacío "sin registros que coincidan" cuando hay filtros activos', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [], { empty_reason: 'no_results' });

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="empty-state"]')?.textContent).toContain('Sin registros que coincidan');
  });

  it('muestra un estado vacío distinto cuando no hay ninguna actividad todavía', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [], { empty_reason: 'no_data' });

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="empty-state"]')?.textContent).toContain('Todavía no hay actividad registrada');
  });

  it('filtra por tipo de acción y lo manda combinado al backend', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeLog()]);

    const el = fixture.nativeElement as HTMLElement;
    const selects = el.querySelectorAll('select');
    const actionSelect = selects[1] as HTMLSelectElement;
    actionSelect.value = 'suspended';
    actionSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await tick();
    const req = http.expectOne((r) => r.url === BASE && r.params.get('action') === 'suspended' && r.params.get('page') === '1');
    req.flush({ items: [makeLog()], total: 1, page: 1, size: 20, pages: 1, empty_reason: null });
    await settle(fixture);
  });

  it('"limpiar filtros" quita todos los filtros activos a la vez', async () => {
    const { fixture, http } = await crear();
    await flushPage(http, fixture, [makeLog()]);

    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input[type=text]') as HTMLInputElement;
    input.value = 'user-123';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await tick();
    const req1 = http.expectOne((r) => r.url === BASE && r.params.get('affected_user_id') === 'user-123');
    req1.flush({ items: [], total: 0, page: 1, size: 20, pages: 0, empty_reason: 'no_results' });
    await settle(fixture);

    expect(el.querySelector('[data-testid="clear-filters"]')).toBeTruthy();
    (el.querySelector('[data-testid="clear-filters"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await tick();

    const req2 = http.expectOne((r) => r.url === BASE && !r.params.has('affected_user_id'));
    req2.flush({ items: [makeLog()], total: 1, page: 1, size: 20, pages: 1, empty_reason: null });
    await settle(fixture);

    expect(el.querySelector('[data-testid="clear-filters"]')).toBeFalsy();
  });
});
