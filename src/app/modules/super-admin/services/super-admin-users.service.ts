import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  RoleOption,
  UserListFilters,
  UserListItem,
  UserStats,
} from '../interfaces/admin-user.interface';
import { PageWithEmptyReason } from '../interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';

const DEFAULT_FILTERS: UserListFilters = { sort_by: 'created_at', sort_dir: 'desc' };

@Injectable({ providedIn: 'root' })
export class SuperAdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin/users`;

  // ---- Listado centralizado (spec 159, User Story 1) -----------------------

  readonly page = signal(1);
  readonly size = signal(20);
  readonly filters = signal<UserListFilters>(DEFAULT_FILTERS);

  private readonly listQuery = injectPagedQuery<UserListItem>({
    queryKey: () => [
      'super-admin-users', 'page',
      { page: this.page(), size: this.size(), filters: this.filters() },
    ],
    queryFn: () => this.fetchUsersPage(this.page(), this.size(), this.filters()),
    enabled: () => true,
  });

  readonly listItems = computed(() => this.listQuery.data()?.items ?? []);
  readonly listTotal = computed(() => this.listQuery.data()?.total ?? 0);
  readonly listTotalPages = computed(() => this.listQuery.data()?.pages ?? 0);
  readonly emptyReason = computed(
    () => (this.listQuery.data() as PageWithEmptyReason<UserListItem> | undefined)?.empty_reason ?? null,
  );
  readonly isListLoading = computed(() => this.listQuery.isFetching());
  readonly isListInitialLoading = computed(() => this.listQuery.isLoading());
  readonly listHasError = computed(() => this.listQuery.isError());

  private fetchUsersPage(
    page: number, size: number, filters: UserListFilters,
  ): Promise<PageWithEmptyReason<UserListItem>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (filters.search) params = params.set('search', filters.search);
    for (const status of filters.status ?? []) params = params.append('status', status);
    if (filters.role_id) params = params.set('role_id', filters.role_id);
    if (filters.plan_id) params = params.set('plan_id', filters.plan_id);
    if (filters.registered_from) params = params.set('registered_from', filters.registered_from);
    if (filters.registered_to) params = params.set('registered_to', filters.registered_to);
    params = params.set('sort_by', filters.sort_by ?? 'created_at');
    params = params.set('sort_dir', filters.sort_dir ?? 'desc');

    return firstValueFrom(
      this.http.get<PageWithEmptyReason<UserListItem>>(this.baseUrl, { params }),
    );
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  setSize(size: number): void {
    this.size.set(size);
    this.page.set(1);
  }

  /** Reemplaza los filtros/búsqueda activos y vuelve a la página 1 (FR-005). */
  setFilters(filters: UserListFilters): void {
    this.filters.set({ ...filters });
    this.page.set(1);
  }

  /** Única acción de "limpiar filtros" (FR-005): conserva el orden vigente. */
  clearFilters(): void {
    const current = this.filters();
    this.filters.set({ sort_by: current.sort_by, sort_dir: current.sort_dir });
    this.page.set(1);
  }

  setSort(sortBy: NonNullable<UserListFilters['sort_by']>, sortDir: NonNullable<UserListFilters['sort_dir']>): void {
    this.filters.set({ ...this.filters(), sort_by: sortBy, sort_dir: sortDir });
    this.page.set(1);
  }

  retryList(): void {
    this.listQuery.refetch();
  }

  // ---- Indicadores generales (spec 159, User Story 2, FR-008/FR-009) --------

  private readonly statsQuery = injectQuery(() => ({
    queryKey: ['super-admin-users-stats'],
    queryFn: () => firstValueFrom(
      this.http.get<UserStats>(`${environment.apiBaseUrl}/super-admin/users/stats`),
    ),
  }));

  readonly stats = computed(() => this.statsQuery.data() ?? null);
  readonly isStatsLoading = computed(() => this.statsQuery.isLoading());
  readonly statsHasError = computed(() => this.statsQuery.isError());

  /** Refresca el listado y los indicadores sin recargar la página (FR-009).
   * Lo llama cualquier acción administrativa que cambie el estado de un
   * usuario (suspender/reactivar, Historia 4) además de este propio módulo. */
  refreshListAndStats(): void {
    this.listQuery.refetch();
    this.statsQuery.refetch();
  }

  // ---- Catálogo de roles (selector de filtro, FR-005) -----------------------

  readonly roles = signal<RoleOption[]>([]);

  async loadRoles(): Promise<void> {
    try {
      this.roles.set(
        await firstValueFrom(this.http.get<RoleOption[]>(`${environment.apiBaseUrl}/super-admin/roles`)),
      );
    } catch {
      // El selector de filtro de rol simplemente queda vacío -- no bloquea el listado principal.
    }
  }
}
