import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { ProductSelectComponent } from '../components/product-select.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { PosTerminalHeaderComponent } from '../components/pos-terminal-header.component';
import { BillSummaryComponent } from '../components/bill-summary.component';
import { CartItemOptionsComponent } from '../components/cart-item-options.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../shared/searchable-select/searchable-select.component';
import { effectivePrice } from '../../promotions/services/promotion-pricing.util';

/**
 * Vista dedicada para armar un pedido de mostrador nuevo (ajuste posterior a
 * spec 036, sobre un prototipo de referencia adicional): reemplaza el CTA
 * "+ Crear Orden Manual" que antes se mostraba embebido en la Terminal de
 * Mesas (`manual-order-panel.component.ts`) — el cajero llega aquí al
 * seleccionar una mesa libre, arma el pedido con el mismo catálogo/carrito
 * ya existentes en el store, y "Crear pedido" lo crea
 * (`createManualOrderFromDraft()`, sin cambios) y vuelve a la terminal.
 *
 * "Para Llevar" ya está habilitada (spec 055): comparte `store.orderTypeTab`
 * con `pos-tables-panel.component.ts` (spec 036), pero esta vista tiene su
 * propia instancia de store, así que no hay ningún efecto cruzado entre
 * ambas pantallas. "Domicilio" también está habilitada (spec 056) y el
 * `@if (store.orderTypeTab() === 'domicilios')` del template la usa.
 *
 * spec 078 (US2): al llegar desde el CTA de la Terminal en la pestaña
 * "Domicilios" / "Para llevar", `ngOnInit` lee `?tipo=` y preselecciona ese
 * tipo una sola vez — sigue siendo editable dentro del formulario (FR-011).
 *
 * Provee su propia instancia de `PosTerminalStore` (no es singleton,
 * `@Injectable()` sin `providedIn`) porque esta vista vive en una ruta
 * aparte de `table-sessions.component.ts` — mismo patrón que esa página.
 *
 * Rediseño (`create-order/code.html`/`screen.png`): réplica fiel del mockup
 * -- cabecera de terminal compartida con `table-sessions.component.ts`
 * (`app-pos-terminal-header`), barra de búsqueda + contadores, nav de
 * categorías con pestaña "Todos" (`showingAllCategories`,
 * `store.catalogProductsAllFiltered()` -- computed nuevo y aparte, no
 * cambia el significado de `catalogCategoryId`/`catalogProductsFiltered`
 * que también usa `pos-catalog-drawer.component.ts`), tarjetas de producto,
 * y el panel de ticket con la tabla de líneas (Producto/Cant./Costo/
 * Acciones) incluyendo insignia + tachado + "Ahorras $X" por línea cuando la
 * variante tiene promoción vigente y la cantidad ya califica
 * (`store.cartLinePromo`, puramente presentacional -- ver comentario en
 * `pos-terminal.store.ts`, el total real lo sigue calculando el backend).
 * Por debajo de `lg` se muestra una sola tarjeta (catálogo/ticket) a la vez
 * (`viewingCart`), con un botón "Ver pedido" flotante y uno de volver;
 * desde `lg` van lado a lado (65%/35%), mismo mecanismo que
 * `table-sessions.component.ts`. Cada línea del carrito tiene botones de
 * editar que reabren `app-product-select` precargado
 * (`store.openConfigForEdit`/`store.editingSelection`).
 */
