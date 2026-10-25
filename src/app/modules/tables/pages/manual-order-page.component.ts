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
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartOptionLine, PosTerminalStore } from '../services/pos-terminal.store';
import { ProductSelectPosComponent } from '../components/product-select-pos.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { PosTerminalHeaderComponent } from '../components/pos-terminal-header.component';
import { BillSummaryComponent } from '../components/bill-summary.component';
import { splitVariantLabel } from '../services/menu-lookup';
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
 * Rediseño (`design/nueva-orden.html`): sigue el lenguaje visual de tokens
 * `--terminal-color-*` (`src/styles.css`, clase `terminal-theme` en el
 * contenedor raíz) ya consolidado en `table-sessions.component.ts`,
 * `bill-summary.component.ts` y `product-select.component.ts` -- antes esta
 * pantalla usaba colores Tailwind planos y nunca aplicaba `terminal-theme`,
 * por lo que esos dos últimos renderizaban su color de *fallback* en vez del
 * tema real. Encabezado de volver + título fusionados (antes una franja
 * aparte "Volver a la Terminal"); sin la fila de contadores
 * (pendientes/mesas/para-llevar/domicilios) ni el escáner de código del
 * buscador -- ninguno está en el mockup de referencia. Nav de categorías con
 * pestaña "Todos" (`showingAllCategories`, `store.catalogProductsAllFiltered()`
 * -- computed aparte, no cambia el significado de
 * `catalogCategoryId`/`catalogProductsFiltered` que también usa
 * `pos-catalog-drawer.component.ts`), tarjetas de producto, y el panel de
 * ticket con una sola fila apilada por línea (nombre + variante/opciones
 * inline, precio, nota rápida, stepper de cantidad) incluyendo insignia +
 * tachado por línea cuando la variante tiene promoción vigente y la
 * cantidad ya califica (`store.cartLinePromo`, puramente presentacional --
 * ver comentario en `pos-terminal.store.ts`, el total real lo sigue
 * calculando el backend). El contenido del carrito (tabs de tipo de orden,
 * campos condicionales, líneas, resumen y botones) vive en un único
 * `<ng-template #ticketBody>` para no duplicarlo: desde `lg` se renderiza
 * siempre en la barra lateral (grid 12 columnas, catálogo 8/ticket 4 -- a
 * pedido del usuario, un ancho fijo en píxeles se veía muy angosto); por
 * debajo de `lg` el catálogo es siempre visible y el carrito
 * vive en una hoja inferior (`viewingCart`, bottom sheet con backdrop,
 * manija y botón X) que se abre desde una barra fija al fondo de la pantalla
 * ("Ver pedido" + total / "Crear orden" directo) -- ya no el mecanismo
 * anterior de alternar catálogo/carrito a pantalla completa. Cada línea del
 * carrito tiene botones de editar que reabren `app-product-select`
 * precargado (`store.openConfigForEdit`/`store.editingSelection`), sin
 * limitarse a cantidad/nota como el mockup -- decisión explícita del
 * usuario, es funcionalidad existente que no se quita.
 */
