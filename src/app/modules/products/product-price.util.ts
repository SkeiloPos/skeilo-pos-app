import { formatMoney } from '../../shared/money';
import { Product } from './interfaces/product.interface';

/**
 * Spec 152 (US3, FR-005/FR-006, data-model.md "Regla de cómputo"): fuente única del
 * texto de precio del listado -- reusada por `ProductListCardComponent` (tarjeta) y
 * `ProductsPageComponent` (columna "Precio" de la tabla) para que ambas vistas
 * formateen el mismo valor exactamente igual.
 */
export function formatProductPrice(product: Pick<Product, 'price_display' | 'price_from'>): string {
  if (product.price_display === null) return 'Sin precio';
  const money = formatMoney(Number(product.price_display));
  return product.price_from ? `Desde ${money}` : money;
}
