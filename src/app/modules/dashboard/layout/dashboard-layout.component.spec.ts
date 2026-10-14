import { TestBed } from '@angular/core/testing';
import { Component, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { OverlayContainer } from '@angular/cdk/overlay';
import { vi } from 'vitest';
import { NavigationTransitionService } from './navigation-transition.service';
import { DashboardLayoutComponent } from './dashboard-layout.component';
import { LayoutService } from './layout.service';
import { PanelThemeService } from './panel-theme.service';
import { SidebarComponent } from './sidebar.component';
import { HeaderComponent } from './header.component';
import { TenantSidebarComponent } from './tenant-sidebar.component';
import { TenantHeaderComponent } from './tenant-header.component';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { CashService } from '../../cash-register/services/cash.service';
import { NotificationCenterService } from '../../../core/notifications/notification-center.service';
import { PushRegistrationService } from '../../../core/notifications/push-registration.service';
import { ToastContainerComponent } from '../../../shared/feedback/toast-container.component';
import { ConfirmDialogComponent } from '../../../shared/feedback/confirm-dialog.component';

@Component({ selector: 'app-blank', standalone: true, template: '' })
class BlankComponent {}

/** spec 077 sumó `AuthService → PushRegistrationService → SwPush` al árbol de
 *  inyección del shell; este TestBed no proveía `SwPush` y quedó en `NG0201`.
 *  Ningún test de aquí ejercita push (spec 078, stub local). */
const swPushStub = { provide: SwPush, useValue: { isEnabled: false } };

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

/**
 * Spec 036 (FR-012): `sidebarOpen()` ahora también controla el panel de
 * escritorio, no solo el slide-over móvil. El auto-cierre en cada
 * navegación (ya existente, pensado para ocultar el slide-over tras
 * navegar en móvil) antes se ejecutaba sin condición y colapsaba el
 * sidebar de escritorio en cuanto el usuario cambiaba de página, perdiendo
 * su elección — el bug reportado tras el despliegue de esta feature.
 *
 * No se llama `fixture.detectChanges()` a propósito: la suscripción a
 * `Router.events` vive en el constructor (corre al crear el componente,
 * sin falta de render), y evita tener que montar `<app-sidebar>`/
 * `<app-header>` completos con sus propias dependencias (AuthService,
 * TenantInfoService, etc.), ajenas a lo que prueba este bloque.
 */
describe('DashboardLayoutComponent — auto-cierre del sidebar solo en móvil (spec 036)', () => {
  let layoutService: LayoutService;
  let router: Router;
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideRouter([{ path: 'otra', component: BlankComponent }]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    TestBed.createComponent(DashboardLayoutComponent);
    layoutService = TestBed.inject(LayoutService);
    router = TestBed.inject(Router);
  });

  afterEach(() => setViewportWidth(originalInnerWidth));

  it('en escritorio, navegar a otra página NO cierra el sidebar', async () => {
    setViewportWidth(1280);
    layoutService.open();

    await router.navigateByUrl('/otra');

    expect(layoutService.sidebarOpen()).toBe(true);
  });

  it('en móvil, navegar a otra página sí cierra el slide-over (comportamiento ya existente)', async () => {
    setViewportWidth(375);
    layoutService.open();

    await router.navigateByUrl('/otra');

    expect(layoutService.sidebarOpen()).toBe(false);
  });

  // ── spec 078 (US6): umbral md (768) → lg (1024) — el menú se colapsa en tablet ──

  it('en tablet (~900px), navegar a otra página cierra el menú (nuevo — antes se mantenía fijo)', async () => {
    setViewportWidth(900);
    layoutService.open();

    await router.navigateByUrl('/otra');

    expect(layoutService.sidebarOpen()).toBe(false);
  });

  it('justo por debajo de 1024px auto-cierra; en 1024px o más, no', async () => {
    setViewportWidth(1023);
    layoutService.open();
    await router.navigateByUrl('/otra');
    expect(layoutService.sidebarOpen()).toBe(false);

    setViewportWidth(1024);
    layoutService.open();
    await router.navigateByUrl('/');
    expect(layoutService.sidebarOpen()).toBe(true);
  });
});

