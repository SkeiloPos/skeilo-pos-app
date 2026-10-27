import { Promotion } from '../interfaces/promotion.interface';
import { zonedParts } from '../../../shared/date-format.util';
import { MenuProduct, MenuVariant, MenuVariantPromotion } from '../../products/interfaces/product.interface';

/**
 * spec 115: extraído de `public-menu.component.ts` (pestaña "Promociones" del
 * menú QR, spec 081) para que el catálogo de la orden manual use exactamente
 * el mismo criterio, sin mantener dos copias que puedan divergir. La vigencia
 * ya la resolvió el backend al poblar `promotion` -- leerla no es evaluarla.
 */
export function hasPromotion(product: MenuProduct): boolean {
  return product.variants.some((v) => v.promotion != null);
}

/**
 * spec 115 (hallazgo del dueño del producto, A-125): extraído de
 * `product-select.component.ts` (spec 081) para que `PosTerminalStore` pueda
 * calcular el mismo importe con descuento para la insignia por línea del
 * carrito (`cartLinePromo()`) sin duplicar esta regla. Único cálculo que
 * sirve tanto para `min_qty == 1` como para `min_qty > 1`: agrupa `quantity`
 * en bloques completos de `promo.min_qty` (`evaluate_variant_sets`/
 * `_greedy_units` en el backend hace lo mismo) y cobra el remanente que no
 * completa otro bloque a precio normal -- "2 x $7.000" con cantidad 3 cobra
 * un paquete (2 u.) más 1 u. a precio normal, no 3 u. al precio de paquete.
 */
export function packagePrice(
  normalPrice: number,
  promo: MenuVariantPromotion,
  quantity: number,
): number {
  const fullSets = Math.floor(quantity / promo.min_qty);
  const remainder = quantity - fullSets * promo.min_qty;
  // El precio de paquete es el importe exacto de la regla (`value`), no
  // `min_qty * unit_equivalent`: ese es un redondeo por unidad para mostrar
  // y podría no sumar el mismo total.
  const setsTotal = promo.type === 'package_price'
    ? fullSets * promo.value
    : fullSets * promo.min_qty * promo.unit_equivalent;
  return setsTotal + remainder * normalPrice;
}

/**
 * spec 063 — modelo por conjunto explícito de variantes, partición
 * `Promoción`/`Regla` (revisión 2026-09-01). Este util se reduce a:
 *  - vigencia local (`inTimeWindow` / `isPromoActiveNow`) — port de `_valid_now`;
 *  - `getPromoDisplay` (insignia de la lista de administración);
 *  - `effectivePrice` / `discountInfo` — elegir cuál de los dos números que ya
 *    resolvió el backend pintar.
 *
 * `isPromoActiveNow`/`getPromoDisplay` siguen operando sobre la
 * **promoción** (`status`/`starts_at`/`ends_at`/`days_of_week`/
 * `start_time`/`end_time`) sin cambio: esos campos no se movieron a la
 * regla — la vigencia y el estado son de la promoción y los comparten todas
 * sus reglas (FR-001). Lo que sí vive en cada regla (`condition_text`,
 * `type`, `value`) se consume directo desde `PromotionRule` donde haga
 * falta, no por este util.
 *
 * Se van: `bestProductDiscount` / `discountedUnitPrice` (cálculo local por
 * targets, A-58/A-60) y `findOverlaps` (el solape real lo bloquea el backend con
 * 409, ya no hay panel de advertencia, A-59). El descuento efectivo de la
 * terminal viene del **preview del cobro** del backend, no de un cálculo local
 * (FR-023, research.md D10).
 */
export function inTimeWindow(current: string, start: string | null, end: string | null): boolean {
  if (!start && !end) return true;
  if (!start) return current <= end!;
  if (!end) return current >= start;
  if (start <= end) return start <= current && current <= end;
  return current >= start || current <= end;
}

/**
 * Reloj de pared del negocio en `now`: `YYYY-MM-DD`, `HH:mm`, día de la semana (0 = lunes) y la marca
 * `YYYY-MM-DDTHH:mm:ss` comparable con `starts_at`.
 *
 * `starts_at`/`ends_at` de una promoción son **hora de pared del tenant sin offset** (spec 138, FR-002): se comparan
 * contra la hora de pared del negocio en `now`, nunca pasan por `new Date()` (que los leería en la zona del navegador).
 */
function wallClock(now: Date, timezone: string) {
  const p = zonedParts(now, timezone);
  if (!p) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { ymd: p.ymd, hhmm: p.hhmm, weekday: p.weekday, stamp: `${p.ymd}T${p.hhmm}:${pad(p.second)}` };
}

/**
 * Réplica de `_valid_now()` del backend: decide si una promoción está vigente en
 * este instante (estado, rango de fechas, día de semana, franja horaria), todo en la
 * zona horaria del NEGOCIO (spec 138, FR-009). El cálculo real del descuento lo hace el backend.
 */
