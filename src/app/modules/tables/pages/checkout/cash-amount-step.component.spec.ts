import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { CashAmountStepComponent } from './cash-amount-step.component';
import { CheckoutProgressStore } from './checkout-progress.store';
import { DinerService } from '../../services/diner.service';
import { DiningCartService } from '../../services/dining-cart.service';
import { DinerPaymentMethod } from '../../interfaces/diner.interface';

/** Spec 130 (FR-005/FR-006): paso del monto en efectivo de "Pago mixto". */
function buildMethod(overrides: Partial<DinerPaymentMethod> = {}): DinerPaymentMethod {
  return {
    id: 'pm-mixto', name: 'Pago mixto', type: 'mixed', is_cash: false,
    payment_info: null, fields: [],
    ...overrides,
  };
}

function buildTransfer(id: string, name: string): DinerPaymentMethod {
  return { id, name, type: 'transfer', is_cash: false, payment_info: null, fields: [] };
}

describe('CashAmountStepComponent', () => {
  let fixture: ComponentFixture<CashAmountStepComponent>;
  let component: CashAmountStepComponent;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let progress: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    paymentMethods: ReturnType<typeof signal<DinerPaymentMethod[]>>;
  };

  async function createComponent(opts: {
    total: number;
    transferMethods: DinerPaymentMethod[];
    record?: { payment_method_id: string | null; cash_amount?: number | null; transfer_method_id?: string | null };
  }): Promise<void> {
    TestBed.resetTestingModule();
    router = { navigate: vi.fn() };
    progress = {
      read: vi.fn().mockReturnValue(
        opts.record ?? { payment_method_id: 'pm-mixto', cash_amount: null, transfer_method_id: null },
      ),
      write: vi.fn(),
      paymentMethods: signal<DinerPaymentMethod[]>(opts.transferMethods),
    };
    TestBed.configureTestingModule({
      imports: [CashAmountStepComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'test-token' } } } },
        { provide: DinerService, useValue: { getPaymentMethods: vi.fn().mockResolvedValue(opts.transferMethods) } },
        { provide: DiningCartService, useValue: { total: signal(opts.total) } },
        { provide: CheckoutProgressStore, useValue: progress },
      ],
    });
    fixture = TestBed.createComponent(CashAmountStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('resuelve el único método de transferencia activo sin preguntar (FR-005)', async () => {
    await createComponent({ total: 8000, transferMethods: [buildTransfer('pm-nequi', 'Nequi')] });
    expect(component.selectedTransferMethodId()).toBe('pm-nequi');
  });

  it('bloquea con monto >= total, orientando a elegir Efectivo (FR-006)', async () => {
    await createComponent({ total: 8000, transferMethods: [buildTransfer('pm-nequi', 'Nequi')] });
    component.rawAmount.set(8000);

    component.continue_();

    expect(component.error()).toContain('Efectivo');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('bloquea sin ingresar ningún monto', async () => {
    await createComponent({ total: 8000, transferMethods: [buildTransfer('pm-nequi', 'Nequi')] });

    component.continue_();

    expect(component.error()).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('con un monto válido, guarda el progreso mixto y navega a transfer', async () => {
    await createComponent({ total: 8000, transferMethods: [buildTransfer('pm-nequi', 'Nequi')] });
    component.rawAmount.set(3000);

    component.continue_();

    expect(progress.write).toHaveBeenCalledWith({
      step: 'transfer', payment_method_id: 'pm-mixto',
      cash_amount: 3000, transfer_method_id: 'pm-nequi',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/menu/t', 'test-token', 'checkout', 'transfer']);
  });

  it('monto $0 se trata como elegir transferencia directamente, no mixto (FR-006 edge case)', async () => {
    await createComponent({ total: 8000, transferMethods: [buildTransfer('pm-nequi', 'Nequi')] });
    component.rawAmount.set(0);

    component.continue_();

    expect(progress.write).toHaveBeenCalledWith({
      step: 'transfer', payment_method_id: 'pm-nequi',
      cash_amount: null, transfer_method_id: null,
    });
  });

  it('con más de un método de transferencia, exige elegir cuál antes de continuar (FR-005)', async () => {
    await createComponent({
      total: 8000,
      transferMethods: [buildTransfer('pm-nequi', 'Nequi'), buildTransfer('pm-banco', 'Bancolombia')],
    });
    expect(component.selectedTransferMethodId()).toBeNull();
    component.rawAmount.set(3000);

    component.continue_();
    expect(component.error()).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();

    component.selectedTransferMethodId.set('pm-banco');
    component.continue_();
    expect(progress.write).toHaveBeenCalledWith({
      step: 'transfer', payment_method_id: 'pm-mixto',
      cash_amount: 3000, transfer_method_id: 'pm-banco',
    });
  });
});