/**
 * spec 078 (US6, FR-031–FR-036; research.md D7): el valor inicial de
 * `sidebarOpen` depende del viewport contra el umbral `lg` (1024), no `md`
 * (768). Se necesita un TestBed nuevo por ancho para que el `signal` de
 * `LayoutService` (que lee `window.innerWidth` al construirse) tome el valor.
 */
describe('LayoutService — valor inicial de sidebarOpen por ancho (spec 078, US6)', () => {
  const originalInnerWidth = window.innerWidth;
  afterEach(() => setViewportWidth(originalInnerWidth));

  function freshLayoutService(width: number): LayoutService {
    setViewportWidth(width);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(LayoutService);
  }

  it('en móvil (375px) arranca cerrado', () => {
    expect(freshLayoutService(375).sidebarOpen()).toBe(false);
  });

  it('en tablet (900px) arranca cerrado (antes, con umbral md, arrancaba abierto)', () => {
    expect(freshLayoutService(900).sidebarOpen()).toBe(false);
  });

  it('en el límite 1023px arranca cerrado; en 1024px arranca abierto', () => {
    expect(freshLayoutService(1023).sidebarOpen()).toBe(false);
    expect(freshLayoutService(1024).sidebarOpen()).toBe(true);
  });

  it('en escritorio (1280px) arranca abierto — sin cambio', () => {
    expect(freshLayoutService(1280).sidebarOpen()).toBe(true);
  });
});

// Nota (spec 078, US6): el cambio de clases `md:hidden`→`lg:hidden` (backdrop) y
// `md:ml-64`→`lg:ml-64` (margen del contenido) en `dashboard-layout.component.ts`
// es un swap estático de prefijo de breakpoint. Montar el shell completo en un
// TestBed para afirmarlo exige `TenantContextService`/`AuthService`/… (el mismo
// motivo por el que el bloque de arriba evita `detectChanges()`), así que se
// verifica por lectura de código + el recorrido responsive de quickstart.md
// (Historia 6). El comportamiento observable — cuándo el menú arranca oculto y
// cuándo auto-cierra — sí queda cubierto por los tests de este archivo.


/**
 * spec 089 (Historia 5, FR-022/FR-024): el reporte de cierre de caja se imprimía en blanco. Causa
 * reproducida con Chrome real (`Page.printToPDF`, medio `print`): al paginar a ~816 px el telón del menú
 * móvil (`fixed inset-0 z-30 lg:hidden`) dejaba de estar oculto y se pintaba ENCIMA del reporte en cada
 * hoja; además el shell (`h-screen overflow-hidden`) no dejaba paginar. Ninguna prueba unitaria ejecuta
 * la impresión real (eso se verifica en la vista previa del navegador): estas comprueban que las clases
 * y las reglas de la corrección siguen en su sitio. Los hijos (sidebar, header…) se sustituyen por
 * elementos vacíos: aquí solo importa el shell.
 */
