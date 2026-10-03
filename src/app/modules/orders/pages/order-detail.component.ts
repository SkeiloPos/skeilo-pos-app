import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  DiningOrder,
  DiningOrderItem,
  lineTotalGross,
} from '../../tables/interfaces/dining.interface';
import { DiningSessionService } from '../../tables/services/dining-session.service';
import { TableService } from '../../tables/services/table.service';
import { MenuService } from '../../../core/services/menu.service';
import { buildMenuLookup } from '../../tables/services/menu-lookup';
import {
  displayOrderStatus,
  kitchenStatusClass,
  kitchenStatusLabel,
  orderStatusClass,
  orderStatusLabel,
  orderTypeLabel,
} from '../order-status.util';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { MoneyPipe } from '../../../shared/money.pipe';
import { BillSummaryComponent } from '../../tables/components/bill-summary.component';
import { ToastService } from '../../../shared/feedback/toast.service';

/**
 * spec 094 — los tres avisos de la pantalla, como constantes del archivo.
 *
 * Son **textos literales fijados por la spec** (FR-023, FR-024a, FR-018) y no
 * son parafraseables: viven aquí, y no interpolados en la plantilla, para que
 * una edición descuidada del HTML no pueda reescribirlos sin que los tests de
 * componente —que los comparan completos— se pongan rojos.
 */
const AVISO_CUENTA_UNIFICADA =
  'Este pedido se cobró junto con otros en una cuenta unificada; el total facturado está en Ventas';
const AVISO_PEDIDO_SIN_COBRAR = 'El descuento se calcula al cobrar; este total aún puede cambiar';
const AVISO_SIN_DETALLE_DE_PRECIOS = 'Esta orden no tiene el detalle de precios por ítem';

