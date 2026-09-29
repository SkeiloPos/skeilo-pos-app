import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PaymentMethodsPageComponent } from './payment-methods-page.component';
import { PaymentMethodService } from '../services/payment-method.service';
import { TenantPaymentMethodCatalogService } from '../services/payment-method-catalog.service';
import type {
  CatalogPaymentMethodOption,
  PaymentMethod,
} from '../interfaces/sales.interface';

const QR = 'https://assets.skeilopos.com/acme/payment-methods/qr.png';

const OPTION = {
  id: 'cat-nequi',
  name: 'Nequi',
  active: true,
  already_activated: true,
  fields: [
    { key: 'celular', label: 'Celular', required: true, format: 'numeric', length: 10 },
    { key: 'qr', label: 'QR', required: false, format: 'image' },
  ],
} as CatalogPaymentMethodOption;

const METHOD = {
  id: 'pm2',
  catalog_id: 'cat-nequi',
  name: 'Nequi',
  type: 'transfer',
  is_cash: false,
  active: true,
  is_complete: true,
  payment_info: { celular: '3001234567', qr: QR },
} as PaymentMethod;

describe('PaymentMethodsPageComponent (spec 088: payment_info_base)', () => {
  let component: PaymentMethodsPageComponent;
  let svc: {
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof signal<string | null>>;
    isSubmitting: ReturnType<typeof signal<boolean>>;
  };

  beforeEach(() => {
    svc = {
      update: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockResolvedValue(true),
      error: signal<string | null>(null),
      isSubmitting: signal(false),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PaymentMethodsPageComponent],
      providers: [
        { provide: PaymentMethodService, useValue: { ...svc, methods: signal([]), load: vi.fn() } },
        {
          provide: TenantPaymentMethodCatalogService,
          useValue: { options: signal([OPTION]), load: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(PaymentMethodsPageComponent);
    component = fixture.componentInstance;
    // `useValue` clona el literal: se toma el mismo objeto que inyecta el componente.
    svc = component.svc as unknown as typeof svc;
  });

  it('al editar envía payment_info completo (el QR sin tocar incluido) y la base de lo que vio al abrir', async () => {
    component.openFieldsForm(METHOD);
    component.setFieldValue('celular', '3009999999'); // cambia solo el celular

    await component.submitFields();

    expect(svc.update).toHaveBeenCalledWith('pm2', {
      payment_info: { celular: '3009999999', qr: QR }, // el QR viaja: omitirlo lo eliminaría
      payment_info_base: { celular: '3001234567', qr: QR },
    });
  });

  it('la base no cambia cuando se sube un QR nuevo: sigue siendo el valor con que se abrió el formulario', async () => {
    component.openFieldsForm(METHOD);
    const nuevo = 'https://pub-x.r2.dev/acme/payment-methods/nuevo.png';
    component.setFieldValue('qr', nuevo);

    await component.submitFields();

    const [, payload] = svc.update.mock.calls[0];
    expect(payload.payment_info.qr).toBe(nuevo);
    expect(payload.payment_info_base.qr).toBe(QR);
  });

  it('una activación nueva (create) no envía base', async () => {
    component.selectCatalogOption(OPTION);
    component.setFieldValue('celular', '3001234567');

    await component.submitFields();

    expect(svc.create).toHaveBeenCalledWith('cat-nequi', { celular: '3001234567' });
    expect(svc.update).not.toHaveBeenCalled();
  });
});
