import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DiningOrder, DiningOrderItem } from '../../tables/interfaces/dining.interface';
import { DiningSessionService } from '../../tables/services/dining-session.service';
import { TableService } from '../../tables/services/table.service';
import { MenuService } from '../../../core/services/menu.service';
import { buildMenuLookup } from '../../tables/services/menu-lookup';
import { displayOrderStatus, orderStatusClass, orderStatusLabel } from '../order-status.util';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [RouterLink, TenantDatePipe, IconMiComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <a
          routerLink="/dashboard/orders"
          aria-label="Volver a la lista"
          class="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:border-indigo-300 hover:text-indigo-700 shadow-sm transition-all"
        >
          <app-mi-icon name="arrow_back" [size]="18" />
        </a>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Detalle de Orden</h1>
          <p class="text-gray-500 text-sm mt-0.5">Vista completa de la comanda</p>
        </div>
      </div>

      @if (isLoading()) {
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-pulse space-y-4">
          <div class="h-4 bg-gray-200 rounded w-1/3"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2"></div>
          <div class="h-20 bg-gray-200 rounded"></div>
        </div>
      } @else if (!order()) {
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-gray-400">
          <app-mi-icon name="search" [size]="40" class="mb-3" />
          <p class="font-medium text-gray-600">Orden no encontrada</p>
          <a routerLink="/dashboard/orders" class="mt-3 inline-block text-sm text-indigo-600 hover:underline">
            Volver a la lista
          </a>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">Mesa</p>
              <p class="text-base font-bold text-gray-900 truncate">{{ tableLabel() }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Canal: {{ order()!.channel }}</p>
            </div>
            <span class="text-sm px-3 py-1.5 rounded-full font-semibold shrink-0" [class]="statusClass(displayStatus(order()!))">
              {{ statusLabel(displayStatus(order()!)) }}
            </span>
          </div>

          <div class="px-5 py-3 grid grid-cols-2 gap-4 border-b border-gray-100 text-sm">
            <div>
              <p class="text-xs text-gray-400">Comensal</p>
              <!-- spec 087 (FR-004, A-88): destacado -- "Cliente sin nombre"
                   solo para pedidos históricos anteriores a esta spec
                   (customer_name nulo/vacío), nunca migrados. -->
              <p class="font-bold text-[15px] text-gray-900">{{ order()!.customer_name?.trim() || 'Cliente sin nombre' }}</p>
            </div>
            <div>
              <p class="text-xs text-gray-400">Creada</p>
              <p class="font-medium text-gray-700">{{ order()!.created_at | tenantDate: 'dd/MM/yyyy HH:mm' }}</p>
            </div>
          </div>

          @if (order()!.notes) {
            <div class="px-5 py-3 border-b border-gray-100">
              <p class="text-xs text-gray-400">Notas</p>
              <p class="text-sm text-gray-700 italic">“{{ order()!.notes }}”</p>
            </div>
          }

          <div class="px-5 py-4">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ítems del pedido</p>
            <div class="space-y-2">
              @for (item of order()!.items ?? []; track item.id) {
                <div class="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span class="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                    {{ item.quantity }}
                  </span>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-800">{{ variantLabel(item.product_variant_id) }}</p>
                    @if (optionLabels(item)) {
                      <p class="text-xs text-gray-400">{{ optionLabels(item) }}</p>
                    }
                    @if (item.notes) {
                      <p class="text-xs text-amber-600 italic">“{{ item.notes }}”</p>
                    }
                  </div>
                </div>
              } @empty {
                <p class="text-sm text-gray-400">Sin ítems</p>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderDetailComponent implements OnInit {
  private readonly api = inject(DiningSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly tableService = inject(TableService);
  private readonly menuService = inject(MenuService);

  readonly order = signal<DiningOrder | null>(null);
  readonly isLoading = signal(true);

  private readonly lookup = computed(() => buildMenuLookup(this.menuService.categories()));

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.isLoading.set(false);
      return;
    }
    // Menu + tables give names/labels for the comanda's variant/option/table ids.
    this.menuService.loadMenu();
    this.tableService.loadTables();
    try {
      this.order.set(await this.api.getOrder(id));
    } catch {
      this.order.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  tableLabel(): string {
    const o = this.order();
    if (!o?.dining_table_id) return 'Mostrador';
    const t = this.tableService.tables().find((x) => x.id === o.dining_table_id);
    return t ? (t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`) : 'Mesa';
  }

  variantLabel(variantId: string): string {
    return this.lookup().variantLabel(variantId);
  }

  optionLabels(item: DiningOrderItem): string {
    return (item.options ?? [])
      .map((o) => this.lookup().optionLabelWithQuantity(o.option_id, o.quantity ?? 1))
      .filter(Boolean).join(', ');
  }

  statusLabel = orderStatusLabel;
  statusClass = orderStatusClass;
  displayStatus = displayOrderStatus;
}
