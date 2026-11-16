import { UserRole } from './user.interface';
import { ModuleAccess } from '../../modules/plan/interfaces/plan-summary.interface';

export interface NavItem {
  label: string;
  /** Semantic icon name resolved by the icon system (see IconComponent). */
  icon: string;
  route: string;
  /** Section this item belongs to (see NAV_GROUP_ORDER). */
  group: string;
  roles: UserRole[];
  /** Clave de `ModuleAccess` que gobierna este ítem (spec 033, Historias 4/5):
   * si el plan vigente del tenant no la incluye (o el tenant está vencido),
   * el ítem se oculta del sidebar. Sin definir = siempre visible para los
   * roles indicados (no todo módulo está gobernado por el plan). */
  moduleKey?: keyof ModuleAccess;
  /**
   * Presentación nueva del sidebar/navbar de tenant (spec 116,
   * data-model.md §4) — aditiva: `route`/`roles`/`moduleKey` siguen siendo la
   * única fuente de verdad del acceso (FR-005/FR-006), sin cambios. La lee
   * `app-tenant-sidebar`, también para los ítems de Super Admin
   * (`SUPER_ADMIN_NAV_ITEMS`, grupo `'Plataforma'`) — el componente legado
   * (`SidebarComponent`) ya no se usa en el shell principal.
   */
  frame?: {
    label: string;
    icon: string;
    group:
      | 'Inicio'
      | 'Operación'
      | 'Catálogo'
      | 'Inventario'
      | 'Control'
      | 'Administración'
      | 'Plataforma';
  };
}

/** Order in which sidebar sections are rendered (componente legado). */
export const NAV_GROUP_ORDER = [
  'PRINCIPAL',
  'OPERACIONES',
  'CATÁLOGO',
  'ADMINISTRACIÓN',
  'PLATAFORMA',
] as const;

/**
 * Orden de los grupos del sidebar/navbar de tenant rediseñado (spec 116,
 * data-model.md §4; contracts/navigation-grouping-contract.md). `Plataforma`
 * se añade para los ítems de Super Admin, que ahora comparten este mismo
 * sidebar en vez del componente legado.
 */
export const TENANT_FRAME_GROUP_ORDER = [
  'Inicio',
  'Operación',
  'Catálogo',
  'Inventario',
  'Control',
  'Administración',
  'Plataforma',
] as const;
