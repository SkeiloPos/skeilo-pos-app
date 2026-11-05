import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { KitchenCard } from '../interfaces/kitchen-board.interface';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

const ORIGIN_ICON: Record<KitchenCard['origin'], string> = {
  mesa: 'table_restaurant',
  caja: 'shopping_bag',
  domicilio: 'delivery_dining',
};

const ORIGIN_LABEL: Record<KitchenCard['origin'], string> = {
  mesa: 'Mesa',
  caja: 'Mostrador',
  domicilio: 'Domicilio',
};

/**
 * Tarjeta del tablero de cocina (spec 151, Historia 3, FR-012): número de
 * orden, origen, cliente/mesa, productos con cantidades y adiciones, notas y
 * tiempo transcurrido desde `sent_to_kitchen_at`. El asa de arrastre
 * (`draggable`) la controla el padre -- `false` para ADMIN/CASHIER (FR-014).
 */
@Component({
  selector: 'app-kitchen-card',
  standalone: true,
  imports: [IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <app-mi-icon [name]="originIcon()" [size]="28" />
          <span>{{ originLabel() }}</span>
          @if (card().table_number !== null) {
            <span class="text-gray-500 font-normal">#{{ card().table_number }}</span>
          }
        </div>
        @if (draggable()) {
          <app-mi-icon name="drag-handle" [size]="26" ariaLabel="Arrastrar" />
        }
      </div>

      @if (card().table_order_number !== null) {
        <div class="text-lg text-gray-500">Orden #{{ card().table_order_number }}</div>
      }

      @if (card().customer_name) {
        <div class="text-lg text-gray-700">{{ card().customer_name }}</div>
      }
      @if (card().delivery_address) {
        <div class="text-lg text-gray-500">{{ card().delivery_address }}</div>
      }

      <ul class="space-y-2.5">
        @for (item of card().items; track item.product_name + item.quantity) {
          <li class="text-2xl text-gray-800 leading-snug">
            <span class="font-bold">{{ item.quantity }}×</span> {{ item.product_name }}
            @if (item.addons.length) {
              <div class="text-lg text-gray-500 pl-5">
                @for (addon of item.addons; track addon.name) {
                  <div>+ {{ addon.quantity }} {{ addon.name }}</div>
                }
              </div>
            }
            @if (item.notes) {
              <div class="text-lg text-amber-700 pl-5">"{{ item.notes }}"</div>
            }
          </li>
        }
      </ul>

      @if (card().notes) {
        <div class="text-lg text-amber-700 bg-amber-50 rounded px-3 py-1.5">{{ card().notes }}</div>
      }

      <div class="text-lg text-gray-400 pt-2 border-t border-gray-100">{{ elapsedLabel() }}</div>
    </div>
  `,
})
export class KitchenCardComponent implements OnInit {
  readonly card = input.required<KitchenCard>();
  readonly draggable = input<boolean>(false);

  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(Date.now());

  readonly originIcon = () => ORIGIN_ICON[this.card().origin];
  readonly originLabel = () => ORIGIN_LABEL[this.card().origin];

  readonly elapsedLabel = () => formatElapsed(this.now() - new Date(this.card().sent_to_kitchen_at).getTime());

  ngOnInit(): void {
    const handle = setInterval(() => this.now.set(Date.now()), 15_000);
    this.destroyRef.onDestroy(() => clearInterval(handle));
  }
}

function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes} min`;
}
