import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { KitchenBoardService } from '../services/kitchen-board.service';
import { KitchenCard, KitchenStatus } from '../interfaces/kitchen-board.interface';
import { KitchenCardComponent } from '../components/kitchen-card.component';

interface Column {
  readonly status: KitchenStatus;
  readonly label: string;
}

const COLUMNS: Column[] = [
  { status: 'SIN_PREPARAR', label: 'Sin preparar' },
  { status: 'EN_PROGRESO', label: 'En progreso' },
  { status: 'LISTO', label: 'Listo' },
];

type Board = Record<KitchenStatus, KitchenCard[]>;

function emptyBoard(): Board {
  return { SIN_PREPARAR: [], EN_PROGRESO: [], LISTO: [] };
}

/** Orden FIFO (FR-003): ascendente por `sent_to_kitchen_at`, desempate por `order_id`. */
function compareCards(a: KitchenCard, b: KitchenCard): number {
  const diff = new Date(a.sent_to_kitchen_at).getTime() - new Date(b.sent_to_kitchen_at).getTime();
  if (diff !== 0) return diff;
  return a.order_id.localeCompare(b.order_id);
}

/**
 * Tablero de cocina en tres columnas fijas (spec 151, Historias 1/2/4):
 * lectura FIFO, movimiento entre columnas (gateado por rol en el backend) y
 * retiro/actualización en tiempo real vía `CH_STAFF` (reutilizado, sin
 * stream nuevo -- research.md Decisión 0).
 */
