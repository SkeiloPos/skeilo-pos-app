import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AdminAuditLogItem, AuditLogFilters } from '../interfaces/admin-user.interface';
import { PageWithEmptyReason } from '../interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import { firstValueFrom } from 'rxjs';

/** Auditoría administrativa de alcance plataforma (spec 159, User Story 7,
 * FR-033 a FR-038). Mismo patrón que `SuperAdminUsersService` (listado con
 * `injectPagedQuery`, filtros como señal, página reseteada a 1 al filtrar). */
@Injectable({ providedIn: 'root' })
export class SuperAdminAuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin/audit-logs`;

  readonly page = signal(1);
  readonly size = signal(20);
  readonly filters = signal<AuditLogFilters>({});

  private readonly logsQuery = injectPagedQuery<AdminAuditLogItem>({
    queryKey: () => [
      'super-admin-audit-logs', 'page',
      { page: this.page(), size: this.size(), filters: this.filters() },
    ],
    queryFn: () => this.fetchAuditLogsPage(this.page(), this.size(), this.filters()),
    enabled: () => true,
  });

  readonly items = computed(() => this.logsQuery.data()?.items ?? []);
  readonly total = computed(() => this.logsQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.logsQuery.data()?.pages ?? 0);
  readonly emptyReason = computed(
    () => (this.logsQuery.data() as PageWithEmptyReason<AdminAuditLogItem> | undefined)?.empty_reason ?? null,
  );
  readonly isInitialLoading = computed(() => this.logsQuery.isLoading());
  readonly hasError = computed(() => this.logsQuery.isError());

  private fetchAuditLogsPage(
    page: number, size: number, filters: AuditLogFilters,
  ): Promise<PageWithEmptyReason<AdminAuditLogItem>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (filters.affected_user_id) params = params.set('affected_user_id', filters.affected_user_id);
    if (filters.actor_user_id) params = params.set('actor_user_id', filters.actor_user_id);
    if (filters.tenant_id != null) params = params.set('tenant_id', filters.tenant_id);
    if (filters.action) params = params.set('action', filters.action);
    if (filters.date_from) params = params.set('date_from', filters.date_from);
    if (filters.date_to) params = params.set('date_to', filters.date_to);

    return firstValueFrom(
      this.http.get<PageWithEmptyReason<AdminAuditLogItem>>(this.baseUrl, { params }),
    );
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  /** Reemplaza los filtros activos y vuelve a la página 1 (FR-036). */
  setFilters(filters: AuditLogFilters): void {
    this.filters.set({ ...filters });
    this.page.set(1);
  }

  clearFilters(): void {
    this.filters.set({});
    this.page.set(1);
  }

  retry(): void {
    this.logsQuery.refetch();
  }
}
