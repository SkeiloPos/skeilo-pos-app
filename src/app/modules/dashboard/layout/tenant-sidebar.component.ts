import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { NAV_ITEMS } from '../../../core/config/navigation.config';
import { NavItem, TENANT_FRAME_GROUP_ORDER } from '../../../core/interfaces/navigation.interface';
import { IconComponent } from '../../../shared/icon/icon.component';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PlanSummaryService } from '../../plan/services/plan-summary.service';
import { LayoutService } from './layout.service';
import { PanelThemeService } from './panel-theme.service';

interface TenantNavGroup {
  title: (typeof TENANT_FRAME_GROUP_ORDER)[number];
  items: NavItem[];
}

const DESKTOP_BREAKPOINT_QUERY = '(min-width: 1024px)';
const DRAWER_WIDTH_PX = 256;
const DESKTOP_EXPANDED_WIDTH_PX = 248;
const DESKTOP_COLLAPSED_WIDTH_PX = 72;

/**
 * Sidebar rediseñado del panel de tenant (Administrador/Cajero/Mesero) — spec
 * 116. Reemplaza a `SidebarComponent` SOLO para estas identidades
 * (`DashboardLayoutComponent`, research.md R1); `SidebarComponent` sigue
 * siendo, sin ningún cambio, la implementación real para Super Admin.
 */