export function isPromoActiveNow(promo: Promotion, now: Date, timezone: string): boolean {
  if (promo.status !== 'active') return false;
  const w = wallClock(now, timezone);
  if (!w) return false;
  if (promo.starts_at && w.stamp < promo.starts_at.slice(0, 19)) return false;
  if (promo.ends_at && w.ymd > promo.ends_at.slice(0, 10)) return false;
  if (promo.days_of_week) {
    const allowed = promo.days_of_week.split(',').map((d) => d.trim());
    if (!allowed.includes(String(w.weekday))) return false; // 0 = lunes … 6 = domingo, igual que el backend
  }
  return inTimeWindow(w.hhmm, promo.start_time?.slice(0, 5) ?? null, promo.end_time?.slice(0, 5) ?? null);
}

/**
 * Precio a mostrar cuando el descuento ya lo resolvió el backend (menú público,
 * carrito del comensal, terminal): el precio con descuento si vino, o el normal
 * si no.
 */
export function effectivePrice(
  price: string | number,
  discountedPrice: string | number | null | undefined,
): number {
  return Number(discountedPrice ?? price);
}

export interface DiscountInfo {
  original: number;
  discounted: number;
  percent: number;
  amountOff: number;
  kind: 'percent' | 'fixed' | null;
}

/**
 * Info de descuento para la insignia de UI (% + precio tachado) a partir de los
 * dos números que resolvió el backend.
 */
export function discountInfo(
  price: number,
  discountedPrice: number | null | undefined,
  kind?: string | null,
): DiscountInfo | null {
  if (discountedPrice == null) return null;
  const original = Number(price);
  const discounted = Number(discountedPrice);
  if (original <= 0 || discounted >= original) return null;
  const percent = Math.round((1 - discounted / original) * 100);
  if (percent <= 0) return null;
  return {
    original,
    discounted,
    percent,
    amountOff: original - discounted,
    kind: kind === 'fixed' ? 'fixed' : 'percent',
  };
}

/**
 * Estado que se muestra en la lista de administración. Separa el `status`
 * persistido de la vigencia derivada: una promoción `active` puede no descontar
 * porque todavía no empieza, ya venció, o está fuera de su franja.
 */
export type PromoDisplay =
  | 'draft'
  | 'live'
  | 'out_of_window'
  | 'scheduled'
  | 'expired'
  | 'paused'
  | 'finished';

export interface MinPromoPrice {
  /** `2 x $15.000` de la regla más barata por unidad, tal cual la renderizó el backend
   *  (`MenuVariantPromotion.short_condition`). Sin el equivalente por unidad (`· $7.500 c/u`):
   *  la tarjeta solo dice la condición (spec 084, A-82). */
  displayText: string;
  /** `true` cuando el precio viene de la más barata entre 2+ variantes cubiertas
   *  del mismo producto -- el llamador antepone "Desde " en ese caso (FR-013). */
  isMinimum: boolean;
}

/**
 * spec 084 (bug 1, FR-012/013): precio (o precio mínimo) para la tarjeta de un
 * producto, a partir de `variant.promotion` -- dato que el backend ya calcula
 * para cualquier `min_qty` (spec 066/`menu_variant_promotion`), no solo
 * `min_qty = 1` (que es todo lo que hoy usa `discountInfo`). Sin esto, un
 * producto cuya única regla vigente es de paquete con `min_qty >= 2` (la norma
 * desde spec 083 FR-025) no mostraba ningún precio en la tarjeta, solo la
 * insignia genérica -- research.md D0/D6.
 */
export function minPromoPriceForProduct(variants: MenuVariant[]): MinPromoPrice | null {
  const covered = variants.filter(
    (v): v is MenuVariant & { promotion: NonNullable<MenuVariant['promotion']> } =>
      v.promotion != null,
  );
  if (covered.length === 0) return null;
  const cheapest = covered.reduce((a, b) =>
    a.promotion.unit_equivalent <= b.promotion.unit_equivalent ? a : b,
  );
  return {
    displayText: cheapest.promotion.short_condition,
    isMinimum: covered.length > 1,
  };
}

export function getPromoDisplay(promo: Promotion, now: Date, timezone: string): PromoDisplay {
  if (promo.status === 'draft') return 'draft';
  if (promo.status === 'paused') return 'paused';
  if (promo.status === 'finished') return 'finished';
  const w = wallClock(now, timezone);
  if (w && promo.starts_at && w.stamp < promo.starts_at.slice(0, 19)) return 'scheduled';
  if (w && promo.ends_at && w.ymd > promo.ends_at.slice(0, 10)) return 'expired';
  return isPromoActiveNow(promo, now, timezone) ? 'live' : 'out_of_window';
}
