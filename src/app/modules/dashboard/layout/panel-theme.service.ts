import { Injectable, signal } from '@angular/core';

const THEME_KEY = 'pos.panel.theme';

type PanelTheme = 'light' | 'dark';

/**
 * Preferencia de tema claro/oscuro del marco del panel de tenant
 * (sidebar/navbar/fondo de contenido — `.panel-theme`, spec 116).
 *
 * El valor inicial se resuelve leyendo primero el atributo `data-theme` que el
 * script inline de `index.html` (research.md R4) ya fijó en `<html>` antes de
 * que Angular arrancara -- así nunca hay una segunda detección que pueda
 * discrepar de la primera y provocar el parpadeo que esa detección temprana
 * evita. Solo si ese atributo no está (script sin ejecutar, o entorno de
 * prueba) se repite la misma resolución en orden: `localStorage` →
 * preferencia del sistema → `'light'`.
 */
@Injectable({ providedIn: 'root' })
export class PanelThemeService {
  readonly theme = signal<PanelTheme>(this.resolveInitial());

  toggleTheme(): void {
    this.setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(value: PanelTheme): void {
    this.theme.set(value);
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      /* navegación privada u otro bloqueo: la preferencia vive solo esta carga */
    }
  }

  private resolveInitial(): PanelTheme {
    const fromHtmlAttribute = this.readHtmlAttribute();
    if (fromHtmlAttribute) return fromHtmlAttribute;

    const stored = this.readStorage();
    if (stored) return stored;

    return this.prefersDark() ? 'dark' : 'light';
  }

  private readHtmlAttribute(): PanelTheme | null {
    try {
      const value = document.documentElement.dataset['theme'];
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private readStorage(): PanelTheme | null {
    try {
      const value = localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null; // almacenamiento no disponible (FR-014) — no es un error, es el caso previsto
    }
  }

  private prefersDark(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    } catch {
      return false;
    }
  }
}
