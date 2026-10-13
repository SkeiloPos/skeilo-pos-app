import { NavItem } from '../interfaces/navigation.interface';
import { UserRole } from '../interfaces/user.interface';

export const NAV_ITEMS: NavItem[] = [
  // ── PRINCIPAL ──────────────────────────────────────────────────────────
  {
    label: 'Dashboard',
    icon: 'dashboard',
    route: '/dashboard/admin',
    group: 'PRINCIPAL',
    roles: [UserRole.ADMIN],
    frame: { label: 'Dashboard', icon: 'layout-dashboard', group: 'Inicio' },
  },
  {
    label: 'Ventas',
    icon: 'sales',
    route: '/dashboard/ventas',
    group: 'PRINCIPAL',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
    frame: { label: 'Ventas', icon: 'shopping-cart', group: 'Operación' },
  },
  {
    label: 'Reportes',
    icon: 'reports',
    route: '/dashboard/reports',
    group: 'PRINCIPAL',
    roles: [UserRole.ADMIN],
    frame: { label: 'Reportes', icon: 'chart-column', group: 'Control' },
  },

  // ── OPERACIONES ────────────────────────────────────────────────────────
  {
    label: 'Órdenes',
    icon: 'orders',
    route: '/dashboard/orders',
    group: 'OPERACIONES',
    roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.MESERO],
    frame: { label: 'Órdenes', icon: 'receipt', group: 'Operación' },
  },
  {
    label: 'Mesas',
    icon: 'tables',
    route: '/dashboard/mesas',
    group: 'OPERACIONES',
    roles: [UserRole.ADMIN],
    frame: { label: 'Mesas', icon: 'layout-grid', group: 'Operación' },
  },
  {
    label: 'Terminal de mesas',
    icon: 'sessions',
    route: '/dashboard/mesas-sesiones',
    group: 'OPERACIONES',
    roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.MESERO],
    frame: { label: 'Terminal de Mesas', icon: 'qr-code', group: 'Operación' },
  },

  // ── CATÁLOGO ───────────────────────────────────────────────────────────
  {
    label: 'Carta del menú',
    icon: 'products',
    route: '/dashboard/products',
    group: 'CATÁLOGO',
    // spec 093: el Cajero entra a la misma pantalla, en solo lectura salvo el
    // interruptor "Agotado" (ver ProductsPageComponent.isAdmin).
    roles: [UserRole.ADMIN, UserRole.CASHIER],
    frame: { label: 'Carta del Menú', icon: 'book-open', group: 'Catálogo' },
  },
  {
    label: 'Categorías',
    icon: 'categories',
    route: '/dashboard/categories',
    group: 'CATÁLOGO',
    roles: [UserRole.ADMIN],
    frame: { label: 'Categorías', icon: 'tags', group: 'Catálogo' },
  },
  {
    label: 'Presentaciones',
    icon: 'presentations',
    route: '/dashboard/presentations',
    group: 'CATÁLOGO',
    roles: [UserRole.ADMIN],
    // spec 083 (research.md D3): sin moduleKey -- catálogo base, mismo criterio
    // que Categorías/Productos, no un módulo pago como Promociones.
    frame: { label: 'Presentaciones', icon: 'cup-soda', group: 'Catálogo' },
  },
  {
    label: 'Promociones',
    icon: 'promotions',
    route: '/dashboard/promotions',
    group: 'CATÁLOGO',
    roles: [UserRole.ADMIN],
    moduleKey: 'promociones',
    frame: { label: 'Promociones', icon: 'percent', group: 'Catálogo' },
  },

  // ── ADMINISTRACIÓN ─────────────────────────────────────────────────────
  {
    label: 'Inventario',
    icon: 'inventory',
    route: '/dashboard/inventario',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
    moduleKey: 'inventario',
    frame: { label: 'Inventario', icon: 'package', group: 'Inventario' },
  },
  {
    label: 'Proveedores',
    icon: 'suppliers',
    route: '/dashboard/proveedores',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
    frame: { label: 'Proveedores', icon: 'truck', group: 'Inventario' },
  },
  {
    label: 'Caja',
    icon: 'cash',
    route: '/dashboard/caja',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
    frame: { label: 'Cajas', icon: 'banknote', group: 'Control' },
  },
  {
    label: 'Usuarios',
    icon: 'users',
    route: '/dashboard/users',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
    frame: { label: 'Usuarios', icon: 'users', group: 'Administración' },
  },
  {
    label: 'Ajustes',
    icon: 'settings',
    route: '/dashboard/ajustes',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
    frame: { label: 'Ajustes', icon: 'settings', group: 'Administración' },
  },
];

/**
 * Navegación del área Super Admin (dominio raíz). No se filtra por rol: estos
 * ítems se muestran cuando el usuario autenticado es super admin.
 */
export const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'Tenants',
    icon: 'tenants',
    route: '/super-admin/tenants',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Usuarios',
    icon: 'users',
    route: '/super-admin/users',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Métodos de pago',
    icon: 'payment-methods',
    route: '/super-admin/payment-methods-catalog',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Planes',
    icon: 'layers',
    route: '/super-admin/plans',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
];
