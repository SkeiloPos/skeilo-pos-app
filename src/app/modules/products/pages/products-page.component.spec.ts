import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ProductsPageComponent } from './products-page.component';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { ToastService } from '../../../shared/feedback/toast.service';

const PRODUCT = {
  id: 'p1',
  category_id: 'c1',
  name: 'Fresa boom',
  description: null,
  preparation_type: 'prepared',
  image_url: null,
  active: true,
  available: true,
  available_changed_at: null,
  available_changed_by_name: null,
  tracks_inventory: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
};

/** `promotions-page.component.spec.ts::tick` -- TanStack Query despacha su
 *  petición y propaga su cache al signal `data()` en su propia ronda de
 *  microtareas/macrotareas, aparte de la del Observable HTTP: un solo tick no
 *  siempre alcanza. */
const tick = () => new Promise((r) => setTimeout(r, 0));

async function crear(role: UserRole | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductsPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      { provide: AuthService, useValue: { currentUser: () => (role ? { role } : null) } },
    ],
  });
  const fixture = TestBed.createComponent(ProductsPageComponent);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  await tick();
  http.match(() => true).forEach((req) =>
    req.flush(
      req.request.url.includes('/categories')
        ? { items: [], total: 0, page: 1, size: 100, pages: 0 }
        : { items: [PRODUCT], total: 1, page: 1, size: 20, pages: 1 },
    ),
  );

  const el = fixture.nativeElement as HTMLElement;
  const start = Date.now();
  while (!el.textContent?.includes('Fresa boom') && Date.now() - start < 1000) {
    await tick();
    fixture.detectChanges();
  }

  return { el, fixture, http };
}

describe('ProductsPageComponent — íconos estandarizados (spec 082)', () => {
  it('ningún ícono se renderiza ya como emoji ni SVG artesanal (empty state y "Nuevo producto")', async () => {
    const { el } = await crear(UserRole.ADMIN);
    expect(el.querySelector('svg')).toBeNull();
    for (const emoji of ['🍦', '🚫', '✏️', '🔴', '🟢']) {
      expect(el.textContent).not.toContain(emoji);
    }
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('add');
  });
});

describe('ProductsPageComponent — Carta del menú para Cajero (spec 093)', () => {
  it('Admin ve "Nuevo producto" y las acciones de editar/desactivar', async () => {
    const { el } = await crear(UserRole.ADMIN);
    expect(el.textContent).toContain('Nuevo producto');
    expect(el.querySelector('[title="Editar"]')).not.toBeNull();
    expect(el.querySelector('[title="Desactivar"]')).not.toBeNull();
  });

  it('Cajero no ve "Nuevo producto" ni acciones de editar/desactivar, sin ningún error de permisos', async () => {
    const { el } = await crear(UserRole.CASHIER);
    expect(el.textContent).not.toContain('Nuevo producto');
    expect(el.querySelector('[title="Editar"]')).toBeNull();
    expect(el.querySelector('[title="Desactivar"]')).toBeNull();
    expect(el.querySelector('[title="Activar"]')).toBeNull();
    expect(el.textContent?.toLowerCase()).not.toContain('permiso');
    expect(el.textContent?.toLowerCase()).not.toContain('forbidden');
  });

  it('Cajero sí puede usar el interruptor "Agotado" de la fila', async () => {
    const { el } = await crear(UserRole.CASHIER);
    const toggle = el.querySelector('[title="Marcar agotado"]') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.disabled).toBe(false);
  });

  it('el filtro Todos/Disponibles/Agotados está disponible para Cajero (escenario 2)', async () => {
    const { el } = await crear(UserRole.CASHIER);
    const options = Array.from(el.querySelectorAll('select option')).map((o) => o.textContent?.trim());
    expect(options).toContain('Disponibles');
    expect(options).toContain('Agotados');
  });

  it('Cajero ve "Ver detalle" en vez de "Editar" en la fila', async () => {
    const { el } = await crear(UserRole.CASHIER);
    expect(el.querySelector('[title="Ver detalle"]')).not.toBeNull();
  });

  // ── Escenario 13: falla de red al marcar ──────────────────────────────────

  it('si el PATCH de disponibilidad falla, el interruptor queda en su estado previo y se ve un error', async () => {
    const { el, fixture, http } = await crear(UserRole.CASHIER);
    const toast = TestBed.inject(ToastService);

    const toggle = el.querySelector('[title="Marcar agotado"]') as HTMLButtonElement;
    toggle.click();

    await tick();
    const req = http.expectOne((r) => r.url.endsWith('/products/p1/availability'));
    req.flush({ detail: 'fallo simulado' }, { status: 500, statusText: 'Server Error' });
    await tick();
    fixture.detectChanges();

    // El producto sigue disponible: la fila nunca llegó a reflejar el cambio
    // (la invalidación de la query solo corre en éxito, research.md D12) --
    // "vuelve a su estado anterior" porque nunca lo abandonó.
    expect(el.querySelector('[title="Marcar agotado"]')).not.toBeNull();
    expect(el.querySelector('[title="Marcar disponible"]')).toBeNull();
    expect(toast.toasts().some((t) => t.kind === 'error')).toBe(true);
  });
});
