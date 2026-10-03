import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { inject } from '@angular/core';
import { ProductDetail } from '../interfaces/product.interface';
import { ProductService } from '../services/product.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { MoneyPipe } from '../../../shared/money.pipe';
import { RelativeTimePipe } from '../../../shared/relative-time.pipe';

/**
 * Detalle de producto de solo lectura de "Carta del menú" (spec 093, escenario 9):
 * imagen, nombre, descripción, categoría, tipo de preparación, presentaciones con su
 * precio, estado y disponibilidad -- sin costos, receta ni datos de inventario
 * (FR-017/FR-018). El único control editable es el interruptor "Agotado"
 * (FR-009), igual que en {@link ProductsPageComponent}.
 *
 * A diferencia de `ProductFormComponent` (exclusivo de Admin), esta pantalla no
 * permite cambiar nombre, categoría, imagen ni presentaciones -- es a donde
 * navega el Cajero desde "Ver detalle" (y, si quiere, también el Admin).
 */
@Component({
  selector: 'app-product-detail-page',
  standalone: true,
  imports: [RouterLink, IconMiComponent, MoneyPipe, RelativeTimePipe],
  template: `
    <div class="space-y-6 max-w-2xl">
      <div class="flex items-center gap-3">
        <a
          routerLink="/dashboard/products"
          class="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <app-mi-icon name="arrow_back" ariaLabel="Volver" [size]="20" />
        </a>
        <h1 class="text-2xl font-bold text-gray-900">Detalle del producto</h1>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      } @else if (!product()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          No se pudo cargar el producto.
        </div>
      } @else {
        @let p = product()!;
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          <div class="flex items-start gap-4">
            @if (p.image_url) {
              <img [src]="p.image_url" [alt]="p.name" class="w-24 h-24 rounded-xl object-cover shrink-0" />
            } @else {
              <div class="w-24 h-24 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <app-mi-icon name="image-off" ariaLabel="Sin imagen" [size]="32" />
              </div>
            }
            <div class="flex-1 min-w-0">
              <h2 class="text-lg font-semibold text-gray-900">{{ p.name }}</h2>
              @if (p.description) {
                <p class="text-sm text-gray-500 mt-1">{{ p.description }}</p>
              }
              <div class="flex items-center gap-1.5 flex-wrap mt-3">
                @if (p.active) {
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
                @if (!p.available) {
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
                    >Agotado</span
                  >
                  @if (p.available_changed_at) {
                    <span class="text-xs text-gray-400">{{
                      p.available_changed_at | relativeTime
                    }}</span>
                  }
                }
                <span
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  [class]="
                    p.preparation_type === 'packaged'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  "
                >
                  {{ p.preparation_type === 'packaged' ? 'Empacado' : 'Preparado' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Interruptor "Agotado" -->
          <div class="flex items-center justify-between border-t border-gray-100 pt-4">
            <div>
              <p class="text-sm font-medium text-gray-900">Agotado</p>
              <p class="text-xs text-gray-400">
                @if (!p.active) {
                  Un producto inactivo no se puede marcar como agotado.
                } @else {
                  Evita que se agreguen nuevos pedidos de este producto sin desactivarlo.
                }
              </p>
            </div>
            <button
              (click)="onToggleAvailable()"
              [disabled]="!p.active"
              type="button"
              role="switch"
              [attr.aria-checked]="!p.available"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              [class]="!p.available ? 'bg-red-500' : 'bg-gray-200'"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                [class.translate-x-6]="!p.available"
                [class.translate-x-1]="p.available"
              ></span>
            </button>
          </div>

          <!-- Presentaciones -->
          <div class="border-t border-gray-100 pt-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Presentaciones</h3>
            @if (p.variants.length === 0) {
              <p class="text-sm text-gray-400">Sin presentaciones activas.</p>
            } @else {
              <ul class="divide-y divide-gray-50">
                @for (variant of p.variants; track variant.id) {
                  <li class="flex items-center justify-between py-2 text-sm">
                    <span class="text-gray-700">{{ variant.presentation_name }}</span>
                    <span class="font-medium text-gray-900">{{ variant.price | money }}</span>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ProductDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly product = signal<ProductDetail | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/dashboard/products']);
      return;
    }
    this.loading.set(true);
    this.product.set(await this.productService.getProductDetail(id));
    this.loading.set(false);
  }

  async onToggleAvailable(): Promise<void> {
    const p = this.product();
    if (!p) return;
    const ok = await this.productService.toggleAvailable(p.id, p.available);
    if (ok) {
      this.toast.success(p.available ? `${p.name} marcado como agotado` : `${p.name} disponible`);
      this.product.set(await this.productService.getProductDetail(p.id));
    } else {
      this.toast.error(this.productService.error() ?? 'No se pudo actualizar');
    }
  }
}
