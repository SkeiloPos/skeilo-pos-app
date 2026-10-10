import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Supplier } from '../interfaces/supplier.interface';
import { SuppliersService } from '../services/suppliers.service';
import { SupplierFormComponent } from '../components/supplier-form.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

type ActiveFilter = '' | 'active' | 'inactive';

@Component({
  selector: 'app-suppliers-page',
  standalone: true,
  imports: [FormsModule, SupplierFormComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">Proveedores</h1>
          <p class="text-sm text-gray-500 mt-0.5">Directorio de proveedores para compras de insumos</p>
        </div>
        <button (click)="openCreate()"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
          <app-mi-icon name="add" [size]="16" />
          Nuevo proveedor
        </button>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3">
        <input
          [ngModel]="searchSignal()"
          (ngModelChange)="searchSignal.set($event)"
          type="text"
          placeholder="Buscar por nombre, NIT o email..."
          class="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">

        <select [ngModel]="activeFilter()" (ngModelChange)="activeFilter.set($event)"
          class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Activos e inactivos</option>
          <option value="active">Solo activos</option>
          <option value="inactive">Solo inactivos</option>
        </select>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
        @if (service.isLoading()) {
          <div class="flex items-center justify-center py-12">
            <p class="text-sm text-gray-400">Cargando proveedores...</p>
          </div>
        } @else if (filtered().length === 0) {
          <div class="flex flex-col items-center justify-center py-12">
            <p class="text-sm text-gray-400">No se encontraron proveedores</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NIT</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Teléfono</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (s of filtered(); track s.id) {
                  <tr class="hover:bg-gray-50 transition-colors" [class.opacity-50]="!s.active">
                    <td class="px-4 py-3">
                      <p class="font-medium text-gray-900">{{ s.name }}</p>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ s.tax_id || '—' }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ s.phone || '—' }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ s.email || '—' }}</td>
                    <td class="px-4 py-3">
                      @if (s.active) {
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Activo</span>
                      } @else {
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactivo</span>
                      }
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center justify-end gap-1">
                        @if (!s.is_system) {
                          <button (click)="openItems(s)" title="Insumos que vende"
                            class="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
                            Insumos
                          </button>
                        }
                        <button (click)="openEdit(s)"
                          class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                          Editar
                        </button>
                        <button (click)="service.toggleActive(s.id, s.active)"
                          class="px-2 py-1 text-xs font-medium rounded-lg transition-colors"
                          [class]="s.active
                            ? 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                            : 'text-green-700 bg-green-50 hover:bg-green-100'">
                          {{ s.active ? 'Desactivar' : 'Activar' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    <!-- Modal -->
    @if (showForm()) {
      <app-supplier-form
        [supplier]="selectedSupplier()"
        (close)="showForm.set(false)"
        (saved)="showForm.set(false)">
      </app-supplier-form>
    }
  `,
})
export class SuppliersPageComponent implements OnInit {
  readonly service = inject(SuppliersService);
  private readonly router = inject(Router);

  readonly searchSignal = signal('');
  readonly activeFilter = signal<ActiveFilter>('');

  readonly showForm = signal(false);
  readonly selectedSupplier = signal<Supplier | null>(null);

  readonly filtered = computed(() => {
    const q = this.searchSignal().toLowerCase().trim();
    const active = this.activeFilter();

    return this.service.suppliers().filter(s => {
      if (active === 'active' && !s.active) return false;
      if (active === 'inactive' && s.active) return false;
      if (q) {
        const haystack = `${s.name} ${s.tax_id ?? ''} ${s.email ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  async ngOnInit(): Promise<void> {
    await this.service.loadSuppliers();
  }

  openCreate(): void {
    this.selectedSupplier.set(null);
    this.showForm.set(true);
  }

  openEdit(s: Supplier): void {
    this.selectedSupplier.set(s);
    this.showForm.set(true);
  }

  openItems(s: Supplier): void {
    this.router.navigate(['/dashboard/proveedores', s.id, 'detalle']);
  }
}
