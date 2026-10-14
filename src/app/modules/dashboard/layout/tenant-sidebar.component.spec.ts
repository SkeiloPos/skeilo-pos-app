import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import { TenantSidebarComponent } from './tenant-sidebar.component';
import { LayoutService } from './layout.service';
import { AuthService } from '../../../core/services/auth.service';
import { User, UserRole } from '../../../core/interfaces/user.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { PlanSummary } from '../../plan/interfaces/plan-summary.interface';

const DESKTOP_BREAKPOINT_PX = 1024;

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
    modules: { inventario: true, compras: true, promociones: true },
    ...partial,
  };
}

/**
 * Mock controlable de `matchMedia` para el punto de quiebre de
 * `BreakpointObserver` (`(min-width: 1024px)`) — jsdom no evalúa media
 * queries de verdad. Expone `setWidth()` para simular el cruce del punto de
 * quiebre en vivo (quickstart.md §5.3) disparando el mismo evento de cambio
 * que el navegador real.
 */
function installMatchMedia(initialWidth: number): { setWidth: (w: number) => void } {
  let width = initialWidth;
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const matches = () => width >= DESKTOP_BREAKPOINT_PX;
  const mql = {
    get matches() {
      return matches();
    },
    media: `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
      listeners.delete(cb),
    addListener: (cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeListener: (cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  return {
    setWidth(w: number) {
      width = w;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
      const value = matches();
      listeners.forEach((cb) => cb({ matches: value }));
    },
  };
}

@Component({ selector: 'app-blank', standalone: true, template: '' })
class BlankComponent {}

describe('TenantSidebarComponent (spec 116)', () => {
  const currentUser = signal<User | null>(null);
  const planSummary = signal<PlanSummary | null>(null);
  let fixture: ComponentFixture<TenantSidebarComponent>;
  let layoutService: LayoutService;

  function createComponent(initialWidth = 1280): ReturnType<typeof installMatchMedia> {
    const media = installMatchMedia(initialWidth);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TenantSidebarComponent],
      providers: [
        provideRouter([
          { path: 'dashboard/inventario', component: BlankComponent },
          { path: 'dashboard/inventario/editar/:id', component: BlankComponent },
          { path: 'dashboard/caja', component: BlankComponent },
          { path: 'dashboard/orders', component: BlankComponent },
          { path: 'dashboard/mesas', component: BlankComponent },
          { path: 'dashboard/mesas-sesiones', component: BlankComponent },
        ]),
        { provide: AuthService, useValue: { currentUser } },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
      ],
    });
    fixture = TestBed.createComponent(TenantSidebarComponent);
    layoutService = TestBed.inject(LayoutService);
    fixture.detectChanges();
    return media;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    currentUser.set(null);
    planSummary.set(null);
    // `desktopCollapsed`/`sidebarOpen` persisten en el `localStorage` real de
    // jsdom entre tests (mismo patrón defensivo que `PanelThemeService`) —
    // sin esto, un `toggleDesktopCollapsed()` de un test se filtra al
    // siguiente, que esperaría arrancar expandido.
    localStorage.removeItem('pos.panel.sidebar_collapsed');
  });

  // ── Historia 1 — acceso por rol/plan reutilizado (data-model.md §5) ─────

  it('ADMIN ve exactamente los grupos/ítems que navigation.config.ts le permite hoy', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent();

    const routes = fixture.componentInstance.visibleItems().map((i) => i.route);
    expect(routes).toContain('/dashboard/caja');
    expect(routes).toContain('/dashboard/inventario');
    expect(routes).toContain('/dashboard/users');
  });

  it('CASHIER ve exactamente los grupos/ítems que navigation.config.ts le permite hoy', () => {
    currentUser.set(makeUser({ role: UserRole.CASHIER }));
    createComponent();

    const routes = fixture.componentInstance.visibleItems().map((i) => i.route);
    expect(routes).toContain('/dashboard/caja');
    expect(routes).not.toContain('/dashboard/inventario'); // sin moduleKey para CASHIER de todos modos
    expect(routes).not.toContain('/dashboard/users');
  });

  it('MESERO ve exactamente los grupos/ítems que navigation.config.ts le permite hoy', () => {
    currentUser.set(makeUser({ role: UserRole.MESERO }));
    createComponent();

    const routes = fixture.componentInstance.visibleItems().map((i) => i.route);
    expect(routes).toEqual(['/dashboard/orders', '/dashboard/mesas-sesiones']);
  });

  it('un rol sin ítems en un grupo hace que ese grupo desaparezca, nunca vacío (FR-016)', () => {
    // MESERO solo tiene acceso a Órdenes/Terminal de Mesas (ambos del frame
    // "Operación") -- los otros 5 grupos del contrato no tienen ningún ítem
    // visible para este rol y no deben renderizarse como contenedores vacíos
    // (mismo filtro `.filter(g => g.items.length > 0)` que `SidebarComponent`
    // ya aplica hoy, data-model.md §5).
    currentUser.set(makeUser({ role: UserRole.MESERO }));
    createComponent();

    const groups = fixture.componentInstance.groupedItems();
    expect(groups.map((g) => g.title)).toEqual(['Operación']);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it('un plan sin "inventario" oculta solo el ítem gobernado por ese módulo (FR-016, ADMIN)', () => {
    // "Proveedores" comparte el frame "Inventario" con "Inventario" pero no
    // tiene `moduleKey` (navigation-grouping-contract.md) -- el grupo sigue
    // visible por ese ítem, solo el gobernado por el plan desaparece.
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    planSummary.set(makeSummary({ modules: { inventario: false, compras: true, promociones: true } }));
    createComponent();

    const routes = fixture.componentInstance.visibleItems().map((i) => i.route);
    expect(routes).not.toContain('/dashboard/inventario');
    expect(routes).toContain('/dashboard/proveedores');
  });

  it('el ítem de la ruta activa se resalta (FR-004)', async () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard/caja');
    fixture.detectChanges();

    const activeLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/dashboard/caja"]',
    )!;
    expect(activeLink.className).toContain('var(--panel-color-primary-soft)');
  });

  it('resalta el ítem padre en una subvista sin ítem propio en el Sidebar (FR-004)', async () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard/inventario/editar/5');
    fixture.detectChanges();

    const activeLink = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/dashboard/inventario"]',
    )!;
    expect(activeLink.className).toContain('var(--panel-color-primary-soft)');
  });

  it('no confunde módulos cuyas rutas comparten prefijo de texto (FR-004)', async () => {
    // "/dashboard/mesas-sesiones" no es una subvista de "/dashboard/mesas" --
    // la coincidencia por segmento de Angular (exact: false) no debe resaltar
    // "Mesas" cuando la ruta activa es en realidad "Terminal de Mesas".
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard/mesas-sesiones');
    fixture.detectChanges();

    const mesas = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/dashboard/mesas"]',
    )!;
    const sesiones = (fixture.nativeElement as HTMLElement).querySelector(
      'a[href="/dashboard/mesas-sesiones"]',
    )!;
    expect(mesas.className).not.toContain('var(--panel-color-primary-soft)');
    expect(sesiones.className).toContain('var(--panel-color-primary-soft)');
  });

  // research.md R15 (revierte R13 para este punto): Layout base.dc.html
  // vuelve a ser la fuente de verdad -- el botón de colapso ya NO vive en el
  // propio sidebar, se reubica en app-tenant-header como un único control
  // siempre visible (ver tenant-header.component.spec.ts, T059).
  it('no renderiza ningún botón de colapso, en ningún modo (se reubicó al navbar)', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));

    createComponent(1280);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'button[aria-label="Contraer menú"], button[aria-label="Expandir menú"]',
      ),
    ).toBeNull();

    createComponent(900);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'button[aria-label="Contraer menú"], button[aria-label="Expandir menú"]',
      ),
    ).toBeNull();
  });

  it('colapsar y expandir no navega ni cambia la ruta activa', async () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/dashboard/caja');

    layoutService.toggleDesktopCollapsed();
    fixture.detectChanges();

    expect(router.url).toBe('/dashboard/caja');
  });

  // research.md R7: el tooltip del ítem colapsado usa position: fixed,
  // calculado desde el rect del ítem en foco/hover -- no CSS :hover puro,
  // porque el <nav> con overflow-y: auto recorta el eje horizontal también
  // (regla "contradictory overflow" de CSS2.1), verificado con Chrome real.
  it('showTooltip() calcula la posición desde el rect del ítem y hideTooltip() la limpia', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent();
    layoutService.toggleDesktopCollapsed();
    fixture.detectChanges();

    const fakeRect = { top: 100, height: 40, right: 72 } as DOMRect;
    const target = { getBoundingClientRect: () => fakeRect } as unknown as HTMLElement;
    const event = { currentTarget: target } as unknown as MouseEvent;

    fixture.componentInstance.showTooltip(event, 'Ventas');
    expect(fixture.componentInstance.tooltip()).toEqual({ top: 120, left: 82, label: 'Ventas' });

    fixture.componentInstance.hideTooltip();
    expect(fixture.componentInstance.tooltip()).toBeNull();
  });

  it('el tooltip solo se renderiza cuando el sidebar está colapsado', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent();
    fixture.componentInstance.tooltip.set({ top: 10, left: 20, label: 'Ventas' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="tooltip"]')).toBeNull();

    layoutService.toggleDesktopCollapsed();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="tooltip"]')?.textContent?.trim()).toBe(
      'Ventas',
    );
  });

  it('un nombre de negocio largo se trunca sin romper el layout del encabezado', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    TestBed.resetTestingModule();
    const longName = 'Heladería y Postres La Esquina Dulce de Siempre Sabores del Barrio';
    TestBed.configureTestingModule({
      imports: [TenantSidebarComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser } },
        { provide: PlanSummaryService, useValue: { summary: planSummary } },
        {
          provide: TenantInfoService,
          useValue: { businessName: () => longName, logoUrl: () => null },
        },
      ],
    });
    installMatchMedia(1280);
    const f = TestBed.createComponent(TenantSidebarComponent);
    f.detectChanges();

    const h1 = (f.nativeElement as HTMLElement).querySelector('h1')!;
    expect(h1.textContent?.trim()).toBe(longName);
    expect(h1.className).toContain('truncate');
  });

  // ── Historia 3 — responsive (data-model.md §3; T028) ─────────────────────

  it('con un ancho simulado < 1024px, el sidebar inicia oculto y el scrim aparece al abrirlo', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent(900);

    expect(fixture.componentInstance.viewMode()).toBe('drawer');
    expect(fixture.componentInstance.isVisible()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('div.bg-black\\/40')).toBeNull();

    layoutService.open();
    fixture.detectChanges();

    expect(fixture.componentInstance.isVisible()).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('div.bg-black\\/40'),
    ).not.toBeNull();
  });

  it('seleccionar un ítem en modo drawer cierra el sidebar', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent(900);
    layoutService.open();
    fixture.detectChanges();

    fixture.componentInstance.onItemSelected();

    expect(layoutService.sidebarOpen()).toBe(false);
  });

  it('"tocar" el scrim cierra el sidebar', () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    createComponent(900);
    layoutService.open();
    fixture.detectChanges();

    const scrim = (fixture.nativeElement as HTMLElement).querySelector(
      'div.bg-black\\/40',
    ) as HTMLElement;
    scrim.click();

    expect(layoutService.sidebarOpen()).toBe(false);
  });

  // `BreakpointObserver.observe()` aplica `debounceTime(0)` a los cambios
  // posteriores al primer valor (CDK) -- hace falta ceder un macrotask real
  // para que el signal derivado (`toSignal`) reciba el nuevo valor.
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('alternar el ancho simulado 900→1200→900px sin recargar cambia entre modo drawer y desktop sin perder la ruta activa', async () => {
    currentUser.set(makeUser({ role: UserRole.ADMIN }));
    const media = createComponent(900);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/dashboard/caja');

    expect(fixture.componentInstance.viewMode()).toBe('drawer');

    media.setWidth(1200);
    await flush();
    fixture.detectChanges();
    expect(fixture.componentInstance.viewMode()).toBe('desktop');
    expect(router.url).toBe('/dashboard/caja');

    media.setWidth(900);
    await flush();
    fixture.detectChanges();
    expect(fixture.componentInstance.viewMode()).toBe('drawer');
    expect(router.url).toBe('/dashboard/caja');
  });
});
