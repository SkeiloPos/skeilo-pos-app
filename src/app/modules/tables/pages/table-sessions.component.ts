import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PosTablesPanelComponent } from '../components/pos-tables-panel.component';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { PosTerminalHeaderComponent } from '../components/pos-terminal-header.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Terminal POS de mesas (staff) -- diseño alineado al mockup de referencia
 * (`terminal-de-mesas/code.html`): cabecera de estado de terminal + sub-barra
 * de pestañas de tipo de orden y resumen de salón, dos tarjetas blancas
 * flotantes (mesas · detalle) sobre fondo gris, radio de 6px y sin sombras.
 *
 * Rediseño responsive: por debajo del breakpoint `lg` las dos tarjetas ya no
 * conviven lado a lado — se muestra una sola a la vez, según
 * `store.hasActiveSelection()`, con un botón de volver a la grilla. Desde
 * `lg` en adelante van lado a lado, igual que en el mockup.
 *
 * Feature 028 ("terminal híbrida por origen"): la columna central ya no tiene
 * pestañas — antes duplicaban la misma información ("Pedido de la mesa" /
 * "Pagos por confirmar") y el cajero tenía que acordarse de ir a mirar la
 * segunda.
 *
 * Hotfix posterior (a pedido del usuario): tampoco hay ya una vista aparte
 * para "Pagos por confirmar" que reemplazara `app-pos-order-panel` +
 * `app-pos-checkout-panel` por `app-payment-validation-block` -- ese cambio
 * dejaba `app-pos-checkout-panel` sin ningún pedido "seleccionado" (un pago
 * QR pendiente nunca entra en `selectedOrderId`, ver `pos-terminal.store.ts`)
 * y terminaba mostrando el CTA de "Pedido de mostrador", sin sentido en una
 * mesa ocupada. Ahora un pago QR pendiente se ve integrado en la MISMA vista
 * de siempre: `app-pos-order-panel` cae a `store.firstPendingOrder()` para
 * mostrar sus ítems (de sólo lectura) cuando no hay nada seleccionado de
 * verdad, y `app-pos-checkout-panel` muestra ahí mismo el comprobante y las
 * acciones de confirmar/rechazar en vez de la cuenta.
 *
 * - una mesa libre sin pedido en curso → bloque informativo en línea (spec
 *   045: ya no abre ningún armado de pedido embebido — para crear uno nuevo,
 *   el cajero usa el botón fijo de "Pedido de mostrador" o F3, que navegan a
 *   `manual-order-page.component.ts`)
 * - cualquier otro caso (mesa con algo real que mostrar: armando un pedido,
 *   uno ya en cocina, o un pago QR pendiente) → siempre
 *   `app-pos-order-panel` + `app-pos-checkout-panel`.
 *
 * A pedido del usuario, sin ninguna mesa ni pedido seleccionado la tarjeta de
 * detalle ya no se muestra en absoluto (antes tenía su propio estado vacío
 * con ícono + atajos de teclado) -- la de mesas ocupa todo el ancho, y el CTA
 * "+ Crear pedido nuevo" vive ahora en la sub-barra, junto al resumen de
 * mesas.
 */
