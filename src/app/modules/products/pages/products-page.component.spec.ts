import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ProductsPageComponent } from './products-page.component';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { ToastService } from '../../../shared/feedback/toast.service';
import { ProductService } from '../services/product.service';

/** Spec 152 (FR-008/SC-004): forma recortada de `ProductListResponse` -- ya no
 *  trae `code`, `description`, `tracks_inventory`, `is_topping`, `visible_en_qr`
 *  ni `available_changed_by_name`; agrega `price_display`/`price_from`. */
const PRODUCT = {
  id: 'p1',
  category_id: 'c1',
  category_name: 'Postres fríos',
  name: 'Fresa boom',
  preparation_type: 'prepared',
  image_url: null,
  active: true,
  available: true,
  available_changed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  price_display: '12000.00',
  price_from: false,
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

describe('ProductsPageComponent — nombre de categoría resuelto por el backend (spec 097)', () => {
  it('pinta el category_name que ya llega resuelto en GET /products, en la columna Categoría', async () => {
    const { el } = await crear(UserRole.ADMIN);
    expect(el.textContent).toContain('Postres fríos');
  });

  it('no resuelve category_name contra GET /categories (llega ya resuelto en GET /products) -- la única petición a /categories que sigue haciendo es para poblar el selector del filtro (spec 152, US2)', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
        { provide: AuthService, useValue: { currentUser: () => ({ role: UserRole.ADMIN }) } },
      ],
    });
    const fixture = TestBed.createComponent(ProductsPageComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await tick();

    const pending = http.match(() => true);
    const categoryRequests = pending.filter((r) => r.request.url.includes('/categories'));
    // spec 152 (US2): una sola carga del catálogo completo, para el selector del filtro
    // -- no una petición por fila ni un `categoryMap` resuelto en el cliente.
    expect(categoryRequests).toHaveLength(1);
    pending.forEach((req) =>
      req.flush(
        req.request.url.includes('/categories')
          ? { items: [], total: 0, page: 1, size: 100, pages: 0 }
          : { items: [PRODUCT], total: 1, page: 1, size: 20, pages: 1 },
      ),
    );
  });
});

describe('ProductsPageComponent — sincronizador de disponibilidad (spec 148, T039/T043)', () => {
  it('un cambio manual de una fila visible llama a refreshOne', async () => {
    const { fixture } = await crear(UserRole.ADMIN);
    const productService = fixture.debugElement.injector.get(ProductService);
    const spy = vi.spyOn(productService, 'refreshOne').mockResolvedValue(undefined);

    fixture.componentInstance.applyAvailability([
      { kind: 'product', id: 'p1', sold_out: true, available: false },
    ]);

    expect(spy).toHaveBeenCalledWith('p1');
  });

  it('un cambio manual de una fila fuera de la página no hace nada', async () => {
    const { fixture } = await crear(UserRole.ADMIN);
    const productService = fixture.debugElement.injector.get(ProductService);
    const spy = vi.spyOn(productService, 'refreshOne').mockResolvedValue(undefined);

    fixture.componentInstance.applyAvailability([
      { kind: 'product', id: 'no-esta-en-la-pagina', sold_out: true, available: false },
    ]);

    expect(spy).not.toHaveBeenCalled();
  });

  it('un cambio solo de inventario (sin diferencia en sold_out) no toca el interruptor', async () => {
    const { fixture } = await crear(UserRole.ADMIN);
    const productService = fixture.debugElement.injector.get(ProductService);
    const spy = vi.spyOn(productService, 'refreshOne').mockResolvedValue(undefined);

    // row.available=true -> !row.available=false; el cambio trae sold_out:false (igual) con
    // un `available` derivado distinto: no es un cambio de la marca manual.
    fixture.componentInstance.applyAvailability([
      { kind: 'product', id: 'p1', sold_out: false, available: false },
    ]);

    expect(spy).not.toHaveBeenCalled();
  });

  it('un snapshot recarga la página actual', async () => {
    const { fixture } = await crear(UserRole.ADMIN);
    const productService = fixture.debugElement.injector.get(ProductService);
    const spy = vi.spyOn(productService, 'loadProducts');

    fixture.componentInstance.applyAvailabilitySnapshot({
      as_of: 1,
      products: [],
      variants: [],
      options: [],
    });

    expect(spy).toHaveBeenCalledWith(productService.page(), productService.size());
  });
});

