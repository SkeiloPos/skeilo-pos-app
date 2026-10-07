import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationCenterService } from '../notifications/notification-center.service';
import { TenantInfoService } from '../tenant/tenant-info.service';
import { PlanSummaryService } from '../../modules/plan/services/plan-summary.service';
import { BootstrapResponse } from './bootstrap.model';

/**
 * Arranque agregado del panel (`GET /api/v1/bootstrap`, spec 100): una sola
 * petición HTTP en vez de las 3 independientes que `TenantInfoService`,
 * `PlanSummaryService` y `NotificationCenterService` disparaban por su
 * cuenta. Reparte cada bloque a su `hydrate()` correspondiente — ninguno
 * dispara HTTP propio al hidratarse.
 */
@Injectable({ providedIn: 'root' })
export class BootstrapService {
  private readonly http = inject(HttpClient);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly planSummaryService = inject(PlanSummaryService);
  private readonly notificationCenter = inject(NotificationCenterService);
  private readonly baseUrl = `${environment.apiBaseUrl}/bootstrap`;

  async load(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<BootstrapResponse>(this.baseUrl));
      this.tenantInfo.hydrate(res.tenant);
      this.planSummaryService.hydrate(res.plan);
      this.notificationCenter.hydrate(res.notifications);
    } catch {
      // Fallo total (red, timeout, 5xx): sin reintentos automáticos dentro de
      // esta misma carga (FR-005) — ningún hydrate() se llama, el panel queda
      // con los valores por defecto actuales de cada servicio.
    }
  }
}
