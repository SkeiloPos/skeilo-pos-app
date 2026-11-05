import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../interfaces/user.interface';

const ROLE_DEFAULT_ROUTES: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '/dashboard/admin',
  [UserRole.ADMIN]: '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.MESERO]: '/dashboard/mesas-sesiones',
  [UserRole.KITCHEN]: '/dashboard/cocina',
};

export const roleGuard =
  (allowedRoles: UserRole[]): CanActivateFn =>
  () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.authReady$.pipe(
      take(1),
      map(() => {
        const user = authService.currentUser();
        if (!user) return router.createUrlTree(['/login']);
        if (allowedRoles.includes(user.role)) return true;
        return router.createUrlTree([ROLE_DEFAULT_ROUTES[user.role]]);
      }),
    );
  };
