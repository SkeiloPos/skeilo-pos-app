import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SidebarComponent } from './sidebar.component';
import { LayoutService } from './layout.service';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserRole } from '../../../core/interfaces/user.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';

function makeUser(partial: Partial<User>): User {
  return {
    id: 'u1',
    email: 'a@b.c',
    role: UserRole.ADMIN,
    tenantId: 1,
    isSuperAdmin: false,
    mustChangePassword: false,
    ...partial,
  };
}

function makeSummary(partial: Partial<PlanSummary>): PlanSummary {
  return {
    plan_name: 'Pro',
    ciclo_facturacion: 'mensual',
    plan_vence_en: null,
    vencido: false,
    resources: {},
    modules: { inventario: true, promociones: true, cocina: false },
    ...partial,
  };
}

describe('SidebarComponent.visibleItems', () => {
  const currentUser = signal<User | null>(null);
  const planSummary = signal<PlanSummary | null>(null);

  function createComponent(): SidebarComponent {
    TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        // El sidebar inyecta TenantInfoService (solo lee sus señales, no pide nada).
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser } },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
      ],
    });
    return TestBed.createComponent(SidebarComponent).componentInstance;
  }

  it('shows super admin navigation when the user is a super admin', () => {
    currentUser.set(makeUser({ isSuperAdmin: true, role: UserRole.SUPER_ADMIN, tenantId: null }));
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes).toEqual([
      '/super-admin/tenants',
      '/super-admin/users',
      '/super-admin/payment-methods-catalog',
      '/super-admin/plans',
    ]);
    expect(sidebar.isSuperAdmin()).toBe(true);
  });

  it('shows role-based POS navigation for a tenant user (no super admin items)', () => {
    currentUser.set(makeUser({ isSuperAdmin: false, role: UserRole.CASHIER }));
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes.every((r) => !r.startsWith('/super-admin'))).toBe(true);
    expect(routes).toContain('/dashboard/caja');
    expect(sidebar.isSuperAdmin()).toBe(false);
  });

  it('shows nothing when there is no authenticated user', () => {
    currentUser.set(null);
    const sidebar = createComponent();
    expect(sidebar.visibleItems()).toEqual([]);
  });

  // Spec 033 (Historias 4/5): un ítem con `moduleKey` (Inventario, Promociones)
  // no debe aparecer en el sidebar si el plan vigente del tenant no lo incluye,
  // ni si el tenant está vencido — mismo criterio que `plan-module.guard.ts`,
  // que ya bloquea el acceso directo por URL a esas mismas rutas.
  it('hides module-gated items the plan does not include', () => {
    currentUser.set(makeUser({ isSuperAdmin: false, role: UserRole.ADMIN }));
    planSummary.set(makeSummary({ modules: { inventario: false, promociones: true, cocina: false } }));
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes).not.toContain('/dashboard/inventario');
    expect(routes).not.toContain('/dashboard/proveedores'); // spec 141: Proveedores es parte del módulo Inventario
    expect(routes).toContain('/dashboard/promotions');
  });

  it('shows module-gated items the plan does include', () => {
    currentUser.set(makeUser({ isSuperAdmin: false, role: UserRole.ADMIN }));
    planSummary.set(makeSummary({ modules: { inventario: true, promociones: true, cocina: false } }));
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes).toContain('/dashboard/inventario');
    expect(routes).toContain('/dashboard/proveedores');
  });

  it('hides all module-gated items when the tenant is vencido, regardless of module flags', () => {
    currentUser.set(makeUser({ isSuperAdmin: false, role: UserRole.ADMIN }));
    planSummary.set(makeSummary({ vencido: true, modules: { inventario: true, promociones: true, cocina: false } }));
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes).not.toContain('/dashboard/inventario');
    expect(routes).not.toContain('/dashboard/proveedores');
    expect(routes).not.toContain('/dashboard/promotions');
  });

  it('fails open (keeps items visible) while the plan summary has not loaded yet', () => {
    currentUser.set(makeUser({ isSuperAdmin: false, role: UserRole.ADMIN }));
    planSummary.set(null);
    const sidebar = createComponent();

    const routes = sidebar.visibleItems().map((i) => i.route);
    expect(routes).toContain('/dashboard/inventario');
    expect(routes).toContain('/dashboard/proveedores');
  });

  it('does not apply plan gating to super admin navigation', () => {
    currentUser.set(makeUser({ isSuperAdmin: true, role: UserRole.SUPER_ADMIN, tenantId: null }));
    planSummary.set(makeSummary({ modules: { inventario: false, promociones: false, cocina: false } }));
    const sidebar = createComponent();

    expect(sidebar.visibleItems().map((i) => i.route)).toEqual([
      '/super-admin/tenants',
      '/super-admin/users',
      '/super-admin/payment-methods-catalog',
      '/super-admin/plans',
    ]);
  });
});

