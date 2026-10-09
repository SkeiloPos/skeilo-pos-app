import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Supplier } from '../interfaces/supplier.interface';
import { SuppliersService } from '../services/suppliers.service';
import { SupplierItemsService } from '../../supplier-items/services/supplier-items.service';
import { SupplierItem } from '../../supplier-items/interfaces/supplier-item.interface';
import {
  SupplierItemFormComponent,
} from '../../supplier-items/components/supplier-item-form.component';
import { SupplierItemListComponent } from '../../supplier-items/components/supplier-item-list.component';
import { ToastService } from '../../../shared/feedback/toast.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Detalle de proveedor (spec 106): pestaña "Insumos que vende" -- mismo dato que la
 * pestaña "Proveedores" del insumo (Historia 3), visto desde el otro lado.
 */
@Component({
  selector: 'app-supplier-detail-page',
  standalone: true,
  imports: [FormsModule, RouterLink, IconMiComponent, SupplierItemFormComponent, SupplierItemListComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <a routerLink="/dashboard/proveedores" class="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <app-mi-icon name="arrow_back" ariaLabel="Volver" [size]="20" />
        </a>
        <h1 class="text-xl font-bold text-gray-900">{{ supplier()?.name || 'Proveedor' }}</h1>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else if (!supplier()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          No se pudo cargar el proveedor.
        </div>
      } @else {
        <!-- Tabs -->
        <div class="flex gap-1 border-b border-gray-200">
          <button class="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-indigo-600 text-indigo-600">
            Insumos que vende
          </button>
        </div>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" [ngModel]="includeInactive()" (ngModelChange)="onToggleInactive($event)" />
            Mostrar inactivas
          </label>
          <button (click)="openCreate()"
            class="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
            <app-mi-icon name="add" [size]="16" />
            Vincular insumo
          </button>
        </div>

        <app-supplier-item-list [items]="relations()" mode="supplier"
          (edit)="openEdit($event)" (prefer)="onPrefer($event)" (deactivate)="onDeactivate($event)" />
      }
    </div>

    @if (showForm() && supplier()) {
      <app-supplier-item-form mode="supplier" [fixedId]="supplier()!.id" [fixedLabel]="supplier()!.name"
        [initial]="editing()"
        (close)="showForm.set(false)"
        (saved)="onSaved()"
        (editRequested)="onEditRequested($event)" />
    }
  `,
})
export class SupplierDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly suppliersService = inject(SuppliersService);
  private readonly supplierItemsService = inject(SupplierItemsService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly supplier = signal<Supplier | null>(null);
  readonly relations = signal<SupplierItem[]>([]);
  readonly includeInactive = signal(false);
  readonly showForm = signal(false);
  readonly editing = signal<SupplierItem | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/dashboard/proveedores']);
      return;
    }
    this.loading.set(true);
    try {
      const supplier = await this.suppliersService.getSupplier(id);
      if (supplier.is_system) {
        // FR-012: el proveedor de sistema no tiene pestaña "Insumos que vende" que mostrar.
        this.supplier.set(null);
        return;
      }
      this.supplier.set(supplier);
      await this.reloadRelations();
    } catch {
      this.supplier.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private async reloadRelations(): Promise<void> {
    const supplier = this.supplier();
    if (!supplier) return;
    this.relations.set(await this.supplierItemsService.listForSupplier(supplier.id, this.includeInactive()));
  }

  async onToggleInactive(value: boolean): Promise<void> {
    this.includeInactive.set(value);
    await this.reloadRelations();
  }

  openCreate(): void {
    this.editing.set(null);
    this.showForm.set(true);
  }

  openEdit(r: SupplierItem): void {
    this.editing.set(r);
    this.showForm.set(true);
  }

  async onSaved(): Promise<void> {
    this.showForm.set(false);
    this.editing.set(null);
    await this.reloadRelations();
  }

  onEditRequested(existingId: string): void {
    const existing = this.relations().find((r) => r.id === existingId);
    if (existing) {
      this.editing.set(existing);
    }
  }

  async onPrefer(relationId: string): Promise<void> {
    const result = await this.supplierItemsService.setPreferred(relationId);
    if (result) {
      this.toast.success(`${result.inventory_item_name}: preferido actualizado`);
      await this.reloadRelations();
    } else {
      this.toast.error(this.supplierItemsService.error() ?? 'No se pudo marcar como preferido');
    }
  }

  async onDeactivate(r: SupplierItem): Promise<void> {
    const result = await this.supplierItemsService.deactivate(r.id);
    if (result) {
      this.toast.success(`${r.inventory_item_name} desactivado`);
      if (result.was_preferred) {
        this.toast.info('Sin proveedor preferido: no se incluirá en órdenes sugeridas');
      }
      await this.reloadRelations();
    } else {
      this.toast.error(this.supplierItemsService.error() ?? 'No se pudo desactivar');
    }
  }
}