@Component({
  selector: 'app-kitchen-board-page',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, KitchenCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Cocina</h1>
          <p class="text-gray-500 text-sm mt-1">Pedidos enviados a cocina, en orden de llegada.</p>
        </div>
        <button
          (click)="loadBoard()"
          class="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700 shadow-sm transition-all"
        >
          Actualizar
        </button>
      </div>

      @if (errorMsg()) {
        <div class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
          {{ errorMsg() }}
        </div>
      }

      <div cdkDropListGroup class="grid gap-4" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
        @for (col of columns; track col.status) {
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-2 min-h-[200px]">
            <h2 class="text-lg font-semibold text-gray-700 uppercase">
              {{ col.label }}
              <span class="text-gray-400 font-normal">({{ board()[col.status].length }})</span>
            </h2>
            <div
              cdkDropList
              [id]="col.status"
              [cdkDropListData]="board()[col.status]"
              [cdkDropListSortingDisabled]="true"
              (cdkDropListDropped)="drop($event, col.status)"
              class="flex flex-col gap-2 flex-1 min-h-[150px]"
            >
              @for (card of board()[col.status]; track card.order_id) {
                <div cdkDrag [cdkDragDisabled]="!canDrag()" [cdkDragData]="card">
                  <app-kitchen-card [card]="card" [draggable]="canDrag()" />
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class KitchenBoardPageComponent implements OnInit {
  readonly columns = COLUMNS;

  private readonly service = inject(KitchenBoardService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly board = signal<Board>(emptyBoard());
  readonly errorMsg = signal<string | null>(null);
  readonly loading = signal(false);

  readonly canDrag = () => this.auth.currentUser()?.role === UserRole.KITCHEN;

  ngOnInit(): void {
    void this.loadBoard();
    this.connectRealtime();
  }

  async loadBoard(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const res = await this.service.getBoard();
      this.board.set({
        SIN_PREPARAR: [...res.sin_preparar],
        EN_PROGRESO: [...res.en_progreso],
        LISTO: [...res.listo],
      });
    } catch (err) {
      this.errorMsg.set(this.service.extractError(err, 'No se pudo cargar el tablero de cocina.'));
    } finally {
      this.loading.set(false);
    }
  }

  drop(event: CdkDragDrop<KitchenCard[]>, targetStatus: KitchenStatus): void {
    const sourceStatus = event.previousContainer.id as KitchenStatus;
    if (sourceStatus === targetStatus) return;
    const card = event.previousContainer.data[event.previousIndex];
    if (!card) return;
    this.moveCardOptimistic(card, sourceStatus, targetStatus);
  }

  private moveCardOptimistic(card: KitchenCard, from: KitchenStatus, to: KitchenStatus): void {
    this.removeFromColumn(from, card.order_id);
    this.insertSorted(to, card);
    void this.persistMove(card, from, to);
  }

  private async persistMove(card: KitchenCard, from: KitchenStatus, to: KitchenStatus): Promise<void> {
    try {
      const updated = await this.service.moveCard(card.order_id, to, card.version);
      this.replaceCard(to, updated);
    } catch (err) {
      const code = this.service.extractErrorCode(err);
      if (code === 'NOT_IN_KITCHEN') {
        // contracts/move-kitchen-status.md: la tarjeta ya no debería existir
        // en el tablero -- se recarga en vez de devolverla a una columna.
        this.errorMsg.set(this.service.extractError(err, 'El pedido ya no está en la cola de cocina.'));
        void this.loadBoard();
        return;
      }
      // Los otros tres 409 (FR-009): la tarjeta vuelve a su columna de
      // origen; `KITCHEN_STATUS_CONFLICT` además trae el `kitchen_status`
      // vigente, que se adopta para que el próximo intento use la versión
      // correcta.
      this.removeFromColumn(to, card.order_id);
      const vigente = this.service.extractConflictKitchenStatus(err);
      this.insertSorted(from, vigente ? { ...card, kitchen_status: vigente } : card);
      this.errorMsg.set(this.service.extractError(err, 'No se pudo mover el pedido.'));
    }
  }

  private connectRealtime(): void {
    const unsubscribers = [
      this.realtime.on('order.sent_to_kitchen', () => void this.loadBoard()),
      this.realtime.on('order.kitchen_status_changed', (ev) => this.onKitchenStatusChanged(ev)),
      this.realtime.on('order.cancelled', (ev) => this.removeOrderEverywhere(ev.order_id)),
      this.realtime.on('order.delivered', (ev) => this.removeOrderEverywhere(ev.order_id)),
      this.realtime.on('resync', () => void this.loadBoard()),
      this.realtime.on('reconnected', () => void this.loadBoard()),
    ];
    this.destroyRef.onDestroy(() => unsubscribers.forEach((off) => off()));
  }

  private onKitchenStatusChanged(ev: { order_id: string; kitchen_status: KitchenStatus; version: number }): void {
    const found = this.findCard(ev.order_id);
    if (!found) return;
    if (found.card.kitchen_status === ev.kitchen_status && found.card.version === ev.version) return;
    this.removeFromColumn(found.status, ev.order_id);
    this.insertSorted(ev.kitchen_status, {
      ...found.card,
      kitchen_status: ev.kitchen_status,
      version: ev.version,
    });
  }

  private removeOrderEverywhere(orderId: string): void {
    for (const col of this.columns) this.removeFromColumn(col.status, orderId);
  }

  private findCard(orderId: string): { card: KitchenCard; status: KitchenStatus } | null {
    for (const col of this.columns) {
      const card = this.board()[col.status].find((c) => c.order_id === orderId);
      if (card) return { card, status: col.status };
    }
    return null;
  }

  private removeFromColumn(status: KitchenStatus, orderId: string): void {
    this.board.update((b) => ({ ...b, [status]: b[status].filter((c) => c.order_id !== orderId) }));
  }

  private insertSorted(status: KitchenStatus, card: KitchenCard): void {
    this.board.update((b) => ({ ...b, [status]: [...b[status], card].sort(compareCards) }));
  }

  private replaceCard(status: KitchenStatus, card: KitchenCard): void {
    this.board.update((b) => ({
      ...b,
      [status]: b[status].map((c) => (c.order_id === card.order_id ? card : c)),
    }));
  }
}