/** Literal de FR-017; el de error es propio de esta pantalla (research.md D11). */
const TOAST_DATOS_COPIADOS = 'Datos de envío copiados al portapapeles';
const TOAST_FALLO_AL_COPIAR = 'No se pudieron copiar los datos';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [RouterLink, TenantDatePipe, IconMiComponent, MoneyPipe, BillSummaryComponent],
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
              <p class="text-xs text-gray-400 uppercase tracking-wide font-medium">{{ rotuloEncabezado() }}</p>
              <p class="text-base font-bold text-gray-900 truncate">{{ encabezado() }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Canal: {{ order()!.channel }}</p>
            </div>
            <span class="text-sm px-3 py-1.5 rounded-full font-semibold shrink-0" [class]="statusClass(displayStatus(order()!))">
              {{ statusLabel(displayStatus(order()!)) }}
            </span>
          </div>

          <div class="px-5 py-3 grid grid-cols-2 gap-4 border-b border-gray-100 text-sm">
            <div>
              <!-- spec 094 (FR-013, US4): "Comensal" solo era correcto en mesa; el
                   mismo nombre aparece en pedidos para llevar y a domicilio. -->
              <p class="text-xs text-gray-400">Cliente</p>
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
                <div
                  data-testid="item-row"
                  class="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0"
                >
                  <span class="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                    {{ item.quantity }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-gray-800">{{ variantLabel(item.product_variant_id) }}</p>
                    @if (optionLabels(item)) {
                      <p class="text-xs text-gray-400">{{ optionLabels(item) }}</p>
                    }
                    @if (item.notes) {
                      <p class="text-xs text-amber-600 italic">“{{ item.notes }}”</p>
                    }
                    <!-- FR-004: con adicionales por línea, el monto se muestra para que
                         "unitario × cantidad" no parezca contradecir el importe. -->
                    @if (muestraImportes() && item.estado_cocina !== 'anulado' && tieneAdicionales(item)) {
                      <p class="text-xs text-gray-400">Adicionales: {{ item.addons_total | money }}</p>
                    }
                  </div>
                  <!-- FR-019a (research.md D9): el ítem anulado conserva su línea visible y
                       lleva el distintivo EN LUGAR del importe. No se pinta un importe
                       tachado: un número tachado sigue leyéndose como dinero al ojear la
                       columna, y ensucia la suma a mano que SC-007 pide verificar. -->
                  <div class="text-right shrink-0">
                    @if (item.estado_cocina === 'anulado') {
                      <span
                        class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                        [class]="kitchenClass('anulado')"
                      >{{ kitchenLabel('anulado') }}</span>
                    } @else if (muestraImportes()) {
                      <p class="text-xs text-gray-400">{{ item.unit_price | money }} c/u</p>
                      <p class="text-sm font-semibold text-gray-900 tabular-nums">
                        {{ importeDeLinea(item) | money }}
                      </p>
                    }
                  </div>
                </div>
              } @empty {
                <p class="text-sm text-gray-400">Sin ítems</p>
              }
            </div>
          </div>

          <!-- FR-024b: el desglose llega ya resuelto del servidor. Si no viene
               (backend anterior al despliegue), el bloque entero no se renderiza
               y tampoco los importes por línea: la ausencia de dato es
               "no mostrar", nunca cero (research.md D15). -->
          @if (order()!.billing; as billing) {
            <div class="px-5 py-4 border-t border-gray-100 space-y-2">
              <app-bill-summary
                [subtotal]="numero(billing.subtotal)"
                [discount]="numero(billing.discount)"
                [discountLabel]="billing.discount_label ?? 'Descuento'"
                [deliveryFee]="numero(billing.delivery_fee)"
                [total]="numero(billing.total)"
                size="md"
              />

              @if (billing.state === 'factura_agrupada') {
                <p class="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{{ avisoCuentaUnificada }}</p>
              } @else if (billing.state === 'sin_factura' && order()!.status !== 'cancelada') {
                <p class="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{{ avisoPedidoSinCobrar }}</p>
              }
              @if (billing.sin_detalle_de_precios) {
                <p class="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{{ avisoSinDetalleDePrecios }}</p>
              }
            </div>
          }

          <!-- FR-015 (research.md D14): el bloque depende del TIPO de pedido, no de
               que los campos estén llenos. Un domicilio sin ningún dato muestra el
               bloque con el botón deshabilitado, que es más honesto que esconder
               que el pedido es un domicilio. -->
          @if (order()!.order_type === 'DELIVERY') {
            <div
              data-testid="datos-de-entrega"
              class="px-5 py-4 border-t border-gray-100"
            >
              <div class="flex items-center justify-between gap-3 mb-3">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos de entrega</p>
                <button
                  type="button"
                  data-testid="copiar-datos"
                  [disabled]="camposDeEntrega().length === 0"
                  (click)="copiarDatosDeEntrega()"
                  class="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <app-mi-icon name="content_copy" [size]="15" />
                  Copiar datos
                </button>
              </div>
              <!-- Un campo omitido no deja etiqueta huérfana, línea en blanco, guion
                   de relleno ni la palabra "null" (FR-020, RN-003): el filtrado lo
                   hace camposDeEntrega(), no la plantilla. -->
              <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                @for (campo of camposDeEntrega(); track campo.etiqueta) {
                  <div data-testid="campo-entrega">
                    <p class="text-xs text-gray-400">{{ campo.etiqueta }}</p>
                    <p class="font-medium text-gray-800 break-words">{{ campo.valor }}</p>
                  </div>
                }
              </div>
            </div>
          }
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
  // spec 094 (US2): el servicio de notificaciones ya existente, el mismo que usa
  // el copiado del checkout del comensal (research.md D11).
  private readonly toast = inject(ToastService);

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

  readonly avisoCuentaUnificada = AVISO_CUENTA_UNIFICADA;
  readonly avisoPedidoSinCobrar = AVISO_PEDIDO_SIN_COBRAR;
  readonly avisoSinDetalleDePrecios = AVISO_SIN_DETALLE_DE_PRECIOS;

  /**
   * spec 094 (FR-012, research.md D13): la mesa cuando hay mesa, el tipo de
   * pedido cuando no la hay. La palabra "Mostrador", que aparecía para todo
   * pedido sin mesa, desaparece: era el problema 3 de la spec.
   *
   * Se pregunta por `dining_table_id` y **no** por `order_type === 'DINE_IN'`
   * porque hay pedidos históricos con mesa y `order_type` nulo (la columna
   * nació nulable y sin relleno retroactivo): preguntar por el tipo los
   * mandaría a "Sin especificar" teniendo la mesa delante.
   */
  encabezado(): string {
    const o = this.order();
    if (!o?.dining_table_id) return orderTypeLabel(o?.order_type);
    const t = this.tableService.tables().find((x) => x.id === o.dining_table_id);
    return t ? (t.name ? `Mesa ${t.number} · ${t.name}` : `Mesa ${t.number}`) : 'Mesa';
  }

  /** El rótulo de encima del encabezado, con el mismo criterio que `encabezado()`. */
  rotuloEncabezado(): string {
    return this.order()?.dining_table_id ? 'Mesa' : 'Tipo de pedido';
  }

  /**
   * ¿Se pintan los importes por línea? Solo cuando el servidor mandó el
   * desglose (research.md D15): sin `billing` no se calcula nada en su lugar
   * ni se rellena con ceros.
   */
  muestraImportes(): boolean {
    const billing = this.order()?.billing;
    // Sin `billing` no se pinta nada (D15); con `sin_detalle_de_precios` los
    // importes por línea **se omiten** —no se pintan en "$ 0"— y el resumen
    // sigue visible con su Total, acompañado del aviso de FR-018. Un "$ 0" por
    // línea donde el dato falta es exactamente el valor inventado que RN-005
    // prohíbe.
    return !!billing && !billing.sin_detalle_de_precios;
  }

  /**
   * Importe de la línea, **sin descuento** (FR-002, FR-003).
   *
   * Reusa `lineTotalGross`, el auxiliar que ya existe: lee `line_total` del
   * backend y cae a `unit_price × quantity + addons_total` contra una respuesta
   * anterior. No se escribe ningún cálculo de importe nuevo (decisión de
   * diseño 1 de la spec), y **nunca** se leen `discounted_unit_price` ni
   * `discounted_line_total`: el descuento vive solo en la fila del resumen (Q5).
   */
  importeDeLinea(item: DiningOrderItem): number {
    return lineTotalGross(item);
  }

  tieneAdicionales(item: DiningOrderItem): boolean {
    return Number(item.addons_total ?? 0) > 0;
  }

  /**
   * Convierte el importe que el servidor publica como `string` al `number` que
   * espera `BillSummaryComponent` — la convención ya establecida en el resto de
   * las superficies de cobro. No es aritmética: el componente **no calcula
   * nada**, los cuatro importes llegan resueltos y el condicionado de las filas
   * de descuento y envío ya lo hace él (FR-006, FR-007, FR-024b, D10).
   */
  numero(valor: string): number {
    return Number(valor);
  }

  /**
   * spec 094 (US2, research.md D12): los campos de entrega diligenciados, en el
   * orden que fija la spec — Cliente, Teléfono, Dirección, Notas.
   *
   * Es **una sola** función para la tarjeta visible y para el texto copiado, de
   * modo que no puedan divergir: un campo que se ve es un campo que se copia, y
   * al revés. Los vacíos —nulos, cadena vacía o solo espacios— no producen ni
   * fila ni línea (FR-020, RN-003).
   *
   * El origen de cada campo lo fija Q1. `notes` sirve a dos propósitos (nota de
   * cocina y referencias de entrega): es una consecuencia aceptada de esa
   * decisión, anotada como limitación y no como deuda silenciosa.
   */
  camposDeEntrega(): { etiqueta: string; valor: string }[] {
    const o = this.order();
    if (!o) return [];
    const candidatos: [string, string | null | undefined][] = [
      ['Cliente', o.customer_name],
      ['Teléfono', o.delivery_phone],
      ['Dirección', o.delivery_address],
      ['Notas', o.notes],
    ];
    return candidatos
      .filter(([, valor]) => !!valor?.trim())
      .map(([etiqueta, valor]) => ({ etiqueta, valor: valor!.trim() }));
  }

  /**
   * Deja los datos de entrega en el portapapeles como texto plano listo para
   * pegar en el chat del mensajero (FR-016, FR-017).
   *
   * Mismo patrón ya probado en producción en
   * `tables/pages/checkout/transfer-details-step.component.ts:407-416`. **No** se
   * extrae a un helper compartido: sería una refactorización que no pide
   * ninguna historia, sobre dos únicos llamadores, donde la parte compartible
   * son cinco líneas y la no compartible son justo los textos que FR-017 fija
   * (Principio V, research.md D11).
   *
   * El `catch` cubre el Edge Case del portapapeles no disponible (la app abierta
   * por `http://` en LAN, que no es un contexto seguro): avisa, no lanza al
   * llamador, y el bloque sigue renderizado con sus datos seleccionables a mano.
   */
  async copiarDatosDeEntrega(): Promise<void> {
    const texto = this.camposDeEntrega()
      .map(({ etiqueta, valor }) => `${etiqueta}: ${valor}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      this.toast.success(TOAST_DATOS_COPIADOS);
    } catch {
      this.toast.error(TOAST_FALLO_AL_COPIAR);
    }
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
  // spec 094 (D9): el distintivo del ítem anulado reusa la etiqueta y el color
  // que ya usan el KDS y la terminal de mesas, en vez de inventar una nueva.
  kitchenLabel = kitchenStatusLabel;
  kitchenClass = kitchenStatusClass;
}
