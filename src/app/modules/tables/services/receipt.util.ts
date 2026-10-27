/**
 * Factura de 58 mm para impresora térmica.
 *
 * Se genera como un **documento HTML independiente** con su propio `@page`, y se
 * imprime en un iframe oculto. No usa Tailwind ni los estilos de la app a
 * propósito: el ancho del papel manda, y así imprimir el ticket no interfiere
 * con las otras pantallas que ya llaman a `window.print()` (la hoja de QR y el
 * arqueo de caja), que tienen sus propias reglas de impresión.
 */
import { Sale } from '../../sales/interfaces/sales.interface';
import { formatMoney } from '../../../shared/money';
import { zonedParts } from '../../../shared/date-format.util';
import { SessionBill } from '../interfaces/dining.interface';

// El formato de moneda se movió a `shared/` (lo necesita el menú QR, que no debe
// arrastrar este generador de tickets). Se reexporta para no tocar a quien ya lo
// importaba desde aquí.
export { formatMoney };

/** Una línea del ticket. */
export interface ReceiptLine {
  quantity: number;
  description: string;
  lineTotal: number;
  /** Sabores/extras elegidos, ya resueltos a nombre. Se imprimen bajo la línea. */
  options?: string[];
}

/** Un pago del ticket, con el nombre del método ya resuelto. */
export interface ReceiptPayment {
  name: string;
  amount: number;
}

/** Todo lo que se imprime de una venta. Una venta = un ticket. */
export interface ReceiptData {
  businessName: string;
  logoUrl: string | null;
  /** "Mesa 5 · Terraza", o vacío si no se conoce. */
  tableLabel: string;
  /** ISO del backend (`Sale.sold_at`). */
  soldAt: string;
  cashier: string | null;
  customerName: string | null;
  saleId: string;
  /** Consecutivo fiscal. `null` en ventas antiguas, sin factura emitida. */
  invoice: { prefix: string; number: number } | null;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  total: number;
  payments: ReceiptPayment[];
  change: number | null;
  /** Mensaje de cierre configurado en Ajustes. */
  message: string;
}

/** Lo que hay que saber del negocio para componer un ticket. */
export interface ReceiptContext {
  businessName: string;
  logoUrl: string | null;
  message: string;
  /** Resuelve el nombre del método de pago a partir de su id. */
  methodName: (paymentMethodId: string) => string;
}

/**
 * Convierte una venta del backend en un ticket.
 *
 * Vive aquí, y no en la terminal, porque el mismo ticket se imprime al cobrar y
 * al reimprimir desde el detalle de la venta: dos mapeos se desincronizarían.
 */
export function saleToReceipt(sale: Sale, ctx: ReceiptContext): ReceiptData {
  return {
    businessName: ctx.businessName,
    logoUrl: ctx.logoUrl,
    tableLabel: tableLabel(sale.dining_table),
    soldAt: sale.sold_at,
    cashier: sale.user_name ?? null,
    customerName: sale.customer_name ?? null,
    saleId: sale.id,
    invoice: sale.invoice ?? null,
    lines: (sale.items ?? []).map((it) => ({
      quantity: it.quantity,
      description: it.description,
      lineTotal: Number(it.line_total),
      options: (it.options ?? [])
        .map((o) => ((o.quantity ?? 1) > 1 ? `${o.quantity}x ${o.name}` : o.name))
        .filter(Boolean),
    })),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    tax: Number(sale.tax),
    tip: Number(sale.tip),
    total: Number(sale.total),
    payments: (sale.payments ?? []).map((p) => ({
      name: ctx.methodName(p.payment_method_id),
      amount: Number(p.amount),
    })),
    change: sale.change_given != null ? Number(sale.change_given) : null,
    message: ctx.message,
  };
}

function tableLabel(table: Sale['dining_table']): string {
  if (!table) return '';
  return table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`;
}

/**
 * Convierte la cuenta de una sesión de mesa (antes de cobrar) en un ticket de
 * "pre-cuenta" — feature 028, T031.
 *
 * Se necesita un generador aparte de `saleToReceipt` porque antes de pagar no
 * existe ninguna `Sale`: la pre-cuenta se imprime desde `SessionBill`
 * (`GET /table-sessions/{id}/bill`), que no trae pagos ni consecutivo fiscal.
 * Reutiliza `printReceiptHtml`/`buildReceiptHtml` sin tocarlos.
 */
export function sessionBillToReceipt(
  bill: SessionBill,
  ctx: ReceiptContext & { tableLabel?: string },
): ReceiptData {
  const lines: ReceiptLine[] = bill.split.flatMap((line) =>
    line.items.map((it) => ({
      quantity: Number(it.quantity),
      description: it.description,
      lineTotal: Number(it.line_total),
    })),
  );
  const discount = bill.split.reduce((s, l) => s + Number(l.discount), 0);
  const total = Number(bill.total);

  return {
    businessName: ctx.businessName,
    logoUrl: ctx.logoUrl,
    tableLabel: ctx.tableLabel ?? '',
    soldAt: new Date().toISOString(),
    cashier: null,
    // Sin comensal único: la pre-cuenta es de toda la mesa, no de una persona.
    customerName: null,
    saleId: bill.table_session_id,
    // Sin factura todavía: `documentRow` cae a "Ticket #…", que es correcto.
    invoice: null,
    lines,
    subtotal: total + discount,
    discount,
    tax: 0,
    tip: 0,
    total,
    // Sin pagos: es previa al cobro.
    payments: [],
    change: null,
    message: `PRE-CUENTA · Este documento no es una factura. ${ctx.message}`.trim(),
  };
}


function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fecha y hora del ticket en la zona del NEGOCIO, no en la del navegador (spec 138, FR-008). */
function formatDateTime(iso: string, timezone: string): string {
  const parts = zonedParts(iso, timezone);
  if (!parts) return '';
  // Se compone a mano en vez de con `toLocaleString` para no arrastrar la coma
  // que mete entre fecha y hora: es la fila más larga del ticket y a 48 mm de
  // papel dos caracteres deciden si cabe.
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(parts.day)}/${p(parts.month)}/${parts.year} ${parts.hhmm}`;
}

