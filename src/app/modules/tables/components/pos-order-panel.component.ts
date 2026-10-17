import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { KitchenStatus, getSidebarMode } from '../interfaces/dining.interface';
import { kitchenStatusClass, kitchenStatusLabel } from '../../orders/order-status.util';
import { PosCatalogDrawerComponent } from './pos-catalog-drawer.component';
import { CartItemOptionsComponent } from './cart-item-options.component';
import { splitVariantLabel } from '../services/menu-lookup';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

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
  imports: [PosCatalogDrawerComponent, CartItemOptionsComponent, IconMiComponent],
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
        class="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-6 gap-2"
      >
        <app-mi-icon name="restaurant" [size]="40" />
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
        class="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-6 gap-2"
      >
        <app-mi-icon name="receipt_long" [size]="40" />
        <p class="text-[13px] max-w-xs">
          Esta mesa todavía no tiene ningún pedido. Usa "Crear pedido manual" para empezar uno.
        </p>
      </div>
    } @else {
      <div class="flex flex-col">
        <!-- Header: mesa + estado + cliente en una sola fila, siempre de solo
             lectura (spec 049, FR-006/FR-008) — el nombre ya no se edita
             desde aquí. -->
        <div class="p-4 border-b border-gray-200 space-y-2 shrink-0">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Insignia numerada: solo tiene sentido con una mesa real
                   (Domicilio/Para llevar no tienen un número que mostrar). -->
              @if (store.selectedTable(); as t) {
                <span
                  class="w-8 h-8 rounded-[6px] bg-indigo-600 text-white flex items-center justify-center text-[13px] font-bold shrink-0"
                  >{{ t.number }}</span
                >
              }
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-[16px] font-bold text-gray-900 truncate">{{ headerTitle() }}</h3>
                  @if (store.selectedTableStatusMeta(); as meta) {
                    <span
                      class="px-2 py-0.5 rounded-[6px] text-[11px] font-medium"
                      [class]="meta.chip"
                      >{{ meta.label }}</span
                    >
                  }
                </div>
                <span class="flex items-center gap-1 text-[13px] font-semibold text-gray-900">
                  <app-mi-icon name="person" [size]="14" class="text-indigo-600 shrink-0" />
                  {{ displayCustomerName() }}
                </span>
              </div>
            </div>

            <!-- Columna derecha desde sm (en móvil se apila abajo, a todo el
                 ancho -- 4 pestañas "Pedido N" no caben al lado del nombre del
                 cliente en ~375px sin aplastarlo): pestañas "Pedido N", chip de
                 cobro pendiente y el botón de cerrar, todos en una sola fila
                 junto al botón de cerrar (antes las pestañas iban en su propia
                 fila debajo, separadas de él). -->
            <div class="flex flex-wrap items-center justify-start sm:justify-end gap-1.5 shrink-0">
              @if (store.orderTabs().length > 0) {
                <!-- Spec 049, FR-009: cada "Pedido N" enfoca una sola orden de la
                     mesa. Sin "+ Nuevo pedido" (FR-001, spec 049 — retirado sin
                     reemplazo en este panel). -->
                <div class="flex flex-wrap gap-1.5">
                  @for (ot of store.orderTabs(); track ot.id) {
                    <button
                      (click)="selectOrderTab(ot.id)"
                      class="px-3 py-1.5 text-[12px] font-medium rounded-[6px] border transition-colors"
                      [class]="
                        store.selectedOrderId() === ot.id
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      "
                    >
                      <!-- A pedido del usuario: un pago QR por confirmar es
                           una pestaña más (ver orderTabs() en el store) --
                           este punto la distingue de un pedido ya
                           consumido/activo de un vistazo, sin pantalla aparte. -->
                      @if (ot.pending) {
                        <span
                          class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                          [class]="store.selectedOrderId() === ot.id ? 'bg-white' : 'bg-amber-500'"
                        ></span>
                      }
                      {{ ot.label }}
                    </button>
                  }
                </div>
              }
              <!-- Mismo dato que ya calculaba headerStatusText() ("pago
                   pendiente"), ahora también como insignia visible de un
                   vistazo -- no se inventa ningún estado nuevo. -->
              @if (headerStatusText() === 'pago pendiente') {
                <span
                  class="px-2.5 py-1 rounded-[6px] bg-indigo-600 text-white text-[11px] font-semibold whitespace-nowrap"
                  >Cobro pendiente</span
                >
              }
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
              class="text-[12px] text-gray-500 flex flex-wrap items-start gap-x-3 gap-y-1 shrink-0"
            >
              <span class="min-w-0 break-words inline-flex items-center gap-1">
                <app-mi-icon name="location_on" [size]="14" />
                {{ store.selectedOrder()?.delivery_address }}
              </span>
              @if (store.selectedOrder()?.delivery_phone; as phone) {
                <span class="whitespace-nowrap inline-flex items-center gap-1">
                  <app-mi-icon name="call" [size]="14" />
                  {{ phone }}
                </span>
              }
              <span class="whitespace-nowrap inline-flex items-center gap-1">
                <app-mi-icon name="delivery_dining" [size]="14" />
                Domicilio: {{ store.fmt(store.selectedOrder()?.delivery_fee ?? 0) }}
              </span>
            </div>
          }
        </div>

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
          <div class="px-4 divide-y divide-gray-200">
            @for (it of cartItems(); track it.key) {
              <!-- Rediseño (a pedido del usuario): insignia de cantidad +
                   nombre/variante en pastillas + precio unitario debajo del
                   nombre + "qty × unitario" debajo del importe -- mismo
                   patrón visual en toda la fila, en vez de una sola línea
                   plana "3x Nombre ... $ Importe". -->
              @let parts = splitVariantLabel(it.name);
              <div class="py-3 flex items-start gap-3">
                <div
                  class="shrink-0 w-9 h-9 rounded-[8px] bg-indigo-50 text-indigo-600 flex items-center justify-center text-[13px] font-bold"
                >
                  {{ it.qty }}x
                </div>
                <div class="flex-1 min-w-0 space-y-1.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-gray-900 text-[14px]">{{ parts.product }}</span>
                        @if (parts.variant) {
                          <span
                            class="bg-gray-100 text-gray-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            >{{ parts.variant }}</span
                          >
                        }
                      </div>
                      <div class="text-[11px] text-gray-400">{{ store.fmt(it.unitPrice) }} c/u</div>
                      @if (it.promo; as promo) {
                        <!-- spec 115 (A-129): mismo formato de condición que ya usa
                             product-select.component.ts (data-testid="variant-promo"), en vez
                             del esquema rojo/"Ahorras" anterior -- consistencia con el modal. -->
                        <span
                          class="inline-block bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 whitespace-nowrap"
                          >{{ promo.badge }}</span
                        >
                      }
                    </div>
                    <div class="text-right shrink-0">
                      @if (it.promo; as promo) {
                        <div class="flex items-center justify-end gap-1.5">
                          <span class="line-through text-[11px] text-gray-400 font-mono">{{
                            store.fmt(promo.originalAmount)
                          }}</span>
                          <span class="font-bold text-indigo-600 text-[14px]">{{
                            store.fmt(promo.discountedAmount)
                          }}</span>
                        </div>
                      } @else {
                        <div class="font-bold text-gray-900 text-[14px]">{{ store.fmt(it.subtotal) }}</div>
                      }
                      @if (!it.promo) {
                        <!-- spec 115 (A-133): se quita con promoción -- con cantidades que no
                             completan un paquete exacto, el precio promedio por unidad no
                             representa ningún precio real cobrado, solo confunde. -->
                        <div class="text-[11px] text-gray-400">{{ it.qty }} × {{ store.fmt(it.unitPrice) }}</div>
                      }
                      @if (it.addonsTotal > 0) {
                        <!-- spec 089 (A-94): adicionales del Menú QR, cobrados una vez por línea. -->
                        <div class="text-[11px] text-gray-400">+ {{ store.fmt(it.addonsTotal) }} adicionales</div>
                      }
                    </div>
                  </div>
                  <!-- Opciones elegidas (agrupadas por el nombre de su grupo,
                       p. ej. "Toppings", "Sabores") + nota de texto libre --
                       reutilizado tal cual en manual-order-page.component.ts. -->
                  <app-cart-item-options [options]="it.options" [notes]="it.notes" />
                  @if (it.kind === 'draft') {
                    <div class="flex items-center justify-between pt-1">
                      <div class="flex items-center gap-2">
                        <button
                          (click)="store.decDraft(it.key)"
                          class="w-7 h-7 rounded-[6px] border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold"
                        >
                          −
                        </button>
                        <span class="w-5 text-center font-bold text-[13px]">{{ it.qty }}</span>
                        <button
                          (click)="store.incDraft(it.key)"
                          class="w-7 h-7 rounded-[6px] border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold"
                        >
                          +
                        </button>
                      </div>
                      <button
                        (click)="store.removeDraft(it.key)"
                        class="text-[11px] font-medium text-red-600 hover:text-red-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  } @else if (it.kind === 'persisted') {
                    <div class="flex items-center justify-between pt-1">
                      <div class="flex items-center gap-2 text-[11px]">
                        @if (it.kitchenStatus; as estado) {
                          <span class="px-2 py-0.5 rounded-[6px]" [class]="statusClass(estado)">
                            {{ statusLabel(estado) }}
                          </span>
                        }
                        <!-- spec 123: la línea tiene al menos una adición
                           agregada después de que el pedido ya se cobró. -->
                        @if (it.modificada) {
                          <span
                            class="px-2 py-0.5 rounded-[6px] bg-amber-50 text-amber-700 font-semibold"
                          >
                            Modificada
                          </span>
                        }
                      </div>
                      <div class="flex items-center gap-3">
                        <!-- Marcar listo desde aquí es lo que sustituye al tablero de
                           cocina: quien toma el pedido lo prepara y lo marca sin
                           cambiar de pantalla. Botón outline (borde, sin
                           relleno) -- antes era solo texto con color, sin forma
                           de botón; "Marcar listo" en vez de "✓ Listo" para que
                           el texto ya diga la acción sin depender del ícono. -->
                        @if (!it.ready) {
                          <button
                            (click)="store.avanzarItem(it.key)"
                            [disabled]="store.submitting()"
                            class="px-2.5 py-1 rounded-[6px] border border-green-200 text-[11px] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
                          >
                            Marcar listo
                          </button>
                        }
                        <!-- spec 123 (FR-001 a FR-003): solo mientras la línea
                           siga "pendiente"/"en_preparacion" (!it.ready) y no
                           sea un combo -- disponible aunque el pedido ya esté
                           pagado (a diferencia de "Anular", abajo). Además,
                           solo si la variante tiene algún grupo de opciones
                           configurado -- si no, el selector solo mostraría
                           el estado vacío. -->
                        @if (!it.ready && !it.comboId && store.variantHasAdditionOptions(it.variantId)) {
                          <button
                            (click)="store.openAdditionPicker(it.itemIds[0], it.variantId!)"
                            [disabled]="store.submitting()"
                            class="px-2.5 py-1 rounded-[6px] border border-blue-200 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                          >
                            Agregar adición
                          </button>
                        } @else if (it.ready) {
                          <!-- FR-003: texto de ayuda cuando la acción no está
                             disponible por el estado de la línea. -->
                          <span class="text-[11px] text-gray-400" title="Producto ya preparado: agrega un producto nuevo">
                            Producto ya preparado
                          </span>
                        }
                        <!-- Un pedido ya pagado se asume entregado: no se anula
                           (spec 029, FR-007). Mismo tratamiento outline que
                           "Marcar listo", en su color de peligro. -->
                        @if (!store.selectedOrder()?.paid) {
                          <button
                            (click)="
                              it.comboId
                                ? store.voidPersistedCombo(it.comboId)
                                : store.voidPersistedItem(it.itemIds[0])
                            "
                            class="px-2.5 py-1 rounded-[6px] border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
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
              <div class="text-center text-gray-400 py-10 text-[13px]">
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
                class="w-full py-2.5 border border-gray-200 rounded-[6px] text-[13px] font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1"
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
            <div class="p-4 pt-3 border-t border-gray-200 shrink-0">
              <button
                (click)="store.saveOrder()"
                [disabled]="store.submitting()"
                class="w-full py-2.5 bg-indigo-600 text-white rounded-[6px] text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {{ store.submitting() ? 'Guardando…' : 'Guardar pedido' }}
              </button>
            </div>
          }
        }
      </div>
    }

    <!-- spec 123: selector mínimo de "Agregar adición" -- lista las opciones
       de la variante de la línea abierta; el cajero elige una y su
       cantidad, y confirma. No valida min/max aquí: el backend es la
       autoridad final (FR-008/FR-009). -->
    @if (store.additionPickerItemId(); as itemId) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 class="text-sm font-semibold text-gray-900">Agregar adición</h2>
            <button
              type="button"
              (click)="closeAdditionPicker()"
              class="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
          <div class="p-4 max-h-96 overflow-y-auto">
            @if (store.additionPickerOptions().length === 0) {
              <p class="text-[12px] text-gray-500">
                Este producto no tiene adiciones configuradas.
              </p>
            }
            @for (entry of store.additionPickerOptions(); track entry.option.id) {
              @let existingQty = store.additionPickerExistingQty().get(entry.option.id);
              <div class="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <div class="text-[12px]">
                  <div class="text-gray-900">{{ entry.option.name }}</div>
                  <div class="text-gray-400">{{ entry.groupName }} · $ {{ entry.option.extra_price }}</div>
                  @if (existingQty != null) {
                    <div class="text-indigo-600">Ya en la línea: x{{ existingQty }}</div>
                  }
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      [disabled]="additionQtyFor(entry.option.id) <= additionQtyMinFor(entry.option.id)"
                      (click)="decAdditionQty(entry.option.id)"
                      class="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-[13px] font-bold transition-colors disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      [attr.min]="additionQtyMinFor(entry.option.id)"
                      [value]="additionQtyFor(entry.option.id)"
                      (input)="setAdditionQty(entry.option.id, +$any($event.target).value || additionQtyMinFor(entry.option.id))"
                      class="w-10 border border-gray-200 rounded-[6px] text-[12px] px-1 py-1 text-center font-mono tabular-nums"
                    />
                    <button
                      type="button"
                      (click)="incAdditionQty(entry.option.id)"
                      class="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center text-[13px] font-bold transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <button
                    [disabled]="additionConfirmDisabled(entry.option.id)"
                    (click)="confirmAdditionEntry(entry.option.id)"
                    class="px-2.5 py-1 rounded-[6px] bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {{ existingQty != null ? 'Actualizar' : 'Agregar' }}
                  </button>
                  @if (existingQty != null) {
                    <button
                      type="button"
                      [disabled]="store.submitting()"
                      (click)="store.removeAddition(entry.option.id)"
                      title="Quitar esta adición de la línea"
                      class="p-1 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-[6px] disabled:opacity-50 transition-colors"
                    >
                      <app-mi-icon name="delete" ariaLabel="Quitar adición" [size]="16" />
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class PosOrderPanelComponent {
  readonly store = inject(PosTerminalStore);

  /** spec 123: cantidad elegida en el selector de "Agregar adición" --
   *  estado transitorio de UI, no vive en el store. Una entrada por
   *  option.id para que cada adición tenga su propio contador. */
  private readonly additionQty = signal<Record<string, number>>({});

  /** El contador arranca en lo que de verdad hay -- 0 para una opción nueva, la
   *  cantidad ya persistida para una que ya está en la línea -- nunca asumiendo que
   *  el cajero quiere agregar/sumar 1 por defecto. El cajero decide con +/- cuánto
   *  quiere, y "Agregar"/"Actualizar" se deshabilita mientras eso siga siendo nada
   *  (0 para agregar) o lo mismo que ya hay (para actualizar). */
  additionQtyFor(optionId: string): number {
    const typed = this.additionQty()[optionId];
    if (typed != null) return typed;
    return this.store.additionPickerExistingQty().get(optionId) ?? 0;
  }

  /** Una opción nueva puede bajar hasta 0 (sin elegir nada); una ya persistida no
   *  baja de 1 -- el PATCH siempre exige `quantity >= 1` (quitarla del todo va por
   *  el botón de borrar, no por bajar el contador a 0). */
  additionQtyMinFor(optionId: string): number {
    return this.store.additionPickerExistingQty().has(optionId) ? 1 : 0;
  }

  /** Nada que enviar: 0 en una opción nueva (no se agrega nada) o la misma
   *  cantidad que ya tiene una existente (el backend lo rechazaría igual). */
  additionConfirmDisabled(optionId: string): boolean {
    if (this.store.submitting()) return true;
    const qty = this.additionQtyFor(optionId);
    const existing = this.store.additionPickerExistingQty().get(optionId);
    return existing != null ? qty === existing : qty === 0;
  }

  setAdditionQty(optionId: string, value: number): void {
    this.additionQty.update((qty) => ({ ...qty, [optionId]: value }));
  }

  /** Stepper de botones -/+ (más accesible que las flechitas nativas del
   *  `<input type="number">`, sobre todo para bajar la cantidad). */
  incAdditionQty(optionId: string): void {
    this.setAdditionQty(optionId, this.additionQtyFor(optionId) + 1);
  }

  decAdditionQty(optionId: string): void {
    const next = this.additionQtyFor(optionId) - 1;
    if (next >= this.additionQtyMinFor(optionId)) this.setAdditionQty(optionId, next);
  }

  /** La opción ya en la línea sube o baja su cantidad (PATCH); una nueva se agrega
   *  (POST) -- reutiliza el mismo botón "Agregar adición" para los tres casos en
   *  vez de obligar a anular la línea para ajustar un topping ya puesto. */
  confirmAdditionEntry(optionId: string): void {
    const qty = this.additionQtyFor(optionId);
    if (this.store.additionPickerExistingQty().has(optionId)) {
      this.store.updateAdditionQuantity(optionId, qty);
    } else {
      this.store.confirmAddition(optionId, qty);
    }
  }

  closeAdditionPicker(): void {
    this.additionQty.set({});
    this.store.closeAdditionPicker();
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
   * Spec 029, Historia 3: "listo para cobrar" exige pago Y cocina, las dos a
   * la vez — antes solo miraba `kitchenReady()`. `kitchenReady()` en sí no
   * cambia: sigue controlando, sin relación con el pago, cuándo se oculta
   * el botón "Marcar pedido listo".
   */
  headerStatusText(): string {
    if (!this.store.kitchenReady()) return 'en preparación';
    return this.store.selectedOrder()?.paid ? 'listo para cobrar' : 'pago pendiente';
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

  statusClass(status: KitchenStatus): string {
    return kitchenStatusClass(status);
  }

  /** Separa el nombre del producto de su variante -- ver `splitVariantLabel()` en `menu-lookup.ts`. */
  splitVariantLabel = splitVariantLabel;
}