describe('DashboardLayoutComponent — impresión del reporte de caja (spec 089, Historia 5)', () => {
  const estilos = (): string =>
    (
      (DashboardLayoutComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles ?? []
    ).join('\n');

  function render(): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        // spec 116: este bloque solo verifica el CSS de impresión del shell
        // de Super Admin (legado) -- sin este doble, `isSuperAdmin()` (real
        // AuthService, sin sesión) resolvería `false` y montaría los
        // componentes nuevos de tenant, que no son el objeto de esta prueba.
        { provide: AuthService, useValue: { currentUser: () => ({ isSuperAdmin: true }) } },
      ],
    });
    TestBed.overrideComponent(DashboardLayoutComponent, {
      remove: {
        imports: [
          SidebarComponent,
          HeaderComponent,
          TenantSidebarComponent,
          TenantHeaderComponent,
          ToastContainerComponent,
          ConfirmDialogComponent,
        ],
      },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    TestBed.inject(LayoutService).open();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('el telón del menú móvil nunca se imprime (print:hidden), aunque el menú esté abierto', () => {
    const backdrop = render().querySelector('div.fixed.inset-0') as HTMLElement | null;
    expect(backdrop).not.toBeNull();
    expect(backdrop!.className).toContain('print:hidden');
  });

  it('los tres contenedores del shell tienen las clases que la impresión libera', () => {
    const el = render();
    expect(el.querySelector('.shell-root')).not.toBeNull();
    expect(el.querySelector('.shell-content')).not.toBeNull();
    expect(el.querySelector('main.shell-main')).not.toBeNull();
  });

  it('en impresión, y solo con body.printing-cash-report, el shell se libera (altura, overflow, margen)', () => {
    const css = estilos();
    expect(css).toContain('@media print');
    for (const cls of ['.shell-root', '.shell-content', '.shell-main']) {
      expect(css).toMatch(new RegExp(`printing-cash-report[^{}]*${cls.replace('.', '\\.')}`));
    }
    expect(css).toMatch(/height:\s*auto/);
    expect(css).toMatch(/overflow:\s*visible/);
    expect(css).toMatch(/margin-left:\s*0/);
    expect(css).toMatch(/position:\s*static/);
  });

  it('sigue ocultando sidebar y header solo durante esa impresión (spec 087)', () => {
    const css = estilos();
    expect(css).toMatch(/printing-cash-report[^{}]*app-sidebar/);
    expect(css).toMatch(/printing-cash-report[^{}]*app-header/);
  });

  // spec 116: quien cierra turno e imprime el reporte desde el panel de
  // tenant (ADMIN/CASHIER) necesita el mismo tratamiento de impresión.
  it('también oculta app-tenant-sidebar/app-tenant-header durante esa impresión (spec 116)', () => {
    const css = estilos();
    expect(css).toMatch(/printing-cash-report[^{}]*app-tenant-sidebar/);
    expect(css).toMatch(/printing-cash-report[^{}]*app-tenant-header/);
  });
});

/**
 * spec 116 (T021, contracts/tenant-layout-contract.md §1): la única
 * bifurcación del shell compartido -- Super Admin sigue montando
 * `app-sidebar`/`app-header` sin ningún cambio; el resto (Administrador,
 * Cajero, Mesero) monta los componentes nuevos.
 */
