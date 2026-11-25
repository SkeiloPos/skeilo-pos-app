import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

/**
 * Detalle de un pedido de la Terminal de Mesas, en su propia ruta
 * (`mesas-sesiones/:mesa` o `mesas-sesiones/pedido/:pedido`) -- extraído de
 * `table-sessions.component.ts` (la grilla), que antes mostraba esto mismo
 * ocultando la grilla con CSS en el mismo componente/instancia de store.
 * Separarlo en una ruta propia le da a esta instancia de `PosTerminalStore`
 * una carga SIEMPRE acotada a su mesa/pedido (`init({ tableId })`/
 * `init({ orderId })`), sin el negocio completo -- ver el comentario de
 * `scope` en `pos-terminal.store.ts`.
 */
@Component({
  selector: 'app-table-order-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PosTerminalStore],
  imports: [PosOrderPanelComponent, PosCheckoutPanelComponent, IconMiComponent, IconLucideComponent],
  template: `
    <div class="terminal-theme flex flex-col -m-4 md:-m-6 bg-[var(--terminal-color-canvas)] ">
      <div class="flex-1 flex flex-col p-3 gap-3 min-h-0 overflow-hidden">
        <div class="h-11 shrink-0 flex items-center gap-3">
          <button
            type="button"
            data-testid="page-back-button"
            (click)="volver()"
            aria-label="Volver a mesas"
            title="Volver a mesas"
            class="w-11 h-11 shrink-0 border rounded-[8px] flex items-center justify-center transition-colors"
            style="border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-primary)"
          >
            <app-lucide-icon name="arrow-left" [size]="18" />
          </button>
          <div class="min-w-0 leading-tight flex-1">
            <div
              class="text-[11px] font-semibold uppercase tracking-wider"
              style="color:var(--terminal-color-text-muted)"
            >
              Terminal de mesas
            </div>
            <h2
              class="text-[18px] font-semibold tracking-tight truncate m-0"
              style="font-family:Sora,ui-sans-serif,system-ui,sans-serif;color:var(--terminal-color-text-primary)"
            >
              Pedido de la mesa
            </h2>
          </div>
          <!-- CTA "Crear pedido nuevo" (spec 078, A-138): crear un segundo
               pedido en paralelo nunca se restringe. Solo tiene sentido acá
               para un pedido SIN mesa -- uno con mesa ya tiene "Nueva cuenta"
               dentro de app-pos-order-panel para lo mismo. -->
          @if (!store.selectedTableId()) {
            <button
              type="button"
              data-testid="standalone-new-order-cta"
              (click)="goToNewOrder()"
              class="h-9 px-3 rounded-[8px] text-[13px] font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors shrink-0"
              style="background:var(--terminal-color-primary);color:var(--terminal-color-on-primary)"
            >
              <app-lucide-icon name="circle-plus" [size]="16" class="shrink-0" />
              <span>Crear pedido nuevo</span>
            </button>
          }
        </div>
        <div
          class="flex-1 flex flex-col min-h-0 rounded-[16px] border overflow-hidden"
          style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border)"
        >
          @if (store.loading()) {
            <div
              class="flex-1 flex items-center justify-center text-sm"
              style="color:var(--terminal-color-text-muted)"
            >
              Cargando terminal…
            </div>
          } @else {
            @if (store.error()) {
              <div class="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
                {{ store.error() }}
              </div>
            }
            <div class="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
              <div class="flex flex-col lg:w-[60%] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto">
                <app-pos-order-panel />
              </div>
              <app-pos-checkout-panel />
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Diálogo de éxito (igual que antes, ahora vive donde se usa). -->
    @if (store.successOpen()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div class="text-center space-y-1">
            <app-mi-icon name="check_circle" [size]="40" class="text-green-600" />
            <h2 class="text-lg font-bold text-gray-900">Pago registrado</h2>
            @if (store.lastSale(); as s) {
              <p class="text-sm text-gray-500">
                @if (store.lastReceipts().length > 1) {
                  <span>
                    Cuenta dividida en {{ store.lastReceipts().length }} pagos ·
                    {{ store.fmt(s.total) }}. El inventario se actualizó.
                  </span>
                } @else if (store.lastReceipts()[0]; as r) {
                  <span>
                    {{ store.fmt(s.total) }} · {{ s.customer }} ·
                    {{ store.paymentMethodLabel(r) }}
                  </span>
                  @if (r.change != null) {
                    <span> · Vuelto {{ store.fmt(r.change) }} </span>
                  }
                }
              </p>
            }
          </div>

          @if (store.lastReceipts().length > 1) {
            <div class="border border-gray-100 rounded-xl divide-y divide-gray-100">
              @for (r of store.lastReceipts(); track r.saleId; let i = $index) {
                <div class="flex items-center justify-between gap-3 px-3 py-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">
                      {{ r.customerName || 'Comensal ' + (i + 1) }}
                    </p>
                    <p class="text-xs text-gray-400">{{ store.fmt(r.total) }}</p>
                  </div>
                  <button
                    (click)="store.printReceipt(i)"
                    class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shrink-0 inline-flex items-center gap-1.5"
                  >
                    <app-mi-icon name="receipt" [size]="16" />
                    Imprimir
                  </button>
                </div>
              }
            </div>
          }

          <div class="flex gap-2 justify-center pt-1">
            @if (store.lastReceipts().length > 1) {
              <button
                (click)="store.printReceipt()"
                class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <app-mi-icon name="receipt" [size]="16" />
                Imprimir todos
              </button>
            } @else {
              <button
                (click)="store.printReceipt(); store.closeSuccess()"
                class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <app-mi-icon name="receipt" [size]="16" />
                Imprimir Factura
              </button>
            }
            <button
              (click)="store.closeSuccess()"
              class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TableOrderDetailComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** `true` recién después de la primera selección (éxito del `.then()` de
   *  `ngOnInit`). Antes de eso, `hasActiveSelection()` también es `false`
   *  -- simplemente todavía no hubo tiempo de seleccionar nada -- y el
   *  `effect()` de abajo no debe confundir "todavía cargando" con "la
   *  selección se perdió de verdad" (bug real: sin este flag, rebotaba a la
   *  grilla ANTES de que `selectTable()` llegara a correr). */
  private readonly selectedOnce = signal(false);

  constructor() {
    // Vuelve a la grilla en cuanto la selección se pierde -- cubre los casos
    // donde antes `cancelSelection()` "expulsaba" dentro de la misma
    // instancia (liberar mesa, pedido sin mesa resuelto, A-138): ahora es
    // una navegación real, no solo un cambio de signal.
    effect(() => {
      if (this.selectedOnce() && !this.store.hasActiveSelection()) {
        untracked(() => void this.router.navigate(['/dashboard/mesas-sesiones']));
      }
    });
  }

  ngOnInit(): void {
    const mesa = this.route.snapshot.paramMap.get('mesa');
    const pedidoParam = this.route.snapshot.paramMap.get('pedido');
    const pedidoQuery = this.route.snapshot.queryParamMap.get('pedido');
    // Hay que ESPERAR a que init() resuelva antes de seleccionar: a
    // diferencia de la grilla (que ya tenía `orders()` cargado de antes),
    // esta instancia del store siempre nace vacía -- `selectTable()` lee
    // `tableOrders(tableId)` de forma síncrona, así que si se llama antes de
    // que la carga acotada responda, encuentra la lista vacía, fija
    // `selectedOrderId` en `null` y nunca vuelve a intentarlo (no reacciona
    // a que `orders()` se llene después). Bug real, confirmado en vivo: la
    // mesa quedaba mostrando "todavía no tiene ningún pedido" aunque el
    // pedido sí estuviera en la respuesta del backend.
    void this.store.init(mesa ? { tableId: mesa } : { orderId: pedidoParam! }).then(() => {
      if (mesa) {
        this.store.selectTable(mesa);
        if (pedidoQuery) this.store.selectOrder(pedidoQuery);
      } else {
        this.store.selectStandaloneOrder(pedidoParam!);
      }
      this.selectedOnce.set(true);
    });
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  volver(): void {
    void this.router.navigate(['/dashboard/mesas-sesiones']);
  }

  /** CTA "Crear pedido nuevo" para un pedido SIN mesa -- preselecciona el
   *  mismo tipo (domicilio/para-llevar) del pedido que se está viendo, igual
   *  que `goToNewOrder()` hacía con la pestaña activa de la grilla (que ya
   *  no existe en esta ruta). */
  goToNewOrder(): void {
    const tipo = this.store.selectedOrder()?.order_type === 'DELIVERY' ? 'domicilio' : 'para-llevar';
    this.router.navigate(['/dashboard/mesas-sesiones/orden-manual'], { queryParams: { tipo } });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.store.catalogOpen()) this.store.closeCatalog();
      else this.volver();
    } else if (!(document.activeElement?.tagName ?? '').match(/INPUT|TEXTAREA|SELECT/) &&
      e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey)) {
      // Spec 029, Historia 4: solo el caso de cuenta dividida imprime desde
      // el diálogo de éxito.
      if (this.store.successOpen() && this.store.lastReceipts().length > 1) {
        e.preventDefault();
        this.store.printReceipt();
      }
    }
  }
}
