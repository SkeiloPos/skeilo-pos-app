import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { TableOrderDetailComponent } from './table-order-detail.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';

const swPushStub = { provide: SwPush, useValue: { isEnabled: false } };
const promotionServiceStub = {
  provide: PromotionService,
  useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() },
};

/**
 * `TableOrderDetailComponent` es la ruta nueva (`mesas-sesiones/:mesa` o
 * `mesas-sesiones/pedido/:pedido`) extraída de `table-sessions.component.ts`
 * -- esta instancia de `PosTerminalStore` siempre nace acotada a su
 * mesa/pedido (`init({ tableId })`/`init({ orderId })`), nunca al negocio
 * completo. `store.init()` se anula con `vi.spyOn` en la mayoría de los
 * tests para no tener que mockear las peticiones HTTP reales de la carga
 * acotada -- lo que se prueba aquí es CON QUÉ se llama, no el resultado de
 * esa carga (eso ya lo cubre `pos-terminal.store.spec.ts`).
 */
function createComponent(params: {
  mesa?: string;
  pedido?: string;
  queryPedido?: string;
}): { fixture: ComponentFixture<TableOrderDetailComponent>; store: PosTerminalStore; router: Router } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TableOrderDetailComponent],
    providers: [
      provideRouter([]),
      swPushStub,
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTanStackQuery(new QueryClient()),
      promotionServiceStub,
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({
              ...(params.mesa ? { mesa: params.mesa } : {}),
              ...(params.pedido ? { pedido: params.pedido } : {}),
            }),
            queryParamMap: convertToParamMap(params.queryPedido ? { pedido: params.queryPedido } : {}),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TableOrderDetailComponent);
  const store = fixture.componentInstance.store;
  const router = TestBed.inject(Router);
  return { fixture, store, router };
}

describe('TableOrderDetailComponent — ruta mesas-sesiones/:mesa', () => {
  it('llama a store.init({ tableId }) y, una vez resuelto, a store.selectTable(mesa)', async () => {
    const { fixture, store } = createComponent({ mesa: 't1' });
    const initSpy = vi.spyOn(store, 'init').mockResolvedValue(undefined);
    const selectTableSpy = vi.spyOn(store, 'selectTable');

    fixture.detectChanges();
    expect(initSpy).toHaveBeenCalledWith({ tableId: 't1' });
    // selectTable() se llama DESPUÉS de que init() resuelve (encadenado con
    // .then()), nunca en paralelo -- de lo contrario lee `orders()` todavía
    // vacío y no vuelve a intentarlo (bug real, confirmado en vivo: la mesa
    // quedaba "sin pedido" aunque el pedido sí estuviera en la respuesta).
    expect(selectTableSpy).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(selectTableSpy).toHaveBeenCalledWith('t1');
  });

  it('con ?pedido= además de :mesa, también llama a store.selectOrder tras resolver init()', async () => {
    const { fixture, store } = createComponent({ mesa: 't1', queryPedido: 'o1' });
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
    const selectOrderSpy = vi.spyOn(store, 'selectOrder');

    fixture.detectChanges();
    await Promise.resolve();

    expect(selectOrderSpy).toHaveBeenCalledWith('o1');
  });
});

describe('TableOrderDetailComponent — ruta mesas-sesiones/pedido/:pedido (sin mesa)', () => {
  it('llama a store.init({ orderId }) y, tras resolver, a store.selectStandaloneOrder(pedido), sin tocar selectTable', async () => {
    const { fixture, store } = createComponent({ pedido: 'o1' });
    const initSpy = vi.spyOn(store, 'init').mockResolvedValue(undefined);
    const selectStandaloneSpy = vi.spyOn(store, 'selectStandaloneOrder');
    const selectTableSpy = vi.spyOn(store, 'selectTable');

    fixture.detectChanges();
    await Promise.resolve();

    expect(initSpy).toHaveBeenCalledWith({ orderId: 'o1' });
    expect(selectStandaloneSpy).toHaveBeenCalledWith('o1');
    expect(selectTableSpy).not.toHaveBeenCalled();
  });
});

describe('TableOrderDetailComponent — botón "← Volver"', () => {
  it('navega a la grilla', () => {
    const { fixture, router } = createComponent({ mesa: 't1' });
    vi.spyOn(fixture.componentInstance.store, 'init').mockResolvedValue(undefined);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();

    const backButton = fixture.nativeElement.querySelector(
      '[data-testid="page-back-button"]',
    ) as HTMLButtonElement;
    expect(backButton).not.toBeNull();
    backButton.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones']);
  });
});

/**
 * Antes (misma instancia que la grilla), `cancelSelection()` solo limpiaba
 * signals y la grilla se revelaba con CSS. Separado por ruta, lo mismo tiene
 * que traducirse en una navegación real -- este `effect()` es lo que lo hace,
 * sin que cada flujo interno que llama `cancelSelection()` (liberar mesa,
 * pedido sin mesa resuelto) tenga que saber nada de rutas.
 */
describe('TableOrderDetailComponent — vuelve a la grilla si la selección se pierde', () => {
  it('cancelSelection() (p. ej. tras liberar la mesa) dispara la navegación de vuelta', async () => {
    const { fixture, store, router } = createComponent({ mesa: 't1' });
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    // Deja resolver la selección inicial (selectedOnce) antes de limpiar el
    // spy -- si no, el `effect()` todavía no distingue "cargando" de
    // "selección perdida de verdad" y el aserto de abajo quedaría contaminado.
    await Promise.resolve();
    fixture.detectChanges();
    navigateSpy.mockClear();

    store.cancelSelection();
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones']);
  });
});

describe('TableOrderDetailComponent — CTA "Crear pedido nuevo" solo para pedidos sin mesa', () => {
  // Acotado a `data-testid` (no a cualquier botón con ese texto en la
  // pantalla): `app-pos-order-panel` tiene su propio "Crear pedido nuevo"
  // para su estado vacío, que no es el que este describe ejercita.
  const findCta = (fixture: ComponentFixture<TableOrderDetailComponent>): HTMLButtonElement | undefined =>
    (fixture.nativeElement.querySelector('[data-testid="standalone-new-order-cta"]') ?? undefined) as
      | HTMLButtonElement
      | undefined;

  it('no aparece en el detalle de una mesa -- "Nueva cuenta" (pos-order-panel.component.ts) ofrece la misma capacidad ahí', async () => {
    const { fixture, store } = createComponent({ mesa: 't1' });
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(findCta(fixture)).toBeUndefined();
  });

  it('aparece en el detalle de un pedido sin mesa, y navega preservando el tipo de pedido', () => {
    const { fixture, store, router } = createComponent({ pedido: 'o1' });
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
    store.orders.set([
      {
        id: 'o1',
        channel: 'POS',
        status: 'pendiente',
        order_type: 'DELIVERY',
        dining_table_id: null,
        customer_name: null,
        created_at: '2026-08-28T10:00:00',
        items: [],
      } as unknown as ReturnType<PosTerminalStore['orders']>[number],
    ]);
    store.selectStandaloneOrder('o1');
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const cta = findCta(fixture);
    expect(cta).toBeTruthy();
    cta!.click();

    expect(navigateSpy).toHaveBeenCalledWith(
      ['/dashboard/mesas-sesiones/orden-manual'],
      { queryParams: { tipo: 'domicilio' } },
    );
  });
});
