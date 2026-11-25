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
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

/**
 * Terminal POS de mesas (staff) -- diseño alineado al mockup de referencia
 * (`terminal-de-mesas/code.html`): cabecera de estado de terminal + sub-barra
 * de pestañas de tipo de orden y resumen de salón, tarjeta blanca flotante
 * sobre fondo gris, radio de 6px y sin sombras.
 *
 * Esta pantalla es SOLO la grilla de mesas/pedidos sueltos -- el detalle de
 * un pedido (armar/cobrar) vive en su propia ruta
 * (`table-order-detail.component.ts`, `mesas-sesiones/:mesa` o
 * `mesas-sesiones/pedido/:pedido`), no acá. Antes ambas vivían en este mismo
 * componente/instancia de store, alternando con una columna oculta por CSS
 * (`showingDetail()`); se separaron por ruta para que cada instancia de
 * `PosTerminalStore` cargue solo lo que su pantalla necesita (ver `scope` en
 * `pos-terminal.store.ts`).
 */
@Component({
  selector: 'app-table-sessions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PosTerminalStore],
  imports: [
    PosTablesPanelComponent,
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
        <div
          class="flex-1 flex flex-col min-h-0 rounded-[16px] border overflow-hidden"
          style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border)"
        >
          <!-- Sub-barra: pestañas de tipo de orden + resumen de salón + CTA
               "Crear pedido nuevo" -- el detalle de un pedido vive en su
               propia ruta (table-order-detail.component.ts), así que esta
               franja ya no necesita conditionarse a showingDetail(). -->
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
                        (click)="selectTab(t.key)"
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
              </div>

              <!-- CTA "Crear pedido nuevo": visible y habilitado en las tres
                 pestañas y en los tres anchos, con etiqueta de texto siempre
                 (nunca solo el ícono +). El detalle (donde esto se ocultaba
                 para una mesa, porque esa capacidad vive en "Nueva cuenta"
                 dentro de pos-order-panel.component.ts) ahora es una ruta
                 aparte (table-order-detail.component.ts), así que aquí
                 siempre se muestra. -->
                <div data-testid="sub-bar-new-order-cta" class="flex items-center gap-2 shrink-0">
                  @if (store.orderTypeTab() === 'mesas') {
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
            </div>

          @if (mobileFiltersOpen() && store.orderTypeTab() === 'mesas') {
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
            <!-- El detalle de un pedido vive en su propia ruta
                 (table-order-detail.component.ts) -- esta vista ya solo es
                 la grilla, sin la columna de detalle que antes se ocultaba
                 con CSS. -->
            <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
              <app-pos-tables-panel />
            </div>
          }
        </div>
      </div>
    </div>
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
    // recibe a qué pestaña volver (`pestana`) -- su store no es singleton y arranca en "Mesas",
    // así que sin esto siempre se quedaría ahí al volver de Domicilio/Para llevar.
    const pestana = this.route.snapshot.queryParamMap.get('pestana');
    if (pestana === 'mesas' || pestana === 'para-llevar' || pestana === 'domicilios') {
      this.store.setOrderTypeTab(pestana);
    }
  }

  /** Sincroniza la pestaña con `?pestana=` en la URL (sin agregar una entrada
   *  nueva al historial) -- esta instancia de store ya no es la misma que el
   *  detalle de un pedido (ahora en su propia ruta), así que sin esto la
   *  pestaña se perdía cada vez que el cajero volvía de un detalle. */
  selectTab(key: 'mesas' | 'para-llevar' | 'domicilios'): void {
    this.store.setOrderTypeTab(key);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pestana: key },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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
      // `existente: '1'` solo si esta mesa YA tiene un pedido vivo --
      // `newOrderTableId()` no distingue mesa libre de ocupada (es solo
      // `selectedTableId()`), así que se calcula acá con lo que el tablero ya
      // tiene cargado (`store.orders()`), sin pedir nada nuevo. Mismo aviso
      // que manda `pos-order-panel.component.ts::createNewOrderForTable()`
      // para que `orden-manual` no tenga que volver a preguntarlo.
      const tieneOrden = this.store.orders().some((o) => o.dining_table_id === tableId);
      const ruta = ['/dashboard/mesas-sesiones', tableId, 'orden-manual'];
      if (tieneOrden) {
        this.router.navigate(ruta, { queryParams: { existente: '1' } });
      } else {
        this.router.navigate(ruta);
      }
    } else {
      this.router.navigate(['/dashboard/mesas-sesiones/orden-manual']);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'F2') {
      e.preventDefault();
      this.focusSearch();
    } else if (e.key === 'F3') {
      e.preventDefault();
      this.goToNewOrder();
    }
  }
}
