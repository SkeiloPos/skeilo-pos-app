import { RouterLink } from '@angular/router';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Table, TableStatus } from '../interfaces/table.interface';
import { TableService } from '../services/table.service';
import { TableFormComponent } from '../components/table-form.component';
import { TableQrComponent } from '../components/table-qr.component';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { ToastService } from '../../../shared/feedback/toast.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

@Component({
  selector: 'app-tables-page',
  standalone: true,
  imports: [RouterLink, TableFormComponent, TableQrComponent, PaginationBarComponent, IconMiComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Mesas</h1>
          <p class="text-gray-500 text-sm mt-1">Gestiona las mesas del local y sus códigos QR</p>
        </div>
        <div class="flex items-center gap-2">
          <a
            routerLink="/dashboard/mesas/qr"
            class="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Imprimir códigos QR
          </a>
          <button
            (click)="openCreate()"
            class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <span>+</span> Nueva mesa
          </button>
        </div>
      </div>

      <!-- Error banner -->
      @if (tableService.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ tableService.error() }}
        </div>
      }

      <!-- Loading -->
      @if (tableService.tablesLoading() && tableService.pagedTables().length === 0) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Table list -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          @if (tableService.pagedTables().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center px-4">
              <app-mi-icon name="table_restaurant" [size]="48" class="mb-4" />
              <p class="text-gray-600 font-medium">Aún no hay mesas registradas</p>
              <p class="text-gray-400 text-sm mt-1">Crea la primera mesa para generar su QR</p>
              <button
                (click)="openCreate()"
                class="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Crear mesa
              </button>
            </div>
          } @else {
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Mesa</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden sm:table-cell">Nombre</th>
                  <th class="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th class="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (table of tableService.pagedTables(); track table.id) {
                  <tr [class.opacity-50]="!table.active" class="hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                          <app-mi-icon name="table_restaurant" [size]="20" class="text-indigo-600" />
                        </div>
                        <div>
                          <span class="text-sm font-medium" [class.text-gray-400]="!table.active" [class.text-gray-900]="table.active">
                            Mesa {{ table.number }}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td class="px-5 py-4 hidden sm:table-cell">
                      <span class="text-sm text-gray-500">{{ table.name || '—' }}</span>
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" [class]="statusChip(table.status)">
                          {{ statusLabel(table.status) }}
                        </span>
                        <select
                          [value]="table.status"
                          (change)="changeStatus(table, $any($event.target).value)"
                          class="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          title="Cambiar estado"
                        >
                          <option value="libre">Libre</option>
                          <option value="ocupada">Ocupada</option>
                          <option value="reservada">Reservada</option>
                          <option value="pendiente_pago">Pendiente de pago</option>
                        </select>
                      </div>
                    </td>
                    <td class="px-5 py-4">
                      <div class="flex items-center justify-end gap-1">
                        <button
                          (click)="openQr(table)"
                          title="Ver QR"
                          class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <app-mi-icon name="photo_camera" ariaLabel="Ver QR" [size]="18" />
                        </button>
                        <button
                          (click)="openEdit(table)"
                          title="Editar"
                          class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <app-mi-icon name="edit" ariaLabel="Editar" [size]="18" />
                        </button>
                        <button
                          (click)="onToggle(table)"
                          [title]="table.active ? 'Desactivar' : 'Activar'"
                          class="p-2 rounded-lg transition-colors"
                          [class]="table.active
                            ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                            : 'text-green-600 hover:text-green-700 hover:bg-green-50'"
                        >
                          <app-mi-icon
                            name="circle"
                            [ariaLabel]="table.active ? 'Desactivar' : 'Activar'"
                            [size]="14"
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>

            <app-pagination-bar
              [page]="tableService.tablesPage()"
              [size]="tableService.tablesSize()"
              [total]="tableService.tablesTotal()"
              [totalPages]="tableService.tablesTotalPages()"
              [loading]="tableService.tablesLoading()"
              (pageChange)="tableService.loadTablesPage($event, tableService.tablesSize())"
              (sizeChange)="tableService.loadTablesPage(1, $event)"
            />
          }
        </div>
      }
    </div>

    <!-- Form modal -->
    @if (showForm()) {
      <app-table-form
        [table]="editingTable()"
        (saved)="onSaved()"
        (cancelled)="onCancelled()"
      />
    }

    <!-- QR modal -->
    @if (showQr() && qrTable()) {
      <app-table-qr
        [table]="qrTable()!"
        (closed)="onQrClosed()"
      />
    }
  `,
})
export class TablesPageComponent implements OnInit {
  readonly tableService = inject(TableService);
  private readonly toast = inject(ToastService);

  readonly showForm = signal(false);
  readonly editingTable = signal<Table | null>(null);
  readonly showQr = signal(false);
  readonly qrTable = signal<Table | null>(null);

  ngOnInit(): void {
    this.tableService.loadTablesPage(1, 20);
  }

  openCreate(): void {
    this.editingTable.set(null);
    this.showForm.set(true);
  }

  openEdit(table: Table): void {
    this.editingTable.set(table);
    this.showForm.set(true);
  }

  openQr(table: Table): void {
    this.qrTable.set(table);
    this.showQr.set(true);
  }

  async onToggle(table: Table): Promise<void> {
    await this.tableService.toggleActive(table.id, table.active);
    this.tableService.refreshTablesPage();
  }

  onSaved(): void {
    this.showForm.set(false);
    this.editingTable.set(null);
    // Tras crear/editar, la lista paginada se recoloca en una página válida (FR-022).
    this.tableService.refreshTablesPage();
  }

  onCancelled(): void {
    this.showForm.set(false);
    this.editingTable.set(null);
  }

  onQrClosed(): void {
    this.showQr.set(false);
    this.qrTable.set(null);
  }

  async changeStatus(table: Table, status: TableStatus): Promise<void> {
    if (status === table.status) return;
    const ok = await this.tableService.setStatus(table.id, status);
    this.tableService.refreshTablesPage();
    if (ok) this.toast.success(`Mesa ${table.number}: ${this.statusLabel(status)}`);
    else this.toast.error(this.tableService.error() ?? 'No se pudo cambiar el estado');
  }

  statusLabel(s: TableStatus): string {
    return {
      libre: 'Libre',
      ocupada: 'Ocupada',
      reservada: 'Reservada',
      pendiente_pago: 'Pendiente de pago',
    }[s];
  }

  statusChip(s: TableStatus): string {
    return {
      libre: 'bg-emerald-100 text-emerald-700',
      ocupada: 'bg-amber-100 text-amber-700',
      reservada: 'bg-indigo-100 text-indigo-700',
      pendiente_pago: 'bg-red-100 text-red-700',
    }[s];
  }
}
