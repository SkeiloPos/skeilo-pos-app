import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalesService } from '../services/sales.service';
import { PaymentMethodService } from '../services/payment-method.service';
import { Sale, SaleStatus } from '../interfaces/sales.interface';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PrinterSettingsStore } from '../../../core/printing/printer-settings.store';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import {
  buildReceiptHtml,
  formatInvoice,
  printReceiptHtml,
  saleToReceipt,
} from '../../tables/services/receipt.util';


const STATUS_LABELS: Record<SaleStatus, string> = {
  issued: 'Emitida',
  paid: 'Pagada',
  void: 'Anulada',
};

const STATUS_CHIP_CLASSES: Record<SaleStatus, string> = {
  issued: 'bg-gray-100 text-gray-600',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
};

@Component({
  selector: 'app-sales-page',
  standalone: true,
  imports: [DecimalPipe, FormsModule, PaginationBarComponent, TenantDatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Ventas</h1>
          <p class="text-gray-500 text-sm mt-1">Historial de ventas emitidas</p>
        </div>
        <button
          (click)="svc.list()"
          class="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          ↻ Actualizar
        </button>
      </div>

      <!-- Filtros -->
      <div class="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-[11px] font-medium text-gray-500 mb-1">Estado</label>
          <select [ngModel]="svc.status()" (ngModelChange)="onStatusChange($event)"
            class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Todos</option>
            <option value="issued">Emitida</option>
            <option value="paid">Pagada</option>
            <option value="void">Anulada</option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-medium text-gray-500 mb-1">Desde</label>
          <input type="date" [ngModel]="svc.dateFrom()" (ngModelChange)="onDateFromChange($event)"
            class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label class="block text-[11px] font-medium text-gray-500 mb-1">Hasta</label>
          <input type="date" [ngModel]="svc.dateTo()" (ngModelChange)="onDateToChange($event)"
            class="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div class="flex-1 min-w-48">
          <label class="block text-[11px] font-medium text-gray-500 mb-1">Factura</label>
          <input [ngModel]="invoiceSearchSignal()" (ngModelChange)="onInvoiceSearchInput($event)" type="text"
            placeholder="Ej: A-000004"
            class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
      </div>

      @if (svc.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ svc.error() }}</div>
      }

      <!-- Tabla -->
      <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
        @if (svc.loading() && svc.sales().length === 0) {
          <div class="flex items-center justify-center py-12"><p class="text-sm text-gray-400">Cargando ventas...</p></div>
        } @else if (svc.sales().length === 0) {
          <div class="flex flex-col items-center justify-center py-16 text-gray-400">
            <p class="text-4xl mb-3">🧾</p>
            <p class="font-medium">No se encontraron ventas</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50">
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Documento</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (s of svc.sales(); track s.id) {
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 text-gray-600">{{ s.sold_at | tenantDate: 'dd/MM/yyyy HH:mm' }}</td>
                    <td class="px-4 py-3 font-medium text-gray-900">{{ docLabel(s) }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ s.customer_name || '—' }}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" [class]="statusChipClass(s.status)">
                        {{ statusLabel(s.status) }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right font-semibold text-gray-900">$ {{ +s.total | number: '1.2-2' }}</td>
                    <td class="px-4 py-3 text-right">
                      <button (click)="selected.set(s)"
                        class="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                        Ver
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pagination-bar
            [page]="svc.page()" [size]="svc.size()"
            [total]="svc.total()" [totalPages]="svc.totalPages()"
            [loading]="svc.loading()"
            (pageChange)="svc.list($event, svc.size())"
            (sizeChange)="svc.list(1, $event)" />
        }
      </div>
    </div>

    <!-- Recibo -->
    @if (selected(); as r) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="selected.set(null)">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
            <h2 class="text-lg font-semibold text-gray-900">{{ docLabel(r) }}</h2>
            <div class="flex items-center gap-2 shrink-0">
              <button
                (click)="print(r)"
                class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                🧾 Imprimir
              </button>
              <button (click)="selected.set(null)" class="text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </div>
          <div class="px-6 py-4 space-y-3 text-sm">
            <p class="text-xs text-gray-400">{{ r.sold_at | tenantDate: 'dd/MM/yyyy HH:mm' }}{{ r.customer_name ? ' · ' + r.customer_name : '' }}</p>
            <div class="space-y-1">
              @for (it of r.items ?? []; track it.id) {
                <div class="flex justify-between">
                  <span class="text-gray-700">{{ it.quantity }}× {{ it.description }}</span>
                  <span class="text-gray-600">$ {{ +it.line_total | number: '1.2-2' }}</span>
                </div>
              }
            </div>
            <div class="border-t border-gray-100 pt-2 space-y-1">
              <div class="flex justify-between text-gray-500"><span>Subtotal</span><span>$ {{ +r.subtotal | number: '1.2-2' }}</span></div>
              @if (+r.discount > 0) { <div class="flex justify-between text-gray-500"><span>Descuento</span><span>− $ {{ +r.discount | number: '1.2-2' }}</span></div> }
              @if (+r.discount > 0 && r.promotion_evaluated_at) {
                <!-- spec 073, FR-011a/SC-009: distingue un descuento de una promoción
                     hoy vencida de una falla del sistema — sin abrir el pedido. -->
                <p class="text-[11px] text-gray-400 leading-snug">
                  Promociones evaluadas con la vigencia del
                  {{ r.promotion_evaluated_at | tenantDate: 'dd/MM/yyyy HH:mm' }}
                </p>
              }
              @if (+r.tax > 0) { <div class="flex justify-between text-gray-500"><span>Impuesto</span><span>$ {{ +r.tax | number: '1.2-2' }}</span></div> }
              @if (+r.tip > 0) { <div class="flex justify-between text-gray-500"><span>Propina</span><span>$ {{ +r.tip | number: '1.2-2' }}</span></div> }
              <div class="flex justify-between font-bold text-base"><span>Total</span><span>$ {{ +r.total | number: '1.2-2' }}</span></div>
              @if (hasCashComponent(r)) {
                <div class="flex justify-between text-gray-500"><span>Cambio</span><span>$ {{ +(r.change_given ?? 0) | number: '1.2-2' }}</span></div>
              }
            </div>
            @if (r.payments && r.payments.length > 0) {
              <div class="border-t border-gray-100 pt-2">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pagos</p>
                @for (p of r.payments; track p.id) {
                  <div class="flex justify-between text-gray-600">
                    <span>{{ methodName(p.payment_method_id) }}</span>
                    <span>$ {{ +p.amount | number: '1.2-2' }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SalesPageComponent implements OnInit, OnDestroy {
  readonly svc = inject(SalesService);
  private readonly methods = inject(PaymentMethodService);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly printer = inject(PrinterSettingsStore);
  readonly selected = signal<Sale | null>(null);

  /** Local echo of the invoice search box; the query to the service is debounced. */
  readonly invoiceSearchSignal = signal('');
  private invoiceSearchDebounce: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.svc.list();
    this.methods.load();
    // Para el ticket: nombre del negocio, logo y mensaje de cierre.
    if (!this.tenantInfo.info()) void this.tenantInfo.load();
  }

  ngOnDestroy(): void {
    if (this.invoiceSearchDebounce) clearTimeout(this.invoiceSearchDebounce);
  }

  onStatusChange(value: SaleStatus | ''): void {
    this.svc.setStatus(value);
  }

  onDateFromChange(value: string): void {
    this.svc.setDateFrom(value);
  }

  onDateToChange(value: string): void {
    this.svc.setDateTo(value);
  }

  onInvoiceSearchInput(value: string): void {
    this.invoiceSearchSignal.set(value);
    if (this.invoiceSearchDebounce) clearTimeout(this.invoiceSearchDebounce);
    this.invoiceSearchDebounce = setTimeout(() => this.svc.setInvoiceReference(value), 300);
  }

  statusLabel(status: SaleStatus): string {
    return STATUS_LABELS[status];
  }

  statusChipClass(status: SaleStatus): string {
    return STATUS_CHIP_CLASSES[status];
  }

  methodName(id: string): string {
    return this.methods.methods().find((m) => m.id === id)?.name ?? 'Pago';
  }

  /** spec 087 (FR-013): ¿el pago de esta venta incluyó algún método en
   *  efectivo? -- gobierna si se muestra "Cambio: $X" (backend ya serializa
   *  `change_given`, sin cambios de esquema). */
  hasCashComponent(sale: Sale): boolean {
    const cashIds = new Set(
      this.methods.methods().filter((m) => m.is_cash).map((m) => m.id),
    );
    return (sale.payments ?? []).some((p) => cashIds.has(p.payment_method_id));
  }

  /** Cómo se identifica la venta: por su factura, o por el id si no tiene. */
  docLabel(sale: Sale): string {
    return sale.invoice ? `Factura ${formatInvoice(sale.invoice)}` : `Venta #${sale.id.slice(0, 8)}`;
  }

  /** Reimprime el mismo ticket que salió al cobrar. */
  print(sale: Sale): void {
    printReceiptHtml(
      buildReceiptHtml(
        [
          saleToReceipt(sale, {
            businessName: this.tenantInfo.businessName(),
            logoUrl: this.tenantInfo.logoUrl(),
            message: this.tenantInfo.receiptMessage(),
            methodName: (id) => this.methodName(id),
          }),
        ],
        { paperWidthMm: this.printer.paperWidthMm() },
      ),
    );
  }
}