/** Fila etiqueta/importe. Es el ladrillo de todos los bloques de totales. */
function row(label: string, value: string, cls = ''): string {
  return `<div class="row${cls ? ' ' + cls : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

/** Los 6 últimos del uuid bastan para identificar el ticket en el mostrador. */
function shortId(saleId: string): string {
  return saleId.replace(/-/g, '').slice(-6).toUpperCase();
}

/** Consecutivo fiscal: `A-000004`. Es el número por el que pregunta el cliente. */
export function formatInvoice(invoice: { prefix: string; number: number }): string {
  const numero = String(invoice.number).padStart(6, '0');
  return invoice.prefix ? `${invoice.prefix}-${numero}` : numero;
}

/**
 * Identificación del ticket: el consecutivo de la factura si la venta lo tiene,
 * y si no el id corto —ventas anteriores a la facturación, que no llevan número.
 */
function documentRow(data: ReceiptData): string {
  return data.invoice
    ? meta('Factura', formatInvoice(data.invoice))
    : meta('Ticket', '#' + shortId(data.saleId));
}

function meta(label: string, value: string | null): string {
  return value ? row(label, value, 'meta') : '';
}

function receiptBody(data: ReceiptData, timezone: string): string {
  const lines = data.lines
    .map(
      (l) => `
        <div class="line">
          <div class="desc">${l.quantity} × ${escapeHtml(l.description)}</div>
          <div class="amount">${escapeHtml(formatMoney(l.lineTotal))}</div>
        </div>${
          l.options?.length
            ? `
        <div class="line-options">${escapeHtml(l.options.join(', '))}</div>`
            : ''
        }`,
    )
    .join('');

  // Subtotal solo aporta información si hay algo que lo separe del total.
  const hasBreakdown = data.discount > 0 || data.tax > 0 || data.tip > 0;

  return `
    <article class="ticket">
      <header class="block center">
        ${data.logoUrl ? `<img class="logo" src="${escapeHtml(data.logoUrl)}" alt="" />` : ''}
        <h1>${escapeHtml(data.businessName)}</h1>
        ${data.tableLabel ? `<p class="table">${escapeHtml(data.tableLabel)}</p>` : ''}
      </header>

      <section class="block">
        ${meta('Fecha', formatDateTime(data.soldAt, timezone))}
        ${meta('Cliente', data.customerName)}
        ${meta('Atendió', data.cashier)}
        ${documentRow(data)}
      </section>

      <section class="block lines">${lines}</section>

      <section class="block totals">
        ${hasBreakdown ? row('Subtotal', formatMoney(data.subtotal)) : ''}
        ${data.discount > 0 ? row('Descuento', '-' + formatMoney(data.discount)) : ''}
        ${data.tax > 0 ? row('Impuesto', formatMoney(data.tax)) : ''}
        ${data.tip > 0 ? row('Propina', formatMoney(data.tip)) : ''}
        ${row('TOTAL', formatMoney(data.total), 'total')}
      </section>

      <section class="block">
        ${data.payments.map((p) => row(p.name, formatMoney(p.amount))).join('')}
        ${data.change !== null && data.change > 0 ? row('Cambio', formatMoney(data.change)) : ''}
      </section>

      <footer class="center message">${escapeHtml(data.message)}</footer>
    </article>`;
}

/**
 * Hoja de estilos del ticket, ajustada al ancho real del rollo.
 *
 * Reglas que vienen de cómo imprime un cabezal térmico de 203 dpi, no del gusto:
 *
 * - La página **tiene que medir lo que mide el papel**. Si se compone más ancha,
 *   el navegador la encaja reduciéndola y el texto acaba impreso a un tamaño que
 *   el cabezal ya no resuelve: sale gris y deshilachado.
 * - Sans-serif y `font-weight: 700` en todo el cuerpo: a este tamaño una
 *   tipografía de trazo fino (Courier y compañía) pierde puntos y se rompe.
 * - Separadores `solid` y negro puro. Un `dashed` se convierte en puntos sueltos
 *   y se lee como una línea desvaída.
 */
function styles(widthMm: number): string {
  return `
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: ${widthMm}mm;
    margin: 0;
    /* Poco margen lateral: a 48 mm cada milímetro es un carácter. El de abajo es
       holgado para que el corte no se coma el mensaje de cierre. */
    padding: 3mm 2mm 8mm;
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .block { padding-bottom: 2.5mm; margin-bottom: 2.5mm; border-bottom: 1px solid #000; }
  /* Solo la última sección; la cabecera es <header> y conserva su separador. */
  section.block:last-of-type { border-bottom: 0; padding-bottom: 0; }
  .center { text-align: center; }
  /* Un logo grande sale como una mancha gris; pequeño y contrastado se distingue. */
  .logo {
    max-width: 20mm; max-height: 12mm; margin: 0 auto 2mm; display: block;
    filter: grayscale(1) contrast(1.6);
  }
  h1 { font-size: 15px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: .5px; }
  .table { margin: 1.5mm 0 0; }
  .row { display: flex; justify-content: space-between; gap: 2mm; }
  /* Sin salto solo para importes, que son cortos. En los datos de cabecera un
     nombre largo tiene que bajar de línea: recortado se lee como un dato
     incompleto, que es peor que una línea de más. */
  .row span:last-child { text-align: right; white-space: nowrap; }
  .meta span:last-child { white-space: normal; overflow-wrap: anywhere; }
  .meta span:first-child { flex-shrink: 0; }
  /* El importe va **debajo** de la descripción, no al lado: compitiendo por el
     ancho, a 48 mm el nombre del producto se partía por la mitad. */
  .line { margin-bottom: 2mm; }
  .line:last-child { margin-bottom: 0; }
  .desc { overflow-wrap: anywhere; }
  .amount { text-align: right; white-space: nowrap; }
  /* Sabores elegidos: sangrados bajo su línea y sin importe propio (ya va en ella). */
  .line-options { padding-left: 3mm; margin: -1mm 0 2mm; overflow-wrap: anywhere; }
  .totals .row { margin-bottom: 1mm; }
  .total { font-size: 15px; font-weight: 800; margin-top: 2.5mm; padding-top: 2mm; border-top: 1px solid #000; }
  .message { margin-top: 5mm; overflow-wrap: anywhere; }
  /* Un ticket por venta: en cuenta dividida cada comensal se lleva el suyo.
     Van seguidos en la misma tirada, separados por una línea de corte, **no**
     por un salto de página: con la página fija que declara el driver (48×210mm)
     el segundo ticket se iba a otra hoja —avance largo de papel en blanco, y en
     muchas térmicas directamente se pierde— y desperdiciaba 15 cm de rollo. */
  .cut { margin: 6mm 0; text-align: center; border-top: 1px dashed #000; padding-top: 2mm; }
`;
}

/** Ancho por defecto del rollo, en milímetros. */
const DEFAULT_PAPER_WIDTH_MM = 48;

export interface ReceiptOptions {
  /** Ancho del rollo. Debe coincidir con el papel configurado en el driver. */
  paperWidthMm?: number;
  /** Zona horaria IANA del negocio (`TenantInfoService.timezone()`). Obligatoria a propósito: el
   *  compilador obliga a cada llamador a decir en qué zona se imprime la fecha del ticket (spec 138). */
  timezone: string;
}

/** Marca dónde cortar el rollo entre un ticket y el siguiente. */
const CUT = '<div class="cut">✂ - - - - - - - - - - - - -</div>';

/** Documento completo con un ticket por venta. */
export function buildReceiptHtml(
  receipts: ReceiptData[],
  options: ReceiptOptions,
): string {
  const width = options.paperWidthMm ?? DEFAULT_PAPER_WIDTH_MM;
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><title>Factura</title><style>${styles(width)}</style></head>
<body>${receipts.map((receipt) => receiptBody(receipt, options.timezone)).join(CUT)}</body>
</html>`;
}

/**
 * Imprime el documento en un iframe oculto y lo descarta al terminar.
 *
 * El iframe aísla el `@page` del rollo: imprimir la factura no puede alterar cómo
 * se imprimen las demás pantallas de la app.
 */
export function printReceiptHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    return;
  }

  const cleanup = (): void => frame.remove();
  win.addEventListener('afterprint', cleanup, { once: true });

  doc.open();
  doc.write(html);
  doc.close();

  // Esperar al layout (y a las imágenes del logo) antes de abrir el diálogo.
  const print = (): void => {
    win.focus();
    win.print();
    // Si el navegador no emite `afterprint` (o el usuario cancela), no dejar basura.
    setTimeout(cleanup, 60000);
  };
  if (doc.readyState === 'complete') print();
  else win.addEventListener('load', print, { once: true });
}
