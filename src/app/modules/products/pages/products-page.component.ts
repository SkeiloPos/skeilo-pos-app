import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Product } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { RelativeTimePipe } from '../../../shared/relative-time.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [FormsModule, PaginationBarComponent, IconMiComponent, RelativeTimePipe],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Carta del menú</h1>
          <p class="text-gray-500 text-sm mt-1">
            {{ isAdmin() ? 'Gestiona el catálogo de productos' : 'Consulta el catálogo y marca lo que se agote' }}
          </p>
        </div>
        @if (isAdmin()) {
          <button
            (click)="openCreate()"
            class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <app-mi-icon name="add" [size]="16" /> Nuevo producto
          </button>
        }
      </div>

      <!-- Filters -->
      <div class="flex gap-3 flex-wrap">
        <input
          type="text"
          [ngModel]="searchSignal()"
          (ngModelChange)="onSearchInput($event)"
          placeholder="Buscar por nombre..."
          class="flex-1 min-w-48 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        @if (isAdmin()) {
          <select
            [ngModel]="statusFilterValue"
            (ngModelChange)="onStatusFilterChange($event)"
            class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        }
        <select
          [ngModel]="availabilityFilterValue"
          (ngModelChange)="onAvailabilityFilterChange($event)"
          class="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        >
          <option value="all">Todos</option>
          <option value="available">Disponibles</option>
          <option value="sold_out">Agotados</option>
        </select>
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
        <!-- Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (productService.products().length === 0) {
            <!-- Empty state -->
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <app-mi-icon name="shopping_bag" [size]="48" class="mb-4" />
              @if (searchSignal() || statusFilterValue !== 'all') {
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
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Nombre
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell"
                  >
                    Categoría
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Preparación
                  </th>
                  <th
                    class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                  >
                    Estado
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
                            <app-mi-icon name="image-off" ariaLabel="Sin imagen" [size]="18" />
                          </div>
                        }
                        <div>
                          <span
                            class="text-sm font-medium"
                            [class.text-gray-400]="!product.active"
                            [class.text-gray-900]="product.active"
                          >
                            {{ product.name }}
                          </span>
                          @if (product.description) {
                            <p class="text-xs text-gray-400 line-clamp-1">
                              {{ product.description }}
                            </p>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden md:table-cell">
                      <span class="text-sm text-gray-500">{{ product.category_name ?? '—' }}</span>
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
export class ProductsPageComponent implements OnInit, OnDestroy {
  readonly productService = inject(ProductService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  /** spec 093: el Cajero comparte esta pantalla con el Admin, en solo lectura salvo
   *  el interruptor "Agotado" -- mismo patrón que `cash-session.store.ts`. */
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === UserRole.ADMIN);

  /** Local echo of the search box; the actual query to the service is debounced. */
  readonly searchSignal = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  statusFilterValue: 'all' | 'active' | 'inactive' = 'all';
  availabilityFilterValue: 'all' | 'available' | 'sold_out' = 'all';

  ngOnInit(): void {
    this.productService.loadProducts();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
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
}