describe('DashboardLayoutComponent — bifurcación Super Admin vs. tenant (spec 116, research.md R1)', () => {
  function render(isSuperAdmin: boolean): HTMLElement {
    const currentUser = signal({
      id: 'u1',
      email: 'a@b.c',
      role: isSuperAdmin ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
      tenantId: isSuperAdmin ? null : 1,
      isSuperAdmin,
      mustChangePassword: false,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser, logout: vi.fn() } },
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
        { provide: PlanSummaryService, useValue: { summary: signal(null) } },
        {
          provide: CashService,
          useValue: { shift: signal(null), isOpen: () => false, discoverOpenShift: vi.fn() },
        },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(0), list: signal([]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('un usuario no-super-admin monta app-tenant-sidebar/app-tenant-header (y no app-sidebar/app-header)', () => {
    const el = render(false);
    expect(el.querySelector('app-tenant-sidebar')).not.toBeNull();
    expect(el.querySelector('app-tenant-header')).not.toBeNull();
    expect(el.querySelector('app-sidebar')).toBeNull();
    expect(el.querySelector('app-header')).toBeNull();
  });

  it('un super admin sigue montando app-sidebar/app-header sin ningún cambio (prueba negativa, research.md R1)', () => {
    const el = render(true);
    expect(el.querySelector('app-sidebar')).not.toBeNull();
    expect(el.querySelector('app-header')).not.toBeNull();
    expect(el.querySelector('app-tenant-sidebar')).toBeNull();
    expect(el.querySelector('app-tenant-header')).toBeNull();
  });

  it('solo el shell de tenant lleva la clase .panel-theme; Super Admin nunca la recibe (FR-009, FR-010)', () => {
    const tenantRoot = render(false).querySelector('.shell-root')!;
    expect(tenantRoot.classList.contains('panel-theme')).toBe(true);

    const superAdminRoot = render(true).querySelector('.shell-root')!;
    expect(superAdminRoot.classList.contains('panel-theme')).toBe(false);
    expect(superAdminRoot.getAttribute('data-theme')).toBeNull();
  });
});

/**
 * spec 116 (T024, contracts/panel-theme-contract.md §1/§3): alternar el tema
 * actualiza `data-theme` en la raíz del shell; Super Admin nunca ve el
 * interruptor ni la clase `.panel-theme` (research.md R1).
 */
describe('DashboardLayoutComponent — tema claro/oscuro (spec 116, T024)', () => {
  function render(isSuperAdmin: boolean) {
    const currentUser = signal({
      id: 'u1',
      email: 'a@b.c',
      role: isSuperAdmin ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
      tenantId: isSuperAdmin ? null : 1,
      isSuperAdmin,
      mustChangePassword: false,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser, logout: vi.fn() } },
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
        { provide: PlanSummaryService, useValue: { summary: signal(null) } },
        {
          provide: CashService,
          useValue: { shift: signal(null), isOpen: () => false, discoverOpenShift: vi.fn() },
        },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(0), list: signal([]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('alternar el tema actualiza data-theme en la raíz y cambia el ícono del botón (moon↔sun)', () => {
    const fixture = render(false);
    const panelTheme = TestBed.inject(PanelThemeService);
    panelTheme.setTheme('light');
    fixture.detectChanges();

    const root = (fixture.nativeElement as HTMLElement).querySelector('.shell-root')!;
    expect(root.getAttribute('data-theme')).toBe('light');

    panelTheme.toggleTheme();
    fixture.detectChanges();

    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('un super admin nunca recibe la clase .panel-theme ni ve el interruptor de tema', () => {
    const fixture = render(true);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.shell-root')!.classList.contains('panel-theme')).toBe(false);
    expect(el.querySelector('app-tenant-header')).toBeNull();
  });
});

/**
 * spec 116 (T050, research.md R18; contracts/panel-theme-contract.md §9): el
 * `cdk-overlay-container` es compartido por toda la app (un nodo hijo de
 * `<body>`, fuera del subárbol de `.panel-theme`) -- sin esta sincronización,
 * el único `cdkConnectedOverlay` del panel de tenant (Promociones) quedaría
 * congelado en paleta clara aunque el resto del panel esté en oscuro.
 */
describe('DashboardLayoutComponent — sincronización del cdk-overlay-container (spec 116, T050)', () => {
  function render(isSuperAdmin: boolean) {
    const currentUser = signal({
      id: 'u1',
      email: 'a@b.c',
      role: isSuperAdmin ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
      tenantId: isSuperAdmin ? null : 1,
      isSuperAdmin,
      mustChangePassword: false,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser, logout: vi.fn() } },
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
        { provide: PlanSummaryService, useValue: { summary: signal(null) } },
        {
          provide: CashService,
          useValue: { shift: signal(null), isOpen: () => false, discoverOpenShift: vi.fn() },
        },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(0), list: signal([]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('un usuario de tenant repinta el contenedor compartido de CDK Overlay con el tema activo', () => {
    const fixture = render(false);
    const panelTheme = TestBed.inject(PanelThemeService);
    const overlayEl = TestBed.inject(OverlayContainer).getContainerElement();

    panelTheme.setTheme('light');
    fixture.detectChanges();
    expect(overlayEl.classList.contains('panel-theme')).toBe(true);
    expect(overlayEl.getAttribute('data-theme')).toBe('light');

    panelTheme.toggleTheme();
    fixture.detectChanges();
    expect(overlayEl.getAttribute('data-theme')).toBe('dark');
  });

  it('un super admin nunca repinta el contenedor compartido de CDK Overlay', () => {
    render(true);
    const overlayEl = TestBed.inject(OverlayContainer).getContainerElement();

    expect(overlayEl.classList.contains('panel-theme')).toBe(false);
    expect(overlayEl.getAttribute('data-theme')).toBeNull();
  });
});

/**
 * spec 116 (T065; contracts/navigation-transition-contract.md §1, §6): la
 * barra/skeleton de transición de navegación se muestran y ocultan según
 * `NavigationTransitionService.phase()`, y un super admin nunca monta el
 * contenedor (`.nav-transition`) -- research.md R1/R20.
 */
describe('DashboardLayoutComponent — barra de carga y skeleton de navegación (spec 116, T065)', () => {
  function render(isSuperAdmin: boolean, transitionServiceStub?: unknown) {
    const currentUser = signal({
      id: 'u1',
      email: 'a@b.c',
      role: isSuperAdmin ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
      tenantId: isSuperAdmin ? null : 1,
      isSuperAdmin,
      mustChangePassword: false,
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [
        provideRouter([]),
        swPushStub,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser, logout: vi.fn() } },
        { provide: TenantInfoService, useValue: { businessName: () => 'Heladería', logoUrl: () => null } },
        { provide: PlanSummaryService, useValue: { summary: signal(null) } },
        {
          provide: CashService,
          useValue: { shift: signal(null), isOpen: () => false, discoverOpenShift: vi.fn() },
        },
        {
          provide: NotificationCenterService,
          useValue: { pendingCount: signal(0), list: signal([]), attend: vi.fn() },
        },
        { provide: PushRegistrationService, useValue: { supported: false, register: vi.fn() } },
        ...(transitionServiceStub
          ? [{ provide: NavigationTransitionService, useValue: transitionServiceStub }]
          : []),
      ],
    });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('un super admin nunca monta el contenedor de transición de navegación', () => {
    const fixture = render(true);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.nav-transition')).toBeNull();
    expect(el.querySelector('.nav-transition-bar')).toBeNull();
  });

  it('un usuario de tenant monta el contenedor, y su data-phase refleja la fase del servicio', () => {
    // Doble de escritura libre (el servicio real expone signals de solo
    // lectura) -- aquí solo se verifica el enlace de la plantilla, no el
    // cronómetro interno del servicio (ya cubierto en
    // navigation-transition.service.spec.ts, T061).
    const phase = signal<'idle' | 'out' | 'skeleton' | 'in'>('idle');
    const barVisible = signal(false);
    const barProgress = signal<0 | 75 | 100>(0);
    const fixture = render(false, { phase, barVisible, barProgress });
    const el = fixture.nativeElement as HTMLElement;
    const container = el.querySelector('.nav-transition') as HTMLElement;
    const bar = el.querySelector('.nav-transition-bar') as HTMLElement;
    expect(container).not.toBeNull();
    expect(bar).not.toBeNull();

    phase.set('skeleton');
    barVisible.set(true);
    barProgress.set(75);
    fixture.detectChanges();

    expect(container.getAttribute('data-phase')).toBe('skeleton');
    expect(bar.classList.contains('nav-transition-bar--visible')).toBe(true);
    expect(bar.style.width).toBe('75%');
    expect(el.querySelector('.nav-skeleton')).not.toBeNull();

    phase.set('in');
    fixture.detectChanges();
    expect(container.getAttribute('data-phase')).toBe('in');
  });
});