/**
 * Spec 036 (FR-012): `sidebarOpen()` ahora también controla la visibilidad
 * del `<aside>` en escritorio — antes `md:relative md:translate-x-0` era
 * incondicional y el componente lo ignoraba ahí (solo importaba en el
 * slide-over móvil). No hay forma de simular el breakpoint `md` en jsdom
 * (no evalúa media queries), así que la prueba correcta es sobre las clases
 * reactivas (`-translate-x-full` / `translate-x-0`), que ahora son la
 * ÚNICA fuente de verdad de la visibilidad en cualquier tamaño de pantalla
 * — y confirmar que la clase `md:` incondicional que las anulaba en
 * escritorio ya no está.
 */
describe('SidebarComponent — clases de escritorio honran sidebarOpen() (spec 036)', () => {
  const currentUser = signal<User | null>(makeUser({ isSuperAdmin: false, role: UserRole.CASHIER }));
  let fixture: ComponentFixture<SidebarComponent>;
  let layoutService: LayoutService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser } },
        // Evita la cadena TenantInfoService → TenantContextService (necesita
        // provideTenantInitializer() al arranque real): este bloque solo
        // ejercita las clases reactivas del <aside>, no el branding.
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
      ],
    });
    fixture = TestBed.createComponent(SidebarComponent);
    layoutService = TestBed.inject(LayoutService);
  });

  const aside = (): HTMLElement => fixture.nativeElement.querySelector('aside') as HTMLElement;

  it('ya no fuerza "md:relative md:translate-x-0" de forma incondicional', () => {
    fixture.detectChanges();
    expect(aside().className).not.toContain('md:relative');
    expect(aside().className).not.toContain('md:translate-x-0');
  });

  it('sidebarOpen() en true → visible (translate-x-0), también en escritorio', () => {
    layoutService.sidebarOpen.set(true);
    fixture.detectChanges();

    expect(aside().classList.contains('translate-x-0')).toBe(true);
    expect(aside().classList.contains('-translate-x-full')).toBe(false);
  });

  it('sidebarOpen() en false → oculto (-translate-x-full), también en escritorio', () => {
    layoutService.sidebarOpen.set(false);
    fixture.detectChanges();

    expect(aside().classList.contains('-translate-x-full')).toBe(true);
    expect(aside().classList.contains('translate-x-0')).toBe(false);
  });
});

/**
 * Spec 082: ni la marca por defecto ni los ítems de navegación deben mostrar
 * ya un ícono SVG artesanal (`app-icon`) ni temática de heladería.
 */
describe('SidebarComponent — íconos estandarizados (spec 082)', () => {
  function crear(isSuperAdmin: boolean) {
    const currentUser = signal<User | null>(makeUser({ isSuperAdmin, role: UserRole.ADMIN }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser } },
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ningún ícono se renderiza ya como SVG artesanal (app-icon)', () => {
    const el = crear(false);
    expect(el.querySelector('svg')).toBeNull();
  });

  it('la marca por defecto de un tenant regular usa un ícono neutro, no el cono de helado', () => {
    const el = crear(false);
    expect(el.textContent).not.toContain('🍦');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('storefront');
  });

  it('la marca de super-admin usa el ícono neutro correspondiente', () => {
    const el = crear(true);
    expect(el.textContent).not.toContain('🛡️');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('admin_panel_settings');
  });

  it('los ítems de navegación renderizan su ícono con el nuevo componente', () => {
    const el = crear(false);
    const ligaduras = Array.from(el.querySelectorAll('nav app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    // Dashboard/Ventas/Reportes/Órdenes/Terminal de mesas/Caja/Usuarios/Ajustes visibles para ADMIN.
    // "point_of_sale" aparece dos veces (Ventas y Terminal de mesas) — basta con
    // que la lista lo contenga una vez para esta aserción.
    expect(ligaduras).toEqual(
      expect.arrayContaining([
        'dashboard',
        'point_of_sale',
        'assessment',
        'receipt_long',
        'payments',
        'group',
        'settings',
      ]),
    );
  });

  it('el ícono de "Terminal de mesas" coincide con el del acceso rápido del dashboard para la misma ruta (regresión)', () => {
    // NAV_ITEMS usa el nombre semántico heredado "sessions"; el acceso rápido
    // del dashboard (admin-dashboard.component.ts) usa el nombre nuevo
    // "point_of_sale" directamente. Antes resolvían a ligaduras distintas
    // (event_seat vs. restaurant) para la misma ruta — este test falla si
    // alguno de los dos vuelve a desalinearse.
    const el = crear(false);
    const link = Array.from(el.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/dashboard/mesas-sesiones',
    )!;
    const icon = link.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('point_of_sale');
  });
});
