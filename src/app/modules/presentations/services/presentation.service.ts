import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import {
  Presentation,
  PresentationCreatePayload,
  PresentationForm,
  PresentationUpdatePayload,
} from '../interfaces/presentation.interface';

@Injectable({ providedIn: 'root' })
export class PresentationService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/presentations`;

  readonly isSubmitting = signal(false);
  /** Errores fuera de las dos queries: mutaciones y validaciones de formulario
   *  (`presentation-form` escribe acá directo para su banner). */
  readonly otherError = signal<string | null>(null);

  readonly page = signal(1);
  readonly size = signal(20);
  readonly search = signal('');
  readonly activeFilter = signal<'' | 'active' | 'inactive'>('');
  private readonly wantsPage = signal(false);
  private readonly wantsAll = signal(false);

  /** Página actual, para el listado de Presentaciones. */
  private readonly pageQuery = injectPagedQuery<Presentation>({
    queryKey: () => [
      'presentations',
      'page',
      { page: this.page(), size: this.size(), search: this.search().trim(), active: this.activeFilter() },
    ],
    queryFn: () => this.fetchPresentationsPage(this.page(), this.size(), this.search().trim(), this.activeFilter()),
    enabled: () => this.wantsPage(),
  });

  /** Lista completa (tope 100), para el picker de presentaciones de Categorías (US2). */
  private readonly allQuery = injectPagedQuery<Presentation>({
    queryKey: () => ['presentations', 'all'],
    queryFn: () =>
      firstValueFrom(this.http.get<Page<Presentation>>(this.baseUrl, { params: { size: 100 } })),
    enabled: () => this.wantsAll(),
  });

  readonly presentations = computed(() => this.pageQuery.data()?.items ?? []);
  readonly allPresentations = computed(() =>
    [...(this.allQuery.data()?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly total = computed(() => this.pageQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.pageQuery.data()?.pages ?? 0);
  readonly loading = computed(() => this.pageQuery.isFetching());
  readonly error = computed(() => {
    if (this.otherError()) return this.otherError();
    if (this.pageQuery.isError()) return this.extractError(this.pageQuery.error());
    if (this.allQuery.isError()) return this.extractError(this.allQuery.error());
    return null;
  });

  private fetchPresentationsPage(
    page: number,
    size: number,
    search: string,
    activeFilter: '' | 'active' | 'inactive',
  ): Promise<Page<Presentation>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    if (activeFilter === 'active') params = params.set('active', 'true');
    if (activeFilter === 'inactive') params = params.set('active', 'false');
    return firstValueFrom(this.http.get<Page<Presentation>>(this.baseUrl, { params }));
  }

  loadPresentations(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  /** Lista completa (tope 100) para el picker de presentaciones de Categorías. */
  loadAllPresentations(): void {
    this.otherError.set(null);
    this.wantsAll.set(true);
  }

  /**
   * Búsqueda server-side para el picker de presentación del formulario de producto (spec 102,
   * D3): a diferencia de `allPresentations()` (una sola página de 100, sin `search`), esto
   * reutiliza `fetchPresentationsPage()` (la misma función que ya usa el listado de
   * Presentaciones), así que una presentación fuera de esa primera página de 100 sigue siendo
   * encontrable escribiendo su nombre.
   */
  searchActivePresentations(query: string): Promise<Presentation[]> {
    return this.fetchPresentationsPage(1, 20, query.trim(), 'active').then((page) => page.items);
  }

  /** Aplica el término de búsqueda y recarga desde la página 1. */
  setSearch(term: string): void {
    this.search.set(term);
    this.loadPresentations(1);
  }

  /** Aplica el filtro de estado y recarga desde la página 1. */
  setActiveFilter(filter: '' | 'active' | 'inactive'): void {
    this.activeFilter.set(filter);
    this.loadPresentations(1);
  }

  async createPresentation(data: PresentationForm): Promise<void> {
    this.isSubmitting.set(true);
    this.otherError.set(null);

    const payload: PresentationCreatePayload = { name: data.name };

    try {
      await firstValueFrom(this.http.post<Presentation>(this.baseUrl, payload));
      this.page.set(1);
      await this.queryClient.invalidateQueries({ queryKey: ['presentations'] });
    } catch (err) {
      this.otherError.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updatePresentation(id: string, data: PresentationForm): Promise<void> {
    this.isSubmitting.set(true);
    this.otherError.set(null);

    const payload: PresentationUpdatePayload = { name: data.name };

    try {
      await firstValueFrom(this.http.patch<Presentation>(`${this.baseUrl}/${id}`, payload));
      await this.queryClient.invalidateQueries({ queryKey: ['presentations'] });
    } catch (err) {
      this.otherError.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.otherError.set(null);

    const payload: PresentationUpdatePayload = { active: !current };

    try {
      await firstValueFrom(this.http.patch<Presentation>(`${this.baseUrl}/${id}`, payload));
      await this.queryClient.invalidateQueries({ queryKey: ['presentations'] });
    } catch (err) {
      this.otherError.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
