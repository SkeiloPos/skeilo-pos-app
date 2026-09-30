import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { PaymentAttemptReviewPanelComponent } from './payment-attempt-review-panel.component';
import {
  CheckoutPreview,
  DiningOrder,
  DiningOrderItem,
  PaymentAttempt,
} from '../interfaces/dining.interface';

const API = environment.apiBaseUrl;

function order(id = 'o1', items: DiningOrderItem[] = []): DiningOrder {
  return {
    id,
    channel: 'QR_MENU',
    status: 'recibida',
    created_at: '2026-08-18T23:09:00',
    items,
  } as DiningOrder;
}

function item(
  unitPrice: string,
  quantity = 1,
  estadoCocina: DiningOrderItem['estado_cocina'] = 'pendiente',
  extra: Partial<DiningOrderItem> = {},
): DiningOrderItem {
  return {
    id: `i-${unitPrice}-${quantity}`,
    product_variant_id: 'v1',
    quantity,
    unit_price: unitPrice,
    estado_cocina: estadoCocina,
    ...extra,
  } as DiningOrderItem;
}

function attempt(partial: Partial<PaymentAttempt>): PaymentAttempt {
  return {
    id: 'a1',
    order_id: 'o1',
    payment_method_id: 'pm1',
    payment_method_name: 'Efectivo',
    is_cash: true,
    status: 'pendiente',
    amount_received: null,
    change_amount: null,
    receipt_file_url: null,
    rejection_reason: null,
    resolved_by_user_id: null,
    resolved_at: null,
    created_at: '2026-08-18T23:09:00',
    ...partial,
  };
}

/** 2 conos a $8.000 con la promoción del 50% llevando 2 ya congelada por el
 *  carrito QR: `discounted_line_total` = $8.000, así la tarjeta declaraba
 *  $8.000 y coincide con el preview autoritativo (sin marca de FR-024). */
function promoItem(discountedLineTotal = '8000'): DiningOrderItem {
  return item('8000', 2, 'pendiente', { discounted_line_total: discountedLineTotal });
}

/** spec 073, US7 (FR-021/FR-022): desglose autoritativo del cobro. Por
 *  defecto sin descuento ni domicilio (`subtotal == total`). */
function preview(partial: Partial<CheckoutPreview> = {}): CheckoutPreview {
  const subtotal = partial.subtotal ?? partial.total ?? '8000';
  return {
    subtotal,
    discount: '0',
    delivery_fee: '0',
    total: partial.total ?? subtotal,
    promotion_evaluated_at: '2026-08-18T23:00:00Z',
    ...partial,
  };
}

