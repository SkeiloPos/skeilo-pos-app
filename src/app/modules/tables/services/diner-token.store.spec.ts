import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DinerTokenStore, DINER_TOKEN_PARAM } from './diner-token.store';

const STORAGE_KEY = 'pos.diner.session_token';
const EXITED_STORAGE_KEY = 'pos.diner.exited_token';

describe('DinerTokenStore', () => {
  function create(): DinerTokenStore {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [DinerTokenStore] });
    return TestBed.inject(DinerTokenStore);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/menu/t/abc');
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('línea base (sin cambios)', () => {
    it('arranca sin token si no hay nada guardado', () => {
      expect(create().token()).toBeNull();
    });

    it('lee el token de localStorage si ya existe', () => {
      localStorage.setItem(STORAGE_KEY, 'tok-1');
      expect(create().token()).toBe('tok-1');
    });

    it('el query param gana sobre localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'tok-viejo');
      history.replaceState(null, '', `/menu/t/abc?${DINER_TOKEN_PARAM}=tok-nuevo`);

      const store = create();

      expect(store.token()).toBe('tok-nuevo');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('tok-nuevo');
    });

    it('set() persiste en localStorage y actualiza el signal', () => {
      const store = create();
      store.set('tok-2');

      expect(store.token()).toBe('tok-2');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('tok-2');
    });

    it('clear() descarta el token del signal y de localStorage', () => {
      const store = create();
      store.set('tok-3');

      store.clear();

      expect(store.token()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('marca de acceso cerrado (Bug 1, FR-001)', () => {
    it('markExited(token) persiste en sessionStorage', () => {
      create().markExited('tok-cerrado');

      expect(sessionStorage.getItem(EXITED_STORAGE_KEY)).toBe('tok-cerrado');
    });

    it('isExited(token) devuelve true solo para el token marcado', () => {
      const store = create();
      store.markExited('tok-cerrado');

      expect(store.isExited('tok-cerrado')).toBe(true);
    });

    it('isExited(otroToken) devuelve false', () => {
      const store = create();
      store.markExited('tok-cerrado');

      expect(store.isExited('otro-token')).toBe(false);
    });

    it('sin ninguna marca, isExited() devuelve false para cualquier token', () => {
      expect(create().isExited('cualquiera')).toBe(false);
    });
  });

  // spec 089 (A-95, FR-015a/c, SC-011): único borrado de fin de acceso.
  describe('endAccess() — único borrado de fin de acceso (A-95)', () => {
    function dinerKeys(area: Storage): string[] {
      const keys: string[] = [];
      for (let i = 0; i < area.length; i++) {
        const k = area.key(i);
        if (k?.startsWith('pos.diner.')) keys.push(k);
      }
      return keys;
    }

    it('deja solo pos.diner.exited_token = token público en sessionStorage', () => {
      const store = create();
      store.set('tok-sesion');
      localStorage.setItem('pos.diner.checkout_progress.ord-1', '{"step":2}');
      sessionStorage.setItem('pos.diner.checkout_progress.ord-2', '{"step":1}');
      sessionStorage.setItem('pos.diner.otro_dato', 'x');

      store.endAccess('tok-mesa');

      expect(store.token()).toBeNull();
      expect(dinerKeys(localStorage)).toEqual([]);
      expect(dinerKeys(sessionStorage)).toEqual([EXITED_STORAGE_KEY]);
      expect(sessionStorage.getItem(EXITED_STORAGE_KEY)).toBe('tok-mesa');
      expect(store.isExited('tok-mesa')).toBe(true);
    });

    it('no toca claves ajenas a pos.diner.*', () => {
      const store = create();
      localStorage.setItem('auth.token', 'staff');

      store.endAccess('tok-mesa');

      expect(localStorage.getItem('auth.token')).toBe('staff');
    });

    it('expira las cookies pos.diner* y respeta las demás', () => {
      const store = create();
      document.cookie = 'pos.diner.dato=1; path=/';
      document.cookie = 'otra=1; path=/';

      store.endAccess('tok-mesa');

      expect(document.cookie).not.toContain('pos.diner');
      expect(document.cookie).toContain('otra=1');
      document.cookie = 'otra=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });

    it('con el almacenamiento bloqueado no lanza y purga el signal', () => {
      const store = create();
      store.set('tok-sesion');
      const blocked = () => {
        throw new DOMException('bloqueado', 'SecurityError');
      };
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
      vi.spyOn(Storage.prototype, 'key').mockImplementation(blocked);

      try {
        expect(() => store.endAccess('tok-mesa')).not.toThrow();
        expect(store.token()).toBeNull();
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
