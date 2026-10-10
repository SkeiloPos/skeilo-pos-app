import { Routes } from '@angular/router';
import { DashboardLayoutComponent } from './layout/dashboard-layout.component';
import { roleGuard } from '../../core/guards/role.guard';
import { planModuleGuard } from '../../core/guards/plan-module.guard';
import { UserRole } from '../../core/interfaces/user.interface';

export const dashboardRoutes: Routes = [
  {
    path: '',
    component: DashboardLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'admin',
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('./pages/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'caja',
        loadComponent: () =>
          import('../cash-register/pages/cash-page.component').then((m) => m.CashPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      {
        // Ajustes de cuenta personal (spec 031) — a diferencia de 'ajustes'
        // (configuración del negocio, solo ADMIN), accesible a cualquier
        // usuario autenticado del dashboard, sin roleGuard.
        path: 'mi-cuenta',
        loadComponent: () =>
          import('../account/pages/account-settings.component').then(
            (m) => m.AccountSettingsComponent,
          ),
      },
      {
        // "Mi plan" (spec 033, Historia de Usuario 6) — mismo criterio que
        // 'mi-cuenta': accesible a cualquier usuario autenticado del
        // dashboard, sin roleGuard (solo expone el consumo del propio tenant).
        path: 'mi-plan',
        loadComponent: () =>
          import('../plan/pages/plan-summary-page.component').then(
            (m) => m.PlanSummaryPageComponent,
          ),
      },
      // Mesas salió de Ajustes a Operaciones; va antes del bloque 'ajustes'
      // para que el redirect gane al match de la ruta padre.
      { path: 'ajustes/mesas', pathMatch: 'full', redirectTo: 'mesas' },
      // Promociones salió de Ajustes a Catálogo; mismo motivo que arriba.
      { path: 'ajustes/promociones', pathMatch: 'full', redirectTo: 'promotions' },
      {
        path: 'ajustes',
        loadComponent: () =>
          import('../settings/pages/settings-page.component').then((m) => m.SettingsPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'informacion' },
          {
            path: 'informacion',
            loadComponent: () =>
              import('../settings/pages/tenant-info.component').then((m) => m.TenantInfoComponent),
          },
          {
            path: 'metodos-pago',
            loadComponent: () =>
              import('../sales/pages/payment-methods-page.component').then(
                (m) => m.PaymentMethodsPageComponent,
              ),
          },
          {
            path: 'unidades',
            loadComponent: () =>
              import('../unit-measures/pages/unit-measures-page.component').then(
                (m) => m.UnitMeasuresPageComponent,
              ),
            canActivate: [planModuleGuard('inventario')],
          },
          {
            path: 'grupos-opciones',
            loadComponent: () =>
              import('../option-groups/pages/option-groups-page.component').then(
                (m) => m.OptionGroupsPageComponent,
              ),
          },
        ],
      },
      // Rutas reubicadas — se conservan como redirect (deep links/marcadores).
      { path: 'metodos-pago', pathMatch: 'full', redirectTo: 'ajustes/metodos-pago' },
      { path: 'unit-measures', pathMatch: 'full', redirectTo: 'ajustes/unidades' },
      { path: 'option-groups', pathMatch: 'full', redirectTo: 'ajustes/grupos-opciones' },
      { path: 'tables', pathMatch: 'full', redirectTo: 'mesas' },
      // El tablero de cocina se deprecó: la preparación se marca desde la
      // terminal de mesas, en la misma pantalla donde se toma y se cobra.
      { path: 'cocina', pathMatch: 'full', redirectTo: 'mesas-sesiones' },
      {
        path: 'ventas',
        loadComponent: () =>
          import('../sales/pages/sales-page.component').then((m) => m.SalesPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('../categories/pages/categories-page.component').then(
            (m) => m.CategoriesPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        // spec 083: catálogo global de presentaciones (entidad nueva, sin relación
        // con la `Presentation` de spec 040 retirada en 063b -- ver research.md D1).
        path: 'presentations',
        loadComponent: () =>
          import('../presentations/pages/presentations-page.component').then(
            (m) => m.PresentationsPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        // spec 093: el Cajero entra a la misma pantalla que el Admin, en solo
        // lectura salvo el interruptor "Agotado" (ProductsPageComponent.isAdmin).
        path: 'products',
        loadComponent: () =>
          import('../products/pages/products-page.component').then((m) => m.ProductsPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      {
        // 'new' debe ir antes de ':id' para no ser capturado como id.
        path: 'products/new',
        loadComponent: () =>
          import('../products/pages/product-form.component').then((m) => m.ProductFormComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        // spec 093 (research.md D9/D11): vista de solo lectura a la que navega el
        // Cajero (y, si quiere, el Admin) desde "Ver detalle" -- debe ir antes de
        // 'products/:id' por el mismo motivo que 'new': es más específica.
        path: 'products/:id/detalle',
        loadComponent: () =>
          import('../products/pages/product-detail-page.component').then(
            (m) => m.ProductDetailPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER])],
      },
      {
        path: 'products/:id',
        loadComponent: () =>
          import('../products/pages/product-form.component').then((m) => m.ProductFormComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'promotions',
        loadComponent: () =>
          import('../promotions/pages/promotions-page.component').then(
            (m) => m.PromotionsPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN]), planModuleGuard('promociones')],
      },
      {
        // Antes que `mesas` para que no la capture como parámetro.
        path: 'mesas/qr',
        loadComponent: () =>
          import('../tables/pages/table-qr-sheet.component').then((m) => m.TableQrSheetComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'mesas',
        loadComponent: () =>
          import('../tables/pages/tables-page.component').then((m) => m.TablesPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'mesas-sesiones',
        loadComponent: () =>
          import('../tables/pages/table-sessions.component').then((m) => m.TableSessionsComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.MESERO])],
      },
      {
        // Vista dedicada para armar un pedido de mostrador nuevo (spec 036,
        // ajuste posterior): reemplaza el CTA "+ Crear Orden Manual" que
        // antes se mostraba embebido en la Terminal de Mesas.
        path: 'mesas-sesiones/:tableId/orden-manual',
        loadComponent: () =>
          import('../tables/pages/manual-order-page.component').then((m) => m.ManualOrderPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.MESERO])],
      },
      {
        // spec 078 (US2, research.md D2): ruta hermana sin `:tableId` para
        // crear un pedido de Domicilio / "Para llevar" desde su pestaña — esos
        // tipos no exigen mesa (`createManualOrderFromDraft()`), así que forzar
        // un `:tableId` "de relleno" (primera mesa libre) es lo que hoy
        // deshabilita el CTA cuando no hay mesas libres. El tipo preseleccionado
        // llega como query param `?tipo=domicilio|para-llevar` (valor inicial
        // editable, FR-011). Mismos guards que la ruta con parámetro.
        path: 'mesas-sesiones/orden-manual',
        loadComponent: () =>
          import('../tables/pages/manual-order-page.component').then((m) => m.ManualOrderPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.MESERO])],
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('../orders/pages/orders-page.component').then((m) => m.OrdersPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.MESERO])],
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('../orders/pages/order-detail.component').then((m) => m.OrderDetailComponent),
        canActivate: [roleGuard([UserRole.ADMIN, UserRole.CASHIER, UserRole.MESERO])],
      },
      {
        // spec 106: más específica que 'inventario/:id' (que no existe hoy, pero sigue el
        // mismo criterio de 'products/:id/detalle' -- la ruta de detalle va antes).
        path: 'inventario/:id/detalle',
        loadComponent: () =>
          import('../inventory/pages/inventory-item-detail-page.component').then(
            (m) => m.InventoryItemDetailPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN]), planModuleGuard('inventario')],
      },
      {
        path: 'inventario',
        loadComponent: () =>
          import('../inventory/pages/inventory-page.component').then(
            (m) => m.InventoryPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN]), planModuleGuard('inventario')],
      },
      {
        path: 'insumos',
        redirectTo: 'inventario',
        pathMatch: 'full',
      },
      {
        // spec 106: antes de 'proveedores' por el mismo motivo que arriba.
        path: 'proveedores/:id/detalle',
        loadComponent: () =>
          import('../suppliers/pages/supplier-detail-page.component').then(
            (m) => m.SupplierDetailPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'proveedores',
        loadComponent: () =>
          import('../suppliers/pages/suppliers-page.component').then(
            (m) => m.SuppliersPageComponent,
          ),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'users',
        loadComponent: () =>
          import('../users/pages/users-page.component').then((m) => m.UsersPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('../reports/pages/reports-page.component').then((m) => m.ReportsPageComponent),
        canActivate: [roleGuard([UserRole.ADMIN])],
      },
    ],
  },
];
