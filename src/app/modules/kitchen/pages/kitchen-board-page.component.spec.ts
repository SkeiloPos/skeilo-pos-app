import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { vi } from 'vitest';
import { KitchenBoardPageComponent } from './kitchen-board-page.component';
import { KitchenBoardService } from '../services/kitchen-board.service';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { UserRole, type User } from '../../../core/interfaces/user.interface';
import { KitchenBoardResponse, KitchenCard } from '../interfaces/kitchen-board.interface';

function card(id: string, over: Partial<KitchenCard> = {}): KitchenCard {
  return {
    order_id: id,
    table_order_number: 1,
    kitchen_status: 'SIN_PREPARAR',
    version: 0,
    sent_to_kitchen_at: '2026-01-01T10:00:00Z',
    origin: 'mesa',
    table_number: 5,
    customer_name: null,
    delivery_address: null,
    notes: null,
    items: [],
    ...over,
  };
}

function board(over: Partial<KitchenBoardResponse> = {}): KitchenBoardResponse {
  return { sin_preparar: [], en_progreso: [], listo: [], ...over };
}

function user(role: UserRole): User {
  return {
    id: 'u1',
    email: 'a@b.c',
    role,
    tenantId: 1,
    isSuperAdmin: false,
    mustChangePassword: false,
  };
}

class FakeKitchenBoardService {
  getBoard = vi.fn();
  moveCard = vi.fn();
  extractError = vi.fn((_err: unknown, fallback: string) => fallback);
  extractErrorCode = vi.fn(() => null as string | null);
  extractConflictKitchenStatus = vi.fn(() => null as KitchenCard['kitchen_status'] | null);
}

class FakeRealtimeService {
  handlers = new Map<string, Set<(ev: unknown) => void>>();
  on = vi.fn((type: string, fn: (ev: unknown) => void) => {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  });
  emit(type: string, ev: unknown): void {
    for (const fn of this.handlers.get(type) ?? []) fn(ev);
  }
}

function dragDrop(previousId: string, previousData: KitchenCard[], previousIndex = 0): CdkDragDrop<KitchenCard[]> {
  return {
    previousContainer: { id: previousId, data: previousData },
    previousIndex,
  } as unknown as CdkDragDrop<KitchenCard[]>;
}

