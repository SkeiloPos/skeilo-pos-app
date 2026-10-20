import { Routes } from '@angular/router';
import { authGuard, redirectIfAuthGuard } from './core/guards/auth.guard';
import {
  changePasswordPageGuard,
  passwordChangeGuard,
} from './core/guards/password-change.guard';
import { superAdminDomainGuard } from './core/tenant/guards/super-admin-domain.guard';
import { tenantDomainGuard } from './core/tenant/guards/tenant-domain.guard';
import { checkoutHydrationGuard } from './modules/tables/pages/checkout/checkout-hydration.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    // Context-aware: works on both root and tenant subdomains.
    path: 'login',
    canActivate: [redirectIfAuthGuard],
    loadComponent: () =>
      import('./modules/auth/pages/login.component').then(m => m.LoginComponent),
  },
  {
    // Solicitar el enlace de restablecimiento (Flujo A, no autenticado).
    path: 'forgot-password',
    canActivate: [redirectIfAuthGuard],
    loadComponent: () =>
      import('./modules/auth/pages/forgot-password.component').then(
        m => m.ForgotPasswordComponent,
      ),
  },
  {
    // Definir la contraseña nueva desde el enlace del correo. Pública: el
    // propio componente limpia cualquier sesión existente (FR-006) en vez de
    // redirigir — un guard de "no autenticado" la echaría antes de leer el token.
    path: 'reset-password',
    loadComponent: () =>
      import('./modules/auth/pages/reset-password.component').then(
        m => m.ResetPasswordComponent,
      ),
  },
  {
    // Forces a password change before accessing the app (temporary password).
    path: 'change-password',
    canActivate: [authGuard, changePasswordPageGuard],
    loadComponent: () =>
      import('./modules/auth/pages/change-password.component').then(m => m.ChangePasswordComponent),
  },
  {
    // Super Admin area — root domain only.
    path: 'super-admin',
    canActivate: [authGuard, superAdminDomainGuard, passwordChangeGuard],
    loadChildren: () =>
      import('./modules/super-admin/routes').then(m => m.superAdminRoutes),
  },
  {
    // Tenant POS — subdomains only.
    path: 'dashboard',
    canActivate: [authGuard, tenantDomainGuard, passwordChangeGuard],
    loadChildren: () =>
      import('./modules/dashboard/routes').then(m => m.dashboardRoutes),
  },
  {
    // Spec 077 (corrección post-implementación): padre sin `path` que envuelve
    // el menú y el checkout del comensal — antes eran rutas hermanas, así que
    // navegar al checkout destruía `PublicMenuComponent` y con él la única
    // conexión SSE del comensal (se perdía cualquier evento, incluida la
    // confirmación de pago, mientras pagaba). `DinerShellComponent` es ahora
    // el único dueño de esa conexión (mismo rol que `DashboardLayoutComponent`
    // del lado del staff) y sobrevive a la navegación entre ambos hijos.
    // Cada hijo conserva su propio `:token` completo en su path — no se usa
    // `paramsInheritanceStrategy`, así que ningún guard/step cambia cómo lee
    // `route.snapshot.paramMap.get('token')`.
    path: '',
    loadComponent: () =>
      import('./modules/tables/pages/diner-shell.component').then(m => m.DinerShellComponent),
    children: [
      {
        // Vista de pasos de revisión y pago (spec 034) — ruta propia en vez de un
        // modal, para que la recarga tenga una URL con sentido propio por paso.
        // Va **antes** de `menu/t/:token` (sin hijos, no puede consumir estos
        // segmentos de más); `checkoutHydrationGuard` corre una sola vez por
        // entrada, no en cada paso hermano.
        path: 'menu/t/:token/checkout',
        canActivate: [checkoutHydrationGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'review' },
          {
            path: 'review',
            loadComponent: () =>
              import('./modules/tables/pages/checkout/review-step.component').then(m => m.ReviewStepComponent),
          },
          {
            path: 'method',
            loadComponent: () =>
              import('./modules/tables/pages/checkout/payment-method-step.component').then(
                m => m.PaymentMethodStepComponent,
              ),
          },
          {
            // Spec 130 (FR-005/FR-006): monto en efectivo de "Pago mixto" —
            // entre 'method' y 'transfer', solo para ese método.
            path: 'cash',
            loadComponent: () =>
              import('./modules/tables/pages/checkout/cash-amount-step.component').then(
                m => m.CashAmountStepComponent,
              ),
          },
          {
            path: 'transfer',
            loadComponent: () =>
              import('./modules/tables/pages/checkout/transfer-details-step.component').then(
                m => m.TransferDetailsStepComponent,
              ),
          },
          {
            path: 'confirmation',
            loadComponent: () =>
              import('./modules/tables/pages/checkout/confirmation-step.component').then(
                m => m.ConfirmationStepComponent,
              ),
          },
        ],
      },
      {
        // Entrada del comensal. `token` es el JWT **firmado** de la mesa: lleva el
        // tenant dentro, así que esta ruta funciona en cualquier dominio.
        path: 'menu/t/:token',
        loadComponent: () =>
          import('./modules/tables/pages/public-menu.component').then(m => m.PublicMenuComponent),
      },
    ],
  },
  {
    // QR antiguos (UUID plano). El backend ya no acepta ese formato, pero hay
    // códigos impresos pegados en las mesas: mejor explicarlo que dar un 404 mudo.
    path: 'menu/qr/:token',
    loadComponent: () =>
      import('./modules/tables/pages/expired-qr.component').then(m => m.ExpiredQrComponent),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