describe('ProductsPageComponent — encabezado responsive con acciones colapsables (spec 152)', () => {
  it('"Exportar carta"/"Importar Excel" del encabezado están ocultas en móvil (hidden sm:flex)', async () => {
    const { el } = await crear(UserRole.ADMIN);
    const headerButtons = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Exportar carta') || b.textContent?.includes('Importar Excel'),
    );
    // Ambas viven ahora dos veces: una oculta en móvil dentro del encabezado
    // (`hidden sm:flex`) y otra al final del panel de filtros (`sm:hidden`).
    const headerCopy = headerButtons.find((b) => b.classList.contains('hidden'));
    expect(headerCopy).toBeDefined();
    expect(headerCopy?.classList.contains('sm:flex')).toBe(true);
  });

  it('"Exportar carta"/"Importar Excel" aparecen al final del panel de filtros, solo para Admin', async () => {
    const { el, fixture } = await crear(UserRole.ADMIN);
    const panel = el.querySelector('#filters-panel') as HTMLElement;
    const toggle = el.querySelector('[aria-controls="filters-panel"]') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    expect(panel.textContent).toContain('Exportar carta');
    expect(panel.textContent).toContain('Importar Excel');
  });

  it('Cajero no ve "Exportar carta" ni "Importar Excel" en el panel de filtros', async () => {
    const { el, fixture } = await crear(UserRole.CASHIER);
    const toggle = el.querySelector('[aria-controls="filters-panel"]') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    const panel = el.querySelector('#filters-panel') as HTMLElement;

    expect(panel.textContent).not.toContain('Exportar carta');
    expect(panel.textContent).not.toContain('Importar Excel');
  });

  it('los filtros empiezan colapsados y el toggle de "Filtros" los muestra/oculta', async () => {
    const { el, fixture } = await crear(UserRole.ADMIN);
    const panel = el.querySelector('#filters-panel') as HTMLElement;
    const toggle = el.querySelector('[aria-controls="filters-panel"]') as HTMLButtonElement;

    expect(panel.classList.contains('hidden')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();

    expect(panel.classList.contains('hidden')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.querySelector('#f-search')).not.toBeNull();
  });

  it('cada input de filtro ocupa el 100% del ancho en móvil (w-full)', async () => {
    const { el } = await crear(UserRole.ADMIN);
    for (const id of ['f-search', 'f-status', 'f-availability', 'f-category']) {
      const control = el.querySelector(`#${id}`) as HTMLElement;
      expect(control.className).toContain('w-full');
    }
  });
});

describe('ProductsPageComponent — tarjetas móvil/tablet y tabla de escritorio (spec 152, US1)', () => {
  it('renderiza las tarjetas (ocultas en escritorio) y la tabla (oculta en móvil) con los mismos datos, sin remontar el componente', async () => {
    const { el } = await crear(UserRole.ADMIN);

    // La cuadrícula de tarjetas usa `lg:hidden` (CSS) -- mismo `productService.products()`
    // que alimenta la tabla, sin un segundo fetch ni un componente aparte por breakpoint.
    const cardGrid = el.querySelector('.lg\\:hidden');
    expect(cardGrid).not.toBeNull();
    const card = cardGrid?.querySelector('app-product-list-card');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Fresa boom');

    // La tabla usa `hidden lg:block` -- sigue intacta (FR-002), con las mismas filas.
    const tableWrapper = el.querySelector('.hidden.lg\\:block');
    expect(tableWrapper).not.toBeNull();
    const table = tableWrapper?.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain('Fresa boom');
  });

  it('la tabla agrega las columnas Precio, Creación y Actualización (FR-002/FR-009)', async () => {
    const { el } = await crear(UserRole.ADMIN);
    const headers = Array.from(el.querySelectorAll('table thead th')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headers).toEqual(
      expect.arrayContaining(['Precio', 'Creación', 'Actualización']),
    );
  });
});
