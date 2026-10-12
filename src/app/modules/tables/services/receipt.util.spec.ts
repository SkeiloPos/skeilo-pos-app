import {
  ReceiptData,
  buildReceiptHtml,
  formatMoney,
  saleToReceipt,
} from './receipt.util';
import { Sale } from '../../sales/interfaces/sales.interface';

function makeReceipt(patch: Partial<ReceiptData> = {}): ReceiptData {
  return {
    businessName: 'Heladería Skeilo',
    logoUrl: null,
    tableLabel: 'Mesa 5 · Terraza',
    soldAt: '2026-07-28T18:42:00',
    cashier: 'Ana',
    customerName: 'Carlos',
    saleId: '11111111-2222-3333-4444-5555aabbccdd',
    invoice: null,
    lines: [{ quantity: 2, description: 'Helado de vainilla', lineTotal: 12000 }],
    subtotal: 12000,
    discount: 0,
    tax: 0,
    tip: 0,
    total: 12000,
    payments: [{ name: 'Efectivo', amount: 12000 }],
    change: null,
    message: '¡Gracias por su compra!',
    ...patch,
  };
}

describe('buildReceiptHtml', () => {
  it('imprime negocio, líneas, total y mensaje', () => {
    const html = buildReceiptHtml([makeReceipt()]);

    expect(html).toContain('Heladería Skeilo');
    expect(html).toContain('Mesa 5 · Terraza');
    expect(html).toContain('2 × Helado de vainilla');
    expect(html).toContain('TOTAL');
    expect(html).toContain(formatMoney(12000));
    expect(html).toContain('¡Gracias por su compra!');
    // Los 6 últimos caracteres del uuid identifican el ticket en el mostrador.
    expect(html).toContain('#BBCCDD');
  });

  it('omite los totales que no aplican', () => {
    const html = buildReceiptHtml([makeReceipt()]);

    // Sin descuento/impuesto/propina, el subtotal no aporta nada sobre el total.
    expect(html).not.toContain('Descuento');
    expect(html).not.toContain('Impuesto');
    expect(html).not.toContain('Propina');
    expect(html).not.toContain('Subtotal');
  });

  it('muestra el desglose cuando hay descuento', () => {
    const html = buildReceiptHtml([
      makeReceipt({ discount: 2000, total: 10000 }),
    ]);

    expect(html).toContain('Subtotal');
    expect(html).toContain('Descuento');
    expect(html).toContain('-' + formatMoney(2000));
  });

  it('emite un ticket por venta en cuenta dividida', () => {
    const html = buildReceiptHtml([
      makeReceipt({ customerName: 'Ana', total: 8000 }),
      makeReceipt({ saleId: 'aaaa-bbbb', customerName: 'Luis', total: 4000 }),
    ]);

    expect(html.match(/<article class="ticket">/g)?.length).toBe(2);
    expect(html).toContain('Ana');
    expect(html).toContain('Luis');
  });

  it('separa los tickets con una línea de corte, no con un salto de página', () => {
    // Con la página fija del driver (48×210mm) el salto mandaba el segundo ticket
    // a otra hoja: avance largo en blanco y, en muchas térmicas, ticket perdido.
    const dos = buildReceiptHtml([makeReceipt(), makeReceipt({ saleId: 'otra-venta' })]);

    expect(dos).not.toContain('page-break-before');
    expect(dos.match(/class="cut"/g)?.length).toBe(1);
  });

  it('no pone línea de corte cuando se imprime un solo ticket', () => {
    expect(buildReceiptHtml([makeReceipt()])).not.toContain('class="cut"');
  });

  it('imprime el consecutivo de la factura cuando la venta lo tiene', () => {
    const html = buildReceiptHtml([makeReceipt({ invoice: { prefix: 'A', number: 4 } })]);

    expect(html).toContain('<span>Factura</span><span>A-000004</span>');
    // El id corto es el respaldo, no se imprimen los dos.
    expect(html).not.toContain('#BBCCDD');
  });

  it('cae al id corto en ventas sin factura emitida', () => {
    const html = buildReceiptHtml([makeReceipt()]);

    expect(html).toContain('<span>Ticket</span><span>#BBCCDD</span>');
    expect(html).not.toContain('<span>Factura</span>');
  });

  it('spec 112 (FR-020): un cobro con pago mixto imprime una fila por método', () => {
    const html = buildReceiptHtml([
      makeReceipt({
        payments: [
          { name: 'Efectivo', amount: 8000 },
          { name: 'Transferencia', amount: 6000 },
        ],
      }),
    ]);

    expect(html).toContain('<span>Efectivo</span><span>' + formatMoney(8000) + '</span>');
    expect(html).toContain('<span>Transferencia</span><span>' + formatMoney(6000) + '</span>');
  });
});

