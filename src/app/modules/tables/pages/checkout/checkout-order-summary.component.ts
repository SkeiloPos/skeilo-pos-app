import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CartLine } from '../../services/dining-cart.service';
import { IconComponent } from '../../../../shared/icon/icon.component';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { formatProductCount } from './checkout-product-count';

/**
 * spec 092 (FR-008) — a partir de cuántas **líneas** el resumen llega contraído.
 *
 * Es una decisión de **producto**, no un cálculo de altura (spec → *Assumptions*),
 * así que vive con nombre y en un único punto de cambio: ajustarlo es un cambio
 * de una línea con su test al lado, no una búsqueda por el repo. Los tests de
 * frontera la importan en vez de repetir el literal (research.md D8).
 *
 * El umbral se mide en **líneas**; el conteo que se le muestra al comensal se
 * mide en **unidades**. Son dos medidas distintas a propósito.
 */
export const UMBRAL_EXPANDIDO_POR_DEFECTO = 3;

/**
 * spec 092 — resumen del pedido del checkout del comensal: el **artefacto único**
 * que FR-021 comparte entre el paso de revisión (paso 1) y el paso de datos de
 * pago (paso 3), para que los dos no puedan divergir (RN-004).
 *
 * **Puramente presentacional y sin salidas, a propósito.** No inyecta
 * `DiningCartService` ni `Router`, no hace peticiones y no declara ningún
 * `@Output`. Eso no es una omisión: es lo que hace que **FR-010** (expandir o
 * contraer MUST NOT modificar el pedido ni disparar carga, envío o cobro) no se
 * pueda violar desde aquí ni por accidente ni por un cambio futuro descuidado.
 * Añadirle una salida es un cambio de alcance que necesita su propio spec.
 *
 * El colapsable es `<details>`/`<summary>` **nativo** (research.md D1): el
 * `<summary>` ya es focusable, ya responde a Enter y Espacio, y el navegador ya
 * expone su estado a la tecnología asistiva, así que FR-011 se cumple sin
 * escribir `tabindex`, `role`, `aria-expanded` ni `keydown` — y por lo tanto sin
 * poder escribirlos mal.
 */