@Component({
  selector: 'app-table-sessions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PosTerminalStore],
  imports: [
    PosTablesPanelComponent,
    PosOrderPanelComponent,
    PosCheckoutPanelComponent,
    PosTerminalHeaderComponent,
    IconMiComponent,
  ],
  template: `
    <div class="flex flex-col -m-4 md:-m-6 bg-[#f9fafb] ">
      <!-- Encabezado: estado de terminal, turno, reloj y acciones de sesión
           (extraído a un componente compartido con manual-order-page.component.ts). -->
      <app-pos-terminal-header />

      <!-- Sub-barra: pestañas de tipo de orden + resumen de salón. Se oculta
           en la vista de detalle de pedido (a pedido del usuario, el detalle
           no necesita las pestañas de tipo ni el CTA de "Crear pedido nuevo",
           ya tiene su propio botón de volver) -- EXCEPTO cuando la mesa
           seleccionada ya tiene un pedido abierto (spec 087, FR-007, A-88):
           ahí se mantiene visible para permitir un segundo pedido en
           paralelo sobre la misma mesa (goToNewOrder() ya apunta a esta
           mesa vía newOrderTableId(), que cae a selectedTableId() aunque
           esté ocupada). Un pedido "Para llevar"/"Domicilio" sin mesa
           (selectedTableId() nulo) conserva el comportamiento previo. -->
      @if (!showingDetail() || store.selectedTableId()) {
        <div
          class="bg-white border-b border-[#e5e7eb] px-3 sm:px-4 py-2 sm:py-0 sm:h-14 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0"
        >
          <div class="flex items-center gap-3">
            <nav
              class="flex items-center gap-1 bg-[#f3f4f6] p-1 rounded-[6px] overflow-x-auto sm:overflow-visible"
            >
              @for (t of orderTypeTabs; track t.key) {
                <button
                  (click)="store.setOrderTypeTab(t.key)"
                  class="shrink-0 h-9 px-3.5 rounded-[6px] text-[13px] flex items-center gap-2 transition-colors whitespace-nowrap"
                  [class]="
                    store.orderTypeTab() === t.key
                      ? 'bg-white border border-[#e5e7eb] text-[#111827] font-semibold'
                      : 'text-[#4b5563] hover:text-[#111827] font-medium'
                  "
                >
                  {{ t.label }}
                </button>
              }
            </nav>
          </div>

          <!-- spec 078 (US2, FR-007/FR-013/FR-015): el CTA "Crear pedido nuevo"
               está fuera del guard de pestaña — visible y habilitado en las tres
               pestañas y en los tres anchos, con etiqueta de texto siempre (nunca
               solo el ícono +). Solo en "Mesas" exige una mesa libre; Domicilio y
               Para llevar no exigen mesa y goToNewOrder() navega a la ruta sin
               tableId con el query param tipo. -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              (click)="goToNewOrder()"
              [disabled]="store.orderTypeTab() === 'mesas' && !store.newOrderTableId()"
              [title]="
                store.orderTypeTab() === 'mesas' && !store.newOrderTableId()
                  ? 'No hay ninguna mesa libre disponible'
                  : ''
              "
              class="h-9 sm:h-10 px-3 sm:px-3.5 rounded-[6px] bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[12px] sm:text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <app-mi-icon name="add_circle" [size]="16" class="shrink-0" />
              <span>Crear pedido nuevo</span>
              <span
                class="hidden md:inline px-1.5 py-0.5 bg-white/20 rounded-[6px] text-[10px] font-semibold uppercase tracking-wider"
                >[F3]</span
              >
            </button>
          </div>
        </div>
      }

      @if (store.loading()) {
        <div class="flex-1 flex items-center justify-center text-sm text-gray-400">
          Cargando terminal…
        </div>
      } @else {
        @if (store.error()) {
          <div class="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
            {{ store.error() }}
          </div>
        }
        <!-- spec 078 (US3, FR-018; research.md D4): sin overflow-y-auto de
             página en ningún ancho — el scroll vive DENTRO de cada columna. El
             min-w-0 en las dos columnas evita que un hijo flex con contenido
             ancho imponga su ancho mínimo y fuerce scroll horizontal de página. -->
        <div class="flex-1 flex flex-col lg:flex-row p-3 gap-3 min-h-0 overflow-hidden">
          <!-- Tarjeta de mesas: ocupa todo el ancho sin selección; en cuanto
               hay algo que mostrar se oculta EN TODOS los anchos (antes solo
               por debajo de lg -- desde lg quedaban las dos a medias, mesas
               y detalle repartiéndose el ancho al 50%, aunque el detalle
               necesitara más espacio) para que la tarjeta de detalle pase a
               ocupar toda la pantalla también en tablet/desktop. -->
          <div
            data-testid="mesas-column"
            class="flex-col min-h-0 min-w-0 flex-1 bg-white rounded-[6px] border border-[#e5e7eb] overflow-hidden"
            [class]="showingDetail() ? 'hidden' : 'flex'"
          >
            <app-pos-tables-panel />
          </div>

          <!-- Tarjeta de detalle: mesa/pedido seleccionado + cobro siempre
               apilados en una sola columna (un único scroll). Ocupa todo el
               ancho disponible en cualquier tamaño de pantalla (la de mesas,
               arriba, se oculta a la vez) -- a pedido del usuario, ya no se
               reparte el ancho al 50% con la de mesas desde lg. Sin nada real
               que mostrar -- ni selección, ni una mesa libre sin pedidos --
               esta tarjeta no se muestra en absoluto (antes tenía un estado
               vacío propio en cada uno de esos dos casos) -- la de mesas (ya
               flex-1) ocupa todo el ancho. -->
          <div
            data-testid="detail-column"
            class="flex-col min-h-0 min-w-0 bg-white rounded-[6px] border border-[#e5e7eb] overflow-hidden"
            [class]="showingDetail() ? 'flex flex-1' : 'hidden'"
          >
            @if (showingDetail()) {
              <!-- spec 078 (US3, FR-016 a FR-021; research.md D4): la columna de
                   detalle es UNA sola columna flex vertical acotada. Se
                   eliminaron el scroll externo (overflow-y-auto) y el div
                   redundante que hoy scrolleaban el panel central + el de cobro
                   juntos (doble contenedor de scroll = contenido recortado +
                   scroll horizontal de página en tablet/móvil). Ahora: secciones
                   fijas shrink-0, una única región flex-1 min-h-0 que scrollea, y
                   app-pos-checkout-panel shrink-0 (su host ya lo lleva). -->
              <!-- Único botón de volver para los 3 estados del panel central,
                   en cualquier ancho -- la tarjeta de mesas se oculta a la vez
                   que aparece esta (ver mesas-column/detail-column arriba),
                   así que hace falta en tablet/desktop igual que en móvil.
                   El botón "Cerrar" (X) que tenía app-pos-order-panel para
                   lg+ se retiró: hubiera quedado duplicado con este. -->
              <!-- Acción primaria en outline (borde/texto en el color primario,
                   fondo blanco -- no rellena, a pedido del usuario): es la
                   única forma de salir de la tarjeta de detalle ahora que
                   ocupa toda la pantalla (mesas-column se oculta a la vez) en
                   cualquier ancho, pero como es una acción de "salir/volver"
                   y no la acción principal de la pantalla (esa es "Cobrar" /
                   "Marcar pedido listo"), lleva el peso visual de una
                   secundaria -- outline en vez de relleno sólido. -->
              <!--
                A pedido del usuario: el botón "Volver a mesas" y el título
                "Pedido de la mesa" van en la misma fila (antes en dos filas
                separadas), con el título más grande. Ya no hay una vista
                separada "Pagos por confirmar" (con su propio título y sin la
                lista de ítems al lado) -- un pago QR pendiente de confirmar
                se ve integrado en esta misma vista, junto a la lista de
                ítems y el resto del cobro (ver app-pos-checkout-panel).
              -->
              <div
                class="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb] shrink-0"
              >
                <button
                  data-testid="page-back-button"
                  (click)="store.cancelSelection()"
                  class="px-3 py-1.5 text-[13px] font-medium rounded-[6px] border border-[#4f46e5] text-[#4f46e5] bg-white hover:bg-[#eef2ff] transition-colors shrink-0"
                >
                  ← Volver a mesas
                </button>
                <span class="text-[18px] font-semibold text-[#111827]">Pedido de la mesa</span>
              </div>

              <!-- Por debajo de lg: una única región de scroll para toda la
                   columna de detalle (antes el carrito, el desglose de
                   app-pos-checkout-panel y el bloque de validar-pago tenían
                   CADA UNO su propio overflow-y-auto -- varias cajas internas
                   scrolleando por separado, cada una recortando su contenido
                   a una porción minúscula sin dejar ver todo de una). Se
                   apilan en una sola columna, cada sección a su alto natural.

                   Desde lg: dos columnas lado a lado en vez de apiladas (a
                   pedido del usuario, hay ancho de sobra en desktop) --
                   pedido a la izquierda (60%) y cobro a la derecha (40%),
                   cada una con su propio scroll independiente
                   (lg:overflow-hidden aquí para no scrollear dos veces lo
                   mismo).

                   Siempre pedido + cobro, en cualquier estado: a pedido del
                   usuario, ya no hay una vista aparte "Pagos por confirmar"
                   que reemplazara las dos columnas por el bloque de
                   confirmación solo. Un pago QR pendiente ya no depende de
                   selectedOrderId para verse: app-pos-order-panel cae a
                   store.firstPendingOrder() cuando no hay nada seleccionado
                   de verdad (de sólo lectura -- sin acciones de cocina, que
                   no aplican antes de confirmar el pago) y
                   app-pos-checkout-panel muestra ahí mismo el
                   comprobante/confirmación en vez de cobro. -->
              <div
                class="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden"
              >
                <!-- Columna izquierda (pedido), 60% desde lg. -->
                <div class="flex flex-col lg:w-[60%] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto">
                  <app-pos-order-panel />
                </div>
                <!-- Columna derecha (cobro), 40% desde lg -- el borde pasa de
                     arriba (apilado, por debajo de lg) a la izquierda (al
                     lado, desde lg) vía las clases lg: propias de
                     app-pos-checkout-panel. -->
                <app-pos-checkout-panel />
              </div>
            }
          </div>
        </div>
      }
    </div>

    <!-- Diálogo de éxito -->
    @if (store.successOpen()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div class="text-center space-y-1">
            <app-mi-icon name="check_circle" [size]="40" class="text-green-600" />
            <h2 class="text-lg font-bold text-gray-900">Pago registrado</h2>
            @if (store.lastSale(); as s) {
              <p class="text-sm text-gray-500">
                @if (store.lastReceipts().length > 1) {
                  Cuenta dividida en {{ store.lastReceipts().length }} pagos ·
                  {{ store.fmt(s.total) }}. El inventario se actualizó.
                } @else {
                  Venta de {{ store.fmt(s.total) }} ({{ s.customer }}) registrada. El inventario se
                  actualizó.
                }
              </p>
            }
          </div>

          @if (store.lastReceipts().length > 1) {
            <!-- Cada comensal pide su ticket: se imprime de a uno. -->
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
              <!-- Spec 029, Historia 4: el caso de un solo comprobante ya no
                   imprime desde aquí — duplicaba "Imprimir Factura" de la
                   barra lateral (D1 de research.md). El de cuenta dividida
                   sí se conserva: no hay equivalente en la barra lateral
                   para imprimir el ticket de cada comensal de una vez. -->
              <button
                (click)="store.printReceipt()"
                class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <app-mi-icon name="receipt" [size]="16" />
                Imprimir todos
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
export class TableSessionsComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);
  private readonly tablesPanel = viewChild(PosTablesPanelComponent);

  readonly orderTypeTabs = [
    { key: 'mesas' as const, label: 'Mesas' },
    { key: 'domicilios' as const, label: 'Domicilios' },
    { key: 'para-llevar' as const, label: 'Para llevar' },
  ];

  ngOnInit(): void {
    void this.store.init();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  /** CTA "Crear pedido nuevo" de la sub-barra (spec 078, US2, FR-008–FR-010).
   *  El destino depende de la pestaña activa:
   *  - "Domicilios" / "Para llevar" → ruta sin `:tableId` con `?tipo=` (no
   *    exigen mesa; `createManualOrderFromDraft()` lo contempla).
   *  - "Mesas" → comportamiento de siempre: navega con `newOrderTableId()` (la
   *    mesa libre seleccionada), y el `[disabled]` del botón ya cubre el caso
   *    de que no haya ninguna. */
  goToNewOrder(): void {
    const tab = this.store.orderTypeTab();
    if (tab === 'domicilios' || tab === 'para-llevar') {
      const tipo = tab === 'domicilios' ? 'domicilio' : 'para-llevar';
      this.router.navigate(['/dashboard/mesas-sesiones/orden-manual'], { queryParams: { tipo } });
      return;
    }
    const tableId = this.store.newOrderTableId();
    if (!tableId) return;
    this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }

  /** A pedido del usuario: una mesa libre sin ningún pedido no cuenta como
   *  "hay algo que mostrar" -- ya no tiene su propio panel (antes mostraba
   *  un mensaje + CTA propios). Sin contenido real que mostrar, se trata
   *  igual que "sin selección": la grilla de mesas ocupa todo el ancho y el
   *  CTA "Crear pedido nuevo" vive en la sub-barra (que ya usa
   *  `store.newOrderTableId()`, y por lo tanto sigue apuntando a esta misma
   *  mesa si es la seleccionada). */
  showingDetail(): boolean {
    return this.store.hasActiveSelection() && this.store.effectiveCentralView() !== 'mesa-libre';
  }

  /** Destino del atajo F3 (spec 078, US2, Edge Case "el cajero pulsa el
   *  atajo…"): en "Domicilios" / "Para llevar" navega a la ruta sin `:tableId`
   *  con el `?tipo=` correspondiente; en "Mesas" el comportamiento no cambia —
   *  solo navega si hay una mesa seleccionada. */
  private openNewOrderFromShortcut(): void {
    const tab = this.store.orderTypeTab();
    if (tab === 'domicilios' || tab === 'para-llevar') {
      const tipo = tab === 'domicilios' ? 'domicilio' : 'para-llevar';
      this.router.navigate(['/dashboard/mesas-sesiones/orden-manual'], { queryParams: { tipo } });
      return;
    }
    const tableId = this.store.selectedTableId();
    if (tableId) this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (document.activeElement?.tagName ?? '').toUpperCase();
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'F2') {
      e.preventDefault();
      this.tablesPanel()?.focusSearch();
    } else if (e.key === 'F3') {
      e.preventDefault();
      this.openNewOrderFromShortcut();
    } else if (e.key === 'Escape') {
      if (this.store.catalogOpen()) this.store.closeCatalog();
      else this.store.cancelSelection();
    } else if (!typing && e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey)) {
      // Spec 029, Historia 4: solo el caso de cuenta dividida imprime desde
      // el diálogo de éxito — el de un solo comprobante ya no tiene acción
      // de impresión aquí (usa "Imprimir Factura" de la barra lateral).
      if (this.store.successOpen() && this.store.lastReceipts().length > 1) {
        e.preventDefault();
        this.store.printReceipt();
      }
    }
  }
}
