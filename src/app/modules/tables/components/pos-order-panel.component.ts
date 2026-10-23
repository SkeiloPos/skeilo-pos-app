import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { KitchenStatus, getSidebarMode } from '../interfaces/dining.interface';
import { kitchenStatusLabel } from '../../orders/order-status.util';
import { PosCatalogDrawerComponent } from './pos-catalog-drawer.component';
import { CartItemOptionsComponent } from './cart-item-options.component';
import { splitVariantLabel } from '../services/menu-lookup';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

/**
 * Columna central: armado y edición del pedido de la mesa seleccionada.
 *
 * Spec 045: sin mesa seleccionada, esta es la única responsabilidad de este
 * panel — un placeholder informativo, nada más. Ya no muestra aquí "Pagos
 * por confirmar" (spec 036 FR-004, retirada) — ese listado global se
 * reemplaza por el filtro "Pendientes" de la grilla de mesas más el flujo
 * ya existente por mesa (`payment-validation-block.component.ts`, spec 044).
 */
@Component({
  selector: 'app-pos-order-panel',
  standalone: true,
  imports: [PosCatalogDrawerComponent, CartItemOptionsComponent, IconLucideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El host es `inline` por defecto: sin esto no se ve como una columna.
  // shrink-0 (no flex-1 min-h-0): a pedido del usuario, el carrito ya no
  // tiene su propio scroll interno -- crece a su alto natural y es la
  // columna de detalle (table-sessions.component.ts) la que scrollea el
  // bloque entero de una sola vez si no alcanza, en vez de que cada caja
  // (carrito, cuenta de la mesa) recorte su contenido por separado.
  host: { class: 'flex flex-col shrink-0' },
  template: `
    @if (!store.hasActiveSelection()) {
      <div
        class="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2"
        style="color:var(--terminal-color-text-muted)"
      >
        <app-lucide-icon name="layout-grid" [size]="40" />
        <p class="text-[13px] max-w-xs">
          Selecciona una mesa para ver su pedido, o usa el filtro "Pendientes" de arriba para
          encontrar pagos por confirmar.
        </p>
      </div>
    } @else if (store.selectedTableId() && !store.selectedOrderId()) {
      <!-- Spec 087 (FR-008/FR-009, T014): mesa libre seleccionada, sin ningún
           pedido todavía -- "Agregar producto"/"Guardar pedido" ya no pueden
           crear la orden implícitamente (A-85), así que ofrecer el catálogo
           aquí solo llevaría a un guardado que falla. Se guía directo a
           "Crear pedido manual". -->
      <div
        class="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2"
        style="color:var(--terminal-color-text-muted)"
      >
        <app-lucide-icon name="receipt" [size]="40" />
        <p class="text-[13px] max-w-xs">
          Esta mesa todavía no tiene ningún pedido. Usa "Crear pedido manual" para empezar uno.
        </p>
      </div>
    } @else {
      <div class="flex flex-col">
        <!-- Header: mesa + estado + cliente en una sola fila, siempre de solo
             lectura (spec 049, FR-006/FR-008) — el nombre ya no se edita
             desde aquí. Banda propia con su propio border-bottom (mockup de
             referencia, tDetOn): no comparte padding/borde con el bloque
             "Cuentas" de abajo, que es una franja aparte. -->
        <div class="p-4 border-b shrink-0" style="border-color:var(--terminal-color-border)">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Insignia numerada: solo tiene sentido con una mesa real
                   (Domicilio/Para llevar no tienen un número que mostrar). -->
              @if (store.selectedTable(); as t) {
                <span
                  class="w-8 h-8 rounded-[8px] flex items-center justify-center text-[13px] font-bold shrink-0"
                  style="background:var(--terminal-color-primary);color:var(--terminal-color-on-primary)"
                  >{{ t.number }}</span
                >
              }
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3
                    class="truncate"
                    style="font-family:Sora,ui-sans-serif,system-ui,sans-serif;font-size:16px;font-weight:700;color:var(--terminal-color-text-primary)"
                  >{{ headerTitle() }}</h3>
                  @if (store.selectedTableStatusMeta(); as meta) {
                    <span
                      class="px-2 py-0.5 rounded-[6px] text-[11px] font-medium"
                      [class]="meta.chip"
                      >{{ meta.label }}</span
                    >
                  }
                </div>
                <span class="flex items-center gap-1 text-[13px] font-semibold" style="color:var(--terminal-color-text-primary)">
                  <app-lucide-icon name="user" [size]="14" style="color:var(--terminal-color-primary)" />
                  {{ displayCustomerName() }}
                </span>
              </div>
            </div>
          </div>

          <!-- Spec 059, Historia 3 (FR-012): datos propios de un pedido de
               Domicilio, capturados al crearlo (spec 056) — solo aplica sin
               mesa y con order_type DELIVERY.
               spec 078 (US5, FR-026–FR-030; research.md D6): fila compacta
               (flex flex-wrap) contigua a la insignia de estado, no un bloque
               vertical extenso. La dirección se muestra completa, envolviendo
               (break-words, sin truncate ni line-clamp). El valor del domicilio
               es el mismo delivery_fee que suma el total de la tarjeta (US1).
               shrink-0: parte del reparto de alto de US4. -->
          @if (!store.selectedTable() && store.selectedOrder()?.order_type === 'DELIVERY') {
            <div
              data-testid="delivery-info-row"
              class="text-[12px] flex flex-wrap items-start gap-x-3 gap-y-1 shrink-0 mt-3"
              style="color:var(--terminal-color-text-secondary)"
            >
              <span class="min-w-0 break-words inline-flex items-center gap-1">
                <app-lucide-icon name="map-pin" [size]="14" />
                {{ store.selectedOrder()?.delivery_address }}
              </span>
              @if (store.selectedOrder()?.delivery_phone; as phone) {
                <span class="whitespace-nowrap inline-flex items-center gap-1">
                  <app-lucide-icon name="phone" [size]="14" />
                  {{ phone }}
                </span>
              }
              <span class="whitespace-nowrap inline-flex items-center gap-1">
                <app-lucide-icon name="bike" [size]="14" />
                Domicilio: {{ store.fmt(store.selectedOrder()?.delivery_fee ?? 0) }}
              </span>
            </div>
          }
        </div>

        <!-- Bloque "Cuentas" (FR-022, research.md punto 4): reutiliza 1:1 el
             markup/estilo del bloque "accOn" del diseño de referencia —
             pestañas "Pedido N" tipo pill + badge, más el botón punteado
             "Nueva cuenta" al final, en su PROPIA franja con border-bottom
             (mockup: padding 12px 20px, separada de la cabecera de arriba y
             de la lista de líneas de abajo) — antes compartía el padding de
             la cabecera, sin ninguna línea que la separase de la lista de
             productos. Solo aplica dentro del detalle de una MESA (FR-022b,
             A-141): "Nueva cuenta" vive siempre que hay una mesa
             seleccionada (incluso con un solo pedido, sin pestañas visibles
             todavía) — es el único punto de entrada para crear un pedido
             nuevo en paralelo mientras se está aquí dentro, ya que la
             sub-barra oculta su propio CTA en ese caso (ver
             table-sessions.component.ts). -->
        @if (store.selectedTableId()) {
          <div
            role="tablist"
            aria-label="Cuentas de la mesa"
            class="flex items-center gap-2 flex-wrap px-5 py-3 border-b shrink-0"
            style="border-color:var(--terminal-color-border)"
          >
            @for (ot of store.orderTabs(); track ot.id) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="store.selectedOrderId() === ot.id"
                (click)="selectOrderTab(ot.id)"
                class="h-9 px-3 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
                [style]="
                  store.selectedOrderId() === ot.id
                    ? 'border-color:var(--terminal-color-primary);background:var(--terminal-color-primary);color:#fff'
                    : 'border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-secondary)'
                "
              >
                <!-- A pedido del usuario: un pago QR por confirmar es
                     una pestaña más (ver orderTabs() en el store) --
                     este punto la distingue de un pedido ya
                     consumido/activo de un vistazo, sin pantalla aparte. -->
                @if (ot.pending) {
                  <span
                    class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    [style.background]="store.selectedOrderId() === ot.id ? '#fff' : 'var(--terminal-color-warning)'"
                  ></span>
                }
                {{ ot.label }}
              </button>
            }
            <button
              type="button"
              (click)="createNewOrderForTable()"
              class="h-9 px-3 rounded-full border border-dashed text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
              style="border-color:var(--terminal-color-primary-border);color:var(--terminal-color-primary-text);background:none"
            >
              <app-lucide-icon name="plus" [size]="14" />
              Nueva cuenta
            </button>
          </div>
        }

        @if (showCatalog()) {
          <!-- Catálogo embebido (spec 036, FR-006/FR-007): reemplaza la lista
               de ítems mientras se agrega un producto, sin overlay de
               pantalla completa — "← Volver" del catálogo regresa aquí sin
               perder lo ya agregado (store.closeCatalog()). -->
          <app-pos-catalog-drawer />
        } @else {
          <!-- Cart: sin scroll propio (a pedido del usuario) -- crece a su
               alto natural; es la columna de detalle
               (table-sessions.component.ts) la que scrollea todo el bloque
               de una sola vez si no alcanza.

               Rediseño de ítems (a pedido del usuario): sin tarjetas
               individuales (bg/border/rounded por ítem) -- una sola lista
               separada por líneas divisorias (divide-y), más compacta y sin
               tanto recuadro repetido. Cada grupo de opciones se muestra con
               su propio nombre (p. ej. "Toppings", "Sabores"), reutilizando
               el mismo que el comensal/mesero vio al elegir -- antes todas
               las opciones (y la nota) iban en una lista plana de "•", sin
               forma de distinguir de qué grupo venía cada una ni qué era
               nota y qué era una opción elegida. -->
          <!-- "divide-y" fija el ancho del borde, pero "border-color" no es
               heredado por CSS -- ponerlo como estilo del contenedor no
               llegaba a los hijos reales que dibujan la línea (caían a
               currentColor, casi blanco sobre este fondo oscuro). Clase de
               color de división con valor arbitrario, no inline style. -->
          <div class="px-4 divide-y divide-[var(--terminal-color-border)]">
            @for (it of cartItems(); track it.key) {
              <!-- Rediseño (a pedido del usuario): insignia de cantidad +
                   nombre/variante en pastillas + precio unitario debajo del
                   nombre + "qty × unitario" debajo del importe -- mismo
                   patrón visual en toda la fila, en vez de una sola línea
                   plana "3x Nombre ... $ Importe". -->
              @let parts = splitVariantLabel(it.name);
              <div class="py-3 flex items-start gap-3">
                <div
                  class="shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center text-[13px] font-bold"
                  style="background:var(--terminal-color-primary-soft);color:var(--terminal-color-primary-text)"
                >
                  {{ it.qty }}x
                </div>
                <div class="flex-1 min-w-0 space-y-2.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 space-y-1.5">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-[14px]" style="color:var(--terminal-color-text-primary)">{{ parts.product }}</span>
                        @if (parts.variant) {
                          <span
                            class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style="background:var(--terminal-color-surface-elevated);color:var(--terminal-color-text-secondary)"
                            >{{ parts.variant }}</span
                          >
                        }
                      </div>
                      <div class="text-[11px]" style="color:var(--terminal-color-text-muted)">{{ store.fmt(it.unitPrice) }} c/u</div>
                      @if (it.promo; as promo) {
                        <!-- spec 115 (A-129): mismo formato de condición que ya usa
                             product-select.component.ts (data-testid="variant-promo"), en vez
                             del esquema rojo/"Ahorras" anterior -- consistencia con el modal. -->
                        <span
                          class="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                          style="background:var(--terminal-color-primary-soft);color:var(--terminal-color-primary-text)"
                          >{{ promo.badge }}</span
                        >
                      }
                      @if (it.addonsTotal > 0) {
                        <!-- spec 089 (A-94): adicionales del Menú QR, cobrados una vez por línea --
                             a la izquierda, junto al resto del detalle de la línea (a pedido del
                             usuario), no bajo el importe a la derecha. -->
                        <div class="text-[11px]" style="color:var(--terminal-color-text-muted)">+ {{ store.fmt(it.addonsTotal) }} adicionales</div>
                      }
                    </div>
                    <div class="text-right shrink-0">
                      @if (it.promo; as promo) {
                        <div class="flex items-center justify-end gap-1.5">
                          <span class="line-through text-[11px] font-mono" style="color:var(--terminal-color-text-muted)">{{
                            store.fmt(promo.originalAmount)
                          }}</span>
                          <span class="font-bold text-[14px]" style="color:var(--terminal-color-primary-text)">{{
                            store.fmt(promo.discountedAmount)
                          }}</span>
                        </div>
                      } @else {
                        <!-- Mockup de referencia (tDetOn, l.sub): el importe de
                             la línea siempre va en el color de marca, con o
                             sin promoción -- no solo cuando hay descuento. -->
                        <div class="font-bold text-[14px]" style="color:var(--terminal-color-primary-text)">{{ store.fmt(it.subtotal) }}</div>
                      }
                    </div>
                  </div>
                  <!-- Opciones elegidas (agrupadas por el nombre de su grupo,
                       p. ej. "Toppings", "Sabores") + nota de texto libre --
                       reutilizado tal cual en manual-order-page.component.ts. -->
                  <app-cart-item-options [options]="it.options" [notes]="it.notes" />
                  @if (it.kind === 'draft') {
                    <div class="flex items-center justify-between pt-2">
                      <div class="flex items-center gap-2">
                        <button
                          (click)="store.decDraft(it.key)"
                          class="w-7 h-7 rounded-[6px] border font-bold transition-colors"
                          style="border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-secondary)"
                        >
                          −
                        </button>
                        <span class="w-5 text-center font-bold text-[13px]" style="color:var(--terminal-color-text-primary)">{{ it.qty }}</span>
                        <button
                          (click)="store.incDraft(it.key)"
                          class="w-7 h-7 rounded-[6px] border font-bold transition-colors"
                          style="border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-secondary)"
                        >
                          +
                        </button>
                      </div>
                      <button
                        (click)="store.removeDraft(it.key)"
                        class="text-[11px] font-medium transition-colors"
                        style="color:var(--terminal-color-error)"
                      >
                        Eliminar
                      </button>
                    </div>
                  } @else if (it.kind === 'persisted') {
                    <div class="flex items-center justify-between pt-2">
                      <div class="flex items-center gap-2 text-[11px]">
                        @if (it.kitchenStatus; as estado) {
                          <span class="px-2 py-0.5 rounded-[6px] font-semibold" [style]="statusStyle(estado)">
                            {{ statusLabel(estado) }}
                          </span>
                        }
                      </div>
                      <div class="flex items-center gap-2">
                        <!-- Marcar listo desde aquí es lo que sustituye al tablero de
                           cocina: quien toma el pedido lo prepara y lo marca sin
                           cambiar de pantalla. Botón outline (borde, sin
                           relleno), 44px de alto -- mismo tratamiento/tamaño que
                           "Anular" (mockup de referencia, tDetOn): antes eran
                           dos botones de distinto peso/tamaño. -->
                        @if (!it.ready) {
                          <button
                            (click)="store.avanzarItem(it.key)"
                            [disabled]="store.submitting()"
                            class="min-h-11 px-3.5 rounded-[8px] border text-[13px] font-semibold disabled:opacity-50 transition-colors"
                            style="border-color:var(--terminal-color-success);color:var(--terminal-color-success);background:var(--terminal-color-surface)"
                          >
                            Marcar listo
                          </button>
                        }
                        @if (it.ready) {
                          <!-- FR-003: texto de ayuda cuando la acción no está
                             disponible por el estado de la línea. -->
                          <span class="text-[11px]" style="color:var(--terminal-color-text-muted)" title="Producto ya preparado: agrega un producto nuevo">
                            Producto ya preparado
                          </span>
                        }
                        <!-- Un pedido ya pagado se asume entregado: no se anula
                           (spec 029, FR-007). Tampoco una línea ya lista: una
                           vez preparada ya consumió su inventario y el cajero
                           la trata como entregada, igual que "Producto ya
                           preparado" de arriba bloquea tocarla de nuevo --
                           antes solo el pago bloqueaba "Anular", y una línea
                           lista en un pedido sin pagar aún mostraba el botón.
                           Mismo tratamiento outline que "Marcar listo", en su
                           color de peligro. -->
                        @if (!store.selectedOrder()?.paid && !it.ready) {
                          <button
                            (click)="
                              it.comboId
                                ? store.voidPersistedCombo(it.comboId)
                                : store.voidPersistedItem(it.itemIds[0])
                            "
                            class="min-h-11 px-3.5 rounded-[8px] border text-[13px] font-semibold transition-colors"
                            style="border-color:var(--terminal-color-error);color:var(--terminal-color-error);background:var(--terminal-color-surface)"
                          >
                            Anular
                          </button>
                        }
                      </div>
                    </div>
                  }
                  <!-- 'pending-review' (pago QR sin confirmar): sin fila de
                       acciones -- el pedido todavía no se envió a cocina (eso
                       pasa recién al confirmar el pago, desde
                       app-pos-checkout-panel a la derecha), así que no hay
                       nada que anular ni marcar listo desde aquí todavía. -->
                </div>
              </div>
            }
            @if (cartIsEmpty()) {
              <div class="text-center py-10 text-[13px]" style="color:var(--terminal-color-text-muted)">
                Aún no hay productos en este pedido.
              </div>
            }
          </div>
          @if (!readOnly() && store.centralState() !== 'ocupada-sin-pedido') {
            <!--
              Fuera del divide-y de la lista (a propósito): con un borde
              propio en las 4 caras, si quedara adentro le sumaría el
              border-t de divide-y encima, una línea doble justo arriba.

              Spec 110: oculto cuando centralState() es 'ocupada-sin-pedido'
              -- esta mesa ya tiene sesión abierta sin ningún pedido vivo, y
              la única acción que debe verse en el panel de detalle es
              "Liberar Mesa" (pos-checkout-panel.component.ts); crear un
              pedido nuevo en esa mesa sigue disponible desde el CTA de la
              sub-barra ("+ Crear pedido nuevo" / F3), que no se toca.
            -->
            <div class="px-4 pb-4" [class]="cartIsEmpty() ? '' : 'pt-3'">
              <button
                (click)="store.openCatalog()"
                class="w-full py-2.5 rounded-[10px] border text-[13px] font-medium flex items-center justify-center gap-1 transition-colors"
                style="border-color:var(--terminal-color-border);color:var(--terminal-color-text-secondary);background:var(--terminal-color-surface)"
              >
                ＋ Agregar producto
              </button>
            </div>
          }

          <!-- Spec 049, FR-002: el resumen Subtotal/Descuento/Total se retiró
               de este panel — vive ahora en session-bill-panel.component.ts
               ("Cuenta de la mesa"). "Guardar pedido" no es de cobro, así que
               se queda aquí, solo sin el contenedor de totales alrededor.
               spec 078 (US4, FR-023): fuera de la lista scrolleable, shrink-0 —
               siempre alcanzable. "Marcar pedido listo" ya no vive aquí -- se
               subió a la cabecera, a la derecha de "Mesa N" (a pedido del
               usuario). -->
          @if (store.hasDraft()) {
            <div class="p-4 pt-3 border-t shrink-0" style="border-color:var(--terminal-color-border)">
              <button
                (click)="store.saveOrder()"
                [disabled]="store.submitting()"
                class="w-full py-2.5 text-white rounded-[8px] text-[13px] font-semibold disabled:opacity-50 transition-colors"
                style="background:var(--terminal-color-primary)"
              >
                {{ store.submitting() ? 'Guardando…' : 'Guardar pedido' }}
              </button>
            </div>
          }
        }
      </div>
    }
  `,
})
export class PosOrderPanelComponent {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);

  /** Botón "Nueva cuenta" del bloque de pestañas (FR-022, FR-022b; A-141):
   *  dispara exactamente la misma navegación que el CTA "+ Crear pedido
   *  nuevo" de la sub-barra (spec 087) — `store.newOrderTableId()` ya
   *  resuelve a `selectedTableId()` cuando hay una mesa seleccionada, así
   *  que dentro del detalle siempre apunta a la mesa actual. */
  createNewOrderForTable(): void {
    const tableId = this.store.newOrderTableId();
    if (!tableId) return;
    this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }

  /**
   * Ítems del pedido seleccionado -- incluido un pago QR por confirmar,
   * ahora que `selectTable()`/`orderTabs()` ya lo seleccionan como cualquier
   * otro pedido (a pedido del usuario). `store.cartView()` ya marca sus
   * ítems `kind: 'pending-review'` (ver `selectedOrderPending()` en el
   * store), así que este panel no necesita distinguir el caso aquí.
   */
  readonly cartItems = computed(() => this.store.cartView());

  readonly cartIsEmpty = computed(() => this.cartItems().length === 0);

  /** spec 087 (FR-004, A-88): el nombre del cliente se destaca en la
   *  cabecera del pedido. Si el pedido no trae `customer_name` (p. ej. mesa
   *  sin cliente capturado), sigue lo que el cajero escriba en "Facturar a
   *  nombre de" del panel de cobro (`billingCustomerName`) -- es la única
   *  forma de nombrar al cliente en ese caso, así que la cabecera debe
   *  reflejarlo en vez de quedarse fija en "Consumidor Final". */
  readonly displayCustomerName = computed(
    () =>
      this.store.customerName().trim() ||
      this.store.billingCustomerName().trim() ||
      'Consumidor Final',
  );

  /** Spec 036, US2, escenario 5: mismo criterio que ya usa
   *  `pos-checkout-panel.component.ts` para su propio modo de solo lectura
   *  (`getSidebarMode`, `dining.interface.ts`) — una orden QR (pagada o
   *  todavía por confirmar) no ofrece "+ Agregar producto". */
  readonly readOnly = computed(() => getSidebarMode(this.store.selectedOrder()) === 'resumen');

  /** Catálogo embebido visible (spec 036, FR-006/FR-007): nunca en modo de
   *  solo lectura, aunque `catalogOpen()` hubiera quedado en `true` de una
   *  orden distinta seleccionada antes en la misma mesa. */
  readonly showCatalog = computed(() => this.store.catalogOpen() && !this.readOnly());

  /** Elegir una pestaña "Pedido N" sale de la vista agregada y enfoca ese
   *  pedido (spec 049, D5) — reusa `selectOrder()` tal cual. */
  selectOrderTab(orderId: string): void {
    this.store.showAllOrders.set(false);
    this.store.selectOrder(orderId);
  }

  /**
   * Spec 059, Historia 3: título de la cabecera — "Mesa N" con mesa
   * seleccionada (sin cambios), o el tipo de pedido sin mesa
   * ("Domicilio"/"Para llevar") cuando se seleccionó desde su tarjeta.
   */
  headerTitle(): string {
    const table = this.store.selectedTable();
    if (table) return 'Mesa ' + table.number;
    return this.store.selectedOrder()?.order_type === 'DELIVERY' ? 'Domicilio' : 'Para llevar';
  }

  /** Las mismas etiquetas que ve el comensal en el menú del QR. */
  statusLabel(status: KitchenStatus): string {
    return kitchenStatusLabel(status);
  }

  /** spec 131: color del badge de preparación con los tokens del rediseño
   *  (research.md, "modelo de caja") en vez de `kitchenStatusClass()`
   *  (`order-status.util.ts`) -- esa función es compartida con el tablero de
   *  Órdenes y el Menú QR del comensal (fuera de alcance de este spec), así
   *  que no se toca; este mapeo vive solo aquí, local a esta plantilla. */
  statusStyle(status: KitchenStatus): string {
    switch (status) {
      case 'pendiente':
        return 'background:var(--terminal-color-warning-soft);color:var(--terminal-color-warning)';
      case 'en_preparacion':
        return 'background:var(--terminal-color-info-soft);color:var(--terminal-color-info)';
      case 'listo':
        return 'background:var(--terminal-color-success-soft);color:var(--terminal-color-success)';
      case 'anulado':
        return 'background:var(--terminal-color-surface-elevated);color:var(--terminal-color-text-muted)';
    }
  }

  /** Separa el nombre del producto de su variante -- ver `splitVariantLabel()` en `menu-lookup.ts`. */
  splitVariantLabel = splitVariantLabel;
}