@Component({
  selector: 'app-manual-order-page',
  standalone: true,
  providers: [PosTerminalStore],
  imports: [
    FormsModule,
    ProductSelectComponent,
    IconMiComponent,
    SearchableSelectComponent,
    PosTerminalHeaderComponent,
    BillSummaryComponent,
    CartItemOptionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col -m-4 md:-m-6 bg-[#f9fafb] overflow-x-hidden">
      <app-pos-terminal-header />

      <!-- Barra secundaria: solo volver (spec 052 — el resto vive en el
           encabezado "Nueva orden" del panel derecho). -->
      <div class="h-10 bg-white border-b border-[#e5e7eb] px-4 flex items-center shrink-0">
        <button
          type="button"
          (click)="backToTerminal()"
          class="flex items-center gap-1 text-[13px] font-medium text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <app-mi-icon name="arrow_back" [size]="16" />
          Volver a la Terminal
        </button>
      </div>

      <!-- Catálogo (izquierda) + panel de configuración y pedido (derecha):
           una sola tarjeta a la vez por debajo de lg, lado a lado desde lg
           (mismo mecanismo que table-sessions.component.ts). -->
      <div
        class="flex-1 flex flex-col lg:flex-row p-3 gap-3 min-h-0 overflow-y-auto lg:overflow-hidden"
      >
        <div
          data-testid="catalogo-column"
          class="flex-col min-h-0 flex-1 lg:flex-1 gap-3"
          [class]="viewingCart() ? 'hidden lg:flex' : 'flex'"
        >
          <!-- Barra de búsqueda + contadores (mockup: una sola caja blanca). -->
          <div
            class="h-11 shrink-0 bg-white border border-[#e5e7eb] rounded-[6px] px-3 flex items-center gap-2"
          >
            <div class="flex-1 flex items-center gap-2 min-w-0 pr-3 border-r border-[#e5e7eb]">
              <app-mi-icon name="search" [size]="18" class="text-[#6b7280] shrink-0" />
              <input
                type="text"
                [value]="store.catalogSearchText()"
                (input)="store.setCatalogSearchText($any($event.target).value)"
                placeholder="Buscar producto, sabor o código... [F2]"
                class="flex-1 min-w-0 bg-transparent border-none text-[13px] text-[#111827] placeholder-[#6b7280] focus:outline-none h-full"
              />
              <div class="flex items-center gap-1.5 shrink-0">
                <kbd
                  class="font-mono text-[11px] font-semibold text-[#6b7280] bg-[#f3f4f6] px-1.5 py-0.5 border border-[#e5e7eb] rounded-[6px]"
                  >[F2]</kbd
                >
                <button
                  type="button"
                  title="Escanear código"
                  aria-label="Escanear código"
                  class="w-7 h-7 rounded-[6px] flex items-center justify-center text-[#6b7280] hover:text-[#111827] hover:bg-[#f3f4f6] transition-colors"
                >
                  <app-mi-icon name="qr_code_scanner" [size]="17" />
                </button>
              </div>
            </div>
            <div class="hidden sm:flex items-center gap-1.5 shrink-0 pl-1 overflow-x-auto">
              <div
                class="flex items-center gap-1.5 px-2 py-1 bg-[#fffbeb] border border-[#fef3c7] rounded-[6px] text-[11px] font-semibold text-[#b45309] whitespace-nowrap"
              >
                <span class="w-1.5 h-1.5 bg-[#f59e0b] rounded-full inline-block"></span>
                <span>{{ store.tableCounts().pendientes }} Por atender</span>
              </div>
              <div
                class="flex items-center gap-1 px-2 py-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[11px] text-[#4b5563] font-medium whitespace-nowrap"
              >
                <app-mi-icon name="table_restaurant" [size]="14" class="text-[#6b7280]" />
                <span class="text-[#111827] font-semibold">{{ store.tableCounts().ocupadas }}</span>
                <span>Mesas</span>
              </div>
              <div
                class="flex items-center gap-1 px-2 py-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[11px] text-[#4b5563] font-medium whitespace-nowrap"
              >
                <app-mi-icon name="shopping_bag" [size]="14" class="text-[#6b7280]" />
                <span class="text-[#111827] font-semibold">{{
                  store.ordersByType('para-llevar').length
                }}</span>
                <span>Llevar</span>
              </div>
              <div
                class="flex items-center gap-1 px-2 py-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[11px] text-[#4b5563] font-medium whitespace-nowrap"
              >
                <app-mi-icon name="delivery_dining" [size]="14" class="text-[#4f46e5]" />
                <span class="text-[#111827] font-semibold">{{
                  store.ordersByType('domicilios').length
                }}</span>
                <span>Domicilios</span>
              </div>
            </div>
          </div>

          <!-- Nav de categorías: "Todos" junta todas las categorías (nuevo,
               computed aparte catalogProductsAllFiltered), igual al mockup. -->
          <nav
            class="h-12 shrink-0 bg-white border border-[#e5e7eb] rounded-[6px] p-1 flex items-center gap-1 overflow-x-auto"
          >
            <button
              type="button"
              (click)="selectAllCategories()"
              class="h-full px-3.5 text-[13px] whitespace-nowrap rounded-[6px] flex items-center gap-1.5 transition-colors"
              [class]="
                showingAllCategories()
                  ? 'bg-[#f3f4f6] border border-[#e5e7eb] text-[#111827] font-semibold'
                  : 'bg-white hover:bg-[#f9fafb] border border-transparent hover:border-[#e5e7eb] text-[#4b5563] hover:text-[#111827] font-medium'
              "
            >
              <span class="text-[11px] text-[#6b7280] font-mono">[F1]</span>
              <span>Todos</span>
            </button>
            @for (c of store.categories(); track c.id) {
              <button
                type="button"
                (click)="selectCategory(c.id)"
                class="h-full px-3.5 text-[13px] whitespace-nowrap rounded-[6px] flex items-center transition-colors"
                [class]="
                  !showingAllCategories() && store.catalogCategoryId() === c.id
                    ? 'bg-[#f3f4f6] border border-[#e5e7eb] text-[#111827] font-semibold'
                    : 'bg-white hover:bg-[#f9fafb] border border-transparent hover:border-[#e5e7eb] text-[#4b5563] hover:text-[#111827] font-medium'
                "
              >
                {{ c.name }}
              </button>
            }
          </nav>

          <div class="flex-1 min-h-0 overflow-y-auto pr-0.5">
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              @for (p of catalogProducts(); track p.id) {
                <button
                  type="button"
                  (click)="store.openConfig(p)"
                  class="relative p-2.5 bg-white border border-[#e5e7eb] hover:bg-[#f9fafb] active:bg-[#f3f4f6] rounded-[6px] flex flex-col gap-2 text-left transition-colors"
                >
                  <div class="relative w-full h-28 overflow-hidden bg-[#f3f4f6] rounded-[6px]">
                    @if (store.cardPromotionText(p.variants); as promo) {
                      <!-- spec 073, FR-016: condición legible del backend (spec 066), no la insignia local. -->
                      <span
                        class="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-[6px] bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] z-10"
                        >{{ promo }}</span
                      >
                    }
                    @if (p.image_url) {
                      <img [src]="p.image_url" [alt]="p.name" class="w-full h-full object-cover" />
                    } @else {
                      <span class="w-full h-full flex items-center justify-center text-[#d1d5db]"
                        ><app-mi-icon name="image-off" [size]="40" ariaLabel="Sin imagen"
                      /></span>
                    }
                  </div>
                  <div class="flex flex-col justify-between flex-1 min-w-0 w-full">
                    <span
                      class="text-[14px] font-semibold text-[#111827] tracking-tight leading-tight truncate"
                      >{{ p.name }}</span
                    >
                    <div class="flex items-center justify-between mt-2">
                      <div class="flex flex-col">
                        <span class="text-[11px] text-[#6b7280] leading-none">Desde</span>
                        <span class="font-mono font-bold text-[15px] text-[#111827]">{{
                          store.fmt(minPrice(p))
                        }}</span>
                      </div>
                      <!-- Solo decorativo: el click de agregar es el de toda la
                           tarjeta, no un botón anidado (evita <button> dentro
                           de <button>). -->
                      <span
                        class="w-9 h-9 rounded-[6px] flex items-center justify-center bg-[#4f46e5] text-white shrink-0"
                        aria-hidden="true"
                      >
                        <app-mi-icon name="shopping_cart" [size]="18" />
                      </span>
                    </div>
                  </div>
                </button>
              }
              @if (catalogProducts().length === 0) {
                <p class="col-span-full text-center text-[13px] text-[#9ca3af] py-10">
                  Sin productos que coincidan.
                </p>
              }
            </div>
          </div>

          <!-- Botón flotante "Ver pedido": solo por debajo de lg, con el carrito no vacío. -->
          @if (!store.cartEmpty()) {
            <div class="lg:hidden shrink-0">
              <button
                type="button"
                (click)="viewingCart.set(true)"
                class="w-full h-11 rounded-[6px] bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[14px] font-semibold flex items-center justify-between px-4 transition-colors"
              >
                <span>Ver pedido ({{ store.cartView().length }})</span>
                <span>{{ store.fmt(store.subtotal()) }}</span>
              </button>
            </div>
          }
        </div>

        <div
          data-testid="ticket-column"
          class="flex-col min-h-0 lg:w-[35%] lg:shrink-0 lg:flex-none bg-white rounded-[6px] border border-[#e5e7eb] lg:overflow-hidden"
          [class]="viewingCart() ? 'flex flex-1' : 'hidden lg:flex'"
        >
          <div class="lg:hidden shrink-0 px-3 pt-3">
            <button
              type="button"
              data-testid="page-back-button"
              (click)="viewingCart.set(false)"
              class="px-3 py-1.5 text-[13px] border border-[#e5e7eb] rounded-[6px] text-[#4b5563] hover:bg-[#f3f4f6]"
            >
              ← Volver al catálogo
            </button>
          </div>

          <!-- Encabezado + tipo de orden + campos (mockup: una sola sección). -->
          <div class="border-b border-[#e5e7eb] bg-white shrink-0 p-3 flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <h2 class="text-[14px] font-bold tracking-tight text-[#111827]">Nueva orden</h2>
            </div>

            <div class="grid grid-cols-3 p-0.5 bg-[#f3f4f6] border border-[#e5e7eb] rounded-[6px]">
              <button
                type="button"
                (click)="setOrderTypeTab('mesas')"
                class="h-11 text-[13px] rounded-[6px] flex items-center justify-center gap-1 transition-all"
                [class]="
                  store.orderTypeTab() === 'mesas'
                    ? 'bg-white text-[#111827] font-semibold border border-[#e5e7eb]'
                    : 'text-[#4b5563] hover:text-[#111827] font-medium'
                "
              >
                <app-mi-icon
                  name="table_restaurant"
                  [size]="18"
                  [class]="store.orderTypeTab() === 'mesas' ? 'text-[#4f46e5]' : ''"
                />
                Mesa
              </button>
              <button
                type="button"
                (click)="setOrderTypeTab('para-llevar')"
                class="h-11 text-[13px] rounded-[6px] flex items-center justify-center gap-1 transition-all"
                [class]="
                  store.orderTypeTab() === 'para-llevar'
                    ? 'bg-white text-[#111827] font-semibold border border-[#e5e7eb]'
                    : 'text-[#4b5563] hover:text-[#111827] font-medium'
                "
              >
                <app-mi-icon
                  name="shopping_bag"
                  [size]="18"
                  [class]="store.orderTypeTab() === 'para-llevar' ? 'text-[#4f46e5]' : ''"
                />
                Para llevar
              </button>
              <button
                type="button"
                (click)="setOrderTypeTab('domicilios')"
                class="h-11 text-[13px] rounded-[6px] flex items-center justify-center gap-1 transition-all"
                [class]="
                  store.orderTypeTab() === 'domicilios'
                    ? 'bg-white text-[#111827] font-semibold border border-[#e5e7eb]'
                    : 'text-[#4b5563] hover:text-[#111827] font-medium'
                "
              >
                <app-mi-icon
                  name="delivery_dining"
                  [size]="18"
                  [class]="store.orderTypeTab() === 'domicilios' ? 'text-[#4f46e5]' : ''"
                />
                Domicilio
              </button>
            </div>

            @if (store.orderTypeTab() === 'mesas') {
              <!-- Solo las mesas libres se pueden elegir: esta vista arma un
                   pedido nuevo, no edita una mesa ya ocupada (spec 053: mesas
                   ocupadas siguen visibles en el select, no seleccionables). -->
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-1.5 sm:items-end">
                <div class="sm:col-span-7 flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider"
                    >Cliente</label
                  >
                  <input
                    type="text"
                    [value]="store.customerName()"
                    (input)="store.customerName.set($any($event.target).value)"
                    (focus)="$any($event.target).select()"
                    placeholder="Ej: Juan Pérez"
                    class="h-11 px-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[13px] text-[#111827] font-medium focus:outline-none focus:border-[#111827] focus:bg-white"
                  />
                  @if (mostrarErrorNombre()) {
                    <span class="text-[11px] text-[#dc2626]">El nombre del cliente es obligatorio.</span>
                  }
                </div>
                <div class="sm:col-span-5 flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider"
                    >Mesa asignada</label
                  >
                  <app-searchable-select
                    placeholder="Buscar mesa…"
                    [options]="mesaOptions()"
                    [ngModel]="store.selectedTableId()"
                    (ngModelChange)="selectTable($event)"
                  />
                </div>
              </div>
            }

            @if (store.orderTypeTab() === 'para-llevar') {
              <!-- Cliente de la orden (spec 091, A-99): precargado con "Consumidor final" y
                   seleccionado por completo al enfocarlo, pero siempre editable -- a diferencia
                   de "Domicilio", si queda vacío se guarda con ese valor por defecto. -->
              <div class="flex flex-col gap-0.5">
                <label class="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider"
                  >Cliente / Para llevar</label
                >
                <input
                  type="text"
                  [value]="store.customerName()"
                  (input)="store.customerName.set($any($event.target).value)"
                  (focus)="$any($event.target).select()"
                  placeholder="Ej: Juan Pérez"
                  class="h-11 px-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[13px] text-[#111827] font-medium focus:outline-none focus:border-[#111827] focus:bg-white"
                />
                @if (mostrarErrorNombre()) {
                  <span class="text-[11px] text-[#dc2626]">El nombre del cliente es obligatorio.</span>
                }
              </div>
            }

            @if (store.orderTypeTab() === 'domicilios') {
              <!-- "Domicilio" (spec 056): a diferencia de "En Mesa"/"Para
                   Llevar", el cliente NO tiene valor por defecto — campo
                   simple siempre editable, sin el toggle de solo-lectura
                   (no hay nada que proteger, FR-003). Dirección y valor del
                   domicilio son obligatorios (FR-004, FR-006); teléfono
                   siempre opcional (FR-008). -->
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-1.5">
                <div class="sm:col-span-7 flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider"
                    >Nombre cliente</label
                  >
                  <input
                    type="text"
                    [value]="store.customerName()"
                    (input)="store.customerName.set($any($event.target).value)"
                    placeholder="Ej: Juan Pérez"
                    class="h-11 px-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[13px] text-[#111827] font-medium focus:outline-none focus:border-[#111827] focus:bg-white"
                  />
                  @if (mostrarErrorNombre()) {
                    <span class="text-[11px] text-[#dc2626]">El nombre del cliente es obligatorio.</span>
                  }
                </div>
                <div class="sm:col-span-5 flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider"
                    >Teléfono</label
                  >
                  <input
                    type="text"
                    [value]="store.deliveryPhone()"
                    (input)="store.deliveryPhone.set($any($event.target).value)"
                    placeholder="Ej: 300 123 4567"
                    class="h-11 px-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[13px] font-mono text-[#111827] focus:outline-none focus:border-[#111827] focus:bg-white"
                  />
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-1.5">
                <div class="sm:col-span-7 flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider"
                    >Dirección de entrega</label
                  >
                  <input
                    type="text"
                    [value]="store.deliveryAddress()"
                    (input)="store.deliveryAddress.set($any($event.target).value)"
                    placeholder="Ej: Calle 45 # 22-10"
                    class="h-11 px-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[13px] text-[#111827] focus:outline-none focus:border-[#111827] focus:bg-white"
                  />
                </div>
                <div class="sm:col-span-5 flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider"
                    >Tarifa Domicilio</label
                  >
                  <input
                    type="number"
                    min="0"
                    [value]="store.deliveryFee()"
                    (input)="onDeliveryFeeInput($any($event.target).value)"
                    placeholder="$5.000"
                    class="h-11 px-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] text-[13px] font-mono font-semibold text-[#111827] focus:outline-none focus:border-[#111827] focus:bg-white"
                  />
                </div>
              </div>
            }
          </div>

          <!-- Detalle del pedido: encabezado + tabla de líneas. Por debajo de
               lg NO tiene scroll propio -- crece con su contenido y es la
               tarjeta completa (ticket-column) + el contenedor externo los
               que crecen/scrollean como una sola pieza (mismo criterio que
               el usuario pidió para esta sección: nada se apiña en una caja
               chica con su propio scroll). Desde lg sí necesita su scroll
               interno (columna de ancho fijo, layout de escritorio del
               mockup). -->
          <div class="lg:flex-1 lg:overflow-y-auto px-4 py-3 flex flex-col bg-white">
            <div class="flex items-center gap-2 flex-wrap pb-3 border-b border-[#e5e7eb]">
              <span
                class="px-2 py-0.5 text-[12px] font-medium text-[#4b5563] bg-[#f3f4f6] border border-[#e5e7eb] rounded-[6px] whitespace-nowrap"
                >Ítems: {{ store.cartView().length }}</span
              >
            </div>

            @if (!store.cartEmpty()) {
              <div
                class="hidden sm:grid grid-cols-12 text-[13px] font-semibold text-[#111827] py-2.5 border-b border-[#e5e7eb]"
              >
                <div class="col-span-5 text-left">Producto</div>
                <div class="col-span-2 text-center">Cant.</div>
                <div class="col-span-3 text-right pr-3">Costo</div>
                <div class="col-span-2 text-right">Acciones</div>
              </div>
            }

            <div class="flex flex-col divide-y divide-[#e5e7eb]">
              @for (it of store.cartView(); track it.key) {
                <!-- Envoltorio único por ítem: divide-y del contenedor padre
                     necesita un solo hijo por iteración (si las dos variantes
                     de abajo fueran hermanas sueltas, divide-y les pintaría
                     un borde entre sí aunque una esté oculta por CSS, ya que
                     su selector mira el atributo HTML hidden, no la clase). -->
                <div>
                  <!-- Tabla (desde sm/tablet+): pixel-igual al mockup. -->
                  <div
                    class="hidden sm:grid grid-cols-12 items-center py-3 gap-1"
                    [class]="
                      it.promo ? 'bg-[#fffbeb]/40 -mx-2 px-2 border-l-2 border-[#f59e0b]' : ''
                    "
                  >
                    <div class="col-span-5 flex flex-col min-w-0 pr-1">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span
                          class="text-[13px] font-semibold text-[#111827] truncate leading-tight"
                          >{{ it.name }}</span
                        >
                        @if (it.promo; as promo) {
                          <span
                            class="bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] text-[10px] font-bold px-1 py-0.2 rounded-[6px] shrink-0 leading-none"
                            >{{ promo.badge }}</span
                          >
                        }
                      </div>
                      <app-cart-item-options [options]="it.options" [notes]="it.notes" />
                      @if (it.promo; as promo) {
                        <div class="flex items-center gap-1.5 mt-0.5">
                          <span class="line-through text-[11px] text-[#6b7280] font-mono">{{
                            store.fmt(promo.originalAmount)
                          }}</span>
                          <span class="text-[11px] text-[#15803d] font-semibold font-mono"
                            >Ahorras {{ store.fmt(promo.savings) }}</span
                          >
                        </div>
                      }
                    </div>
                    <div class="col-span-2 flex items-center justify-center gap-1">
                      <button
                        (click)="store.decDraft(it.key)"
                        class="w-6 h-6 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#4b5563] flex items-center justify-center text-[13px] font-bold transition-colors"
                      >
                        −
                      </button>
                      <span
                        class="font-mono font-medium text-[13px] text-[#111827] tabular-nums min-w-[12px] text-center"
                        >{{ it.qty }}</span
                      >
                      <button
                        (click)="store.incDraft(it.key)"
                        class="w-6 h-6 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#4b5563] flex items-center justify-center text-[13px] font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <div class="col-span-3 text-right pr-3">
                      @if (it.promo; as promo) {
                        <div
                          class="font-semibold text-[15px] text-[#dc2626] tabular-nums font-mono"
                        >
                          {{ store.fmt(promo.discountedAmount) }}
                        </div>
                      } @else {
                        <div
                          class="font-semibold text-[15px] text-[#111827] tabular-nums font-mono"
                        >
                          {{ store.fmt(it.subtotal) }}
                        </div>
                      }
                    </div>
                    <div class="col-span-2 flex items-center justify-end gap-0.5">
                      @if (it.kind === 'draft' && !it.comboId) {
                        <button
                          type="button"
                          (click)="store.openConfigForEdit(it.key)"
                          title="Ver/Editar Notas"
                          class="p-1 text-[#6b7280] hover:text-[#4f46e5] hover:bg-[#f3f4f6] rounded-[6px] transition-colors"
                        >
                          <app-mi-icon name="edit" ariaLabel="Ver/Editar Notas" [size]="16" />
                        </button>
                        <button
                          type="button"
                          (click)="store.openConfigForEdit(it.key)"
                          title="Modificar Toppings"
                          class="p-1 text-[#6b7280] hover:text-[#4f46e5] hover:bg-[#f3f4f6] rounded-[6px] transition-colors"
                        >
                          <app-mi-icon name="tune" ariaLabel="Modificar Toppings" [size]="16" />
                        </button>
                      }
                      <button
                        (click)="store.removeDraft(it.key)"
                        title="Eliminar ítem"
                        class="p-1 text-[#6b7280] hover:text-[#dc2626] hover:bg-[#f3f4f6] rounded-[6px] transition-colors"
                      >
                        <app-mi-icon name="delete" ariaLabel="Eliminar ítem" [size]="16" />
                      </button>
                    </div>
                  </div>

                  <!-- Tarjeta apilada (por debajo de sm): crece verticalmente
                     según su contenido en vez de apretar el stepper y los 3
                     íconos en columnas angostas -- mismos datos/acciones. -->
                  <div
                    class="flex sm:hidden flex-col gap-2 py-3"
                    [class]="
                      it.promo ? 'bg-[#fffbeb]/40 -mx-2 px-2 border-l-2 border-[#f59e0b]' : ''
                    "
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="text-[13px] font-semibold text-[#111827] leading-tight">{{
                            it.name
                          }}</span>
                          @if (it.promo; as promo) {
                            <span
                              class="bg-[#fffbeb] text-[#b45309] border border-[#fef3c7] text-[10px] font-bold px-1 py-0.2 rounded-[6px] shrink-0 leading-none"
                              >{{ promo.badge }}</span
                            >
                          }
                        </div>
                        <app-cart-item-options [options]="it.options" [notes]="it.notes" />
                        @if (it.promo; as promo) {
                          <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span class="line-through text-[11px] text-[#6b7280] font-mono">{{
                              store.fmt(promo.originalAmount)
                            }}</span>
                            <span class="text-[11px] text-[#15803d] font-semibold font-mono"
                              >Ahorras {{ store.fmt(promo.savings) }}</span
                            >
                          </div>
                        }
                      </div>
                      <div class="text-right shrink-0">
                        @if (it.promo; as promo) {
                          <div
                            class="font-semibold text-[15px] text-[#dc2626] tabular-nums font-mono"
                          >
                            {{ store.fmt(promo.discountedAmount) }}
                          </div>
                        } @else {
                          <div
                            class="font-semibold text-[15px] text-[#111827] tabular-nums font-mono"
                          >
                            {{ store.fmt(it.subtotal) }}
                          </div>
                        }
                      </div>
                    </div>
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <button
                          (click)="store.decDraft(it.key)"
                          class="w-7 h-7 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#4b5563] flex items-center justify-center text-[13px] font-bold transition-colors"
                        >
                          −
                        </button>
                        <span
                          class="font-mono font-medium text-[13px] text-[#111827] tabular-nums min-w-[12px] text-center"
                          >{{ it.qty }}</span
                        >
                        <button
                          (click)="store.incDraft(it.key)"
                          class="w-7 h-7 rounded-full bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#4b5563] flex items-center justify-center text-[13px] font-bold transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <div class="flex items-center gap-1">
                        @if (it.kind === 'draft' && !it.comboId) {
                          <button
                            type="button"
                            (click)="store.openConfigForEdit(it.key)"
                            title="Ver/Editar Notas"
                            class="p-1.5 text-[#6b7280] hover:text-[#4f46e5] hover:bg-[#f3f4f6] rounded-[6px] transition-colors"
                          >
                            <app-mi-icon name="edit" ariaLabel="Ver/Editar Notas" [size]="16" />
                          </button>
                          <button
                            type="button"
                            (click)="store.openConfigForEdit(it.key)"
                            title="Modificar Toppings"
                            class="p-1.5 text-[#6b7280] hover:text-[#4f46e5] hover:bg-[#f3f4f6] rounded-[6px] transition-colors"
                          >
                            <app-mi-icon name="tune" ariaLabel="Modificar Toppings" [size]="16" />
                          </button>
                        }
                        <button
                          (click)="store.removeDraft(it.key)"
                          title="Eliminar ítem"
                          class="p-1.5 text-[#6b7280] hover:text-[#dc2626] hover:bg-[#f3f4f6] rounded-[6px] transition-colors"
                        >
                          <app-mi-icon name="delete" ariaLabel="Eliminar ítem" [size]="16" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
            @if (store.cartEmpty()) {
              <div class="text-center text-[#9ca3af] py-10 text-[13px]">
                Agrega productos desde el catálogo.
              </div>
            }
          </div>

          <div class="border-t border-[#e5e7eb] bg-white shrink-0 flex flex-col">
            <div class="p-3 bg-[#f9fafb] border-b border-[#e5e7eb] flex flex-col gap-1">
              @let tot = store.totals();
              @if (store.draftPreview(); as p) {
                <!-- spec 073, FR-013/FR-014: el desglose (con descuento por
                     promoción) lo calcula el backend sobre el borrador. -->
                <!-- spec 087, FR-016: los combos no pasan por el endpoint; se
                     suman a su precio de combo, sin descuento adicional. -->
                <app-bill-summary
                  [subtotal]="+p.subtotal + store.combosSubtotal()"
                  [discount]="+p.discount"
                  [deliveryFee]="+p.delivery_fee"
                  deliveryFeeLabel="Costo de domicilio"
                  [showDeliveryIcon]="true"
                  [total]="+p.total + store.combosSubtotal()"
                  totalLabel="TOTAL ORDEN"
                  size="lg"
                />
              } @else {
                <!-- FR-015: sin descuento verificado (cargando o sin conexión) —
                     subtotal sin descuento + aviso; NO bloquea confirmar. -->
                <app-bill-summary
                  [subtotal]="tot.subtotal"
                  [deliveryFee]="store.orderTypeTab() === 'domicilios' ? tot.deliveryFee : 0"
                  deliveryFeeLabel="Costo de domicilio"
                  [showDeliveryIcon]="true"
                  [total]="tot.total"
                  totalLabel="TOTAL ORDEN"
                  size="lg"
                />
                @if (store.draftPreviewError()) {
                  <p class="text-[11px] text-[#b45309]">El descuento se confirma al cobrar.</p>
                } @else if (store.draftPreviewLoading()) {
                  <p class="text-[11px] text-[#9ca3af]">Calculando el descuento…</p>
                }
              }
            </div>

            <div class="p-2 flex flex-col gap-1.5">
              @if (totalChangeNotice(); as n) {
                <!-- spec 089 (A-96, FR-028): el total del pedido cambió al pulsar "Crear pedido".
                     Aviso NO bloqueante, sin diálogo: no se creó; el siguiente clic lo crea por
                     el importe que se ve ahora. -->
                <div
                  data-testid="total-cambio-aviso"
                  role="status"
                  class="rounded-[6px] border border-[#fef3c7] bg-[#fffbeb] px-3 py-2 text-[12px] text-[#92400e]"
                >
                  El total cambió: ahora es {{ store.fmt(n.now) }} (antes {{ store.fmt(n.before) }}).
                  Revisa el importe y vuelve a pulsar Crear pedido.
                </div>
              }
              <button
                (click)="confirm()"
                [disabled]="
                  store.cartEmpty() ||
                  store.submitting() ||
                  (store.orderTypeTab() === 'mesas' && !store.selectedTableId()) ||
                  (store.orderTypeTab() === 'domicilios' &&
                    (!store.customerName().trim() ||
                      !store.deliveryAddress().trim() ||
                      store.deliveryFee() == null))
                "
                class="w-full h-12 bg-[#4f46e5] hover:bg-[#4338ca] active:bg-[#3730a3] text-white font-semibold text-[15px] flex items-center justify-center gap-2 rounded-[6px] disabled:opacity-50 transition-colors"
              >
                <app-mi-icon name="credit_card" [size]="20" />
                <span>{{ store.submitting() ? 'Guardando…' : 'Crear pedido' }}</span>
              </button>
              <button
                type="button"
                (click)="backToTerminal()"
                class="w-full h-8 border border-[#e5e7eb] bg-white hover:bg-[#f3f4f6] text-[#4b5563] hover:text-[#111827] text-[12px] font-medium flex items-center justify-center gap-1.5 rounded-[6px] transition-colors"
              >
                Regresar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    @if (store.configuringProduct(); as product) {
      <app-product-select
        [product]="product"
        [initialSelection]="store.editingSelection()"
        (added)="store.addDraftFromSelection($event)"
        (cancelled)="store.closeConfig()"
      />
    }
  `,
})
export class ManualOrderPageComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Por debajo de `lg`, cuál de las dos tarjetas (catálogo/ticket) se
   *  muestra -- mismo patrón que `store.hasActiveSelection()` en
   *  `table-sessions.component.ts`, aquí como signal local porque no hay
   *  ninguna selección de mesa/pedido que lo derive: el usuario alterna con
   *  el botón "Ver pedido" y el de volver al catálogo. Desde `lg` ambas
   *  tarjetas van lado a lado sin importar este valor. */
  readonly viewingCart = signal(false);

  /** Pestaña "Todos" del rediseño (`create-order/code.html`): activa por
   *  defecto, igual que el mockup. `store.catalogCategoryId()` sigue
   *  existiendo y se sincroniza al elegir una categoría puntual (para que
   *  `store.openConfig`/otros usos del store no se enteren de esta pestaña),
   *  pero mientras esta signal es `true` el grid usa
   *  `store.catalogProductsAllFiltered()` en su lugar. */
  readonly showingAllCategories = signal(true);

  /** Fuente de datos del grid según la pestaña activa. */
  readonly catalogProducts = computed(() =>
    this.showingAllCategories()
      ? this.store.catalogProductsAllFiltered()
      : this.store.catalogProductsFiltered(),
  );

  /**
   * spec 073, FR-013: recalcula el desglose (con descuento por promoción) en
   * cada cambio de línea, tipo de orden o valor del domicilio. spec 087,
   * FR-016: también cuando cambia la lista de ítems **guardados** del pedido
   * (guardar, anular, refresco por sondeo/tiempo real) — el desglose cubre el
   * conjunto vigente completo, no solo el borrador.
   */
  private readonly _draftPreview = effect(() => {
    this.store.draftLines();
    this.store.selectedOrder();
    this.store.orderTypeTab();
    this.store.deliveryFee();
    void this.store.loadDraftPreview();
  });

  /** Opciones del select buscable de mesas (spec 053, corrección posterior:
   *  el número de mesa es siempre parte de la etiqueta, no se reemplaza por
   *  el nombre personalizado — "Mesa 1 - Terraza - Libre", no solo
   *  "Terraza - Libre"). Mesas ocupadas visibles pero no seleccionables —
   *  mismo criterio que tenía la rejilla de botones que reemplaza. */
  readonly mesaOptions = computed<SearchableSelectOption[]>(() =>
    this.store.tablesView().map((t) => ({
      id: t.id,
      label: `Mesa ${t.number}${t.name ? ` - ${t.name}` : ''} - ${t.statusLabel}`,
      disabled: t.statusLabel !== 'Libre' && t.id !== this.store.selectedTableId(),
    })),
  );

  /** spec 087 (FR-005, A-88) -- acotado por spec 091 (A-99) a solo "Domicilio": Mesa/Para
   *  llevar ya no exigen `customer_name` (el valor por defecto lo resuelve, FR-004/FR-005); el
   *  mensaje de error inline solo se muestra tras un intento de guardar fallido, no desde que se
   *  abre la pantalla. */
  readonly intentoGuardar = signal(false);
  /** spec 089 (A-96, FR-028): aviso no bloqueante de que el total cambió al crear el pedido
   *  (reemplaza al modal "El total cambió" de la spec 073, FR-015a). */
  readonly totalChangeNotice = signal<{ now: number; before: number } | null>(null);
  readonly mostrarErrorNombre = computed(
    () =>
      this.intentoGuardar() &&
      this.store.orderTypeTab() === 'domicilios' &&
      !this.store.customerName().trim(),
  );

  async ngOnInit(): Promise<void> {
    // spec 091 (A-99): esta pantalla arma SIEMPRE un pedido nuevo (nunca edita uno existente,
    // ver comentario de `selectTable()` abajo), así que es seguro reiniciar "Cliente" de cero en
    // cada apertura -- sin esto, abrir "Nueva orden" para la siguiente orden conservaría el
    // nombre de la anterior (FR-011).
    this.store.customerName.set('');
    await this.store.init();
    const tableId = this.route.snapshot.paramMap.get('tableId');
    if (tableId) this.selectTable(tableId);
    // spec 078 (US2, research.md D3): tipo preseleccionado desde la pestaña de
    // origen de la Terminal. Valor ausente / `'mesas'` / inválido → no hace
    // nada (comportamiento idéntico al de hoy). El tipo sigue siendo editable
    // en el formulario (FR-011).
    const tipo = this.route.snapshot.queryParamMap.get('tipo');
    if (tipo === 'domicilio') this.setOrderTypeTab('domicilios');
    else if (tipo === 'para-llevar') this.setOrderTypeTab('para-llevar');
    // spec 091 (A-99, research.md D3): invocación explícita y obligatoria -- la ruta de Mesa
    // (sin `?tipo=`) nunca llama a `setOrderTypeTab()` arriba, así que sin esto el campo quedaría
    // vacío en vez de "Consumidor final" para ese camino, el más común de los tres.
    this.store.applyCustomerNameDefaultForTab(this.store.orderTypeTab());
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  selectAllCategories(): void {
    this.showingAllCategories.set(true);
  }

  selectCategory(id: string): void {
    this.showingAllCategories.set(false);
    this.store.setCatalogCategory(id);
  }

  selectTable(id: string): void {
    // `preserveDraft`: esta pantalla arma SIEMPRE un pedido nuevo -- cambiar
    // de mesa aquí es solo reasignar dónde se sentará ese pedido en curso,
    // nunca cambiar de sesión, así que el carrito (`draftLines()`) no debe
    // vaciarse (bugfix: antes se perdía todo lo agregado al tocar otra mesa).
    this.store.selectTable(id, { preserveDraft: true });
    // Bugfix: esta pantalla arma SIEMPRE un pedido nuevo (`draftLines()`) --
    // nunca edita uno existente. `selectTable()` autoselecciona el primer
    // pedido activo de la mesa (`selectedOrderId`), pensado para la terminal
    // de mesas (donde sí hay que enfocar un pedido concreto); aquí eso
    // colaba el detalle de ese pedido PERSISTIDO en `cartView()` (que mezcla
    // pedido seleccionado + draft), precargando la orden nueva con ítems que
    // el usuario nunca agregó -- sobre todo notorio en una mesa ya ocupada
    // (la única razón por la que "Crear pedido nuevo" puede apuntar aquí:
    // `newOrderTableId()` cae a la mesa ya seleccionada si no hay ninguna
    // libre). Un pedido nuevo nunca "edita" uno existente por selección de
    // mesa, así que se limpia de una vez.
    this.store.selectedOrderId.set(null);
  }

  setOrderTypeTab(tab: 'mesas' | 'para-llevar' | 'domicilios'): void {
    this.store.setOrderTypeTab(tab);
  }

  backToTerminal(): void {
    this.router.navigate(['/dashboard/mesas-sesiones']);
  }

  minPrice(p: { variants: { price: number; discounted_price?: number | null }[] }): number {
    return p.variants.length
      ? Math.min(...p.variants.map((v) => effectivePrice(v.price, v.discounted_price)))
      : 0;
  }

  /** spec 056: `store.deliveryFee` nunca tiene valor por defecto — un campo
   *  vacío queda `null` (faltante), no `0` implícito (FR-006, Edge Cases). */
  onDeliveryFeeInput(value: string): void {
    this.store.deliveryFee.set(value === '' ? null : Number(value));
  }

  async confirm(): Promise<void> {
    this.intentoGuardar.set(true);
    // spec 091 (A-99): solo Domicilio sigue exigiendo el nombre -- en Mesa/Para llevar, un campo
    // vacío se guarda como "Consumidor final" (lo resuelve el backend).
    if (this.store.orderTypeTab() === 'domicilios' && !this.store.customerName().trim()) return;

    // spec 073, FR-015a / research.md D11: doble chequeo del total antes de
    // crear el pedido — pero solo si la pantalla venía mostrando un total con
    // descuento del backend. Si el preview había fallado (FR-015), la pantalla
    // ya avisó "el descuento se confirma al cobrar": no hay ningún total previo
    // que pueda "cambiar", así que se crea el pedido sin más.
    //
    // spec 089 (A-96, FR-028): si el total cambió ya NO se abre un modal; la cifra se actualiza
    // (`loadDraftPreview` ya lo hizo), se avisa sin bloquear y NO se crea el pedido hasta un
    // segundo clic sobre el importe visible.
    this.totalChangeNotice.set(null);
    const shown = this.store.draftPreview();
    if (shown) {
      const before = Number(shown.total);
      await this.store.loadDraftPreview();
      const fresh = this.store.draftPreview();
      if (fresh && Number(fresh.total) !== before) {
        this.totalChangeNotice.set({ now: Number(fresh.total), before });
        return;
      }
    }

    const ok = await this.store.createManualOrderFromDraft();
    if (ok) {
      await this.router.navigate(['/dashboard/mesas-sesiones']);
    }
  }
}