describe('KitchenBoardPageComponent', () => {
  let fixture: ComponentFixture<KitchenBoardPageComponent>;
  let svc: FakeKitchenBoardService;
  let realtime: FakeRealtimeService;
  let currentUser: ReturnType<typeof signal<User | null>>;

  function setUp(role: UserRole, boardResponse: KitchenBoardResponse = board()): void {
    TestBed.resetTestingModule();
    svc = new FakeKitchenBoardService();
    svc.getBoard.mockResolvedValue(boardResponse);
    realtime = new FakeRealtimeService();
    currentUser = signal<User | null>(user(role));

    TestBed.configureTestingModule({
      imports: [KitchenBoardPageComponent],
      providers: [
        { provide: KitchenBoardService, useValue: svc },
        { provide: AuthService, useValue: { currentUser } },
        { provide: RealtimeService, useValue: realtime },
      ],
    });
    fixture = TestBed.createComponent(KitchenBoardPageComponent);
  }

  it('al montar carga el tablero y pinta las tres columnas fijas', async () => {
    setUp(
      UserRole.ADMIN,
      board({ sin_preparar: [card('o1')], en_progreso: [card('o2')], listo: [] }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sin preparar');
    expect(text).toContain('En progreso');
    expect(text).toContain('Listo');
    expect(fixture.componentInstance.board().SIN_PREPARAR.length).toBe(1);
    expect(fixture.componentInstance.board().EN_PROGRESO.length).toBe(1);
  });

  it('canDrag() es true solo para KITCHEN -- ADMIN/CASHIER no pueden arrastrar (FR-014)', () => {
    setUp(UserRole.ADMIN);
    expect(fixture.componentInstance.canDrag()).toBe(false);

    setUp(UserRole.CASHIER);
    expect(fixture.componentInstance.canDrag()).toBe(false);

    setUp(UserRole.KITCHEN);
    expect(fixture.componentInstance.canDrag()).toBe(true);
  });

  it('mover una tarjeta con éxito la deja en la columna destino con los datos que devuelve el servidor', async () => {
    const c = card('o1', { kitchen_status: 'SIN_PREPARAR', version: 0 });
    setUp(UserRole.KITCHEN, board({ sin_preparar: [c] }));
    fixture.detectChanges();
    await fixture.whenStable();

    const actualizada = { ...c, kitchen_status: 'EN_PROGRESO' as const, version: 1 };
    svc.moveCard.mockResolvedValue(actualizada);

    fixture.componentInstance.drop(dragDrop('SIN_PREPARAR', fixture.componentInstance.board().SIN_PREPARAR), 'EN_PROGRESO');
    await fixture.whenStable();

    expect(svc.moveCard).toHaveBeenCalledWith('o1', 'EN_PROGRESO', 0);
    expect(fixture.componentInstance.board().SIN_PREPARAR).toHaveLength(0);
    expect(fixture.componentInstance.board().EN_PROGRESO).toEqual([actualizada]);
  });

  it('409 NOT_IN_KITCHEN recarga el tablero en vez de devolver la tarjeta a su columna', async () => {
    const c = card('o1');
    setUp(UserRole.KITCHEN, board({ sin_preparar: [c] }));
    fixture.detectChanges();
    await fixture.whenStable();

    svc.moveCard.mockRejectedValue(new Error('409'));
    svc.extractErrorCode.mockReturnValue('NOT_IN_KITCHEN');
    svc.getBoard.mockResolvedValue(board({ sin_preparar: [], en_progreso: [], listo: [] }));

    fixture.componentInstance.drop(dragDrop('SIN_PREPARAR', fixture.componentInstance.board().SIN_PREPARAR), 'EN_PROGRESO');
    await fixture.whenStable();
    await fixture.whenStable();

    expect(svc.getBoard).toHaveBeenCalledTimes(2); // carga inicial + recarga tras el 409
    expect(fixture.componentInstance.board().EN_PROGRESO).toHaveLength(0);
  });

  it('409 KITCHEN_STATUS_CONFLICT devuelve la tarjeta a su columna de origen con el kitchen_status vigente del error (FR-009)', async () => {
    const c = card('o1', { kitchen_status: 'SIN_PREPARAR', version: 0 });
    setUp(UserRole.KITCHEN, board({ sin_preparar: [c] }));
    fixture.detectChanges();
    await fixture.whenStable();

    svc.moveCard.mockRejectedValue(new Error('409'));
    svc.extractErrorCode.mockReturnValue('KITCHEN_STATUS_CONFLICT');
    svc.extractConflictKitchenStatus.mockReturnValue('LISTO');

    fixture.componentInstance.drop(dragDrop('SIN_PREPARAR', fixture.componentInstance.board().SIN_PREPARAR), 'EN_PROGRESO');
    await fixture.whenStable();

    expect(fixture.componentInstance.board().EN_PROGRESO).toHaveLength(0);
    expect(fixture.componentInstance.board().SIN_PREPARAR).toEqual([{ ...c, kitchen_status: 'LISTO' }]);
    expect(fixture.componentInstance.errorMsg()).toBeTruthy();
  });

  it('409 PAYMENT_NOT_PAID y ORDER_NOT_ACTIVE devuelven la tarjeta a su columna de origen sin cambiar su estado', async () => {
    for (const code of ['PAYMENT_NOT_PAID', 'ORDER_NOT_ACTIVE']) {
      const c = card('o1', { kitchen_status: 'SIN_PREPARAR', version: 0 });
      setUp(UserRole.KITCHEN, board({ sin_preparar: [c] }));
      fixture.detectChanges();
      await fixture.whenStable();

      svc.moveCard.mockRejectedValue(new Error('409'));
      svc.extractErrorCode.mockReturnValue(code);
      svc.extractConflictKitchenStatus.mockReturnValue(null);

      fixture.componentInstance.drop(dragDrop('SIN_PREPARAR', fixture.componentInstance.board().SIN_PREPARAR), 'EN_PROGRESO');
      await fixture.whenStable();

      expect(fixture.componentInstance.board().EN_PROGRESO).toHaveLength(0);
      expect(fixture.componentInstance.board().SIN_PREPARAR).toEqual([c]);
    }
  });

  it('un evento realtime order.kitchen_status_changed mueve la tarjeta de columna (FR-015)', async () => {
    const c = card('o1', { kitchen_status: 'SIN_PREPARAR', version: 0 });
    setUp(UserRole.ADMIN, board({ sin_preparar: [c] }));
    fixture.detectChanges();
    await fixture.whenStable();

    realtime.emit('order.kitchen_status_changed', { order_id: 'o1', kitchen_status: 'LISTO', version: 1 });

    expect(fixture.componentInstance.board().SIN_PREPARAR).toHaveLength(0);
    expect(fixture.componentInstance.board().LISTO[0].version).toBe(1);
  });

  it('order.cancelled y order.delivered retiran la tarjeta del tablero (FR-011)', async () => {
    setUp(UserRole.ADMIN, board({ sin_preparar: [card('o1')], en_progreso: [card('o2')] }));
    fixture.detectChanges();
    await fixture.whenStable();

    realtime.emit('order.cancelled', { order_id: 'o1' });
    realtime.emit('order.delivered', { order_id: 'o2' });

    expect(fixture.componentInstance.board().SIN_PREPARAR).toHaveLength(0);
    expect(fixture.componentInstance.board().EN_PROGRESO).toHaveLength(0);
  });
});
