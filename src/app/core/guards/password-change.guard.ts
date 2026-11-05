import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../interfaces/user.interface';

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '/dashboard/admin',
  [UserRole.ADMIN]: '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.MESERO]: '/dashboard/mesas-sesiones',
  [UserRole.KITCHEN]: '/dashboard/cocina',
};

/**
 * Blocks protected areas while the user still carries a temporary password,
 * redirecting to `/change-password`. Applied to `dashboard` and `super-admin`.
 */
export const passwordChangeGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authReady$.pipe(
    take(1),
    map(() => {
      const user = authService.currentUser();
      if (user?.mustChangePassword) {
        return router.createUrlTree(['/change-password']);
      }
      return true;
    }),
  );
};

/**
 * Guards the `/change-password` page itself: only reachable while a change is
 * required. Otherwise sends the user to their role home.
 */
export const changePasswordPageGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authReady$.pipe(
    take(1),
    map(() => {
      const user = authService.currentUser();
      if (!user) return router.createUrlTree(['/login']);
      if (!user.mustChangePassword) {
        return router.createUrlTree([ROLE_HOME[user.role] ?? '/dashboard']);
      }
      return true;
    }),
  );
};
