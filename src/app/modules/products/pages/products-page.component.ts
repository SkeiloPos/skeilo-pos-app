import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Product } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { RelativeTimePipe } from '../../../shared/relative-time.pipe';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { ProductImportModalComponent } from '../components/product-import-modal.component';
import { ProductListCardComponent } from '../components/product-list-card.component';
import { formatProductPrice } from '../product-price.util';
import { CategoryService } from '../../categories/services/category.service';
import {
  AvailabilitySyncService,
  AvailabilityTarget,
} from '../../../core/availability/availability-sync.service';
import { AvailabilityChange, AvailabilitySnapshot } from '../../../core/availability/availability.model';
import { LiveStatusIndicatorComponent } from '../../../core/availability/live-status-indicator.component';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [
    FormsModule,
    PaginationBarComponent,
    IconMiComponent,
    RelativeTimePipe,
    TenantDatePipe,
    ProductImportModalComponent,
    ProductListCardComponent,
    LiveStatusIndicatorComponent,
  ],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold text-gray-900">Carta del menú</h1>
            <app-live-status-indicator />
          </div>
          <p class="text-gray-500 text-sm mt-1">
            {{ isAdmin() ? 'Gestiona el catálogo de productos' : 'Consulta el catálogo y marca lo que se agote' }}
          </p>
        </div>
        @if (isAdmin()) {
          <div class="flex items-center gap-2">
            <button
              (click)="openCreate()"
              class="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors whitespace-nowrap"
            >
              <app-mi-icon name="add" [size]="16" /> Nuevo producto
            </button>
            <!-- "Exportar carta"/"Importar Excel": en móvil se mueven al final del
                 panel de filtros (dentro del mismo toggle), para no saturar el
                 encabezado en pantallas angostas. -->
            <button
              (click)="exportProducts()"
              class="hidden sm:flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm transition-colors whitespace-nowrap"
            >
              <app-mi-icon name="download" [size]="16" /> Exportar carta
            </button>
            <button
              (click)="showImportModal.set(true)"
              class="hidden sm:flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm transition-colors whitespace-nowrap"
            >
              <app-mi-icon name="upload" [size]="16" /> Importar Excel
            </button>
          </div>
        }
      </div>

      @if (showImportModal()) {
        <app-product-import-modal
          (close)="showImportModal.set(false)"
          (imported)="productService.loadProducts()"
        />
      }

      <!-- Filters -->
      <div>
        <!-- Toggle solo en móvil: los filtros quedan colapsados para no empujar el
             listado hacia abajo en pantallas angostas (siempre visibles en sm y mayores). -->
        <button
          (click)="showFilters.set(!showFilters())"
          type="button"
          [attr.aria-expanded]="showFilters()"
          aria-controls="filters-panel"
          class="w-full sm:hidden flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-sm transition-colors"
        >
          <app-mi-icon name="filter_list" [size]="16" />
          Filtros
          <app-mi-icon [name]="showFilters() ? 'expand_less' : 'expand_more'" [size]="16" />
        </button>
        <div
          id="filters-panel"
          class="flex-col gap-3 mt-3 sm:mt-0 sm:flex sm:flex-row sm:flex-wrap sm:items-end"
          [class.flex]="showFilters()"
          [class.hidden]="!showFilters()"
        >
          <div class="w-full sm:w-auto sm:flex-1 sm:min-w-48 flex flex-col gap-1">
            <label for="f-search" class="text-xs font-medium text-gray-500">Buscar</label>
            <input
              id="f-search"
              type="text"
              [ngModel]="searchSignal()"
              (ngModelChange)="onSearchInput($event)"
              placeholder="Buscar por nombre..."
              class="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          @if (isAdmin()) {
            <div class="w-full sm:w-auto flex flex-col gap-1">
              <label for="f-status" class="text-xs font-medium text-gray-500">Estado</label>
              <select
                id="f-status"
                [ngModel]="statusFilterValue"
                (ngModelChange)="onStatusFilterChange($event)"
                class="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
          }
          <div class="w-full sm:w-auto flex flex-col gap-1">
            <label for="f-availability" class="text-xs font-medium text-gray-500">Disponibilidad</label>
            <select
              id="f-availability"
              [ngModel]="availabilityFilterValue"
              (ngModelChange)="onAvailabilityFilterChange($event)"
              class="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="all">Todos</option>
              <option value="available">Disponibles</option>
              <option value="sold_out">Agotados</option>
            </select>
          </div>
          <!-- spec 152 (US2, FR-003/FR-004): filtro de categoría, server-side, AND con
               el resto de filtros. -->
          <div class="w-full sm:w-auto flex flex-col gap-1">
            <label for="f-category" class="text-xs font-medium text-gray-500">Categoría</label>
            <select
              id="f-category"
              [ngModel]="categoryFilterValue"
              (ngModelChange)="onCategoryFilterChange($event)"
              class="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="">Todas las categorías</option>
              @for (category of categoryService.allCategories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </div>
          <!-- "Exportar carta"/"Importar Excel": solo en móvil (en sm y mayores ya
               están en el encabezado) -- al final del mismo panel de filtros. -->
          @if (isAdmin()) {
            <div class="w-full sm:hidden flex flex-col gap-2 pt-2 border-t border-gray-100">
              <button
                (click)="exportProducts()"
                class="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm transition-colors"
              >
                <app-mi-icon name="download" [size]="16" /> Exportar carta
              </button>
              <button
                (click)="showImportModal.set(true)"
                class="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm transition-colors"
              >
                <app-mi-icon name="upload" [size]="16" /> Importar Excel
              </button>
            </div>
          }
        </div>
      </div>

      <!-- Error banner -->
      @if (productService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ productService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (productService.loading() && productService.products().length === 0) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (productService.products().length === 0) {
            <!-- Empty state -->
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <app-mi-icon name="shopping_bag" [size]="48" class="mb-4" />
              @if (searchSignal() || statusFilterValue !== 'all' || availabilityFilterValue !== 'all' || categoryFilterValue) {
                <p class="text-gray-600 font-medium">No hay productos que coincidan</p>
                <p class="text-gray-400 text-sm mt-1">Intenta cambiar los filtros</p>
              } @else {
                <p class="text-gray-600 font-medium">Aún no hay productos</p>
                <p class="text-gray-400 text-sm mt-1">Crea el primer producto para comenzar</p>
                <button
                  (click)="openCreate()"
                  class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Crear producto
                </button>
              }
            </div>
          } @else {
            <!-- Tarjetas: móvil/tablet (< 1024px, spec 152 research.md D1) -->
            <div class="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
              @for (product of productService.products(); track product.id) {
                <app-product-list-card
                  [product]="product"
                  [isAdmin]="isAdmin()"
                  (click)="onRowClick(product)"
                  (toggleAvailable)="onToggleAvailable(product)"
                  (toggleActive)="onToggle(product)"
                  (edit)="openEdit(product)"
                  (viewDetail)="onRowClick(product)"
                />
              }
            </div>
            <!-- Tabla: escritorio (>= 1024px) -->
            <div class="hidden lg:block overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50">
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Nombre
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Categoría
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Preparación
                    </th>
                    <th
                      class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Precio
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Estado
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Creación
                    </th>
                    <th
                      class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Actualización
                    </th>
                    <th
                      class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  @for (product of productService.products(); track product.id) {
                    <tr
                      [class.opacity-50]="!product.active"
                      (click)="onRowClick(product)"
                      class="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td class="px-5 py-4">
                        <div class="flex items-center gap-3">
                          @if (product.image_url) {
                            <img
                              [src]="product.image_url"
                              [alt]="product.name"
                              class="w-9 h-9 rounded-lg object-cover shrink-0"
                            />
                          } @else {
                            <div
                              class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"
                            >
                              <app-mi-icon name="image-off" ariaLabel="Sin imagen" [size]="18" class="text-indigo-600" />
                            </div>
                          }
                          <span
                            class="text-sm font-medium"
                            [class.text-gray-400]="!product.active"
                            [class.text-gray-900]="product.active"
                          >
                            {{ product.name }}
                          </span>
                        </div>
                      </td>
                      <td class="px-5 py-4">
                        <span class="text-sm text-gray-500">{{ product.category_name ?? 'Sin categoría' }}</span>
                      </td>
                      <td class="px-5 py-4">
                        <span
                          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          [class]="
                            product.preparation_type === 'packaged'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          "
                        >
                          {{ product.preparation_type === 'packaged' ? 'Empacado' : 'Preparado' }}
                        </span>
                      </td>
                      <td class="px-5 py-4 text-right">
                        <span class="text-sm font-medium text-gray-900 whitespace-nowrap">{{
                          priceText(product)
                        }}</span>
                      </td>
                      <td class="px-5 py-4">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          @if (product.active) {
                            <span
                              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                              >Activo</span
                            >
                          } @else {
                            <span
                              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500"
                              >Inactivo</span
                            >
                          }
                          @if (!product.available) {
                            <span
                              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
                              >Agotado</span
                            >
                            @if (product.available_changed_at) {
                              <span class="text-xs text-gray-400">{{
                                product.available_changed_at | relativeTime
                              }}</span>
                            }
                          }
                        </div>
                      </td>
                      <td class="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {{ product.created_at | tenantDate: 'short' }}
                      </td>
                      <td class="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">
                        @if (product.updated_at) {
                          {{ product.updated_at | tenantDate: 'short' }}
                        } @else {
                          —
                        }
                      </td>
                      <td class="px-5 py-4" (click)="$event.stopPropagation()">
                        <div class="flex items-center justify-end gap-2">
                          <button
                            (click)="onToggleAvailable(product)"
                            [disabled]="!product.active"
                            [title]="
                              !product.active
                                ? 'Un producto inactivo no se puede marcar como agotado'
                                : product.available
                                  ? 'Marcar agotado'
                                  : 'Marcar disponible'
                            "
                            class="p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            [class]="
                              product.available
                                ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-amber-500 hover:text-emerald-600 hover:bg-emerald-50'
                            "
                          >
                            <app-mi-icon
                              [name]="product.available ? 'check_circle' : 'block'"
                              [ariaLabel]="product.available ? 'Marcar agotado' : 'Marcar disponible'"
                              [size]="18"
                            />
                          </button>
                          @if (isAdmin()) {
                            <button
                              (click)="openEdit(product)"
                              title="Editar"
                              class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <app-mi-icon name="edit" ariaLabel="Editar" [size]="18" />
                            </button>
                            <button
                              (click)="onToggle(product)"
                              [title]="product.active ? 'Desactivar' : 'Activar'"
                              class="p-2 rounded-lg transition-colors"
                              [class]="
                                product.active
                                  ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                  : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                              "
                            >
                              <app-mi-icon
                                name="circle"
                                [ariaLabel]="product.active ? 'Desactivar' : 'Activar'"
                                [size]="14"
                              />
                            </button>
                          } @else {
                            <button
                              (click)="onRowClick(product)"
                              title="Ver detalle"
                              class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <app-mi-icon name="eye" ariaLabel="Ver detalle" [size]="18" />
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <app-pagination-bar
            [page]="productService.page()"
            [size]="productService.size()"
            [total]="productService.total()"
            [totalPages]="productService.totalPages()"
            [loading]="productService.loading()"
            (pageChange)="productService.loadProducts($event, productService.size())"
            (sizeChange)="productService.loadProducts(1, $event)"
          />
        </div>
      }
    </div>
  `,
})
export class ProductsPageComponent implements OnInit, OnDestroy, AvailabilityTarget {
  readonly productService = inject(ProductService);
  readonly categoryService = inject(CategoryService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly availabilitySync = inject(AvailabilitySyncService);
  private unregisterAvailabilityTarget: (() => void) | null = null;

  /** spec 093: el Cajero comparte esta pantalla con el Admin, en solo lectura salvo
   *  el interruptor "Agotado" -- mismo patrón que `cash-session.store.ts`. */
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === UserRole.ADMIN);

  /** Local echo of the search box; the actual query to the service is debounced. */
  readonly searchSignal = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  statusFilterValue: 'all' | 'active' | 'inactive' = 'all';
  availabilityFilterValue: 'all' | 'available' | 'sold_out' = 'all';
  /** `''` = "Todas las categorías" (spec 152, US2). */
  categoryFilterValue = '';

  readonly showImportModal = signal(false);
  /** Panel de filtros responsive: en móvil queda colapsado detrás de este toggle
   *  (siempre visible en sm y mayores). "Exportar carta"/"Importar Excel" viven al
   *  final de este mismo panel solo en móvil -- en sm y mayores están en el
   *  encabezado. */
  readonly showFilters = signal(false);

  ngOnInit(): void {
    this.productService.loadProducts();
    // spec 152 (US2): carga única del catálogo completo (tope 100, igual que
    // `allCategories()` en el resto del módulo) para poblar el selector del filtro --
    // no es una búsqueda reactiva por tecleo, así que no aplica la recomendación de
    // evitar fetches proactivos en selectores de búsqueda remota.
    this.categoryService.loadAllCategories();
    this.unregisterAvailabilityTarget = this.availabilitySync.registerTarget(this);
  }

  /**
   * Spec 148 (D15, T039): un cambio `kind:'product'` cuya `sold_out` difiere
   * de `!row.available` de una fila de la página VISIBLE dispara
   * `refreshOne` (trae quién/cuándo, sin ponerlo en el evento). Un cambio que
   * solo trae el `available` derivado por inventario (sin diferencia de
   * `sold_out`) NO toca el interruptor manual (US6.5) -- no se refresca nada
   * por eso solo. Nada fuera de la página visible (está paginada, spec 079).
   */
  applyAvailability(changes: readonly AvailabilityChange[]): void {
    const visibleIds = new Set(this.productService.products().map((p) => p.id));
    for (const c of changes) {
      if (c.kind !== 'product') continue;
      if (c.sold_out === undefined) continue;
      if (!visibleIds.has(c.id)) continue;
      const row = this.productService.products().find((p) => p.id === c.id);
      if (!row) continue;
      if (c.sold_out === !row.available) continue; // sin diferencia -- no es un cambio manual.
      void this.productService.refreshOne(c.id);
    }
  }

  applyAvailabilitySnapshot(_snapshot: AvailabilitySnapshot): void {
    this.productService.loadProducts(this.productService.page(), this.productService.size());
  }

  /** Descarga la carta completa en `.xlsx` (spec 143). */
  exportProducts(): void {
    this.productService.exportProducts().subscribe({
      next: (resp) => {
        const blob = resp.body;
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.exportFilename(resp.headers.get('content-disposition'));
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('No se pudo exportar la carta'),
    });
  }

  private exportFilename(contentDisposition: string | null): string {
    const match = contentDisposition ? /filename="?([^"]+)"?/.exec(contentDisposition) : null;
    return match ? match[1] : 'carta.xlsx';
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.unregisterAvailabilityTarget?.();
    this.unregisterAvailabilityTarget = null;
  }

  onSearchInput(value: string): void {
    this.searchSignal.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.productService.setSearch(value), 300);
  }

  onStatusFilterChange(value: 'all' | 'active' | 'inactive'): void {
    this.statusFilterValue = value;
    this.productService.setActiveFilter(value === 'all' ? '' : value);
  }

  onAvailabilityFilterChange(value: 'all' | 'available' | 'sold_out'): void {
    this.availabilityFilterValue = value;
    this.productService.setAvailabilityFilter(value === 'all' ? '' : value);
  }

  /** spec 152 (US2, FR-003/FR-004): `''` = "Todas las categorías". */
  onCategoryFilterChange(categoryId: string): void {
    this.categoryFilterValue = categoryId;
    this.productService.setCategoryFilter(categoryId);
  }

  openCreate(): void {
    this.router.navigate(['/dashboard/products/new']);
  }

  /** Escenario 9: clic en una fila / "Ver detalle". El Admin sigue yendo al
   *  formulario de edición de siempre; el Cajero va al detalle de solo lectura. */
  onRowClick(product: Product): void {
    if (this.isAdmin()) this.openEdit(product);
    else this.router.navigate(['/dashboard/products', product.id, 'detalle']);
  }

  openEdit(product: Product): void {
    this.router.navigate(['/dashboard/products', product.id]);
  }

  async onToggle(product: Product): Promise<void> {
    await this.productService.toggleActive(product.id, product.active);
  }

  async onToggleAvailable(product: Product): Promise<void> {
    const ok = await this.productService.toggleAvailable(product.id, product.available);
    if (ok)
      // Escenario 3: texto exacto de la spec ("Fresa boom marcado como agotado").
      this.toast.success(
        product.available
          ? `${product.name} marcado como agotado`
          : `${product.name} disponible`,
      );
    else this.toast.error(this.productService.error() ?? 'No se pudo actualizar');
  }

  /** T023 (US3): misma formateadora que usa `ProductListCardComponent`. */
  priceText(product: Product): string {
    return formatProductPrice(product);
  }
}
