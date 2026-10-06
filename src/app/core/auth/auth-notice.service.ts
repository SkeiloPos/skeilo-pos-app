import { Injectable, signal } from '@angular/core';

/**
 * Notices handed from one auth screen to another. Today there is exactly one:
 * the password was just changed, so `/login` greets the user with it.
 */
export type AuthNotice = 'password-updated';

/**
 * One-shot, in-memory notice that crosses a route boundary (spec 095, FR-031).
 *
 * Deliberately **not** a query parameter: anyone could then craft a URL that
 * shows "Contraseña actualizada" without a password ever changing. Memory also
 * makes the single-read rule trivial — reloading `/login` finds it empty, so
 * the message does not come back a second time (R12).
 *
 * The trade-off is that a reload between the change and the landing loses the
 * notice. That is acceptable: it is a courtesy message, not information the
 * user needs to proceed.
 */
@Injectable({ providedIn: 'root' })
export class AuthNoticeService {
  private readonly notice = signal<AuthNotice | null>(null);

  set(notice: AuthNotice): void {
    this.notice.set(notice);
  }

  /** Read the pending notice and clear it. Returns `null` when there is none. */
  consume(): AuthNotice | null {
    const current = this.notice();
    if (current !== null) this.notice.set(null);
    return current;
  }
}
