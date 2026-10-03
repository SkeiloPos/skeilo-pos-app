import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorBody } from '../auth/auth.models';
import {
  MenuCategory,
  MenuOptionGroup,
  MenuVariantPromotion,
} from '../../modules/products/interfaces/product.interface';

/** Raw backend menu (decimals arrive as strings). */
interface MenuOptionResponse {
  id: string;
  name: string;
  extra_price: string;
  /** Ausente contra un backend sin desplegar; se asume disponible. */
  available?: boolean;
}

interface MenuOptionGroupResponse {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  consume?: boolean;
  selection_mode?: 'conteo' | 'cantidad';
  max_quantity_per_option?: number | null;
  max_total_quantity?: number | null;
  options?: MenuOptionResponse[];
}

interface MenuVariantResponse {
  id: string;
  /** spec 084 (A-79): la variante no tiene nombre propio; este es el de su presentación. */
  presentation_id: string;
  presentation_name: string;
  price: string;
  discounted_price?: string | null;
  discount_kind?: string | null;
  promotion?: MenuVariantPromotion | null;
  option_groups?: MenuOptionGroupResponse[];
  available?: boolean;
}

interface MenuProductResponse {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  variants?: MenuVariantResponse[];
  option_groups?: MenuOptionGroupResponse[];
  available?: boolean;
  /** spec 093: marcado manual de "Agotado" (Cajero/Admin). */
  sold_out?: boolean;
}

interface MenuCategoryResponse {
  id: string;
  name: string;
  products?: MenuProductResponse[];
}

/**
 * Mapea el bloque `promotion` de una variante, o `null` si el backend no lo pobló.
 *
 * El backend serializa sus `Decimal` como string JSON (`"unit_equivalent": "3500"`,
 * igual que `price`/`discounted_price`), así que sin este `Number(...)` el `+` de
 * `lineTotal()` en `product-select.component.ts` concatena en vez de sumar
 * ("3500" + 0 → "35000") y el total termina multiplicado por 10.
 */
function toPromotion(p: MenuVariantPromotion | null | undefined): MenuVariantPromotion | null {
  if (p == null) return null;
  return {
    ...p,
    unit_equivalent: Number(p.unit_equivalent),
    min_qty: Number(p.min_qty),
    value: Number(p.value),
  };
}

function toGroup(g: MenuOptionGroupResponse): MenuOptionGroup {
  return {
    id: g.id,
    name: g.name,
    min_select: g.min_select,
    max_select: g.max_select,
    consume: g.consume ?? false,
    selection_mode: g.selection_mode ?? 'conteo',
    max_quantity_per_option: g.max_quantity_per_option ?? null,
    max_total_quantity: g.max_total_quantity ?? null,
    options: (g.options ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      extra_price: Number(o.extra_price),
      available: o.available ?? true,
    })),
  };
}

/** Read-only public menu (`GET /menu`) — the active catalog customers see. */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/menu`;

  readonly categories = signal<MenuCategory[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  async loadMenu(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const data = await firstValueFrom(this.http.get<MenuCategoryResponse[]>(this.baseUrl));
      this.categories.set(data.map((c) => this.toCategory(c)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  private toCategory(c: MenuCategoryResponse): MenuCategory {
    return {
      id: c.id,
      name: c.name,
      products: (c.products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        // `?? true` para no romper contra un backend aún sin desplegar.
        available: p.available ?? true,
        sold_out: p.sold_out ?? false,
        variants: (p.variants ?? []).map((v) => ({
          id: v.id,
          // El modelo del cliente sigue llamando `name` a lo que se muestra de la variante.
          name: v.presentation_name,
          presentation_id: v.presentation_id,
          price: Number(v.price),
          discounted_price: v.discounted_price != null ? Number(v.discounted_price) : null,
          discount_kind: v.discount_kind ?? null,
          promotion: toPromotion(v.promotion),
          option_groups: (v.option_groups ?? []).map(toGroup),
          available: v.available ?? true,
        })),
        option_groups: (p.option_groups ?? []).map(toGroup),
      })),
    };
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