describe('PaymentAttemptReviewPanelComponent', () => {
  let fixture: ComponentFixture<PaymentAttemptReviewPanelComponent>;
  let panel: PaymentAttemptReviewPanelComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PaymentAttemptReviewPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(PaymentAttemptReviewPanelComponent);
    panel = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Deja el panel listo mostrando exactamente los intentos dados y (salvo que
   * `withPreview` sea `null`) el desglose autoritativo del backend, llamando
   * `load()` / `loadCheckoutPreview()` directamente — evita depender de
   * `ngOnChanges` + estabilidad del zoneless change detection para peticiones
   * HTTP async.
   */
  async function renderWith(
    attempts: PaymentAttempt[],
    forOrder: DiningOrder = order(),
    withPreview: CheckoutPreview | 'error' | null = preview(),
  ): Promise<void> {
    panel.order = forOrder;
    const doneAttempts = panel.load();
    http.expectOne(`${API}/orders/${forOrder.id}/payment-attempts`).flush(attempts);
    await doneAttempts;
    if (withPreview !== null) {
      const donePreview = panel.loadCheckoutPreview();
      const req = http.expectOne(`${API}/orders/${forOrder.id}/checkout-preview`);
      if (withPreview === 'error') {
        req.flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });
      } else {
        req.flush(withPreview);
      }
      await donePreview;
    }
    fixture.detectChanges();
  }

  /** Corre `confirmCash()` de punta a punta: reconfirmación de FR-024 + POST
   *  confirm-cash + relista de intentos. */
  async function runConfirmCash(
    current: PaymentAttempt,
    opts: {
      fresh?: CheckoutPreview;
      confirmResponse: PaymentAttempt;
      reload: PaymentAttempt[];
      confirmStatus?: { status: number; statusText: string };
      expectReconfirm?: boolean;
      expectConfirmCall?: boolean;
    },
  ): Promise<void> {
    const done = panel.confirmCash(current);
    if (opts.expectReconfirm !== false) {
      http.expectOne(`${API}/orders/o1/checkout-preview`).flush(opts.fresh ?? preview());
      await flushMicrotasks();
    }
    if (opts.expectConfirmCall !== false) {
      const req = http.expectOne(
        (r) => r.url === `${API}/orders/payment-attempts/${current.id}/confirm-cash`,
      );
      if (opts.confirmStatus) {
        req.flush({ detail: 'nope' }, opts.confirmStatus);
      } else {
        req.flush(opts.confirmResponse);
        await flushMicrotasks();
        http.expectOne(`${API}/orders/o1/payment-attempts`).flush(opts.reload);
      }
    }
    await done;
    fixture.detectChanges();
  }

  // ── Desglose autoritativo (FR-021/FR-022) ────────────────────────────────

  it('Scenario 1: muestra el desglose 16000 / −8000 / 8000 del backend, no el bruto de las líneas', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [promoItem()]),
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Subtotal');
    expect(texto).toContain('16.000');
    expect(texto).toContain('8.000');
    expect(texto).toContain('Descuento');
  });

  it('FR-024/FR-007a: mientras se calcula el total muestra "Calculando el total…" y deshabilita "Confirmar efectivo"', async () => {
    // Sin flush del preview: queda en estado "calculando".
    panel.order = order('o1', [promoItem()]);
    const doneAttempts = panel.load();
    http.expectOne(`${API}/orders/o1/payment-attempts`).flush([attempt({ status: 'pendiente' })]);
    await doneAttempts;
    const donePreview = panel.loadCheckoutPreview();
    const previewReq = http.expectOne(`${API}/orders/o1/checkout-preview`);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent as string).toContain('Calculando el total…');
    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 8000;
    fixture.detectChanges();
    const confirmBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar efectivo'),
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    previewReq.flush(preview({ subtotal: '16000', discount: '8000', total: '8000' }));
    await donePreview;
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBe(false);
  });

  it('preview falla → muestra el error con "Reintentar" y mantiene las acciones deshabilitadas', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [promoItem()]),
      'error',
    );

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('No se pudo calcular el total');
    expect(texto).toContain('Reintentar');

    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 8000;
    fixture.detectChanges();
    const confirmBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar efectivo'),
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  // ── Vuelto sobre el Total real (FR-022) ──────────────────────────────────

  it('Scenario 2: $10.000 en efectivo → cambio $2.000 sobre $8.000 (no sobre el bruto)', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [promoItem()]),
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );

    panel.amountReceived = 10000;
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cambio');
    expect(texto).toContain('2.000');
  });

  it('Scenario 3: $8.000 exactos → cambio $0, confirma al primer intento', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [promoItem()]),
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );
    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 8000;
    fixture.detectChanges();

    await runConfirmCash(panel.current()!, {
      fresh: preview({ subtotal: '16000', discount: '8000', total: '8000' }),
      confirmResponse: attempt({ status: 'confirmado', amount_received: '8000.00', change_amount: '0.00' }),
      reload: [attempt({ status: 'confirmado', amount_received: '8000.00', change_amount: '0.00' })],
    });

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Pago confirmado');
    expect(texto).toContain('Cambio: $ 0');
  });

  it('Scenario 4: $5.000 → cambio negativo "$ -3.000" sobre $8.000 y "Confirmar efectivo" deshabilitado', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [promoItem()]),
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );
    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 5000;
    fixture.detectChanges();

    // El monto no alcanza el total real: la vista previa de cambio se
    // muestra igual, en negativo, para que el cajero vea cuánto falta.
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cambio');
    expect(texto).toContain('$ -3.000');
    const confirmBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar efectivo'),
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // Intentar confirmar no dispara ninguna llamada de cobro: el backend
    // (chequeo previo D13) rechazaría, pero el frontend no llega a pedirlo
    // porque el importe tecleado no cubre el Total real.
    const done = panel.confirmCash(panel.current()!);
    http.expectOne(`${API}/orders/o1/checkout-preview`).flush(
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );
    await flushMicrotasks();
    await done;
    http.expectNone((r) => r.url.endsWith('/confirm-cash'));
  });

  // ── Transferencia: el cajero ve el Total antes de "Aprobar" (Scenario 5) ──

  it('Scenario 5: transferencia con comprobante → el panel muestra Total $8.000 antes de "Aprobar"', async () => {
    panel.cashShiftId = 'shift-1';
    await renderWith(
      [attempt({ status: 'pendiente', is_cash: false, receipt_file_url: 'https://example.invalid/r.jpg' })],
      order('o1', [promoItem()]),
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Total');
    expect(texto).toContain('8.000');
    const aprobar = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Aprobar',
    ) as HTMLButtonElement;
    expect(aprobar.disabled).toBe(false);
  });

  // ── FR-024: el total cambió respecto al declarado por el comensal ─────────

  it('Scenario 7 (spec 089 A-96): preview.total ≠ total de la tarjeta al abrir → texto informativo, sin exigir acuse para continuar', async () => {
    // La tarjeta declaraba $8.000 (discounted_line_total congelado); el preview
    // vivo trae $16.000 (promoción pausada — FR-009a).
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [item('8000', 2, 'pendiente', { discounted_line_total: '8000' })]),
      preview({ subtotal: '16000', discount: '0', total: '16000' }),
    );

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('El total cambió respecto al declarado por el comensal');
    expect(texto).toContain('antes $ 8.000');
    expect(texto).toContain('ahora $ 16.000');
    // Ya no hay botón "Entendido, continuar": el cajero ve la diferencia y decide (D17).
    expect(texto).not.toContain('Entendido, continuar');

    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 16000;
    fixture.detectChanges();
    const confirmBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar efectivo'),
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  it('spec 089 (A-94): la tarjeta declara 2 × $15.000 + adicional $3.000 = $33.000 y coincide con el preview, sin marca de cambio', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [
        item('15000', 2, 'pendiente', { addons_total: '3000', line_total: '33000' }),
      ]),
      preview({ subtotal: '33000', total: '33000' }),
    );

    expect(panel.cardDeclaredTotal()).toBe(33000);
    expect(panel.totalChanged()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('El total cambió respecto al declarado');
  });

  it('spec 089 (A-94): con promoción, usa el discounted_line_total que ya incluye el adicional', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [
        item('15000', 2, 'pendiente', {
          addons_total: '3000', line_total: '33000', discounted_line_total: '27000.00',
        }),
      ]),
      preview({ subtotal: '33000', discount: '6000', total: '27000' }),
    );

    expect(panel.cardDeclaredTotal()).toBe(27000);
    expect(panel.totalChanged()).toBe(false);
  });

  it('research.md D15 → spec 089 (A-96): el preview devuelve otro total justo antes de confirmar → aviso no bloqueante en la tarjeta, sin modal y sin resolver el pago', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [promoItem()]),
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );
    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 16000;
    fixture.detectChanges();

    await runConfirmCash(panel.current()!, {
      fresh: preview({ subtotal: '16000', discount: '0', total: '16000' }),
      confirmResponse: attempt({ status: 'confirmado' }),
      reload: [],
      expectConfirmCall: false,
    });
    fixture.detectChanges();

    // No se emitió el cobro y no hubo diálogo.
    http.expectNone((r) => r.url.endsWith('/confirm-cash'));
    // El total mostrado se actualizó y hay un aviso no bloqueante en la tarjeta.
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('16.000');
    const aviso = fixture.nativeElement.querySelector('[data-testid="total-cambio-aviso"]') as HTMLElement;
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).toContain('El total cambió: ahora es $ 16.000');
  });

  it('spec 089 (A-96, FR-028): tras el aviso, el segundo clic confirma el pago por el total NUEVO', async () => {
    await renderWith(
      [attempt({ status: 'pendiente' })],
      order('o1', [promoItem()]),
      preview({ subtotal: '16000', discount: '8000', total: '8000' }),
    );
    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 16000;
    fixture.detectChanges();

    // Primer clic: el total cambió a 16.000 → aviso, sin confirmar.
    await runConfirmCash(panel.current()!, {
      fresh: preview({ subtotal: '16000', discount: '0', total: '16000' }),
      confirmResponse: attempt({ status: 'confirmado' }),
      reload: [],
      expectConfirmCall: false,
    });
    expect(panel.totalChangeNotice()).toEqual({ now: 16000, before: 8000 });

    // Segundo clic: el preview ya no difiere → confirma el cobro y el aviso desaparece.
    await runConfirmCash(panel.current()!, {
      fresh: preview({ subtotal: '16000', discount: '0', total: '16000' }),
      confirmResponse: attempt({ status: 'confirmado', amount_received: '16000', change_amount: '0' }),
      reload: [attempt({ status: 'confirmado', amount_received: '16000', change_amount: '0' })],
    });
    expect(panel.totalChangeNotice()).toBeNull();
  });

  it('muestra el monto recibido y el cambio de forma permanente al confirmar en efectivo (spec 026, FR-004/FR-005)', async () => {
    await renderWith([attempt({ status: 'pendiente' })], order('o1', [item('20000', 1)]), preview({ total: '20000' }));

    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 22000;
    await runConfirmCash(panel.current()!, {
      fresh: preview({ total: '20000' }),
      confirmResponse: attempt({ status: 'confirmado', amount_received: '22000.00', change_amount: '2000.00' }),
      reload: [attempt({ status: 'confirmado', amount_received: '22000.00', change_amount: '2000.00' })],
    });

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Pago confirmado');
    expect(texto).toContain('Recibido: $ 22.000');
    expect(texto).toContain('Cambio: $ 2.000');
  });

  it('sin turno de caja abierto, no confirma ni aprueba', async () => {
    await renderWith([attempt({ status: 'pendiente', is_cash: true })], order('o1', [item('8000', 1)]), preview({ total: '8000' }));
    panel.cashShiftId = null;
    panel.amountReceived = 8000;
    fixture.detectChanges();

    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Confirmar efectivo'),
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent as string).toContain('Abre un turno de caja');

    await panel.confirmCash(panel.current()!);
    http.expectNone(`${API}/orders/payment-attempts/a1/confirm-cash`);
  });

  it('spec 046, FR-003: un monto en efectivo menor al total real no queda confirmado (el backend lo rechaza)', async () => {
    await renderWith([attempt({ status: 'pendiente' })], order('o1', [item('20000', 1)]), preview({ total: '20000' }));

    panel.cashShiftId = 'shift-1';
    panel.amountReceived = 20000; // cubre el total mostrado, pero el backend recalcula y rechaza
    await runConfirmCash(panel.current()!, {
      fresh: preview({ total: '20000' }),
      confirmResponse: attempt({ status: 'pendiente' }),
      reload: [],
      confirmStatus: { status: 422, statusText: 'Unprocessable Entity' },
    });

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).not.toContain('Pago confirmado');
    expect(texto).toContain('Pendiente de revisión');
  });

  it('muestra la vista previa de cambio en negativo mientras el monto todavía no alcanza el total', async () => {
    await renderWith([attempt({ status: 'pendiente' })], order('o1', [item('8000', 1)]), preview({ total: '8000' }));

    panel.amountReceived = 5000;
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cambio');
    expect(texto).toContain('$ -3.000');
  });

  it('muestra el cambio como "$ 0" explícitamente cuando el monto es exacto, no lo omite', async () => {
    await renderWith(
      [attempt({ status: 'confirmado', amount_received: '18000.00', change_amount: '0.00' })],
      order('o1', [item('18000', 1)]),
      preview({ total: '18000' }),
    );

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cambio: $ 0');
  });

  // ── Rechazar pedido completo (spec 044) ──────────────────────────────────

  const rejectOrderButton = (): HTMLButtonElement | undefined =>
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.includes('Rechazar pedido'),
    );

  it('efectivo: rechazar el pedido llama a cancel con el motivo tipeado', async () => {
    await renderWith([attempt({ status: 'pendiente', is_cash: true })], order('o1', [item('8000', 1)]), preview({ total: '8000' }));

    rejectOrderButton()!.click();
    fixture.detectChanges();
    panel.rejectOrderReason = 'El comensal se fue sin pagar';
    const done = panel.rejectOrder(order());

    http
      .expectOne((r) => r.url === `${API}/orders/o1/cancel` && r.body?.motivo === 'El comensal se fue sin pagar')
      .flush(order());
    await done;

    expect(panel.showRejectOrder()).toBe(false);
    expect(panel.rejectOrderReason).toBe('');
  });

  it('transferencia con comprobante ya subido: no ofrece "Rechazar pedido" (solo el rechazo del intento, sin cambios)', async () => {
    await renderWith(
      [attempt({ status: 'pendiente', is_cash: false, receipt_file_url: 'https://example.invalid/r.jpg' })],
      order('o1', [item('8000', 1)]),
      preview({ total: '8000' }),
    );

    expect(rejectOrderButton()).toBeUndefined();
    expect(fixture.nativeElement.textContent as string).toContain('Rechazar');
  });

  it('el método de pago pendiente ya no usa el emoji 💳 (spec 082)', async () => {
    await renderWith(
      [attempt({ status: 'pendiente', payment_method_name: 'Efectivo' })],
      order('o1', [item('8000', 1)]),
      preview({ total: '8000' }),
    );

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).not.toContain('💳');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('credit_card');
  });
});
