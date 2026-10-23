import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PosTablesPanelComponent } from '../components/pos-tables-panel.component';
import { PosOrderPanelComponent } from '../components/pos-order-panel.component';
import { PosCheckoutPanelComponent } from '../components/pos-checkout-panel.component';
import { PosTerminalHeaderComponent } from '../components/pos-terminal-header.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

/**
 * Terminal POS de mesas (staff) -- diseño alineado al mockup de referencia
 * (`terminal-de-mesas/code.html`): cabecera de estado de terminal + sub-barra
 * de pestañas de tipo de orden y resumen de salón, dos tarjetas blancas
 * flotantes (mesas · detalle) sobre fondo gris, radio de 6px y sin sombras.
 *
 * Rediseño responsive: la tarjeta de mesas y la de detalle nunca conviven
 * lado a lado, en ningún ancho — se muestra una sola a la vez, según
 * `store.hasActiveSelection()`, con un botón de volver a la grilla (A-143,
 * registro-de-anomalias.md: se probó mostrarlas juntas desde `lg`, pero
 * daba 3 columnas a la vez con el detalle -- que ya se divide en pedido +
 * cobro -- en vez de las 2 que pedía el usuario al comparar contra el
 * diseño de referencia).
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
    IconLucideComponent,
  ],
  template: `
    <div class="terminal-theme flex flex-col -m-4 md:-m-6 bg-[var(--terminal-color-canvas)] ">
      <!-- spec 131: una sola tarjeta contenedora (header + sub-barra + grilla/
           detalle), igual que el mockup de referencia (isTerminal): un único
           border+radius envolviendo todo, no tarjetas separadas con huecos
           entre ellas -- antes el header y la sub-barra vivían fuera de
           cualquier tarjeta, y la grilla tenía su propia tarjeta con borde
           redondeado propio, dando un efecto de "caja dentro de caja". -->
      <div class="flex-1 flex flex-col p-3 gap-3 min-h-0 overflow-hidden">
        <!-- Encabezado "Pedido de la mesa" (mismo diseño que "Nueva orden" en
             manual-order-page.component.ts): vive POR FUERA de la tarjeta
             blanca de abajo, directo sobre el fondo de la página -- antes
             estaba dentro de la sub-barra, que a su vez vivía dentro de la
             tarjeta, dando el efecto visual de "encabezado metido en la
             tarjeta" reportado por el usuario. -->
        @if (showingDetail()) {
          <div class="h-11 shrink-0 flex items-center gap-3">
            <button
              type="button"
              data-testid="page-back-button"
              (click)="store.cancelSelection()"
              aria-label="Volver a mesas"
              title="Volver a mesas"
              class="w-11 h-11 shrink-0 border rounded-[8px] flex items-center justify-center transition-colors"
              style="border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-primary)"
            >
              <app-lucide-icon name="arrow-left" [size]="18" />
            </button>
            <div class="min-w-0 leading-tight">
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
          </div>
        }
        <div
          class="flex-1 flex flex-col min-h-0 rounded-[16px] border overflow-hidden"
          style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border)"
        >
          <!-- Encabezado: estado de terminal, turno, reloj y acciones de sesión
               (extraído a un componente compartido con manual-order-page.component.ts).
               A pedido del usuario: oculto en la vista de detalle de un pedido
               (mesa, domicilio o para llevar) -- no aporta nada ahí y resta
               espacio vertical a pedido + cobro. También oculto en móvil (solo
               en esta terminal) -- en pantallas angostas la sub-barra ya trae
               todo lo accionable, y este encabezado solo resta alto útil a la
               grilla de mesas / detalle. -->
          @if (!showingDetail()) {
            <div class="hidden sm:contents">
              <app-pos-terminal-header />
            </div>
          }

          <!-- Sub-barra: pestañas de tipo de orden + resumen de salón, o botón de
               volver cuando se está viendo el detalle de un pedido -- a pedido
               del usuario, siempre visible y en la misma posición (misma fila
               que el CTA "Crear pedido nuevo"), para que el cajero tenga un
               único lugar consistente de dónde volver, sin importar si el
               detalle es de una mesa, un domicilio o un pedido para llevar
               (antes el botón de volver vivía en una fila propia, solo dentro
               de la tarjeta de detalle, y encima las pestañas desaparecían del
               todo para domicilio/para llevar en vez de dejar paso al botón). -->
          @if (!(showingDetail() && store.selectedTableId())) {
            <div
              class="px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0"
              style="border-bottom:1px solid var(--terminal-color-border);background:var(--terminal-color-surface)"
            >
              <!-- spec 131 (FR-002/FR-003, fidelidad al mockup): buscador +
                 pestañas + filtro de ocupación viven en LA MISMA franja
                 (isTerminal del mockup los pone todos juntos en una sola fila) —
                 antes el buscador/filtro vivían un nivel abajo, dentro de
                 pos-tables-panel.component.ts, dando el efecto de "caja dentro
                 de caja" reportado contra el diseño de referencia. -->
              <div class="flex items-center gap-3 flex-wrap min-w-0 w-full sm:w-auto">
                @if (!showingDetail()) {
                  @if (store.orderTypeTab() === 'mesas') {
                    <!-- spec 131 (fidelidad responsive al mockup): el buscador de
                       texto solo se muestra desde el breakpoint "sm" -- en móvil
                       el mockup no lo ofrece en esta franja (se llega a él con
                       el atajo F2); el ancho estrecho lo prioriza para las
                       pestañas. -->
                    <div class="relative shrink-0 hidden sm:block">
                      <span
                        class="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none"
                        style="color:var(--terminal-color-text-muted)"
                      >
                        <app-lucide-icon name="search" [size]="16" />
                      </span>
                      <input
                        #searchInput
                        type="text"
                        [value]="store.search()"
                        (input)="store.search.set($any($event.target).value)"
                        placeholder="Buscar mesa…"
                        class="w-44 sm:w-52 h-9 pl-9 pr-12 rounded-[8px] text-[14px] border focus:outline-none"
                        style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-primary)"
                      />
                      <span
                        class="hidden sm:inline absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 border text-[11px] font-semibold rounded-[4px] pointer-events-none"
                        style="border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-muted)"
                      >
                        F2
                      </span>
                    </div>
                  }
                  <!-- Pestañas: ocupan todo el ancho de su propia fila en móvil
                     (mismo patrón que el mockup de referencia en pantallas
                     angostas), auto-ancho desde sm. -->
                  <nav
                    class="flex items-center gap-1 p-1 rounded-[10px] overflow-x-auto sm:overflow-visible shrink-0 w-full sm:w-auto"
                    style="background:var(--terminal-color-surface-soft)"
                  >
                    @for (t of orderTypeTabs; track t.key) {
                      <button
                        (click)="store.setOrderTypeTab(t.key)"
                        class="flex-1 sm:flex-none h-9 px-3.5 rounded-[8px] text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                        [style]="
                          store.orderTypeTab() === t.key
                            ? 'background:var(--terminal-color-surface);color:var(--terminal-color-text-primary);box-shadow:0 1px 2px rgba(15,23,42,.08)'
                            : 'background:transparent;color:var(--terminal-color-text-secondary)'
                        "
                      >
                        {{ t.label }}
                      </button>
                    }
                  </nav>
                  @if (store.orderTypeTab() === 'mesas') {
                    <!-- Filtro de ocupación (FR-003): un único selector en vez de
                       un botón por opción (mockup: tPills como <select>), misma
                       exclusividad mutua y mismos conteos que antes. Oculto en
                       móvil -- su versión compacta (solo ícono) vive junto al
                       CTA "Crear pedido nuevo", como en el mockup de referencia
                       a ese ancho. -->
                    <label class="relative shrink-0 hidden sm:block">
                      <select
                        aria-label="Filtrar por estado"
                        [value]="store.filter()"
                        (change)="store.filter.set($any($event.target).value)"
                        class="h-9 pl-3 pr-9 rounded-[8px] text-[13px] font-semibold border appearance-none cursor-pointer focus:outline-none"
                        style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-primary)"
                      >
                        @for (f of filters; track f.key) {
                          <option [value]="f.key">{{ f.label }} · {{ countFor(f.key) }}</option>
                        }
                      </select>
                      <span
                        class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style="color:var(--terminal-color-text-secondary)"
                      >
                        <app-lucide-icon name="chevron-down" [size]="16" />
                      </span>
                    </label>
                  }
                }
              </div>

              <!-- spec 078 (US2, FR-007/FR-013/FR-015): el CTA "Crear pedido nuevo"
                 está fuera del guard de pestaña — visible y habilitado en las tres
                 pestañas y en los tres anchos, con etiqueta de texto siempre (nunca
                 solo el ícono +). Solo en "Mesas" exige una mesa libre; Domicilio y
                 Para llevar no exigen mesa y goToNewOrder() navega a la ruta sin
                 tableId con el query param tipo. Sigue visible en la vista de
                 detalle (spec 087/126, A-138: crear un segundo pedido en paralelo
                 nunca se restringe), ahora también para domicilio/para llevar.

                 FR-022b/A-141 (spec 131): excepción explícita a lo anterior --
                 mientras se está DENTRO del detalle de una MESA (donde aplican
                 las pestañas "Pedido N"/"Nueva cuenta" de pos-order-panel.component.ts),
                 este botón se oculta: esa misma capacidad vive exclusivamente en
                 "Nueva cuenta" ahí dentro. Se seguía mostrando aquí para
                 Domicilio/Para llevar (sin mesa, sin esas pestañas) y para la
                 grilla principal (sin selección). -->
              @if (!(showingDetail() && store.selectedTableId())) {
                <div data-testid="sub-bar-new-order-cta" class="flex items-center gap-2 shrink-0">
                  @if (!showingDetail() && store.orderTypeTab() === 'mesas') {
                    <!-- Botón "Filtros" (solo ícono) en móvil (spec 131,
                       fidelidad responsive): despliega el buscador + el
                       filtro de ocupación debajo de esta franja (mismo
                       patrón que el mockup de referencia, tToggleFilt/
                       tFiltOpen) -- en vez del truco de <select> transparente
                       que usaba antes, ahora es un botón real que muestra/
                       oculta el panel de abajo. -->
                    <button
                      type="button"
                      aria-label="Filtros"
                      [attr.aria-expanded]="mobileFiltersOpen()"
                      (click)="mobileFiltersOpen.set(!mobileFiltersOpen())"
                      class="sm:hidden shrink-0 w-11 h-11 rounded-[8px] border flex items-center justify-center transition-colors"
                      [style]="
                        mobileFiltersOpen()
                          ? 'border-color:var(--terminal-color-primary-border);background:var(--terminal-color-primary-soft);color:var(--terminal-color-primary-text)'
                          : 'border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-secondary)'
                      "
                    >
                      <app-lucide-icon name="list-filter" [size]="20" />
                    </button>
                  }
                  <button
                    type="button"
                    (click)="goToNewOrder()"
                    class="flex-1 sm:flex-none h-9 sm:h-11 px-3 sm:px-4 rounded-[8px] text-[13px] font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style="background:var(--terminal-color-primary);color:var(--terminal-color-on-primary)"
                  >
                    <app-lucide-icon name="circle-plus" [size]="16" class="shrink-0" />
                    <span>Crear pedido nuevo</span>
                    <span
                      class="hidden md:inline px-1.5 py-0.5 bg-white/20 rounded-[6px] text-[10px] font-semibold uppercase tracking-wider"
                      >[F3]</span
                    >
                  </button>
                </div>
              }
            </div>
          }

          @if (mobileFiltersOpen() && !showingDetail() && store.orderTypeTab() === 'mesas') {
            <!-- Panel desplegable del botón "Filtros" en móvil (spec 131,
                 fidelidad responsive al mockup: tFiltOpen): buscador + filtro
                 de ocupación, cada uno a todo el ancho, apilados -- mismos
                 controles que la franja de escritorio (arriba, oculta en este
                 ancho), solo que aquí van en su propia fila cada uno. -->
            <div
              class="sm:hidden flex flex-col gap-3 px-4 py-3 border-b shrink-0"
              style="border-color:var(--terminal-color-border);background:var(--terminal-color-surface)"
            >
              <div class="relative w-full">
                <span
                  class="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none"
                  style="color:var(--terminal-color-text-muted)"
                >
                  <app-lucide-icon name="search" [size]="16" />
                </span>
                <input
                  type="text"
                  [value]="store.search()"
                  (input)="store.search.set($any($event.target).value)"
                  placeholder="Buscar mesa…"
                  class="w-full h-11 pl-9 pr-3 rounded-[8px] text-[14px] border focus:outline-none"
                  style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-primary)"
                />
              </div>
              <label class="relative w-full">
                <select
                  aria-label="Filtrar por estado"
                  [value]="store.filter()"
                  (change)="store.filter.set($any($event.target).value)"
                  class="w-full h-11 pl-3 pr-9 rounded-[8px] text-[13px] font-semibold border appearance-none cursor-pointer focus:outline-none"
                  style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-primary)"
                >
                  @for (f of filters; track f.key) {
                    <option [value]="f.key">{{ f.label }} · {{ countFor(f.key) }}</option>
                  }
                </select>
                <span
                  class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style="color:var(--terminal-color-text-secondary)"
                >
                  <app-lucide-icon name="chevron-down" [size]="16" />
                </span>
              </label>
            </div>
          }

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
            <!-- spec 078 (US3, FR-018; research.md D4): sin overflow-y-auto de
                 página en ningún ancho — el scroll vive DENTRO de cada columna. El
                 min-w-0 en las dos columnas evita que un hijo flex con contenido
                 ancho imponga su ancho mínimo y fuerce scroll horizontal de página. -->
            <div class="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
              <!-- Tarjeta de mesas: ocupa todo el ancho sin selección; en cuanto
                   hay algo que mostrar se oculta EN TODOS los anchos -- la
                   tarjeta de detalle pasa a ocupar todo el espacio, dividida a
                   su vez en pedido (60%) + cobro (40%), que son las dos
                   columnas reales de esta vista (no mesas+pedido+cobro a la
                   vez). Se probó mostrar la grilla lado a lado con el detalle
                   desde "lg" (A-142) pero el resultado (3 columnas) no era lo
                   que el usuario pedía al comparar contra el diseño de
                   referencia -- revertido el mismo día, ver A-143 en
                   registro-de-anomalias.md. Sin borde/radio propios (spec 131):
                   comparte la tarjeta única de arriba. -->
              <div
                data-testid="mesas-column"
                class="flex-col min-h-0 min-w-0 flex-1 overflow-hidden"
                [class]="showingDetail() ? 'hidden' : 'flex'"
              >
                <app-pos-tables-panel />
              </div>

              <!-- Tarjeta de detalle: mesa/pedido seleccionado + cobro siempre
                   apilados en una sola columna (un único scroll). Ocupa todo el
                   ancho disponible en cualquier tamaño de pantalla (la de mesas,
                   arriba, se oculta a la vez) -- dividida internamente en
                   pedido (60%) + cobro (40%) desde "lg", que son las dos
                   columnas reales de esta vista (A-143). Sin nada real que
                   mostrar -- ni selección, ni una mesa libre sin pedidos --
                   esta tarjeta no se muestra en absoluto (antes tenía un
                   estado vacío propio en cada uno de esos dos casos). Sin
                   borde/radio propios (spec 131): comparte la tarjeta única de
                   arriba. -->
              <div
                data-testid="detail-column"
                class="flex-col min-h-0 min-w-0 flex-1 overflow-hidden"
                [class]="showingDetail() ? 'flex' : 'hidden'"
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
                  <!--
                A pedido del usuario: el botón "Volver a mesas" y el título
                "Pedido de la mesa" ya no viven en filas separadas (antes se
                veían apilados, uno encima del otro) -- ahora el título vive
                junto al botón de volver, dentro de la misma fila de la
                sub-barra (misma fila que "Crear pedido nuevo"), para que
                ambos aparezcan lado a lado en una sola franja.
              -->

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
      </div>
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
                } @else if (store.lastReceipts()[0]; as r) {
                  <!-- Spec 125 (FR-002/FR-003): monto, cliente, método de pago
                       y vuelto (si el pago fue en efectivo) en una sola línea. -->
                  {{ store.fmt(s.total) }} · {{ s.customer }} ·
                  {{ store.paymentMethodLabel(r) }}
                  @if (r.change != null) {
                    · Vuelto {{ store.fmt(r.change) }}
                  }
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
              <button
                (click)="store.printReceipt()"
                class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <app-mi-icon name="receipt" [size]="16" />
                Imprimir todos
              </button>
            } @else {
              <!-- Spec 125, Historia 4 (decisión A-136): reintroduce aquí
                   "Imprimir Factura" para un solo comprobante, revirtiendo el
                   retiro de spec 029 (Historia 4) — la confirmación del cobro
                   queda autocontenida, sin tener que buscar la acción en la
                   barra lateral. Reutiliza printReceipt(), sin ruta de
                   impresión nueva. -->
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
export class TableSessionsComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly orderTypeTabs = [
    { key: 'mesas' as const, label: 'Mesas' },
    { key: 'domicilios' as const, label: 'Domicilios' },
    { key: 'para-llevar' as const, label: 'Para llevar' },
  ];

  /** Filtro de ocupación de la grilla de mesas (FR-003) -- movido aquí junto
   *  al buscador (spec 131, misma franja que el mockup de referencia). */
  readonly filters = [
    { key: 'todas' as const, label: 'Todas' },
    { key: 'libres' as const, label: 'Libres' },
    { key: 'ocupadas' as const, label: 'Ocupadas' },
    { key: 'pendientes' as const, label: 'Pendientes' },
  ];

  /** Botón "Filtros" de móvil (spec 131, fidelidad responsive al mockup:
   *  tFiltOpen): despliega/oculta el buscador + filtro de ocupación debajo
   *  de la sub-barra en anchos angostos, donde no caben en la misma fila. */
  readonly mobileFiltersOpen = signal(false);

  focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }

  /** Número a mostrar en cada opción del filtro de ocupación (store.tableCounts()). */
  countFor(key: 'todas' | 'libres' | 'ocupadas' | 'pendientes'): number {
    const counts = this.store.tableCounts();
    if (key === 'todas') return counts.total;
    if (key === 'libres') return counts.libres;
    if (key === 'ocupadas') return counts.ocupadas;
    return counts.pendientes;
  }

  ngOnInit(): void {
    void this.store.init();
    // spec 111 (FR-001/FR-008): tras crear un pedido desde "Nueva orden", esta misma pantalla
    // recibe a qué pestaña volver (`pestana`) y qué pedido/mesa quedó recién creado
    // (`pedido`/`mesa`) — su store no es singleton y arranca sin nada seleccionado, así que sin
    // esto siempre se quedaría en "Mesas" sin el pedido a la vista (causa raíz en spec.md).
    const params = this.route.snapshot.queryParamMap;
    const pestana = params.get('pestana');
    if (pestana === 'mesas' || pestana === 'para-llevar' || pestana === 'domicilios') {
      this.store.setOrderTypeTab(pestana);
    }
    const mesa = params.get('mesa');
    const pedido = params.get('pedido');
    if (mesa) {
      this.store.selectTable(mesa);
      if (pedido) this.store.selectOrder(pedido);
    } else if (pedido) {
      this.store.selectStandaloneOrder(pedido);
    }
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  /** CTA "Crear pedido nuevo" de la sub-barra (spec 078, US2, FR-008–FR-010).
   *  El destino depende de la pestaña activa:
   *  - "Domicilios" / "Para llevar" → ruta sin `:tableId` con `?tipo=` (no
   *    exigen mesa; `createManualOrderFromDraft()` lo contempla).
   *  - "Mesas" → navega con `newOrderTableId()` si hay una mesa ya
   *    seleccionada; si no hay ninguna, va a la ruta genérica (sin
   *    `:tableId`) para que el usuario elija la mesa en el formulario --
   *    bugfix: antes auto-asignaba la primera mesa libre y el cajero
   *    terminaba en el detalle de una mesa que nunca tocó. */
  goToNewOrder(): void {
    const tab = this.store.orderTypeTab();
    if (tab === 'domicilios' || tab === 'para-llevar') {
      const tipo = tab === 'domicilios' ? 'domicilio' : 'para-llevar';
      this.router.navigate(['/dashboard/mesas-sesiones/orden-manual'], { queryParams: { tipo } });
      return;
    }
    const tableId = this.store.newOrderTableId();
    if (tableId) {
      this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
    } else {
      this.router.navigate(['/dashboard/mesas-sesiones/orden-manual']);
    }
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
   *  con el `?tipo=` correspondiente; en "Mesas" navega con la mesa
   *  seleccionada, o a la ruta genérica si no hay ninguna (mismo criterio que
   *  `goToNewOrder()`). */
  private openNewOrderFromShortcut(): void {
    const tab = this.store.orderTypeTab();
    if (tab === 'domicilios' || tab === 'para-llevar') {
      const tipo = tab === 'domicilios' ? 'domicilio' : 'para-llevar';
      this.router.navigate(['/dashboard/mesas-sesiones/orden-manual'], { queryParams: { tipo } });
      return;
    }
    const tableId = this.store.selectedTableId();
    if (tableId) {
      this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
    } else {
      this.router.navigate(['/dashboard/mesas-sesiones/orden-manual']);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const tag = (document.activeElement?.tagName ?? '').toUpperCase();
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'F2') {
      e.preventDefault();
      this.focusSearch();
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
