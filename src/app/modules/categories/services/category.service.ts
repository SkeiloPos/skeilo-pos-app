import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import {
  Category,
  CategoryCreatePayload,
  CategoryForm,
  CategoryUpdatePayload,
} from '../interfaces/category.interface';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/categories`;

  readonly isSubmitting = signal(false);
  /** Errores fuera de las dos queries: mutaciones y validaciones de formulario
   *  (`category-form.component.ts` escribe acá directo para su banner). */
  readonly otherError = signal<string | null>(null);

  // Entrada de las queries reactivas (antes: reflejo del `Page<T>` del backend).
  readonly page = signal(1);
  readonly size = signal(20);
  readonly search = signal('');
  readonly activeFilter = signal<'' | 'active' | 'inactive'>('');
  private readonly wantsPage = signal(false);
  private readonly wantsAll = signal(false);

  /** Página actual, para la tabla de Categorías. */
  private readonly pageQuery = injectPagedQuery<Category>({
    queryKey: () => [
      'categories',
      'page',
      { page: this.page(), size: this.size(), search: this.search().trim(), active: this.activeFilter() },
    ],
    queryFn: () => this.fetchCategoriesPage(this.page(), this.size(), this.search().trim(), this.activeFilter()),
    enabled: () => this.wantsPage(),
  });

  /** Lista completa (tope 100), para pickers/validaciones en otros módulos. */
  private readonly allQuery = injectPagedQuery<Category>({
    queryKey: () => ['categories', 'all'],
    queryFn: () =>
      firstValueFrom(this.http.get<Page<Category>>(this.baseUrl, { params: { size: 100 } })),
    enabled: () => this.wantsAll(),
  });

  readonly categories = computed(() => this.pageQuery.data()?.items ?? []);
  readonly allCategories = computed(() =>
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

  private fetchCategoriesPage(
    page: number,
    size: number,
    search: string,
    activeFilter: '' | 'active' | 'inactive',
  ): Promise<Page<Category>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    if (activeFilter === 'active') params = params.set('active', 'true');
    if (activeFilter === 'inactive') params = params.set('active', 'false');
    return firstValueFrom(this.http.get<Page<Category>>(this.baseUrl, { params }));
  }

  loadCategories(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  /** Lista completa (tope 100) para pickers/validaciones de otros módulos. */
  loadAllCategories(): void {
    this.otherError.set(null);
    this.wantsAll.set(true);
  }

  /**
   * Búsqueda server-side para el picker de categoría del formulario de producto (spec 102,
   * D3): a diferencia de `allCategories()` (una sola página de 100, sin `search`), esto reutiliza
   * `fetchCategoriesPage()` (la misma función que ya usa el listado de Categorías), así que una
   * categoría fuera de esa primera página de 100 sigue siendo encontrable escribiendo su nombre.
   */
  searchActiveCategories(query: string): Promise<Category[]> {
    return this.fetchCategoriesPage(1, 20, query.trim(), 'active').then((page) => page.items);
  }

  /** Aplica el término de búsqueda y recarga desde la página 1. */
  setSearch(term: string): void {
    this.search.set(term);
    this.loadCategories(1);
  }

  /** Aplica el filtro de estado y recarga desde la página 1. */
  setActiveFilter(filter: '' | 'active' | 'inactive'): void {
    this.activeFilter.set(filter);
    this.loadCategories(1);
  }

  async createCategory(data: CategoryForm): Promise<void> {
    this.isSubmitting.set(true);
    this.otherError.set(null);

    const payload: CategoryCreatePayload = {
      name: data.name,
      description: data.description || null,
      display_order: data.display_order,
      presentation_ids: data.presentation_ids,
    };

    try {
      await firstValueFrom(this.http.post<Category>(this.baseUrl, payload));
      // A diferencia de update/toggle: crear siempre salta a la página 1 (paridad
      // con el `loadCategories(1)` explícito de antes).
      this.page.set(1);
      await this.queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err) {
      this.otherError.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async updateCategory(id: string, data: CategoryForm): Promise<void> {
    this.isSubmitting.set(true);
    this.otherError.set(null);

    const payload: CategoryUpdatePayload = {
      name: data.name,
      description: data.description || null,
      display_order: data.display_order,
      presentation_ids: data.presentation_ids,
    };

    try {
      await firstValueFrom(this.http.patch<Category>(`${this.baseUrl}/${id}`, payload));
      await this.queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err) {
      this.otherError.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.otherError.set(null);

    const payload: CategoryUpdatePayload = { active: !current, display_order: null };

    try {
      await firstValueFrom(this.http.patch<Category>(`${this.baseUrl}/${id}`, payload));
      await this.queryClient.invalidateQueries({ queryKey: ['categories'] });
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
