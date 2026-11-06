import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { ConfirmationStepComponent } from './confirmation-step.component';
import { CheckoutProgressStore } from './checkout-progress.store';
import { DinerService } from '../../services/diner.service';
import { DiningCartService } from '../../services/dining-cart.service';
import { DiningOrder } from '../../interfaces/dining.interface';

/**
 * spec 154 (FR-007/FR-008/FR-009): las seis combinaciones modalidad × método
 * de pago + el caso sin instrucción (`qr_payment_instruction_mode: null`).
 * No existía spec dedicado para este componente antes de esta spec.
 */
function buildOrder(overrides: Partial<DiningOrder> = {}): DiningOrder {
  return {
    id: 'o1',
    channel: 'QR_MENU',
    status: 'pendiente',
    payment_status: 'UNPAID',
    created_at: '2026-11-06T12:00:00Z',
    items: [],
    qr_payment_instruction_mode: 'PAY_AFTER_RECEIVING',
    current_payment_attempt: {
      id: 'pa1',
      status: 'pendiente',
      payment_method_name: 'Efectivo',
      is_cash: true,
      receipt_file_url: null,
      cash_amount: null,
      transfer_amount: null,
      transfer_method_id: null,
      cash_confirmed_at: null,
    },
    ...overrides,
  } as DiningOrder;
}

describe('ConfirmationStepComponent', () => {
  let fixture: ComponentFixture<ConfirmationStepComponent>;
  let activeOrder: ReturnType<typeof signal<DiningOrder | null>>;

  function render(order: DiningOrder | null): void {
    TestBed.resetTestingModule();
    activeOrder = signal<DiningOrder | null>(order);
    const progressStore = { activeOrder } as unknown as CheckoutProgressStore;
    const cart = { isEmpty: computed(() => true) } as unknown as DiningCartService;
    const dinerService = { myOrders: vi.fn(async () => []) } as unknown as DinerService;

    TestBed.configureTestingModule({
      imports: [ConfirmationStepComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'qr-abc' } } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: CheckoutProgressStore, useValue: progressStore },
        { provide: DinerService, useValue: dinerService },
        { provide: DiningCartService, useValue: cart },
      ],
    });
    fixture = TestBed.createComponent(ConfirmationStepComponent);
    fixture.detectChanges();
  }

  function instructionText(): string {
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('PAY_AFTER_RECEIVING + efectivo: mensaje actual sin cambios', () => {
    render(buildOrder({ qr_payment_instruction_mode: 'PAY_AFTER_RECEIVING' }));
    expect(instructionText()).toContain('Te llevaremos tu pedido a la mesa. Paga al recibirlo.');
  });

  it('PAY_AFTER_RECEIVING + transferencia: mensaje actual sin cambios', () => {
    render(
      buildOrder({
        qr_payment_instruction_mode: 'PAY_AFTER_RECEIVING',
        current_payment_attempt: {
          id: 'pa1', status: 'pendiente', payment_method_name: 'Nequi', is_cash: false,
          receipt_file_url: null, cash_amount: null, transfer_amount: null,
          cash_confirmed_at: null,
        },
      }),
    );
    expect(instructionText()).toContain(
      'Muestra el comprobante de tu banco al cajero cuando recibas tu pedido.',
    );
  });

  it('PAY_AFTER_RECEIVING + mixto: mensaje actual sin cambios', () => {
    render(
      buildOrder({
        qr_payment_instruction_mode: 'PAY_AFTER_RECEIVING',
        current_payment_attempt: {
          id: 'pa1', status: 'pendiente', payment_method_name: 'Efectivo + Nequi', is_cash: false,
          receipt_file_url: null, cash_amount: 5000, transfer_amount: 3000,
          cash_confirmed_at: null,
        },
      }),
    );
    expect(instructionText()).toContain(
      'Al recibir tu pedido, muestra el comprobante de la transferencia al cajero. El efectivo lo pagas al recibirlo.',
    );
  });

  it('PAY_BEFORE_RECEIVING + efectivo: mensaje nuevo', () => {
    render(buildOrder({ qr_payment_instruction_mode: 'PAY_BEFORE_RECEIVING' }));
    expect(instructionText()).toContain(
      'Dirígete a la caja para realizar el pago. ¡Llevaremos tu pedido hasta tu mesa!',
    );
  });

  it('PAY_BEFORE_RECEIVING + transferencia: mensaje nuevo', () => {
    render(
      buildOrder({
        qr_payment_instruction_mode: 'PAY_BEFORE_RECEIVING',
        current_payment_attempt: {
          id: 'pa1', status: 'pendiente', payment_method_name: 'Nequi', is_cash: false,
          receipt_file_url: null, cash_amount: null, transfer_amount: null,
          cash_confirmed_at: null,
        },
      }),
    );
    expect(instructionText()).toContain(
      'Acércate a la caja y muestra el comprobante de tu transferencia para validar el pago. ¡Llevaremos tu pedido hasta tu mesa!',
    );
  });

  it('PAY_BEFORE_RECEIVING + mixto: mensaje nuevo', () => {
    render(
      buildOrder({
        qr_payment_instruction_mode: 'PAY_BEFORE_RECEIVING',
        current_payment_attempt: {
          id: 'pa1', status: 'pendiente', payment_method_name: 'Efectivo + Nequi', is_cash: false,
          receipt_file_url: null, cash_amount: 5000, transfer_amount: 3000,
          cash_confirmed_at: null,
        },
      }),
    );
    expect(instructionText()).toContain(
      'Acércate a la caja, presenta el comprobante de tu transferencia por Nequi y realiza el pago restante en efectivo. ¡Llevaremos tu pedido hasta tu mesa!',
    );
  });

  it('qr_payment_instruction_mode null: no revienta y no renderiza ninguna instrucción nueva fuera de catálogo', () => {
    render(buildOrder({ qr_payment_instruction_mode: null }));
    // research.md Decisión 5: null se trata como PAY_AFTER_RECEIVING (default de compatibilidad).
    expect(instructionText()).toContain('Te llevaremos tu pedido a la mesa. Paga al recibirlo.');
  });
});
