import { Routes } from '@angular/router';
import { DashboardLayoutComponent } from '../dashboard/layout/dashboard-layout.component';

export const superAdminRoutes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'tenants',
      },
      {
        path: 'tenants',
        loadComponent: () =>
          import('./pages/tenants-page.component').then((m) => m.TenantsPageComponent),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/super-admin-users-page.component').then(
            (m) => m.SuperAdminUsersPageComponent,
          ),
      },
      {
        path: 'users/:id',
        loadComponent: () =>
          import('./pages/super-admin-user-detail-page.component').then(
            (m) => m.SuperAdminUserDetailPageComponent,
          ),
      },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./pages/super-admin-audit-page.component').then(
            (m) => m.SuperAdminAuditPageComponent,
          ),
      },
      {
        path: 'payment-methods-catalog',
        loadComponent: () =>
          import('./pages/payment-method-catalog-page.component').then(
            (m) => m.PaymentMethodCatalogPageComponent,
          ),
      },
      {
        path: 'plans',
        loadComponent: () =>
          import('./pages/plans-page.component').then((m) => m.PlansPageComponent),
      },
      {
        path: 'legal/platform-documents',
        loadComponent: () =>
          import('./pages/legal/legal-platform-documents-page.component').then(
            (m) => m.LegalPlatformDocumentsPageComponent,
          ),
      },
      {
        path: 'legal/master-template',
        loadComponent: () =>
          import('./pages/legal/legal-master-template-page.component').then(
            (m) => m.LegalMasterTemplatePageComponent,
          ),
      },
    ],
  },
];
