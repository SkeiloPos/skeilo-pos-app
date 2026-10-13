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
   * única fuente de verdad del acceso (FR-005/FR-006), sin cambios. Solo la
   * lee `app-tenant-sidebar`; el componente legado (Super Admin,
   * research.md R1) no la necesita.
   */
  frame?: {
    label: string;
    icon: string;
    group: 'Inicio' | 'Operación' | 'Catálogo' | 'Inventario' | 'Control' | 'Administración';
  };
}

/** Order in which sidebar sections are rendered. */
export const NAV_GROUP_ORDER = [
  'PRINCIPAL',
  'OPERACIONES',
  'CATÁLOGO',
  'ADMINISTRACIÓN',
  'PLATAFORMA',
] as const;

/**
 * Orden de los 6 grupos del sidebar/navbar de tenant rediseñado (spec 116,
 * data-model.md §4; contracts/navigation-grouping-contract.md). Independiente
 * de `NAV_GROUP_ORDER`, que sigue gobernando solo al componente legado
 * (Super Admin, grupo único `PLATAFORMA`).
 */
export const TENANT_FRAME_GROUP_ORDER = [
  'Inicio',
  'Operación',
  'Catálogo',
  'Inventario',
  'Control',
  'Administración',
] as const;
