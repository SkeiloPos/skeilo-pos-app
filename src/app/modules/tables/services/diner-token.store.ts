import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'pos.diner.session_token';
/** Marca, por pestaña, del token cuyo acceso el propio comensal cerró explícitamente. */
const EXITED_STORAGE_KEY = 'pos.diner.exited_token';

/** Prefijo común de todo lo que la app guarda del comensal (token, marca, progreso de checkout). */
const DINER_STORAGE_PREFIX = 'pos.diner.';

/** Nombre del query param que permite reingresar desde un enlace compartido. */
export const DINER_TOKEN_PARAM = 's';

/**
 * Guarda el `session_token` del comensal (anónimo, sin login).
 *
 * Orden de lectura: **query param → localStorage**. El param gana para que
 * abrir el enlace compartido en otro dispositivo reingrese a esa sesión en vez
 * de crear un comensal nuevo.
 *
 * Nota: el documento de contrato menciona una cookie `httpOnly` como almacén
 * principal, pero el backend devuelve el token en el cuerpo JSON (no con
 * `Set-Cookie`) y una cookie httpOnly no se puede escribir desde JS. Mientras
 * el backend no emita la cookie, `localStorage` es el almacén real.
 */
@Injectable({ providedIn: 'root' })
export class DinerTokenStore {
  /** Token vigente, o `null` si el comensal aún no tiene sesión. */
  readonly token = signal<string | null>(this.read());

  /** Lee el token del query param (si viene) o de `localStorage`. */
  private read(): string | null {
    try {
      const fromUrl = new URLSearchParams(location.search).get(DINER_TOKEN_PARAM);
      if (fromUrl) {
        localStorage.setItem(STORAGE_KEY, fromUrl);
        return fromUrl;
      }
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      // Modo privado / storage bloqueado: la sesión no sobrevive a la recarga,
      // pero el flujo sigue funcionando en memoria.
      return null;
    }
  }

  set(token: string): void {
    this.token.set(token);
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {
      /* sin persistencia: se mantiene solo en memoria */
    }
  }

  /** Descarta el token. Se llama ante cualquier `401` del comensal. */
  clear(): void {
    this.token.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nada que limpiar */
    }
  }

  /** Enlace para compartir/reingresar, con el token en el query param. */
  shareUrl(): string | null {
    const t = this.token();
    if (!t) return null;
    const url = new URL(location.href);
    url.searchParams.set(DINER_TOKEN_PARAM, t);
    return url.toString();
  }

  /**
   * Marca `token` como un acceso que el comensal cerró explícitamente (`exit()`).
   *
   * Vive en `sessionStorage`, no `localStorage`: debe sobrevivir a un reload/
   * back/forward de **esta misma pestaña**, pero no debe bloquear una pestaña
   * nueva (equivalente, en la práctica, a un escaneo físico nuevo del QR) —
   * `research.md` Decisión 1.
   */
  markExited(token: string): void {
    try {
      sessionStorage.setItem(EXITED_STORAGE_KEY, token);
    } catch {
      /* modo privado / storage bloqueado: sin marca persistente en esta pestaña */
    }
  }

  /**
   * Fin de acceso del comensal: **único** borrado, compartido por "Salir" y por el cierre de la
   * mesa (spec 089, A-95, FR-015a / research D9b). Así ambos caminos dejan el navegador idéntico
   * (SC-011).
   *
   * Quita el token de sesión, elimina de `localStorage` y `sessionStorage` toda clave `pos.diner.*`
   * (progreso de checkout incluido), expira cualquier cookie `pos.diner*` y deja **solo** la marca
   * por pestaña del token público de la mesa (`tableToken`, el de la URL; FR-015c), sin datos de
   * sesión ni de comensal. Con almacenamiento bloqueado la purga en memoria igual ocurre.
   */
  endAccess(tableToken: string): void {
    this.clear();
    for (const storage of [() => localStorage, () => sessionStorage]) {
      try {
        const area = storage();
        const keys: string[] = [];
        for (let i = 0; i < area.length; i++) {
          const key = area.key(i);
          if (key?.startsWith(DINER_STORAGE_PREFIX)) keys.push(key);
        }
        keys.forEach((key) => area.removeItem(key));
      } catch {
        /* storage bloqueado: nada que purgar */
      }
    }
    try {
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim();
        if (name.startsWith(DINER_STORAGE_PREFIX.slice(0, -1))) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }
      }
    } catch {
      /* sin acceso a cookies */
    }
    this.markExited(tableToken);
  }

  /** ¿Esta pestaña ya cerró explícitamente el acceso de `token`? */
  isExited(token: string): boolean {
    try {
      return sessionStorage.getItem(EXITED_STORAGE_KEY) === token;
    } catch {
      return false;
    }
  }
}
