import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Product } from '../interfaces/product.interface';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { RelativeTimePipe } from '../../../shared/relative-time.pipe';
import { formatProductPrice } from '../product-price.util';

/**
 * Tarjeta de producto del listado de la Carta del menú (spec 152, FR-001/FR-007):
 * se usa en la cuadrícula móvil/tablet (`< 1024px`) de `ProductsPageComponent` --
 * research.md D5, extraída aparte en vez de un `@if` inline para mantener FR-001
 * (fidelidad visual de la tarjeta) y FR-002 (tabla intacta) por separado.
 */
@Component({
  selector: 'app-product-list-card',
  standalone: true,
  imports: [IconMiComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class.opacity-50]="!product.active"
      class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-3"
    >
      <div class="flex items-center gap-3">
        @if (product.image_url) {
          <img
            [src]="product.image_url"
            [alt]="product.name"
            class="w-14 h-14 rounded-lg object-cover shrink-0"
          />
        } @else {
          <div class="w-14 h-14 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <app-mi-icon name="image-off" ariaLabel="Sin imagen" [size]="22" class="text-indigo-600" />
          </div>
        }
        <div class="min-w-0 flex-1">
          <p
            class="text-sm font-medium truncate"
            [class.text-gray-400]="!product.active"
            [class.text-gray-900]="product.active"
          >
            {{ product.name }}
          </p>
          <p class="text-xs text-gray-400 truncate">{{ product.category_name ?? 'Sin categoría' }}</p>
        </div>
      </div>

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
            <span class="text-xs text-gray-400">{{ product.available_changed_at | relativeTime }}</span>
          }
        }
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-gray-100 pt-3" (click)="$event.stopPropagation()">
        <span class="text-sm font-semibold text-gray-900 truncate">{{ priceText() }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <button
            (click)="toggleAvailable.emit()"
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
          @if (isAdmin) {
            <button
              (click)="edit.emit()"
              title="Editar"
              class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <app-mi-icon name="edit" ariaLabel="Editar" [size]="18" />
            </button>
            <button
              (click)="toggleActive.emit()"
              [title]="product.active ? 'Desactivar' : 'Activar'"
              class="p-2 rounded-lg transition-colors"
              [class]="
                product.active
                  ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                  : 'text-green-600 hover:text-green-700 hover:bg-green-50'
              "
            >
              <app-mi-icon name="circle" [ariaLabel]="product.active ? 'Desactivar' : 'Activar'" [size]="14" />
            </button>
          } @else {
            <button
              (click)="viewDetail.emit()"
              title="Ver detalle"
              class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <app-mi-icon name="eye" ariaLabel="Ver detalle" [size]="18" />
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ProductListCardComponent {
  @Input({ required: true }) product!: Product;
  @Input() isAdmin = false;

  @Output() toggleAvailable = new EventEmitter<void>();
  @Output() toggleActive = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() viewDetail = new EventEmitter<void>();

  priceText(): string {
    return formatProductPrice(this.product);
  }
}
