import { NotificationItem, summarize } from './notification.model';

function item(partial: Partial<NotificationItem>): NotificationItem {
  return {
    id: 'n1',
    event_type: 'payment.completed',
    related_entity_type: 'sale',
    related_entity_id: 'sale-1',
    payload: {},
    created_at: '2026-10-17T18:30:00Z',
    attended_at: null,
    attended_by_user_id: null,
    ...partial,
  };
}

describe('summarize() — spec 125 (formato de moneda del aviso de pago)', () => {
  it('usa el summary ya formateado cuando viene incluido (evento SSE en vivo)', () => {
    expect(summarize(item({ summary: 'Pago recibido · $ 22.000' }))).toBe(
      'Pago recibido · $ 22.000',
    );
  });

  it('payment.completed sin summary (cargado por REST): formatea el total con formatMoney()', () => {
    expect(
      summarize(item({ summary: undefined, payload: { total: '22000' } })),
    ).toBe('Pago recibido · $ 22.000');
  });

  it('payment.completed sin total: "Pago recibido" a secas', () => {
    expect(summarize(item({ summary: undefined, payload: {} }))).toBe('Pago recibido');
  });
});
