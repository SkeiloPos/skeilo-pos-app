import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { PaymentMethodStepComponent } from './payment-method-step.component';
import { CheckoutProgressStore } from './checkout-progress.store';
import { DinerService } from '../../services/diner.service';
import { DiningCartService } from '../../services/dining-cart.service';
import { DinerTokenStore } from '../../services/diner-token.store';
import { DinerPaymentMethod } from '../../interfaces/diner.interface';

function buildMethod(overrides: Partial<DinerPaymentMethod> = {}): DinerPaymentMethod {
  return {
    id: 'pm-cash', name: 'Efectivo', type: 'cash', is_cash: true,
    payment_info: null, fields: [],
    ...overrides,
  };
}

describe('PaymentMethodStepComponent', () => {
  let fixture: ComponentFixture<PaymentMethodStepComponent>;
  let component: PaymentMethodStepComponent;
  let cart: {
    hasAffectedLines: () => boolean;
    affectedLines: ReturnType<typeof signal<ReadonlyMap<string, string>>>;
    clear: ReturnType<typeof vi.fn>;
    clearDiner: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    checkoutTotalSeen: ReturnType<typeof signal<number | null>>;
    totalChangedTo: ReturnType<typeof signal<number | null>>;
    seenCheckoutTotalOnce: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let progress: {
    paymentMethods: ReturnType<typeof signal<DinerPaymentMethod[]>>;
    activeOrder: ReturnType<typeof signal<unknown>>;
    write: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  async function createComponent(methods: DinerPaymentMethod[] = [buildMethod()]): Promise<void> {
    TestBed.resetTestingModule();
    const affectedLines = signal<ReadonlyMap<string, string>>(new Map());
    cart = {
      affectedLines,
      hasAffectedLines: () => affectedLines().size > 0,
      clear: vi.fn(),
      clearDiner: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
      checkoutTotalSeen: signal<number | null>(null),
      totalChangedTo: signal<number | null>(null),
      seenCheckoutTotalOnce: vi.fn(),
    };
    router = { navigate: vi.fn() };
    progress = {
      paymentMethods: signal<DinerPaymentMethod[]>(methods),
      activeOrder: signal(null),
      write: vi.fn(),
      clear: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [PaymentMethodStepComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'test-token' } } } },
        {
          provide: DinerService,
          useValue: {
            getPaymentMethods: vi.fn().mockResolvedValue(methods),
            submitCart: vi.fn().mockResolvedValue({ id: 'o1' }),
            extractError: vi.fn((_err: unknown, fallback: string) => fallback),
          },
        },
        { provide: DinerTokenStore, useValue: { clear: vi.fn() } },
        { provide: DiningCartService, useValue: cart },
        { provide: CheckoutProgressStore, useValue: progress },
      ],
    });
    fixture = TestBed.createComponent(PaymentMethodStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));

  it('lista los métodos de pago y permite elegir uno', async () => {
    await createComponent([buildMethod({ id: 'pm-nequi', name: 'Nequi', type: 'transfer', is_cash: false })]);

    const boton = buttons().find((b) => b.textContent?.includes('Nequi'));
    expect(boton).toBeTruthy();
    expect(boton!.disabled).toBe(false);
  });

  it('elegir efectivo envía el pedido y navega a confirmación', async () => {
    await createComponent([buildMethod()]);

    buttons().find((b) => b.textContent?.includes('Efectivo'))!.click();
    await fixture.whenStable();

    expect(router.navigate).toHaveBeenCalledWith(['/menu/t', 'test-token', 'checkout', 'confirmation']);
    expect(cart.clear).toHaveBeenCalled();
  });

  // ── spec 148 (US2, T058/T063): línea agotada bloquea la elección de método ──

  it('con una línea agotada muestra la alerta y deshabilita todos los métodos', async () => {
    await createComponent([buildMethod({ id: 'pm-nequi', name: 'Nequi', type: 'transfer', is_cash: false })]);
    cart.affectedLines.set(new Map([['i1', 'Granizado de mora']]));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    const boton = buttons().find((b) => b.textContent?.includes('Nequi'))!;
    expect(boton.disabled).toBe(true);
  });

  it('choose() no envía ni navega mientras haya líneas afectadas (defensa en profundidad)', async () => {
    await createComponent([buildMethod()]);
    cart.affectedLines.set(new Map([['i1', 'Granizado de mora']]));
    fixture.detectChanges();

    await component.choose(buildMethod());

    expect(router.navigate).not.toHaveBeenCalled();
    expect(progress.write).not.toHaveBeenCalled();
  });
});
