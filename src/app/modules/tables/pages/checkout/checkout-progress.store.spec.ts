import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CheckoutProgressStore } from './checkout-progress.store';
import { DinerTokenStore } from '../../services/diner-token.store';

/** `{"ts":"ts1","s":"s1"}` como segundo segmento de un JWT, sin firmar — basta
 *  para que `CheckoutProgressStore` derive su clave de `localStorage`. */
const FAKE_TOKEN =
  'header.' + btoa(JSON.stringify({ ts: 'ts1', s: 's1' })).replace(/=+$/, '') + '.sig';

describe('CheckoutProgressStore — spec 130 (cash_amount invalida el comprobante)', () => {
  let store: CheckoutProgressStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: DinerTokenStore, useValue: { token: signal(FAKE_TOKEN) } }],
    });
    store = TestBed.inject(CheckoutProgressStore);
  });

  it('cambiar cash_amount borra el receipt_file_url ya guardado (Clarificación Q6)', () => {
    store.write({
      step: 'transfer', payment_method_id: 'pm-mixto',
      receipt_file_url: 'https://example.invalid/a.jpg', cash_amount: 3000, transfer_method_id: 'pm-nequi',
    });
    expect(store.read()?.receipt_file_url).toBe('https://example.invalid/a.jpg');

    store.write({ cash_amount: 4000 });

    const record = store.read();
    expect(record?.cash_amount).toBe(4000);
    expect(record?.receipt_file_url).toBeNull();
  });

  it('escribir el mismo cash_amount no borra el receipt_file_url', () => {
    store.write({
      step: 'transfer', payment_method_id: 'pm-mixto',
      receipt_file_url: 'https://example.invalid/a.jpg', cash_amount: 3000, transfer_method_id: 'pm-nequi',
    });

    store.write({ cash_amount: 3000 });

    expect(store.read()?.receipt_file_url).toBe('https://example.invalid/a.jpg');
  });

  it('escribir receipt_file_url explícitamente junto con cash_amount no lo pierde', () => {
    store.write({ cash_amount: 3000, receipt_file_url: 'https://example.invalid/b.jpg' });

    expect(store.read()?.receipt_file_url).toBe('https://example.invalid/b.jpg');
  });
});
