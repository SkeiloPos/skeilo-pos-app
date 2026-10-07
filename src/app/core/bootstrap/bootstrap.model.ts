import { TenantInfo } from '../tenant/tenant-info.service';
import { PlanSummary } from '../../modules/plan/interfaces/plan-summary.interface';
import { NotificationListResponse } from '../notifications/notification.model';

/** Espejo de `BootstrapResponse` (`GET /api/v1/bootstrap`, spec 100,
 * data-model.md) — cada bloque es `null` cuando no hay tenant resuelto
 * (Super Admin, FR-007) o cuando solo esa fuente falló (FR-006). */
export interface BootstrapResponse {
  tenant: TenantInfo | null;
  plan: PlanSummary | null;
  notifications: NotificationListResponse | null;
}
