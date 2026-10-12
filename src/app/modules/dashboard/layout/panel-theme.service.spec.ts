import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PanelThemeService } from './panel-theme.service';

const THEME_KEY = 'pos.panel.theme';

/** El script de `index.html` (research.md R4) ya deja `data-theme` fijado en
 *  `<html>` en producción; en estos tests se limpia antes de cada caso para
 *  ejercitar la resolución propia del servicio (localStorage → sistema →
 *  'light'), tal como la vería un entorno donde ese script no corrió. */
function clearHtmlAttribute(): void {
  document.documentElement.removeAttribute('data-theme');
}

function mockMatchMedia(matches: boolean): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockReturnValue({ matches } as MediaQueryList);
  vi.stubGlobal('matchMedia', fn);
  return fn;
}

describe('PanelThemeService (spec 116, quickstart.md §1)', () => {
  afterEach(() => {
    clearHtmlAttribute();
    localStorage.removeItem(THEME_KEY);
    vi.unstubAllGlobals();
  });

  it("sin nada guardado y sin señal de sistema → 'light'", () => {
    clearHtmlAttribute();
    localStorage.removeItem(THEME_KEY);
    mockMatchMedia(false);

    TestBed.resetTestingModule();
    const service = TestBed.inject(PanelThemeService);

    expect(service.theme()).toBe('light');
  });

  it("sin nada guardado y matchMedia(dark)=true → 'dark'", () => {
    clearHtmlAttribute();
    localStorage.removeItem(THEME_KEY);
    mockMatchMedia(true);

    TestBed.resetTestingModule();
    const service = TestBed.inject(PanelThemeService);

    expect(service.theme()).toBe('dark');
  });

  it("con pos.panel.theme='dark' guardado → 'dark', sin consultar matchMedia", () => {
    clearHtmlAttribute();
    localStorage.setItem(THEME_KEY, 'dark');
    const matchMediaSpy = mockMatchMedia(false);

    TestBed.resetTestingModule();
    const service = TestBed.inject(PanelThemeService);

    expect(service.theme()).toBe('dark');
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });

  it('localStorage.getItem/setItem lanzando → no se propaga, el signal sigue cambiando en memoria', () => {
    clearHtmlAttribute();
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    mockMatchMedia(false);

    TestBed.resetTestingModule();
    const service = TestBed.inject(PanelThemeService);

    expect(() => service.toggleTheme()).not.toThrow();
    expect(service.theme()).toBe('dark');

    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
