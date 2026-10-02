import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { TenantContextService } from '../tenant/tenant-context.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authReady$.pipe(
    take(1),
    map(() => {
      if (authService.currentUser()) return true;
      return router.createUrlTree(['/login']);
    }),
  );
};

export const redirectIfAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const tenant = inject(TenantContextService);
  const router = inject(Router);

  const ROLE_HOME: Record<string, string> = {
    admin: '/dashboard/admin',
    cashier: '/dashboard/caja',
  };

  return authService.authReady$.pipe(
    take(1),
    map(() => {
      const user = authService.currentUser();
      if (!user) return true;
      // Host sin acceso (raíz, reservado o desconocido): no hay a dónde enviarlo y
      // /login muestra el aviso de dirección inválida; redirigir aquí haría un bucle
      // con `tenantDomainGuard`.
      if (tenant.isUnrecognized()) return true;
      // Destination depends on the domain context, not just the role:
      // `admin.<dominio>` lands on the Super Admin area, tenant subdomains on the POS.
      if (tenant.isSuperAdmin()) return router.createUrlTree(['/super-admin']);
      return router.createUrlTree([ROLE_HOME[user.role] ?? '/dashboard']);
    }),
  );
};
