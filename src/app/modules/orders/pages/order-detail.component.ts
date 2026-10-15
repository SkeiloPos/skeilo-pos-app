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
  orderDisplayCode,
  orderStatusClass,
  orderStatusLabel,
  orderTypeLabel,
} from '../order-status.util';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { MoneyPipe } from '../../../shared/money.pipe';
import { ToastService } from '../../../shared/feedback/toast.service';
import { To12HourTimePipe } from '../pipes/to-12-hour-time.pipe';

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
  imports: [RouterLink, TenantDatePipe, IconMiComponent, MoneyPipe, To12HourTimePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <a
          routerLink="/dashboard/orders"
          [queryParams]="backQueryParams()"
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
          <a routerLink="/dashboard/orders" [queryParams]="backQueryParams()" class="mt-3 inline-block text-sm text-indigo-600 hover:underline">
            Volver a la lista
          </a>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-bold text-indigo-600 uppercase tracking-wide">Detalle de orden</p>
              <p class="text-base font-bold text-gray-900 truncate">Orden {{ code() }}</p>
              <p class="text-xs text-gray-400 mt-0.5">Canal: {{ order()!.channel }}</p>
            </div>
            <span class="text-sm px-3 py-1.5 rounded-full font-semibold shrink-0" [class]="statusClass(displayStatus(order()!))">
              {{ statusLabel(displayStatus(order()!)) }}
            </span>
          </div>

          <!-- Spec 120 (FR-012): información agrupada por bloques. El bloque
               "Información de la orden" reutiliza el rótulo/valor de spec 094
               (Mesa | Tipo de pedido) tal cual -- no reintroduce "Mostrador",
               que esa misma spec retiró por confuso (research.md D13). -->
          <div class="px-5 py-4 grid gap-5 border-b border-gray-100 text-sm" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Información de la orden</p>
              <div class="space-y-1.5">
                <div>
                  <p class="text-xs text-gray-400">{{ rotuloEncabezado() }}</p>
                  <p class="font-medium text-gray-800">{{ encabezado() }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Hora</p>
                  <p class="font-medium text-gray-800">{{ order()!.created_at | tenantDate: 'HH:mm' | to12HourTime }}</p>
                </div>
              </div>
            </div>

            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Información del cliente</p>
              <div class="space-y-1.5">
                <div>
                  <!-- spec 094 (FR-013, US4): "Comensal" solo era correcto en mesa; el
                       mismo nombre aparece en pedidos para llevar y a domicilio. -->
                  <p class="text-xs text-gray-400">Cliente</p>
                  <!-- spec 087 (FR-004, A-88): destacado -- "Cliente sin nombre"
                       solo para pedidos históricos anteriores a esta spec
                       (customer_name nulo/vacío), nunca migrados. -->
                  <p class="font-bold text-[15px] text-gray-900">{{ order()!.customer_name?.trim() || 'Cliente sin nombre' }}</p>
                </div>
                @if (clientIdentification(); as id) {
                  <div>
                    <p class="text-xs text-gray-400">Identificación</p>
                    <p class="font-medium text-gray-800">{{ id }}</p>
                  </div>
                }
              </div>
            </div>

            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Información de factura</p>
              <div class="space-y-1.5">
                <div>
                  <p class="text-xs text-gray-400">Referencia</p>
                  <p class="font-medium text-indigo-600">{{ invoiceReference() }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-400">Fecha</p>
                  <p class="font-medium text-gray-800">
                    {{ order()!.created_at | tenantDate: 'dd/MM/yyyy' }} · {{ order()!.created_at | tenantDate: 'HH:mm' | to12HourTime }}
                  </p>
                </div>
                @if (paymentMethod(); as metodo) {
                  <div>
                    <p class="text-xs text-gray-400">Método de pago</p>
                    <p class="font-medium text-gray-800">{{ metodo }}</p>
                  </div>
                }
                <div>
                  <p class="text-xs text-gray-400">Estado de pago</p>
                  <span
                    class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                    [class]="order()!.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'"
                  >{{ paymentStatusLabel() }}</span>
                </div>
              </div>
            </div>
          </div>

          @if (order()!.notes) {
            <div class="px-5 py-3 border-b border-gray-100">
              <p class="text-xs text-gray-400">Notas</p>
              <p class="text-sm text-gray-700 italic">“{{ order()!.notes }}”</p>
            </div>
          }

          <div class="px-5 py-4">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumen de la orden</p>
            <!-- spec 120 (FR-014, diseño original "RESUMEN DE LA ORDEN" en
                 SkeiloPOS App.dc.html): tabla real de 4 columnas (Producto,
                 Cantidad, Precio unit., Subtotal), fiel al diseño -- la
                 cantidad es su propia columna, no un sello junto al nombre. -->
            <div class="border border-gray-100 rounded-xl overflow-x-auto">
              <table class="w-full border-collapse" style="min-width:480px">
                <thead>
                  <tr>
                    <th scope="col" class="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">Producto</th>
                    <th scope="col" class="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">Cantidad</th>
                    <th scope="col" class="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">Precio unit.</th>
                    <th scope="col" class="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of order()!.items ?? []; track item.id) {
                    <tr data-testid="item-row" class="border-t border-gray-100">
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                          <span class="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
                            <app-mi-icon name="restaurant" [size]="18" />
                          </span>
                          <div class="min-w-0">
                            <p class="text-sm font-semibold text-gray-900">{{ variantLabel(item.product_variant_id) }}</p>
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
                        </div>
                      </td>
                      <td class="px-4 py-3 text-right tabular-nums text-sm text-gray-700">{{ item.quantity }}</td>
                      <!-- FR-019a (research.md D9): el ítem anulado conserva su línea visible y
                           lleva el distintivo EN LUGAR del importe. No se pinta un importe
                           tachado: un número tachado sigue leyéndose como dinero al ojear la
                           columna, y ensucia la suma a mano que SC-007 pide verificar. -->
                      @if (item.estado_cocina === 'anulado') {
                        <td class="px-4 py-3 text-right" colspan="2">
                          <span
                            class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                            [class]="kitchenClass('anulado')"
                          >{{ kitchenLabel('anulado') }}</span>
                        </td>
                      } @else if (muestraImportes()) {
                        <td class="px-4 py-3 text-right tabular-nums text-sm text-gray-600">{{ item.unit_price | money }}</td>
                        <td class="px-4 py-3 text-right tabular-nums text-sm font-semibold text-gray-900">{{ importeDeLinea(item) | money }}</td>
                      } @else {
                        <td class="px-4 py-3" colspan="2"></td>
                      }
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="px-4 py-6 text-sm text-gray-400 text-center">Sin ítems</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- FR-024b: el desglose llega ya resuelto del servidor. Si no viene
               (backend anterior al despliegue), el bloque entero no se renderiza
               y tampoco los importes por línea: la ausencia de dato es
               "no mostrar", nunca cero (research.md D15). -->
          @if (order()!.billing; as billing) {
            <div class="px-5 py-4 border-t border-gray-100 space-y-3">
              <!-- spec 120 (FR-015, corrección post-captura): caja propia del
                   diseño original ("det.sums" en SkeiloPOS App.dc.html) --
                   filas del mismo tamaño con separadores, fila Total resaltada
                   y fila Pagado, que app-bill-summary (pensado para las
                   pantallas de cobro, con un Total en letra gigante y sin fila
                   de pagado) no reproduce. RN-004 se conserva tal cual: Domicilio
                   y Descuento solo aparecen si son mayores a $0. -->
              <div class="flex justify-end">
                <div data-testid="totales" class="w-full sm:w-[340px] border border-gray-100 rounded-xl overflow-hidden">
                  <div class="flex justify-between items-center gap-3 px-4 py-3 text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span class="font-semibold text-gray-900 tabular-nums">{{ numero(billing.subtotal) | money }}</span>
                  </div>
                  @if (numero(billing.delivery_fee) > 0) {
                    <div class="flex justify-between items-center gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                      <span>Domicilio</span>
                      <span class="font-semibold text-gray-900 tabular-nums">{{ numero(billing.delivery_fee) | money }}</span>
                    </div>
                  }
                  @if (numero(billing.discount) > 0) {
                    <div class="flex justify-between items-center gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                      <span>{{ billing.discount_label ?? 'Descuento' }}</span>
                      <span class="font-semibold text-gray-900 tabular-nums">− {{ numero(billing.discount) | money }}</span>
                    </div>
                  }
                  <!-- Corrección: el diseño original (support.js de SkeiloPOS
                       App.dc.html, función row()) resalta "Total" con
                       var(--color-surface-soft) y peso 700 -- un fondo suave
                       del propio tema, no una banda negra fija. bg-gray-50
                       ya es el alias de ese mismo "surface-soft" en este panel
                       (claro y oscuro), así que el texto sigue el color normal
                       de la fila, nunca blanco fijo. -->
                  <div class="flex justify-between items-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50 font-bold text-gray-900">
                    <span>Total</span>
                    <span class="tabular-nums">{{ numero(billing.total) | money }}</span>
                  </div>
                  @if (montoPagado(); as pagado) {
                    <div class="flex justify-between items-center gap-3 px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                      <span>Pagado</span>
                      <span class="font-semibold text-gray-900 tabular-nums">{{ pagado | money }}</span>
                    </div>
                  }
                </div>
              </div>

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

  /** spec 120, data-model.md "Código corto de orden": identificador interno,
   *  usado como título del encabezado y como respaldo de "Referencia" de
   *  factura mientras la orden no tenga una factura real todavía. */
  code(): string {
    const o = this.order();
    return o ? orderDisplayCode(o) : '';
  }

  /** spec 120 (corrección FR-012): la factura real (`invoice_reference`,
   *  resuelta en `GET /orders/{id}` contra la `Sale`/`Invoice` de la orden —
   *  ver `service.invoice_and_payment_info` en pos-backend) cuando ya existe;
   *  si la orden aún no se ha cobrado, usa el código interno como respaldo en
   *  vez de dejar la fila vacía. Reportado por el negocio: mostrar siempre el
   *  código interno aquí no coincidía con la factura registrada en el sistema. */
  invoiceReference(): string {
    return this.order()?.invoice_reference || this.code();
  }

  /** spec 120 (FR-012): el modelo de pedido no captura todavía una identificación
   *  de cliente (NIT/cédula) — la fila se omite siempre (FR-016) hasta que un
   *  spec futuro agregue ese dato (Principio VIII: sin cambios de esquema aquí). */
  clientIdentification(): string | null {
    return null;
  }

  /** spec 120 (corrección FR-012, FR-016): `payment_method_name` viene resuelto
   *  del pago real de la venta (`Sale.payments`), no de `current_payment_attempt`
   *  -- los pedidos cobrados por mostrador nunca crean un intento de pago, así
   *  que esa fuente quedaba permanentemente vacía aunque la orden sí tuviera un
   *  método de pago real. Se conserva `current_payment_attempt` como respaldo
   *  por si un backend más antiguo todavía no publica el campo nuevo. */
  paymentMethod(): string | null {
    const o = this.order();
    if (!o?.paid) return null;
    return o.payment_method_name ?? o.current_payment_attempt?.payment_method_name ?? null;
  }

  paymentStatusLabel(): string {
    return this.order()?.paid ? 'Pagado' : 'Pendiente';
  }

  /** spec 120 (FR-011): "Volver a órdenes" conserva los filtros con los que se
   *  navegó hasta aquí -- los mismos query params que trajo la ruta. */
  backQueryParams(): Record<string, unknown> {
    return this.route.snapshot.queryParams ?? {};
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
   * Convierte el importe que el servidor publica como `string` al `number`
   * que pide la plantilla — la convención ya establecida en el resto de las
   * superficies de cobro. No es aritmética: los importes llegan ya resueltos
   * del servidor (FR-006, FR-007, FR-024b, D10).
   */
  numero(valor: string): number {
    return Number(valor);
  }

  /**
   * spec 120 (FR-015, corrección post-captura): "monto pagado" de la fila
   * Pagado del desglose, del diseño original. `OrderBilling` no trae un campo
   * de abono/pago parcial -- cuando la orden ya está pagada (`paid`, misma
   * señal que ya usa el badge de estado de pago), lo pagado es exactamente su
   * total (el mismo importe que ya pinta la fila Total, no uno calculado
   * aparte). Si no se ha cobrado todavía, la fila se omite (FR-016) en vez de
   * inventar un $0.
   */
  montoPagado(): number | null {
    const o = this.order();
    if (!o?.paid || !o.billing) return null;
    return this.numero(o.billing.total);
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
