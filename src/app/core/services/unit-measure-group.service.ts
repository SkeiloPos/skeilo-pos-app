import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BlockingUnit,
  UnitMeasureGroup,
  UnitMeasureGroupAddUnitPayload,
  UnitMeasureGroupBaseReassignPayload,
  UnitMeasureGroupCreatePayload,
  UnitMeasureGroupRenamePayload,
} from '../interfaces/unit-measure-group.interface';

/** Grupos de unidades de medida con unidad base explícita (spec 137). */
@Injectable({ providedIn: 'root' })
export class UnitMeasureGroupService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/unit-measure-groups`;

  readonly groups = signal<UnitMeasureGroup[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  /** Unidades que bloquean la última acción con 409 (FR-008/FR-009/FR-011/FR-014);
   *  `null` cuando el último error no fue de ese tipo. */
  readonly blockingUnits = signal<BlockingUnit[] | null>(null);

  async loadGroups(active?: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = active === undefined ? undefined : { active };
      const data = await firstValueFrom(
        this.http.get<UnitMeasureGroup[]>(this.baseUrl, { params }),
      );
      this.groups.set([...data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async createGroup(payload: UnitMeasureGroupCreatePayload): Promise<boolean> {
    return this.submit(() => this.http.post<UnitMeasureGroup>(this.baseUrl, payload));
  }

  async addUnit(groupId: string, payload: UnitMeasureGroupAddUnitPayload): Promise<boolean> {
    return this.submit(() =>
      this.http.post(`${this.baseUrl}/${groupId}/units`, payload),
    );
  }

  async renameGroup(groupId: string, payload: UnitMeasureGroupRenamePayload): Promise<boolean> {
    return this.submit(() =>
      this.http.patch<UnitMeasureGroup>(`${this.baseUrl}/${groupId}`, payload),
    );
  }

  async reassignBase(
    groupId: string,
    payload: UnitMeasureGroupBaseReassignPayload,
  ): Promise<boolean> {
    return this.submit(() =>
      this.http.patch<UnitMeasureGroup>(`${this.baseUrl}/${groupId}/base-unit`, payload),
    );
  }

  async deleteGroup(groupId: string): Promise<boolean> {
    return this.submit(() => this.http.delete<void>(`${this.baseUrl}/${groupId}`));
  }

  private async submit(request: () => Observable<unknown>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    this.blockingUnits.set(null);
    try {
      await firstValueFrom(request());
      await this.loadGroups();
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      this.blockingUnits.set(this.extractBlockingUnits(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const detail = err.error?.detail;
      if (typeof detail === 'string') return detail;
      if (detail && typeof detail === 'object' && 'error' in detail) {
        return String((detail as { error: string }).error);
      }
      return err.error?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }

  /** Lista de `blocking_units` del 409 "en uso" (FR-008/FR-009/FR-011/FR-014, SC-004),
   *  o `null` si el error no trae esa forma. */
  private extractBlockingUnits(err: unknown): BlockingUnit[] | null {
    if (!(err instanceof HttpErrorResponse)) return null;
    const detail = err.error?.detail;
    if (detail && typeof detail === 'object' && Array.isArray(detail.blocking_units)) {
      return detail.blocking_units as BlockingUnit[];
    }
    return null;
  }
}
