import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { SupplierItem } from '../interfaces/supplier-item.interface';
import { SupplierItemFormMode } from './supplier-item-form.component';

/**
 * Tabla de relaciones proveedor-insumo, compartida por las dos pestañas simétricas (spec
 * 106): el detalle del insumo la muestra con la columna "Proveedor" (`mode='item'`), el
 * detalle del proveedor con la columna "Insumo" (`mode='supplier'`) -- misma fila, mismo
 * dato, nombre de columna distinto según desde dónde se mire.
 */
@Component({
  selector: 'app-supplier-item-list',
  standalone: true,
  imports: [IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
      @if (items.length === 0) {
        <div class="flex items-center justify-center py-10">
          <p class="text-sm text-gray-400">
            {{ mode === 'item' ? 'Ningún proveedor vinculado todavía' : 'Ningún insumo vinculado todavía' }}
          </p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50">
                <th class="w-8"></th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {{ mode === 'item' ? 'Proveedor' : 'Insumo' }}
                </th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Presentación</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Equivalencia</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (r of items; track r.id) {
                <tr class="hover:bg-gray-50 transition-colors" [class.opacity-50]="!r.active">
                  <td class="px-2">
                    <button type="button" (click)="r.active && prefer.emit(r.id)" [disabled]="!r.active"
                      [title]="r.preferred ? 'Preferido' : 'Marcar como preferido'"
                      class="disabled:cursor-not-allowed">
                      <app-mi-icon name="star" [size]="18"
                        [class]="r.preferred ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'" />
                    </button>
                  </td>
                  <td class="px-4 py-3">
                    <p class="font-medium text-gray-900">
                      {{ mode === 'item' ? r.supplier_name : r.inventory_item_name }}
                    </p>
                  </td>
                  <td class="px-4 py-3 text-gray-600">{{ r.presentation }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ r.equivalence || '—' }}</td>
                  <td class="px-4 py-3">
                    @if (r.active) {
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Activa</span>
                    } @else {
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactiva</span>
                    }
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end gap-1">
                      <button (click)="edit.emit(r)"
                        class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                        Editar
                      </button>
                      @if (r.active) {
                        <button (click)="deactivate.emit(r)"
                          class="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                          Desactivar
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
    </div>
  `,
})
export class SupplierItemListComponent {
  @Input({ required: true }) items: SupplierItem[] = [];
  @Input({ required: true }) mode!: SupplierItemFormMode;

  @Output() readonly edit = new EventEmitter<SupplierItem>();
  @Output() readonly prefer = new EventEmitter<string>();
  @Output() readonly deactivate = new EventEmitter<SupplierItem>();
}
