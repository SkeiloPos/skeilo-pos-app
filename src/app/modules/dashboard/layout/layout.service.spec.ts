import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LayoutService } from './layout.service';

const DESKTOP_COLLAPSED_KEY = 'pos.panel.sidebar_collapsed';

/** spec 116 (T010, data-model.md §2): `desktopCollapsed` -- los casos de
 *  `sidebarOpen` ya existente no se repiten aquí (ver
 *  `dashboard-layout.component.spec.ts`, que los cubre sin tocarlos). */
describe('LayoutService.desktopCollapsed (spec 116)', () => {
  afterEach(() => {
    localStorage.removeItem(DESKTOP_COLLAPSED_KEY);
  });

  it('por defecto, sin nada guardado, arranca expandido (false)', () => {
    localStorage.removeItem(DESKTOP_COLLAPSED_KEY);
    TestBed.resetTestingModule();
    const service = TestBed.inject(LayoutService);

    expect(service.desktopCollapsed()).toBe(false);
  });

  it('toggleDesktopCollapsed() cambia el valor y lo persiste entre instancias', () => {
    localStorage.removeItem(DESKTOP_COLLAPSED_KEY);
    TestBed.resetTestingModule();
    const service = TestBed.inject(LayoutService);

    service.toggleDesktopCollapsed();
    expect(service.desktopCollapsed()).toBe(true);
    expect(localStorage.getItem(DESKTOP_COLLAPSED_KEY)).toBe('1');

    TestBed.resetTestingModule();
    const fresh = TestBed.inject(LayoutService);
    expect(fresh.desktopCollapsed()).toBe(true);
  });

  it('no lanza si localStorage no está disponible (solo cambia en memoria)', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    TestBed.resetTestingModule();
    const service = TestBed.inject(LayoutService);

    expect(service.desktopCollapsed()).toBe(false);
    expect(() => service.toggleDesktopCollapsed()).not.toThrow();
    expect(service.desktopCollapsed()).toBe(true);

    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('no modifica sidebarOpen ni sus métodos existentes', () => {
    TestBed.resetTestingModule();
    const service = TestBed.inject(LayoutService);
    const before = service.sidebarOpen();

    service.toggleDesktopCollapsed();

    expect(service.sidebarOpen()).toBe(before);
    expect(typeof service.open).toBe('function');
    expect(typeof service.close).toBe('function');
    expect(typeof service.toggle).toBe('function');
  });
});