@Component({
  selector: 'app-manual-order-page',
  standalone: true,
  providers: [PosTerminalStore],
  imports: [
    NgTemplateOutlet,
    FormsModule,
    ProductSelectPosComponent,
    IconMiComponent,
    SearchableSelectComponent,
    PosTerminalHeaderComponent,
    BillSummaryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="terminal-theme flex flex-col -m-4 md:-m-6 overflow-x-hidden bg-[var(--terminal-color-canvas,#f4f6f9)]">
      <!-- Oculto en móvil (mismo criterio que table-sessions.component.ts):
           en pantallas angostas no aporta nada aquí y resta alto útil al
           catálogo/carrito -- el encabezado "Nueva orden" de la columna
           izquierda ya trae el botón de volver. -->
      <div class="hidden sm:contents">
        <app-pos-terminal-header />
      </div>

      <!-- Catálogo (izquierda, siempre visible) + carrito (derecha): barra
           lateral fija desde lg (grid 12 columnas, 8/4 -- a pedido del
           usuario, el resumen de la orden se veía muy angosto con el ancho
           fijo anterior); por debajo de lg el carrito vive en la hoja
           inferior (ver más abajo) -- el padding inferior reserva el alto de
           la barra fija "Ver pedido"/"Crear orden". -->
      <div
        class="flex-1 flex flex-col lg:grid lg:grid-cols-12 p-3 pb-20 lg:pb-3 gap-3 min-h-0 overflow-y-auto lg:overflow-hidden"
      >
        <div data-testid="catalogo-column" class="flex flex-col min-h-0 flex-1 lg:col-span-8 gap-3">
          <!-- Encabezado: botón de volver fusionado con el título "Nueva
               orden" (mockup: una sola franja, sin la barra "Volver a la
               Terminal" aparte que tenía antes esta pantalla). -->
          <div class="h-11 shrink-0 flex items-center gap-3">
            <button
              type="button"
              (click)="backToTerminal()"
              aria-label="Volver a la Terminal de Mesas"
              title="Volver a la Terminal de Mesas"
              class="w-11 h-11 shrink-0 border border-[var(--terminal-color-border,#e5e9ef)] bg-[var(--terminal-color-surface,#fff)] hover:bg-[var(--terminal-color-surface-elevated,#f1f5f9)] text-[var(--terminal-color-text-primary,#090d16)] rounded-[8px] flex items-center justify-center transition-colors"
            >
              <app-mi-icon name="arrow_back" [size]="18" />
            </button>
            <div class="min-w-0 leading-tight">
              <div
                class="text-[11px] font-semibold uppercase tracking-wider text-[var(--terminal-color-text-muted,#64748b)]"
              >
                Terminal de mesas
              </div>
              <h2
                class="text-[18px] font-semibold tracking-tight truncate text-[var(--terminal-color-text-primary,#090d16)] m-0"
                style="font-family:Sora,ui-sans-serif,system-ui,sans-serif"
              >
                Nueva orden
              </h2>
            </div>
          </div>

          <!-- Buscador -->
          <div
            class="h-11 shrink-0 bg-[var(--terminal-color-surface,#fff)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] px-3 flex items-center gap-2"
          >
            <app-mi-icon name="search" [size]="18" class="text-[var(--terminal-color-text-muted,#64748b)] shrink-0" />
            <input
              type="text"
              [value]="store.catalogSearchText()"
              (input)="store.setCatalogSearchText($any($event.target).value)"
              placeholder="Buscar producto, sabor o código…"
              class="flex-1 min-w-0 bg-transparent border-none text-[13px] text-[var(--terminal-color-text-primary,#090d16)] placeholder-[var(--terminal-color-text-muted,#64748b)] focus:outline-none h-full"
            />
            <kbd
              class="font-mono text-[11px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] bg-[var(--terminal-color-surface-soft,#edf1f5)] px-1.5 py-0.5 border border-[var(--terminal-color-border,#e5e9ef)] rounded-[6px] shrink-0"
              >F2</kbd
            >
          </div>

          <!-- Nav de categorías: "Todos" junta todas las categorías (nuevo,
               computed aparte catalogProductsAllFiltered), igual al mockup. -->
          <nav
            class="h-12 shrink-0 bg-[var(--terminal-color-surface,#fff)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] p-1 flex items-center gap-1 overflow-x-auto"
          >
            <button
              type="button"
              (click)="selectAllCategories()"
              class="h-full px-3.5 text-[13px] whitespace-nowrap rounded-[6px] flex items-center transition-colors"
              [class]="
                showingAllCategories()
                  ? 'bg-[var(--terminal-color-surface-soft,#edf1f5)] text-[var(--terminal-color-text-primary,#090d16)] font-semibold'
                  : 'bg-transparent hover:bg-[var(--terminal-color-surface-soft,#edf1f5)] text-[var(--terminal-color-text-secondary,#334155)] font-medium'
              "
            >
              Todos
            </button>
            <button
              type="button"
              (click)="selectPromotions()"
              class="h-full px-3.5 text-[13px] whitespace-nowrap rounded-[6px] flex items-center transition-colors"
              [class]="
                showingPromotions()
                  ? 'bg-[var(--terminal-color-surface-soft,#edf1f5)] text-[var(--terminal-color-text-primary,#090d16)] font-semibold'
                  : 'bg-transparent hover:bg-[var(--terminal-color-surface-soft,#edf1f5)] text-[var(--terminal-color-text-secondary,#334155)] font-medium'
              "
            >
              Promociones
            </button>
            @for (c of store.categories(); track c.id) {
              <button
                type="button"
                (click)="selectCategory(c.id)"
                class="h-full px-3.5 text-[13px] whitespace-nowrap rounded-[6px] flex items-center transition-colors"
                [class]="
                  !showingAllCategories() && !showingPromotions() && store.catalogCategoryId() === c.id
                    ? 'bg-[var(--terminal-color-surface-soft,#edf1f5)] text-[var(--terminal-color-text-primary,#090d16)] font-semibold'
                    : 'bg-transparent hover:bg-[var(--terminal-color-surface-soft,#edf1f5)] text-[var(--terminal-color-text-secondary,#334155)] font-medium'
                "
              >
                {{ c.name }}
              </button>
            }
          </nav>

          <div class="flex-1 min-h-0 overflow-y-auto pr-0.5">
            <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-3">
              @for (p of catalogProducts(); track p.id) {
                <!-- Tarjeta horizontal (mockup design/nueva-orden.html, líneas
                     222-228): ícono/foto a la izquierda, nombre + precio al
                     centro, botón "+" decorativo a la derecha -- ya no la
                     tarjeta vertical con la foto a todo el ancho arriba. -->
                <button
                  type="button"
                  (click)="store.openConfig(p, showingPromotions())"
                  [attr.aria-label]="'Agregar ' + p.name"
                  class="relative min-h-[76px] p-2.5 border rounded-[12px] flex flex-col text-left transition-colors hover:bg-[var(--terminal-color-surface-elevated,#f1f5f9)]"
                  [style]="
                    store.cardPromotionText(p.variants)
                      ? 'background:var(--terminal-color-surface,#fff);border-color:var(--terminal-color-primary-border,#7c3aed)'
                      : 'background:var(--terminal-color-surface,#fff);border-color:var(--terminal-color-border,#e5e9ef)'
                  "
                >
                  @if (store.cardPromotionText(p.variants)) {
                    <!-- Insignia genérica (el detalle de la condición, p. ej.
                         "2 x $12.000", ya se lee abajo del nombre en vez de
                         repetirse aquí). En el flujo normal del layout -- no
                         absoluta -- para que nunca quede pegada al botón "+"
                         decorativo que viene más abajo en la misma tarjeta. -->
                    <span
                      class="self-end -mt-2.5 -mr-2.5 mb-1 text-[9px] font-bold tracking-wide px-2 py-1 rounded-bl-[10px] rounded-tr-[11px] text-white"
                      style="background:var(--terminal-color-primary,#7c3aed)"
                      >% PROMO</span
                    >
                  }
                  <span class="flex-1 flex items-center gap-3">
                  <span
                    class="relative w-[52px] h-[52px] shrink-0 rounded-[10px] overflow-hidden flex items-center justify-center bg-[var(--terminal-color-surface-soft,#edf1f5)]"
                  >
                    @if (p.image_url) {
                      <img [src]="p.image_url" [alt]="p.name" class="w-full h-full object-cover" />
                    } @else {
                      <app-mi-icon
                        name="image-off"
                        [size]="22"
                        ariaLabel="Sin imagen"
                        class="text-[var(--terminal-color-text-subtle,#94a3b8)]"
                      />
                    }
                  </span>
                  @if (cartQtyByProduct().get(p.id); as qty) {
                    <!-- Cuántas unidades de este producto ya hay en el carrito
                         (suma de todas sus líneas/variantes) -- va sobre la
                         tarjeta (relative), no dentro del ícono: ese contenedor
                         tiene overflow-hidden para recortar la foto, y recortaba
                         también la mitad del contador al tener offset negativo. -->
                    <span
                      class="absolute top-1 left-1 z-10 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-[var(--terminal-color-primary,#7c3aed)] border-2 border-[var(--terminal-color-surface,#fff)]"
                      >{{ qty }}</span
                    >
                  }
                  <span class="flex-1 min-w-0 flex flex-col gap-1">
                    <span
                      class="text-[14px] font-semibold text-[var(--terminal-color-text-primary,#090d16)] tracking-tight leading-tight truncate"
                      >{{ p.name }}</span
                    >
                    @if (store.cardPromotionText(p.variants); as promo) {
                      <!-- spec 073, FR-016: condición legible del backend (spec 066). -->
                      <span class="flex flex-col leading-tight">
                        <span class="text-[11px] text-[var(--terminal-color-text-muted,#64748b)] leading-none">desde</span>
                        <span class="font-mono font-bold text-[15px] text-[var(--terminal-color-primary-text,#6d28d9)]">{{
                          promo
                        }}</span>
                      </span>
                    } @else {
                      <span class="flex items-baseline gap-1.5 whitespace-nowrap">
                        <span class="text-[11px] text-[var(--terminal-color-text-muted,#64748b)] leading-none">Desde</span>
                        <span class="font-mono font-bold text-[15px] text-[var(--terminal-color-primary-text,#6d28d9)]">{{
                          store.fmt(minPrice(p))
                        }}</span>
                      </span>
                    }
                  </span>
                  <!-- Solo decorativo: el click de agregar es el de toda la
                       tarjeta, no un botón anidado (evita <button> dentro
                       de <button>). -->
                  <span
                    class="w-9 h-9 rounded-[8px] flex items-center justify-center bg-[var(--terminal-color-primary,#7c3aed)] text-white shrink-0"
                    aria-hidden="true"
                  >
                    <app-mi-icon name="add" [size]="18" />
                  </span>
                  </span>
                </button>
              }
              @if (catalogProducts().length === 0) {
                <p class="col-span-full text-center text-[13px] text-[var(--terminal-color-text-subtle,#94a3b8)] py-10">
                  @if (showingPromotions()) {
                    <span>No hay promociones activas en este momento.</span>
                  } @else {
                    <span>Sin productos que coincidan.</span>
                  }
                </p>
              }
            </div>
          </div>

        </div>

        <!-- Barra lateral fija desde lg (misma tarjeta de siempre); por debajo
             de lg el carrito no vive aquí -- ver la hoja inferior después de
             este contenedor, que renderiza el mismo ticketBody. -->
        <div
          data-testid="ticket-column"
          class="hidden lg:flex lg:flex-col min-h-0 lg:col-span-4 bg-[var(--terminal-color-surface,#fff)] rounded-[8px] border border-[var(--terminal-color-border,#e5e9ef)] lg:overflow-hidden"
        >
          <ng-container *ngTemplateOutlet="ticketBody" />
        </div>
      </div>

      <!-- Hoja inferior del carrito (solo <lg): mismo contenido que la barra
           lateral de escritorio, vía el ng-template compartido. -->
      @if (viewingCart()) {
        <div
          class="lg:hidden fixed inset-0 z-40"
          style="background:rgba(9,13,22,.6)"
          (click)="viewingCart.set(false)"
        ></div>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tu pedido"
          class="lg:hidden fixed inset-x-0 bottom-0 z-50 max-h-[88vh] flex flex-col overflow-hidden rounded-t-[20px]"
          style="background:var(--terminal-color-surface,#fff)"
        >
          <div class="shrink-0 flex justify-center pt-2">
            <span class="w-10 h-1 rounded-full" style="background:var(--terminal-color-border-strong,#cbd5e1)"></span>
          </div>
          <div class="shrink-0 flex items-center justify-between px-4 py-2">
            <h2
              class="text-[18px] font-semibold tracking-tight"
              style="font-family:Sora,ui-sans-serif,system-ui,sans-serif;color:var(--terminal-color-text-primary,#090d16)"
            >
              Tu pedido
            </h2>
            <button
              type="button"
              (click)="viewingCart.set(false)"
              aria-label="Cerrar"
              class="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--terminal-color-surface-soft,#edf1f5)]"
              style="color:var(--terminal-color-text-secondary,#334155)"
            >
              <app-mi-icon name="close" [size]="18" />
            </button>
          </div>
          <ng-container *ngTemplateOutlet="ticketBody" />
        </div>
      }

      <!-- Barra fija "Ver pedido"/"Crear orden" (solo <lg, con carrito no
           vacío y la hoja cerrada): reemplaza el botón flotante anterior --
           queda pegada al fondo de la pantalla en vez de vivir dentro del
           flujo de la columna de catálogo. -->
      @if (!store.cartEmpty() && !viewingCart()) {
        <div
          class="lg:hidden fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 px-3 py-2"
          style="background:var(--terminal-color-surface,#fff);border-top:1px solid var(--terminal-color-border,#e5e9ef)"
        >
          <button
            type="button"
            (click)="viewingCart.set(true)"
            [attr.aria-label]="'Ver pedido, ' + store.cartView().length + ' ítems, ' + store.fmt(store.subtotal())"
            class="flex-1 min-w-0 flex items-center gap-3 text-left"
          >
            <span
              class="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0"
              style="background:var(--terminal-color-surface-soft,#edf1f5);border:1px solid var(--terminal-color-border,#e5e9ef);color:var(--terminal-color-text-primary,#090d16)"
            >
              {{ store.cartView().length }}
            </span>
            <span class="min-w-0 flex flex-col leading-tight">
              <span class="flex items-center gap-1 text-[13px]" style="color:var(--terminal-color-text-secondary,#334155)">
                Ver pedido <app-mi-icon name="expand_less" [size]="16" />
              </span>
              <b class="text-[18px]" style="color:var(--terminal-color-text-primary,#090d16)">{{ store.fmt(store.subtotal()) }}</b>
            </span>
          </button>
          <button
            type="button"
            (click)="confirm()"
            [disabled]="orderDisabled()"
            class="shrink-0 h-12 px-5 rounded-[10px] font-semibold flex items-center gap-2 text-white disabled:opacity-50 transition-colors"
            style="background:var(--terminal-color-primary,#7c3aed)"
          >
            <app-mi-icon name="check" [size]="18" />
            Crear orden
          </button>
        </div>
      }
    </div>

    <!-- Contenido del carrito/ticket: compartido entre la barra lateral de
         escritorio y la hoja inferior de móvil (ver arriba) -- mismo
         formulario, misma lista de líneas, mismo resumen, un solo origen de
         verdad para no duplicar ~400 líneas de plantilla. -->
    <ng-template #ticketBody>
          <!-- Encabezado + tipo de orden + campos (mockup: una sola sección). -->
          <div class="border-b border-[var(--terminal-color-border,#e5e9ef)] bg-[var(--terminal-color-surface,#fff)] shrink-0 p-3 flex flex-col gap-2.5">
            <div class="grid grid-cols-3 p-0.5 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px]">
              <button
                type="button"
                (click)="setOrderTypeTab('mesas')"
                [disabled]="mesaConPedidoExistente()"
                [title]="
                  mesaConPedidoExistente()
                    ? 'Esta mesa ya tiene otro pedido: el tipo de orden no se puede cambiar.'
                    : ''
                "
                class="h-11 text-[13px] rounded-[6px] flex items-center justify-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                [class]="
                  store.orderTypeTab() === 'mesas'
                    ? 'bg-[var(--terminal-color-surface,#fff)] text-[var(--terminal-color-text-primary,#090d16)] font-semibold shadow-[0_1px_2px_rgba(15,23,42,.08)]'
                    : 'text-[var(--terminal-color-text-secondary,#334155)] font-medium'
                "
              >
                <app-mi-icon
                  name="table_restaurant"
                  [size]="18"
                  [class]="store.orderTypeTab() === 'mesas' ? 'text-[var(--terminal-color-primary-text,#6d28d9)]' : ''"
                />
                Mesa
              </button>
              <button
                type="button"
                (click)="setOrderTypeTab('para-llevar')"
                [disabled]="mesaConPedidoExistente()"
                [title]="
                  mesaConPedidoExistente()
                    ? 'Esta mesa ya tiene otro pedido: el tipo de orden no se puede cambiar.'
                    : ''
                "
                class="h-11 text-[13px] rounded-[6px] flex items-center justify-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                [class]="
                  store.orderTypeTab() === 'para-llevar'
                    ? 'bg-[var(--terminal-color-surface,#fff)] text-[var(--terminal-color-text-primary,#090d16)] font-semibold shadow-[0_1px_2px_rgba(15,23,42,.08)]'
                    : 'text-[var(--terminal-color-text-secondary,#334155)] font-medium'
                "
              >
                <app-mi-icon
                  name="shopping_bag"
                  [size]="18"
                  [class]="store.orderTypeTab() === 'para-llevar' ? 'text-[var(--terminal-color-primary-text,#6d28d9)]' : ''"
                />
                Para llevar
              </button>
              <button
                type="button"
                (click)="setOrderTypeTab('domicilios')"
                [disabled]="mesaConPedidoExistente()"
                [title]="
                  mesaConPedidoExistente()
                    ? 'Esta mesa ya tiene otro pedido: el tipo de orden no se puede cambiar.'
                    : ''
                "
                class="h-11 text-[13px] rounded-[6px] flex items-center justify-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                [class]="
                  store.orderTypeTab() === 'domicilios'
                    ? 'bg-[var(--terminal-color-surface,#fff)] text-[var(--terminal-color-text-primary,#090d16)] font-semibold shadow-[0_1px_2px_rgba(15,23,42,.08)]'
                    : 'text-[var(--terminal-color-text-secondary,#334155)] font-medium'
                "
              >
                <app-mi-icon
                  name="delivery_dining"
                  [size]="18"
                  [class]="store.orderTypeTab() === 'domicilios' ? 'text-[var(--terminal-color-primary-text,#6d28d9)]' : ''"
                />
                Domicilio
              </button>
            </div>

            @if (store.orderTypeTab() === 'mesas') {
              <!-- Solo las mesas libres se pueden elegir: esta vista arma un
                   pedido nuevo, no edita una mesa ya ocupada (spec 053: mesas
                   ocupadas siguen visibles en el select, no seleccionables). -->
              <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1.5">
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] uppercase tracking-wider"
                    >Cliente</label
                  >
                  <input
                    type="text"
                    [value]="store.customerName()"
                    (input)="store.customerName.set($any($event.target).value)"
                    (focus)="$any($event.target).select()"
                    placeholder="Ej: Juan Pérez"
                    class="h-11 px-3 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] text-[13px] text-[var(--terminal-color-text-primary,#090d16)] font-medium focus:outline-none focus:border-[var(--terminal-color-primary-border,#7c3aed)] focus:bg-[var(--terminal-color-surface,#fff)]"
                  />
                  @if (mostrarErrorNombre()) {
                    <span class="text-[11px] text-[var(--terminal-color-error,#e11d48)]">El nombre del cliente es obligatorio.</span>
                  }
                </div>
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] uppercase tracking-wider"
                    >Mesa asignada</label
                  >
                  <app-searchable-select
                    placeholder="Buscar mesa…"
                    [options]="mesaOptions()"
                    [ngModel]="store.selectedTableId()"
                    [disabled]="mesaConPedidoExistente()"
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
                <label class="text-[10px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] uppercase tracking-wider"
                  >Cliente / Para llevar</label
                >
                <input
                  type="text"
                  [value]="store.customerName()"
                  (input)="store.customerName.set($any($event.target).value)"
                  (focus)="$any($event.target).select()"
                  placeholder="Ej: Juan Pérez"
                  class="h-11 px-3 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] text-[13px] text-[var(--terminal-color-text-primary,#090d16)] font-medium focus:outline-none focus:border-[var(--terminal-color-primary-border,#7c3aed)] focus:bg-[var(--terminal-color-surface,#fff)]"
                />
                @if (mostrarErrorNombre()) {
                  <span class="text-[11px] text-[var(--terminal-color-error,#e11d48)]">El nombre del cliente es obligatorio.</span>
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
              <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1.5">
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] uppercase tracking-wider"
                    >Nombre cliente</label
                  >
                  <input
                    type="text"
                    [value]="store.customerName()"
                    (input)="store.customerName.set($any($event.target).value)"
                    placeholder="Ej: Juan Pérez"
                    class="h-11 px-3 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] text-[13px] text-[var(--terminal-color-text-primary,#090d16)] font-medium focus:outline-none focus:border-[var(--terminal-color-primary-border,#7c3aed)] focus:bg-[var(--terminal-color-surface,#fff)]"
                  />
                  @if (mostrarErrorNombre()) {
                    <span class="text-[11px] text-[var(--terminal-color-error,#e11d48)]">El nombre del cliente es obligatorio.</span>
                  }
                </div>
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] uppercase tracking-wider"
                    >Teléfono</label
                  >
                  <input
                    type="text"
                    [value]="store.deliveryPhone()"
                    (input)="store.deliveryPhone.set($any($event.target).value)"
                    placeholder="Ej: 300 123 4567"
                    class="h-11 px-3 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] text-[13px] font-mono text-[var(--terminal-color-text-primary,#090d16)] focus:outline-none focus:border-[var(--terminal-color-primary-border,#7c3aed)] focus:bg-[var(--terminal-color-surface,#fff)]"
                  />
                </div>
              </div>
              <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1.5">
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] uppercase tracking-wider"
                    >Dirección de entrega</label
                  >
                  <input
                    type="text"
                    [value]="store.deliveryAddress()"
                    (input)="store.deliveryAddress.set($any($event.target).value)"
                    placeholder="Ej: Calle 45 # 22-10"
                    class="h-11 px-3 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] text-[13px] text-[var(--terminal-color-text-primary,#090d16)] focus:outline-none focus:border-[var(--terminal-color-primary-border,#7c3aed)] focus:bg-[var(--terminal-color-surface,#fff)]"
                  />
                </div>
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] font-semibold text-[var(--terminal-color-text-muted,#64748b)] uppercase tracking-wider"
                    >Tarifa Domicilio</label
                  >
                  <input
                    type="number"
                    min="0"
                    [value]="store.deliveryFee()"
                    (input)="onDeliveryFeeInput($any($event.target).value)"
                    placeholder="$5.000"
                    class="h-11 px-3 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[8px] text-[13px] font-mono font-semibold text-[var(--terminal-color-text-primary,#090d16)] focus:outline-none focus:border-[var(--terminal-color-primary-border,#7c3aed)] focus:bg-[var(--terminal-color-surface,#fff)]"
                  />
                </div>
              </div>
            }
          </div>

          <!-- Detalle del pedido: encabezado + tabla de líneas, con scroll
               propio -- tanto en la barra lateral de escritorio como en la
               hoja inferior de móvil, el contenedor que lo envuelve tiene
               alto acotado (lg:overflow-hidden / max-h-[88vh]), así que
               esta es la única pieza que scrollea; el encabezado de tabs/
               campos y el footer de totales/botones quedan fijos arriba y
               abajo. -->
          <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col bg-[var(--terminal-color-surface,#fff)]">
            <div class="flex items-center gap-2 flex-wrap pb-3 border-b border-[var(--terminal-color-border,#e5e9ef)]">
              <span
                class="px-2 py-0.5 text-[12px] font-medium text-[var(--terminal-color-text-secondary,#334155)] bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-[6px] whitespace-nowrap"
                >Ítems: {{ store.cartView().length }}</span
              >
            </div>

            <div class="flex flex-col divide-y" style="border-color:var(--terminal-color-border,#e5e9ef)">
              @for (it of store.cartView(); track it.key) {
                <!-- Rediseño (design/nueva-orden.html): una sola fila apilada
                     para cualquier ancho -- ya no una tabla de 12 columnas
                     desde sm y una tarjeta aparte por debajo (el carrito
                     vive siempre en una columna angosta, sea la barra lateral
                     de escritorio o la hoja inferior de móvil, así que nunca
                     necesitó una fila de tabla ancha). Variante + opciones
                     elegidas se resumen en una sola línea muted junto al
                     nombre (cartLineDetail) en vez de la insignia de
                     presentación + app-cart-item-options en caja aparte. -->
                @let parts = splitVariantLabel(it.name);
                @let detail = cartLineDetail(it.options, parts.variant);
                <div
                  class="py-3 flex flex-col gap-2"
                  [class]="it.promo ? '-mx-2 px-2' : ''"
                  [style]="it.promo ? 'background:var(--terminal-color-warning-soft,#fef3e2);border-left:2px solid var(--terminal-color-warning,#b45309)' : ''"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <span class="text-[14px] font-semibold text-[var(--terminal-color-text-primary,#090d16)] leading-tight">{{
                        parts.product
                      }}</span>
                      @if (detail) {
                        <span class="text-[13px] text-[var(--terminal-color-text-secondary,#334155)]"> · {{ detail }}</span>
                      }
                    </div>
                    @if (it.promo; as promo) {
                      <div class="shrink-0 flex flex-col items-end gap-1">
                        <span
                          class="text-[11px] font-bold px-2 py-1 rounded-[4px] leading-none border"
                          style="background:var(--terminal-color-warning-soft,#fef3e2);color:var(--terminal-color-warning,#b45309);border-color:var(--terminal-color-warning,#b45309)"
                          >{{ promo.badge }}</span
                        >
                        <b class="font-mono text-[16px] text-[var(--terminal-color-primary-text,#6d28d9)]">{{
                          store.fmt(promo.discountedAmount)
                        }}</b>
                      </div>
                    } @else {
                      <b class="shrink-0 font-mono text-[16px] text-[var(--terminal-color-text-primary,#090d16)]">{{ store.fmt(it.subtotal) }}</b>
                    }
                  </div>

                  @if (it.notes && editingNoteKey() !== it.key) {
                    <!-- Nota ya guardada: caja resaltada con "Editar" -- tocarla reabre el textarea de abajo.
                         Ícono de nota (sticky_note_2), distinto del lápiz "edit" que usa el botón "Editar"
                         de abajo (reabre el modal completo) -- antes ambos usaban el mismo ícono y
                         confundían, a pesar de llevar textos distintos. -->
                    <button
                      type="button"
                      (click)="openNoteEditor(it.key, it.notes)"
                      class="flex items-center gap-2 w-full text-left px-3 py-2 rounded-[8px] border"
                      style="background:var(--terminal-color-warning-soft,#fef3e2);border-color:var(--terminal-color-warning,#b45309)"
                    >
                      <app-mi-icon name="sticky_note_2" [size]="14" style="color:var(--terminal-color-warning,#b45309)" />
                      <span class="flex-1 min-w-0 text-[13px] truncate" style="color:var(--terminal-color-text-primary,#090d16)">{{
                        it.notes
                      }}</span>
                      <span class="shrink-0 text-[13px] font-semibold" style="color:var(--terminal-color-primary-text,#6d28d9)">Editar</span>
                    </button>
                  }

                  @if (editingNoteKey() === it.key) {
                    <div
                      class="flex flex-col gap-2 p-2 rounded-[8px] border"
                      style="background:var(--terminal-color-surface-soft,#edf1f5);border-color:var(--terminal-color-border,#e5e9ef)"
                    >
                      <textarea
                        rows="2"
                        [value]="noteDraft()"
                        (input)="noteDraft.set($any($event.target).value)"
                        placeholder="Observación para preparación…"
                        class="w-full text-[13px] rounded-[6px] border p-2 focus:outline-none"
                        style="background:var(--terminal-color-surface,#fff);border-color:var(--terminal-color-border,#e5e9ef);color:var(--terminal-color-text-primary,#090d16)"
                      ></textarea>
                      <button
                        type="button"
                        (click)="saveNote(it.key)"
                        class="self-end h-9 px-4 rounded-[8px] text-white text-[13px] font-semibold"
                        style="background:var(--terminal-color-primary,#7c3aed)"
                      >
                        Listo
                      </button>
                    </div>
                  }

                  <div class="flex items-center justify-between gap-2">
                    <div
                      class="inline-flex items-center gap-1.5 bg-[var(--terminal-color-surface-soft,#edf1f5)] border border-[var(--terminal-color-border,#e5e9ef)] rounded-full p-1"
                    >
                      <!-- A pedido del usuario: sin botón de eliminar aparte --
                           al llegar a 1, "−" quita la línea (store.decDraft ya
                           filtra las líneas en 0, ver pos-terminal.store.ts). -->
                      <button
                        (click)="store.decDraft(it.key)"
                        [attr.aria-label]="it.qty === 1 ? 'Eliminar ítem' : 'Quitar uno'"
                        [title]="it.qty === 1 ? 'Eliminar ítem' : ''"
                        class="w-9 h-9 rounded-full flex items-center justify-center text-[16px] font-bold transition-colors hover:opacity-80"
                        [style]="
                          it.qty === 1
                            ? 'color:var(--terminal-color-error,#e11d48)'
                            : 'color:var(--terminal-color-text-secondary,#334155)'
                        "
                      >
                        @if (it.qty === 1) {
                          <app-mi-icon name="delete" ariaLabel="Eliminar ítem" [size]="18" />
                        } @else {
                          <span> − </span>
                        }
                      </button>
                      <span
                        class="font-mono font-bold text-[16px] text-[var(--terminal-color-primary-text,#6d28d9)] tabular-nums min-w-[22px] text-center"
                        >{{ it.qty }}</span
                      >
                      <button
                        (click)="store.incDraft(it.key)"
                        class="w-9 h-9 rounded-full flex items-center justify-center text-[16px] font-bold transition-colors hover:opacity-80"
                        style="color:var(--terminal-color-text-secondary,#334155)"
                      >
                        +
                      </button>
                    </div>
                    <div class="flex items-center gap-1.5">
                      @if (it.kind === 'draft' && !it.comboId && !it.notes && editingNoteKey() !== it.key) {
                        <button
                          type="button"
                          (click)="openNoteEditor(it.key, it.notes)"
                          class="flex items-center gap-1.5 text-[12px] font-semibold rounded-[8px] px-2.5 py-1.5 border"
                          style="background:var(--terminal-color-surface-soft,#edf1f5);border-color:var(--terminal-color-border,#e5e9ef);color:var(--terminal-color-text-secondary,#334155)"
                        >
                          <app-mi-icon name="sticky_note_2" [size]="16" />
                          Nota
                        </button>
                      }
                      @if (it.kind === 'draft' && !it.comboId) {
                        <button
                          type="button"
                          (click)="store.openConfigForEdit(it.key)"
                          title="Editar sabor, opciones y toppings"
                          class="flex items-center gap-1.5 text-[12px] font-semibold text-white rounded-[8px] px-2.5 py-1.5"
                          style="background:var(--terminal-color-primary,#7c3aed)"
                        >
                          <app-mi-icon name="tune" [size]="16" />
                          Editar
                        </button>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
            @if (store.cartEmpty()) {
              <div class="text-center text-[var(--terminal-color-text-subtle,#94a3b8)] py-10 text-[13px]">
                Agrega productos desde el catálogo.
              </div>
            }
          </div>

          <div class="border-t border-[var(--terminal-color-border,#e5e9ef)] bg-[var(--terminal-color-surface,#fff)] shrink-0 flex flex-col">
            <div class="p-3 bg-[var(--terminal-color-surface-soft,#edf1f5)] border-b border-[var(--terminal-color-border,#e5e9ef)] flex flex-col gap-1">
              @let tot = store.totals();
              @if (store.draftPreview(); as p) {
                <!-- spec 073, FR-013/FR-014: el desglose (con descuento por
                     promoción) lo calcula el backend sobre el borrador. -->
                <!-- spec 087, FR-016: los combos no pasan por el endpoint; se
                     suman a su precio de combo, sin descuento adicional. -->
                <!-- spec 115, A-127: "Subtotal" se muestra ya neto (sin el
                     descuento), para que coincida con el precio que cada línea
                     en promoción ya muestra tachado/con descuento (A-125) —
                     sin la fila "Descuento" (A-125), un Subtotal bruto se veía
                     inconsistente con las líneas y con el Total. -->
                <app-bill-summary
                  [subtotal]="+p.subtotal - +p.discount + store.combosSubtotal() + store.toppingsSubtotal()"
                  [deliveryFee]="+p.delivery_fee"
                  deliveryFeeLabel="Costo de domicilio"
                  [showDeliveryIcon]="true"
                  [total]="+p.total + store.combosSubtotal() + store.toppingsSubtotal()"
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
                  <p class="text-[11px] text-[var(--terminal-color-warning,#b45309)]">El descuento se confirma al cobrar.</p>
                } @else if (store.draftPreviewLoading()) {
                  <p class="text-[11px] text-[var(--terminal-color-text-subtle,#94a3b8)]">Calculando el descuento…</p>
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
                  class="rounded-[6px] border border-[var(--terminal-color-warning,#b45309)] bg-[var(--terminal-color-warning-soft,#fef3e2)] px-3 py-2 text-[12px] text-[var(--terminal-color-text-primary,#78350f)]"
                >
                  El total cambió: ahora es {{ store.fmt(n.now) }} (antes {{ store.fmt(n.before) }}).
                  Revisa el importe y vuelve a pulsar Crear pedido.
                </div>
              }
              <button
                (click)="confirm()"
                [disabled]="orderDisabled()"
                class="w-full h-12 bg-[var(--terminal-color-primary,#7c3aed)] hover:bg-[var(--terminal-color-primary-active,#6d28d9)] text-white font-semibold text-[15px] flex items-center justify-center gap-2 rounded-[8px] disabled:opacity-50 transition-colors"
              >
                <app-mi-icon name="credit_card" [size]="20" />
                <span>{{ store.submitting() ? 'Guardando…' : 'Crear pedido' }}</span>
              </button>
              <button
                type="button"
                (click)="backToTerminal()"
                class="w-full h-8 border border-[var(--terminal-color-border,#e5e9ef)] bg-[var(--terminal-color-surface,#fff)] hover:bg-[var(--terminal-color-surface-elevated,#f1f5f9)] text-[var(--terminal-color-text-secondary,#334155)] text-[12px] font-medium flex items-center justify-center gap-1.5 rounded-[6px] transition-colors"
              >
                Regresar
              </button>
            </div>
          </div>
    </ng-template>

    @if (store.configuringProduct(); as product) {
      <app-product-select-pos
        [product]="product"
        [initialSelection]="store.editingSelection()"
        [fromPromotions]="store.configuringProductFromPromotions()"
        [openToken]="store.configuringToken()"
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

  /** Separa el nombre del producto de su variante -- ver `splitVariantLabel()`
   *  en `menu-lookup.ts` (spec 113: mismo patrón de pill ya usado en
   *  `pos-order-panel.component.ts`). */
  splitVariantLabel = splitVariantLabel;

  /** Por debajo de `lg`, si la hoja inferior del carrito ("Tu pedido") está
   *  abierta -- el catálogo siempre está visible debajo (rediseño
   *  `design/nueva-orden.html`: ya no alterna entre catálogo y carrito a
   *  pantalla completa). El usuario la abre desde la barra fija "Ver
   *  pedido"/"Crear orden" y la cierra con el botón X, tocando el fondo
   *  oscurecido, o automáticamente desde `confirm()` cuando hay algo que
   *  necesita ver (nombre de Domicilio vacío, aviso de total cambiado). Sin
   *  efecto desde `lg`, donde el carrito vive siempre en la barra lateral. */
  readonly viewingCart = signal(false);

  /** Pestaña "Todos" del rediseño (`create-order/code.html`): activa por
   *  defecto, igual que el mockup. `store.catalogCategoryId()` sigue
   *  existiendo y se sincroniza al elegir una categoría puntual (para que
   *  `store.openConfig`/otros usos del store no se enteren de esta pestaña),
   *  pero mientras esta signal es `true` el grid usa
   *  `store.catalogProductsAllFiltered()` en su lugar. */
  readonly showingAllCategories = signal(true);

  /** spec 115 (FR-001/FR-013): pestaña "Promociones" — tercer modo de
   *  navegación, igual de agregado que "Todos" pero filtrado por
   *  `hasPromotion`. No se autoselecciona al cargar (FR-013): por defecto
   *  queda en `false`, sin ningún `effect()` que la active. */
  readonly showingPromotions = signal(false);

  /** Fuente de datos del grid según la pestaña activa. */
  readonly catalogProducts = computed(() =>
    this.showingPromotions()
      ? this.store.catalogProductsPromotionsFiltered()
      : this.showingAllCategories()
        ? this.store.catalogProductsAllFiltered()
        : this.store.catalogProductsFiltered(),
  );

  /** Rediseño (`design/nueva-orden.html`): cuántas unidades de cada producto
   *  ya hay en el carrito (sumando todas sus líneas -- distintas variantes/
   *  sabores/opciones del mismo producto se cuentan juntas), para la burbuja
   *  sobre la tarjeta del catálogo. Solo líneas de producto (`kind:
   *  'product'`); los combos no tienen tarjeta propia en este grid. */
  readonly cartQtyByProduct = computed(() => {
    const map = new Map<string, number>();
    for (const l of this.store.draftLines()) {
      if (l.kind !== 'product') continue;
      map.set(l.product.id, (map.get(l.product.id) ?? 0) + l.quantity);
    }
    return map;
  });

  /** Rediseño (`design/nueva-orden.html`): condición de deshabilitado del
   *  botón "Crear orden" -- extraída a `computed` porque ahora vive en DOS
   *  botones (el de `ticketBody`, compartido entre barra lateral y hoja
   *  inferior, y el de la barra fija "Ver pedido"/"Crear orden" en móvil). */
  readonly orderDisabled = computed(
    () =>
      this.store.cartEmpty() ||
      this.store.submitting() ||
      (this.store.orderTypeTab() === 'mesas' && !this.store.selectedTableId()) ||
      (this.store.orderTypeTab() === 'domicilios' &&
        (!this.store.customerName().trim() ||
          !this.store.deliveryAddress().trim() ||
          this.store.deliveryFee() == null)),
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

  /**
   * spec 126 (A-138): esta pantalla arma siempre un pedido nuevo, nunca edita
   * uno existente -- pero cuando se llega aquí con una mesa que YA tiene otro
   * pedido (p. ej. "+ Crear pedido nuevo" sobre una mesa ocupada, o con saldo
   * pendiente), el tipo de orden y la mesa asignada deben quedar fijos: el
   * cajero no debe poder reasignar este segundo pedido a otra mesa ni a
   * Para llevar/Domicilio a mitad de armado -- solo puede volver al catálogo
   * y agregar productos, o volver a la Terminal sin guardar nada.
   */
  readonly mesaConPedidoExistente = computed(() => {
    const t = this.store.selectedTableId();
    return !!t && this.store.orders().some((o) => o.dining_table_id === t);
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

  /** Rediseño (design/nueva-orden.html): edición rápida de la nota de una
   *  línea del carrito, directamente ahí -- `key` de la línea cuyo textarea
   *  está abierto, o `null` si ninguno. Solo una a la vez. */
  readonly editingNoteKey = signal<string | null>(null);
  readonly noteDraft = signal('');

  openNoteEditor(key: string, current: string | null): void {
    this.editingNoteKey.set(key);
    this.noteDraft.set(current ?? '');
  }

  saveNote(key: string): void {
    this.store.setDraftNote(key, this.noteDraft());
    this.editingNoteKey.set(null);
  }

  /** Variante + opciones elegidas de una línea, en una sola cadena para
   *  mostrar en línea junto al nombre del producto (p. ej. "Pequeño 8 onz +
   *  Leche condensada, Chispas") -- ya no la insignia de presentación +
   *  `app-cart-item-options` en una caja aparte debajo. */
  cartLineDetail(options: CartOptionLine[], variant: string | null): string {
    const optionsText = options.map((o) => o.text).join(', ');
    return [variant, optionsText].filter((p): p is string => !!p).join(' + ');
  }

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
    this.showingPromotions.set(false);
    this.showingAllCategories.set(true);
  }

  selectCategory(id: string): void {
    this.showingPromotions.set(false);
    this.showingAllCategories.set(false);
    this.store.setCatalogCategory(id);
  }

  /** spec 115 (FR-001). */
  selectPromotions(): void {
    this.showingAllCategories.set(false);
    this.showingPromotions.set(true);
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
    // (p. ej. "+ Crear pedido nuevo" invocado con una mesa ocupada ya
    // seleccionada). Un pedido nuevo nunca "edita" uno existente por
    // selección de mesa, así que se limpia de una vez.
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
    if (this.store.orderTypeTab() === 'domicilios' && !this.store.customerName().trim()) {
      // Rediseño (`design/nueva-orden.html`): en móvil, "Crear orden" se puede pulsar desde la
      // barra fija con la hoja cerrada -- el error inline vive dentro de `ticketBody`, así que sin
      // esto quedaría invisible. Sin efecto en escritorio (la barra lateral ya está siempre visible).
      this.viewingCart.set(true);
      return;
    }

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
        this.viewingCart.set(true); // mismo motivo que el early-return de arriba
        return;
      }
    }

    const ok = await this.store.createManualOrderFromDraft();
    if (!ok) return;
    // spec 111 (FR-001/FR-002, RN1): vuelve a la terminal con el pedido recién creado ya
    // seleccionado (en vez de la pestaña Mesas por defecto) — `pestana`/`mesa`/`pedido` le dicen a
    // `TableSessionsComponent` qué mostrar, porque su store no es singleton y por defecto arranca
    // sin nada seleccionado (ver spec.md, causa raíz).
    const id = this.store.selectedOrderId();
    if (!id) {
      await this.router.navigate(['/dashboard/mesas-sesiones']);
      return;
    }
    const pestana =
      this.store.orderTypeTab() === 'domicilios'
        ? 'domicilios'
        : this.store.orderTypeTab() === 'para-llevar'
          ? 'para-llevar'
          : 'mesas';
    const queryParams: Record<string, string> = { pestana, pedido: id };
    if (pestana === 'mesas') {
      const tableId = this.store.selectedTableId();
      if (tableId) queryParams['mesa'] = tableId;
    }
    await this.router.navigate(['/dashboard/mesas-sesiones'], { queryParams });
  }
}