describe('saleToReceipt', () => {
  function makeSale(patch: Partial<Sale> = {}): Sale {
    return {
      id: 'sale-1',
      cash_shift_id: 'sh1',
      user_id: 'u1',
      user_name: 'Ana',
      customer_name: 'Carlos',
      subtotal: '12000',
      discount: '0',
      tax: '0',
      tip: '0',
      total: '12000',
      change_given: '3000',
      status: 'paid',
      sold_at: '2026-07-31T18:42:00',
      items: [
        {
          id: 'i1',
          product_variant_id: 'v1',
          description: 'Helado de vainilla',
          quantity: 2,
          unit_price: '6000',
          line_total: '12000',
        },
      ],
      payments: [{ id: 'p1', payment_method_id: 'pm1', amount: '15000' }],
      invoice: { prefix: '', number: 7 },
      dining_table: { id: 't1', number: 5, name: 'Terraza' },
      ...patch,
    } as Sale;
  }

  const ctx = {
    businessName: 'Heladería Skeilo',
    logoUrl: null,
    message: '¡Gracias!',
    methodName: (id: string) => (id === 'pm1' ? 'Efectivo' : 'Otro'),
  };

  it('convierte importes, líneas y pagos de la venta', () => {
    const receipt = saleToReceipt(makeSale(), ctx);

    expect(receipt.total).toBe(12000);
    expect(receipt.lines).toEqual([
      { quantity: 2, description: 'Helado de vainilla', lineTotal: 12000, options: [] },
    ]);
    // El nombre del método lo resuelve quien llama; la venta solo trae el id.
    expect(receipt.payments).toEqual([{ name: 'Efectivo', amount: 15000 }]);
    expect(receipt.change).toBe(3000);
    expect(receipt.invoice).toEqual({ prefix: '', number: 7 });
  });

  it('spec 112: convierte las N líneas de `sale.payments` a N entradas de `receipt.payments`, cada una con su propio nombre y monto', () => {
    const sale = makeSale({
      payments: [
        { id: 'p1', payment_method_id: 'pm1', amount: '8000' },
        { id: 'p2', payment_method_id: 'pm2', amount: '6000' },
      ],
    });

    const receipt = saleToReceipt(sale, ctx);

    expect(receipt.payments).toEqual([
      { name: 'Efectivo', amount: 8000 },
      { name: 'Otro', amount: 6000 },
    ]);
  });

  it('lleva al ticket los sabores elegidos, tomándolos del snapshot de la venta', () => {
    // Se usa el nombre congelado en la venta, no el catálogo vivo: un sabor
    // desactivado después seguiría siendo legible al reimprimir.
    const receipt = saleToReceipt(
      makeSale({
        items: [
          {
            id: 'i1',
            product_variant_id: 'v1',
            description: 'Ensalada de frutas',
            quantity: 1,
            unit_price: '12000',
            line_total: '12000',
            options: [{ option_id: 'o1', name: 'Chocolate', extra_price: '0' }],
          },
        ],
      } as Partial<Sale>),
      ctx,
    );

    expect(receipt.lines[0].options).toEqual(['Chocolate']);
    expect(buildReceiptHtml([receipt])).toContain('Chocolate');
  });

  it('arma la etiqueta de la mesa desde la venta', () => {
    expect(saleToReceipt(makeSale(), ctx).tableLabel).toBe('Mesa 5 · Terraza');

    const sinNombre = makeSale({ dining_table: { id: 't2', number: 3, name: null } });
    expect(saleToReceipt(sinNombre, ctx).tableLabel).toBe('Mesa 3');
  });

  it('deja la mesa vacía en una venta de mostrador', () => {
    // Antes la etiqueta venía de la pantalla; ahora sale de la venta, y una de
    // mostrador simplemente no tiene mesa.
    expect(saleToReceipt(makeSale({ dining_table: null }), ctx).tableLabel).toBe('');
  });

  // ── Formato para térmica ──────────────────────────────────────────────────

  it('compone la página al ancho del rollo', () => {
    // Si la página no mide lo que el papel, el navegador la reduce para
    // encajarla y el texto sale gris y deshilachado en el cabezal.
    const porDefecto = buildReceiptHtml([makeReceipt()]);
    expect(porDefecto).toContain('@page { size: 48mm auto; margin: 0; }');
    expect(porDefecto).toContain('width: 48mm;');

    const ancho = buildReceiptHtml([makeReceipt()], { paperWidthMm: 58 });
    expect(ancho).toContain('@page { size: 58mm auto; margin: 0; }');
    expect(ancho).toContain('width: 58mm;');
    expect(ancho).not.toContain('48mm');
  });

  it('no usa separadores punteados ni tipografía fina', () => {
    const html = buildReceiptHtml([makeReceipt()]);

    // Un `dashed` sale como puntos sueltos, así que las divisiones internas del
    // ticket van sólidas; Courier además pierde trazos a este tamaño.
    expect(html).toContain('.block { padding-bottom: 2.5mm; margin-bottom: 2.5mm; border-bottom: 1px solid #000; }');
    expect(html).not.toContain('Courier');
    expect(html).toContain('font-weight: 700');
  });

  it('escribe la fecha sin la coma de toLocaleString', () => {
    // Es la fila más larga del ticket: a 48 mm dos caracteres deciden si cabe.
    const html = buildReceiptHtml([makeReceipt()]);

    expect(html).toContain('28/07/2026 18:42');
  });

  it('escapa el HTML de los textos del negocio', () => {
    const html = buildReceiptHtml([
      makeReceipt({ message: '<script>alert(1)</script>' }),
    ]);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