@Component({
  selector: 'app-checkout-order-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, IconComponent, MoneyPipe],
  template: `
    @if (collapsible) {
      <!-- La clase group habilita la variante group-open: del chevron.
           El atributo open se enlaza a un campo CONGELADO, nunca a una
           expresión viva: si cambiara de valor, Angular reescribiría el
           atributo y cerraría de golpe el panel que el comensal acaba de abrir
           (research.md D2, FR-009). -->
      <details
        class="group bg-white rounded-2xl border border-gray-100 shadow-sm"
        [attr.open]="initiallyOpen ? '' : null"
      >
        <summary
          class="flex items-center justify-between gap-2 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        >
          <span class="text-sm font-semibold text-gray-700">Resumen del pedido</span>
          <span class="flex items-center gap-2 shrink-0">
            <!-- FR-006: el mismo número y la misma palabra que el bloque de
                 total del paso 3, porque los dos salen de formatProductCount. -->
            <span data-testid="summary-count" class="text-xs text-gray-400">{{ countLabel }}</span>
            <span class="w-4 h-4 block text-gray-400 transition-transform group-open:rotate-180">
              <app-icon name="chevron-down" />
            </span>
          </span>
        </summary>
        <div class="px-4 pb-4 space-y-2">
          <ng-container [ngTemplateOutlet]="contenido"></ng-container>
        </div>
      </details>
    } @else {
      <!-- FR-022: el paso de revisión lo muestra plano, sin <details>, sin
           <summary>, sin chevron y sin control de colapso. -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
        <ng-container [ngTemplateOutlet]="contenido"></ng-container>
      </div>
    }

    <!-- UN SOLO markup de la lista y los totales, usado desde las dos ramas
         (research.md D4). Duplicarlo aquí adentro reintroduciría, un nivel más
         abajo, la misma divergencia que FR-021 vino a eliminar: alguien
         corregiría el formato en una rama y no en la otra. -->
    <ng-template #contenido>
      @for (line of lines; track line.id) {
        <div class="flex items-start justify-between gap-2 text-sm">
          <!-- min-w-0 + truncate: los textos largos se recortan en vez de
               ensanchar la caja, desde 320 px (FR-019, SC-009). -->
          <div class="min-w-0">
            <p class="text-gray-800 truncate">
              <span class="font-medium">{{ line.quantity }}×</span>
              {{ line.productName }} · {{ line.variantName }}
            </p>
            @if (line.optionNames.length > 0) {
              <p class="text-xs text-gray-400 truncate">{{ line.optionNames.join(', ') }}</p>
            }
            @if (line.notes) {
              <p class="text-xs text-gray-400 italic truncate">"{{ line.notes }}"</p>
            }
          </div>
          <span class="text-gray-700 font-medium shrink-0">{{ line.lineTotal | money }}</span>
        </div>
      }
      <div class="border-t border-gray-100 pt-3 mt-1 space-y-1">
        <!-- FR-012: la fila "Ahorro" si y solo si hay descuento vigente. Nunca
             en cero, nunca vacía. El input showSavings es la válvula de
             research.md D6. -->
        @if (showSavings && savings > 0) {
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-500">Ahorro</span>
            <span class="text-sm font-medium text-emerald-600">{{ savings | money }}</span>
          </div>
        }
        <div class="flex justify-between items-center">
          <span class="text-sm font-semibold text-gray-700">Total</span>
          <span class="text-base font-bold text-gray-900">{{ total | money }}</span>
        </div>
      </div>
      <!-- Ninguna fila de impuestos ni de subtotal, en ningún modo y bajo
           ninguna condición: el sistema no los calcula, y una fila derivada o en
           cero sería información falsa frente al comensal (FR-013, RN-003). -->
    </ng-template>
  `,
})
export class CheckoutOrderSummaryComponent implements OnInit {
  /** FR-005, FR-007 — las líneas a listar, **en el orden en que llegan**. */
  @Input({ required: true }) lines!: CartLine[];
  /** FR-004, FR-014 — total vigente, ya con el descuento aplicado. */
  @Input({ required: true }) total!: number;
  /** FR-003, FR-006 — unidades totales del pedido, no líneas. */
  @Input({ required: true }) count!: number;
  /** FR-012 — `0` significa "sin promoción": la fila "Ahorro" no se pinta. */
  @Input() savings = 0;
  /** FR-008, FR-022 — `true` solo en el paso de datos de pago. */
  @Input() collapsible = false;
  /** Válvula de escape de research.md D6, hoy en `true` por decisión de negocio. */
  @Input() showSavings = true;

  /**
   * Estado inicial del `<details>`, **congelado** en `ngOnInit` (research.md D2).
   *
   * Es un campo plano y no un `computed` a propósito: el elemento es *no
   * controlado* —el comensal lo abre y lo cierra sin pasar por Angular—, así que
   * el valor enlazado tiene que ser literalmente constante durante toda la vida
   * del componente. `ngOnInit` corre antes de que se evalúen las expresiones de
   * la plantilla, así que no hay un primer render con el valor equivocado.
   */
  initiallyOpen = false;

  /**
   * FR-006 — la cadena del conteo, de la **única** composición del checkout.
   *
   * Es un getter y no un `computed` porque los inputs son decoradores, no
   * señales (convención del repo: ninguno de sus componentes con entradas usa
   * inputs de señal).
   */
  get countLabel(): string {
    return formatProductCount(this.count);
  }

  ngOnInit(): void {
    this.initiallyOpen = this.lines.length <= UMBRAL_EXPANDIDO_POR_DEFECTO;
  }
}
