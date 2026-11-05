import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { vi } from 'vitest';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';
import { User, UserRole } from '../interfaces/user.interface';

function user(partial: Partial<User>): User {
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

function setup(currentUser: User | null) {
  const router = { createUrlTree: vi.fn((commands: unknown[]) => ({ commands }) as unknown as UrlTree) };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal(currentUser), authReady$: of(void 0) } },
      { provide: Router, useValue: router },
    ],
  });
  return router;
}

async function runGuard(allowedRoles: UserRole[]): Promise<unknown> {
  const guard = roleGuard(allowedRoles);
  const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
  return isObservable(result) ? firstValueFrom(result) : result;
}

/** Spec 151 (research.md Decisión 10): `/dashboard/cocina` queda protegida
 *  por `roleGuard([ADMIN, CASHIER, KITCHEN])` -- accesible para KITCHEN (rol
 *  nuevo) y bloqueada para un rol no listado (p. ej. MESERO). */
describe('roleGuard', () => {
  it('permite el acceso a KITCHEN cuando está en la lista permitida', async () => {
    setup(user({ role: UserRole.KITCHEN }));
    const result = await runGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN]);
    expect(result).toBe(true);
  });

  it('redirige a KITCHEN a su ruta por defecto cuando el rol no está permitido', async () => {
    const router = setup(user({ role: UserRole.KITCHEN }));
    await runGuard([UserRole.ADMIN]);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard/cocina']);
  });

  it('bloquea a un rol no listado (MESERO) del tablero de cocina', async () => {
    const router = setup(user({ role: UserRole.MESERO }));
    await runGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN]);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard/mesas-sesiones']);
  });

  it('redirige a /login cuando no hay sesión', async () => {
    const router = setup(null);
    await runGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN]);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
