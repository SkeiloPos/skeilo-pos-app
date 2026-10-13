import { Injectable, signal } from '@angular/core';

/** Breakpoint `lg` de Tailwind (mismo valor usado en
 *  `dashboard-layout.component.ts`) — a partir de aquí el sidebar deja de ser
 *  un slide-over que se superpone al contenido y pasa a ser un panel fijo de
 *  escritorio. spec 078 (US6, FR-031–FR-036; research.md D7; A-71 punto 1):
 *  el umbral subió de `md` (768) a `lg` (1024), así que a ancho de tablet
 *  (768–1023) el menú se colapsa igual que en móvil, en toda la app.
 *  `sidebar.component.ts` no cambia — su `translate` ya depende solo de
 *  `sidebarOpen()`. */
const DESKTOP_BREAKPOINT_PX = 1024;

const DESKTOP_COLLAPSED_KEY = 'pos.panel.sidebar_collapsed';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  /**
   * Spec 036 (FR-012): antes solo controlaba el slide-over móvil (siempre
   * arrancaba en `false`, y el sidebar de escritorio lo ignoraba —
   * `sidebar.component.ts` lo mostraba siempre vía `lg:relative
   * lg:translate-x-0` incondicional). Ahora también controla el colapso en
   * escritorio, así que el valor inicial depende del viewport para no
   * cambiar el comportamiento por defecto ya existente: visible desde
   * escritorio (≥ 1024px), oculto en tablet y móvil (spec 078, US6).
   */
  readonly sidebarOpen = signal(
    typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT_PX : true,
  );

  open(): void {
    this.sidebarOpen.set(true);
  }

  close(): void {
    this.sidebarOpen.set(false);
  }

  toggle(): void {
    this.sidebarOpen.update(v => !v);
  }

  /**
   * Spec 116 (data-model.md §2; research.md R5): colapso del sidebar de
   * tenant a solo-íconos **en escritorio**. Separado de `sidebarOpen` a
   * propósito -- ese signal sigue gobernando, sin cambios, el
   * mostrar/ocultar por completo de `SidebarComponent` (Super Admin) y el
   * drawer móvil/tablet de `app-tenant-sidebar`; este solo decide el ancho
   * en escritorio (72px colapsado vs. 248px expandido) y se persiste con el
   * mismo patrón defensivo que `PanelThemeService`.
   */
  readonly desktopCollapsed = signal(this.readDesktopCollapsed());

  toggleDesktopCollapsed(): void {
    const next = !this.desktopCollapsed();
    this.desktopCollapsed.set(next);
    try {
      localStorage.setItem(DESKTOP_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* navegación privada u otro bloqueo: la preferencia vive solo esta carga */
    }
  }

  private readDesktopCollapsed(): boolean {
    try {
      return localStorage.getItem(DESKTOP_COLLAPSED_KEY) === '1';
    } catch {
      return false; // almacenamiento no disponible -- por defecto, expandido
    }
  }
}