@Component({
  selector: 'app-tenant-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <!-- Scrim del drawer móvil/tablet (< 1024px) — mismo patrón que el
         backdrop de dashboard-layout.component.ts, replicado aquí para que
         este componente sea autosuficiente (contracts/tenant-layout-contract.md §2). -->
    @if (viewMode() === 'drawer' && layoutService.sidebarOpen()) {
      <div
        class="fixed inset-0 bg-black/40 z-30 lg:hidden print:hidden"
        (click)="layoutService.close()"
      ></div>
    }

    <aside
      class="fixed inset-y-0 left-0 z-40 flex flex-col shrink-0 h-full
             bg-[var(--panel-color-surface)] text-[var(--panel-color-text-secondary)]
             border-r border-[var(--panel-color-border)]
             transition-[translate,width] duration-200 ease-in-out"
      [class.-translate-x-full]="!isVisible()"
      [class.translate-x-0]="isVisible()"
      [style.width.px]="widthPx()"
    >
      <!-- Encabezado: logo + nombre del negocio (research.md R9: una sola
           línea, sin "sede"). El botón de colapso ya NO vive aquí -- research.md
           R15 revierte el ajuste de R13: Layout base.dc.html vuelve a ser la
           fuente de verdad, y ahí ese botón vive en app-tenant-header, único y
           siempre visible (ver tenant-header.component.ts). -->
      <div class="flex items-center gap-2 px-2 pb-4 min-h-11" [class.justify-center]="collapsed()">
        <div class="flex items-center gap-2.5 min-w-0 pt-2" [class.flex-1]="!collapsed()">
          @if (logoUrl()) {
            <img
              [src]="logoUrl()"
              alt=""
              class="w-9 h-9 rounded-lg object-cover shrink-0 max-w-none bg-[var(--panel-color-primary-soft)]"
            />
          } @else {
            <span
              class="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center font-semibold
                     bg-[var(--panel-color-primary-soft)] text-[var(--panel-color-primary-text)]"
              style="font-family: var(--panel-font-display)"
            >
              {{ businessName().charAt(0).toUpperCase() }}
            </span>
          }
          @if (!collapsed()) {
            <h1
              class="text-sm font-semibold leading-tight truncate text-[var(--panel-color-text-primary)]"
            >
              {{ businessName() }}
            </h1>
          }
        </div>
      </div>

      <!-- Navegación: 6 grupos (contracts/navigation-grouping-contract.md) -->
      <nav class="flex-1 min-h-0 overflow-y-auto px-2 py-3">
        @for (group of groupedItems(); track group.title) {
          <div class="mb-1">
            @if (!collapsed()) {
              <!-- text-secondary, no text-subtle (research.md R3 solo da los
                   valores de cada token, no garantiza su contraste en este
                   uso -- contracts/panel-theme-contract.md §2 lo deja
                   explícito: "debe confirmarse, no asumirse". text-subtle
                   mide 2.56:1 (claro) / 3.73:1 (oscuro) contra la superficie,
                   por debajo del 4.5:1 de WCAG AA para texto normal,
                   verificado con Lighthouse real -- SC-006 exige 100. -->
              <p
                class="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--panel-color-text-secondary)]"
              >
                {{ group.title }}
              </p>
            }
            <!-- exact: false (FR-004, spec.md Session 2026-10-14): el Router compara por
                 segmento de ruta, no por substring, así que una subvista sin ítem propio
                 (editar/crear/detalle) sigue resaltando a su módulo padre sin que rutas
                 distintas que comparten prefijo de texto (p. ej. /dashboard/mesas vs.
                 /dashboard/mesas-sesiones) se confundan entre sí. -->
            <div class="space-y-0.5">
              @for (item of group.items; track item.route) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive
                  #rla="routerLinkActive"
                  [routerLinkActiveOptions]="{ exact: false }"
                  (click)="onItemSelected()"
                  (mouseenter)="collapsed() && showTooltip($event, item.frame!.label)"
                  (mouseleave)="hideTooltip()"
                  (focus)="collapsed() && showTooltip($event, item.frame!.label)"
                  (blur)="hideTooltip()"
                  class="relative flex items-center gap-3 h-10 px-2.5 rounded-lg text-sm transition-colors"
                  [class]="rla.isActive ? activeClass : inactiveClass"
                  [attr.title]="collapsed() ? item.frame!.label : null"
                  [attr.aria-label]="item.frame!.label"
                >
                  <!-- Barra de acento del ítem activo (SkeiloPOS App.dc.html) -->
                  @if (rla.isActive) {
                    <span
                      class="absolute -left-2 top-2 bottom-2 w-[3px] rounded-r-[3px]"
                      style="background: var(--panel-color-primary)"
                    ></span>
                  }
                  <span class="w-[18px] h-[18px] flex items-center justify-center shrink-0">
                    <app-icon [name]="item.frame!.icon" />
                  </span>
                  @if (!collapsed()) {
                    <span class="truncate">{{ item.frame!.label }}</span>
                  }
                </a>
              }
            </div>
          </div>
        }
      </nav>

      <!-- Pie: wordmark oficial SkeiloPOS (SkeiloPOS App.dc.html) -- activos
           reales del sistema de diseño (_ds/.../assets/logo-horizontal-*),
           no el ícono antiguo de app/favicon (/logo.svg, distinto). Una sola
           imagen (el lockup horizontal completo, ícono+texto) con ancho de
           contenedor variable + overflow-hidden: colapsado recorta al
           ícono (misma técnica que el propio prototipo: contenedor de
           ancho dinámico + overflow hidden alrededor del Wordmark). El
           botón "Ayuda" del diseño se omite a propósito: no hay pantalla,
           ruta ni enlace de soporte real en el panel hoy (spec.md,
           Clarifications). -->
      <div class="shrink-0 border-t border-[var(--panel-color-border)] px-2 pt-3 pb-1">
        <div
          class="h-8 flex items-center overflow-hidden"
          [style.width.px]="collapsed() ? 24 : 128"
        >
          <img
            [src]="
              panelThemeService.theme() === 'dark'
                ? '/images/logo-horizontal-dark.webp'
                : '/images/logo-horizontal.webp'
            "
            alt="SkeiloPOS"
            class="h-8 w-auto shrink-0 max-w-none"
          />
        </div>
      </div>
    </aside>

    <!--
      Tooltip del ícono colapsado (FR-007, research.md R7) — position: fixed
      en vez de position: absolute dentro del propio ítem: el nav necesita
      overflow-y: auto para poder desplazarse (15 ítems en 6 grupos no
      siempre caben), y la regla CSS de "contradictory overflow" (CSS2.1
      §11.1.1) obliga al navegador a recortar también el eje horizontal en
      cuanto un eje es distinto de visible -- un tooltip absolute dentro de
      ese nav queda invisible aunque su opacity compute en 1 (verificado con
      Chrome real). position: fixed, anclado a la posición del ítem
      enfocado/con el mouse encima, escapa de ese recorte sin tocar la
      estructura del nav ni añadir una dependencia nueva.
    -->
    @if (collapsed() && tooltip(); as t) {
      <span
        role="tooltip"
        class="fixed z-50 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap pointer-events-none
               bg-[var(--panel-color-text-primary)] text-[var(--panel-color-surface)]"
        [style.top.px]="t.top"
        [style.left.px]="t.left"
        style="transform: translateY(-50%)"
      >
        {{ t.label }}
      </span>
    }
  `,
})
export class TenantSidebarComponent {
  private readonly authService = inject(AuthService);
  readonly layoutService = inject(LayoutService);
  readonly panelThemeService = inject(PanelThemeService);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly planSummaryService = inject(PlanSummaryService);
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly logoUrl = this.tenantInfo.logoUrl;
  readonly businessName = this.tenantInfo.businessName;

  // Solo color/peso de fuente -- la estructura (flex, alto, radio, padding)
  // vive en la clase estática del <a> en el template, para no duplicar
  // utilidades conflictivas entre ambas.
  readonly inactiveClass =
    'font-medium text-[var(--panel-color-text-secondary)] hover:bg-[var(--panel-color-overlay-hover)] hover:text-[var(--panel-color-text-primary)]';
  readonly activeClass =
    'font-semibold bg-[var(--panel-color-primary-soft)] text-[var(--panel-color-primary-text)]';

  /**
   * Punto de quiebre reactivo (research.md R6) — acotado a este componente,
   * sin tocar `LayoutService` ni afectar a Super Admin. `toSignal` desregistra
   * la suscripción por sí solo al destruirse el componente.
   */
  private readonly isDesktop = toSignal(
    this.breakpointObserver.observe(DESKTOP_BREAKPOINT_QUERY).pipe(map((state) => state.matches)),
    {
      initialValue: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
    },
  );

  readonly viewMode = computed<'desktop' | 'drawer'>(() =>
    this.isDesktop() ? 'desktop' : 'drawer',
  );

  /** `true` solo cuando el colapso de escritorio aplica (data-model.md §3). */
  readonly collapsed = computed(
    () => this.viewMode() === 'desktop' && this.layoutService.desktopCollapsed(),
  );

  readonly isVisible = computed(() =>
    this.viewMode() === 'desktop' ? true : this.layoutService.sidebarOpen(),
  );

  readonly widthPx = computed(() => {
    if (this.viewMode() === 'drawer') return DRAWER_WIDTH_PX;
    return this.collapsed() ? DESKTOP_COLLAPSED_WIDTH_PX : DESKTOP_EXPANDED_WIDTH_PX;
  });

  /** Mismo filtro de `SidebarComponent.visibleItems` (research.md R1,
   *  data-model.md §5), trasladado sin reescribirlo. */
  readonly visibleItems = computed<NavItem[]>(() => {
    const user = this.authService.currentUser();
    if (!user) return [];
    const summary = this.planSummaryService.summary();
    return NAV_ITEMS.filter((item) => item.roles.includes(user.role)).filter((item) => {
      if (!item.moduleKey) return true;
      if (!summary) return true;
      if (summary.vencido) return false;
      return summary.modules[item.moduleKey];
    });
  });

  /** Agrupado por `item.frame.group` contra `TENANT_FRAME_GROUP_ORDER`
   *  (data-model.md §4) — mismo criterio de grupo vacío que `groupedItems()`
   *  ya aplica hoy en `SidebarComponent` (FR-016). */
  readonly groupedItems = computed<TenantNavGroup[]>(() => {
    const items = this.visibleItems();
    return TENANT_FRAME_GROUP_ORDER.map((title) => ({
      title,
      items: items.filter((i) => i.frame?.group === title),
    })).filter((g) => g.items.length > 0);
  });

  /** FR-008 (Historia 3, Escenario 2): seleccionar un ítem en modo drawer lo cierra. */
  onItemSelected(): void {
    if (this.viewMode() === 'drawer') this.layoutService.close();
  }

  /** Tooltip del ítem colapsado (FR-007, research.md R7) — ver el comentario
   *  HTML junto al `@if` en el template para la razón de `position: fixed`. */
  readonly tooltip = signal<{ top: number; left: number; label: string } | null>(null);

  showTooltip(event: FocusEvent | MouseEvent, label: string): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.tooltip.set({ top: rect.top + rect.height / 2, left: rect.right + 10, label });
  }

  hideTooltip(): void {
    this.tooltip.set(null);
  }
}
