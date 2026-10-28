import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorBody } from '../auth/auth.models';
import {
  UnitMeasure,
  UnitMeasureCreatePayload,
  UnitMeasureForm,
  UnitMeasureUpdatePayload,
} from '../interfaces/unit-measure.interface';

/** Forma cruda del backend: Pydantic serializa `Decimal` como texto con 6 decimales fijos
 *  (p. ej. "1000.000000"), nunca como un `number` de JSON -- a diferencia del resto de la
 *  interfaz, que sí coincide 1:1. */
interface UnitMeasureResponse extends Omit<UnitMeasure, 'factor_to_base'> {
  factor_to_base: string;
}

/** Catalog of measurement units from the backend (read + write). */
@Injectable({ providedIn: 'root' })
export class UnitMeasureService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/unit-measures`;

  readonly unitMeasures = signal<UnitMeasure[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  /** Unidad puntual (spec 106): resuelve la abreviatura de un insumo recién elegido en el
   *  selector de "Insumos que vende" sin depender de una precarga del catálogo completo. */
  async getUnitMeasure(id: string): Promise<UnitMeasure> {
    const data = await firstValueFrom(this.http.get<UnitMeasureResponse>(`${this.baseUrl}/${id}`));
    return this.toUnit(data);
  }

  async loadUnitMeasures(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const data = await firstValueFrom(this.http.get<UnitMeasureResponse[]>(this.baseUrl));
      this.unitMeasures.set(data.map((u) => this.toUnit(u)).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  private toUnit(u: UnitMeasureResponse): UnitMeasure {
    return { ...u, factor_to_base: Number(u.factor_to_base) };
  }

  /** Retirado del flujo normal (spec 137): crear una unidad nueva usa
   *  `UnitMeasureGroupService.addUnit`/`createGroup`. Se conserva para compatibilidad. */
  async createUnitMeasure(groupId: string, form: UnitMeasureForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: UnitMeasureCreatePayload = {
      name: form.name,
      abbreviation: form.abbreviation,
      group_id: groupId,
      factor_to_base: form.factor_to_base,
    };

    try {
      await firstValueFrom(this.http.post<UnitMeasure>(this.baseUrl, payload));
      await this.loadUnitMeasures();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** `dimension` ya no viaja en el body (spec 137): se edita renombrando el grupo
   *  (`UnitMeasureGroupService.renameGroup`), nunca unidad por unidad. */
  async updateUnitMeasure(id: string, form: UnitMeasureForm): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: UnitMeasureUpdatePayload = {
      name: form.name,
      abbreviation: form.abbreviation,
      factor_to_base: form.factor_to_base,
    };

    try {
      await firstValueFrom(this.http.patch<UnitMeasure>(`${this.baseUrl}/${id}`, payload));
      await this.loadUnitMeasures();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async toggleActive(id: string, current: boolean): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: UnitMeasureUpdatePayload = { active: !current };

    try {
      await firstValueFrom(this.http.patch<UnitMeasure>(`${this.baseUrl}/${id}`, payload));
      await this.loadUnitMeasures();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
