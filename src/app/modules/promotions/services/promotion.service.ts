import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Page } from '../../../core/interfaces/page.interface';
import { injectPagedQuery } from '../../../core/query/paged-query';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { businessToday } from '../../../shared/date-format.util';
import {
  OverlapConflictError,
  PackageNotDiscountError,
  Promotion,
  PromotionCreatePayload,
  PromotionDuplicatePayload,
  PromotionForm,
  PromotionRuleInPayload,
  PromotionShapePayload,
  PromotionStatus,
  PromotionStatusPayload,
  PromotionUpdatePayload,
  RuleVariantConflictError,
} from '../interfaces/promotion.interface';

/**
 * spec 063 — modelo por conjunto explícito de variantes, partición
 * `Promoción`/`Regla` (revisión 2026-09-01). Se van del servicio:
 * `overlapCandidates` (el solape real lo bloquea el backend con 409, ya no
 * se calcula en cliente), targets, combos, reglas por presentación y
 * `priority`.
 */
interface PromotionErrorBody {
  detail?: string | { msg?: string }[];
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class PromotionService {
  private readonly http = inject(HttpClient);
  private readonly queryClient = inject(QueryClient);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly baseUrl = `${environment.apiBaseUrl}/promotions`;

  readonly isSubmitting = signal(false);
  readonly otherError = signal<string | null>(null);

  /** spec 063 (FR-014): detalle del último 409 de solape real bloqueado
   *  (entre reglas de promociones distintas). */
  readonly overlapConflict = signal<OverlapConflictError | null>(null);
  /** spec 063 (FR-016): detalle del último 409 de "precio de paquete sin descuento". */
  readonly packageNotDiscount = signal<PackageNotDiscountError | null>(null);
  /** spec 063 (revisión 2026-09-01, FR-001a): detalle del último 409 de
   *  variante repetida entre dos reglas de la misma promoción. */
  readonly ruleVariantConflict = signal<RuleVariantConflictError | null>(null);

  readonly page = signal(1);
  readonly size = signal(20);
  readonly search = signal('');
  readonly statusFilter = signal<PromotionStatus | ''>('');
  private readonly wantsPage = signal(false);
  private readonly wantsActive = signal(false);
  private readonly wantsClosedByRefactor = signal(false);

  private readonly pageQuery = injectPagedQuery<Promotion>({
    queryKey: () => [
      'promotions',
      'page',
      {
        page: this.page(),
        size: this.size(),
        search: this.search().trim(),
        status: this.statusFilter(),
      },
    ],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: this.listParams(this.page(), this.size(), this.search().trim(), this.statusFilter()),
        }),
      ),
    enabled: () => this.wantsPage(),
  });

  /** Promociones vigentes para vender, la que consume el POS (tope 100). */
  private readonly activeQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'active'],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: { status: 'active', size: 100 },
          observe: 'response',
        }),
      ).then((res) => {
        const serverTime = res.headers.get('X-Server-Time');
        if (serverTime) this.serverTimeOffsetMs.set(new Date(serverTime).getTime() - Date.now());
        return res.body!;
      }),
    enabled: () => this.wantsActive(),
  });

  /**
   * spec 063 (FR-025): promociones que la migración de la spec 063 pasó a
   * `Finalizada` — el banner descartable del módulo (`closed_by_refactor=true`).
   */
  private readonly closedByRefactorQuery = injectPagedQuery<Promotion>({
    queryKey: () => ['promotions', 'closed-by-refactor'],
    queryFn: () =>
      firstValueFrom(
        this.http.get<Page<Promotion>>(this.baseUrl, {
          params: { closed_by_refactor: true, size: 100 },
        }),
      ),
    enabled: () => this.wantsClosedByRefactor(),
  });

  readonly serverTimeOffsetMs = signal<number | null>(null);
  readonly ready = computed(() => this.serverTimeOffsetMs() !== null);

  now(): Date {
    return new Date(Date.now() + (this.serverTimeOffsetMs() ?? 0));
  }

  readonly promotions = computed(() => this.pageQuery.data()?.items ?? []);
  readonly activePromotions = computed(() => this.activeQuery.data()?.items ?? []);
  readonly closedByRefactor = computed(() => this.closedByRefactorQuery.data()?.items ?? []);
  readonly total = computed(() => this.pageQuery.data()?.total ?? 0);
  readonly totalPages = computed(() => this.pageQuery.data()?.pages ?? 0);
  readonly loading = computed(() => this.pageQuery.isFetching());
  readonly error = computed(() => {
    if (this.otherError()) return this.otherError();
    if (this.pageQuery.isError()) return this.extractError(this.pageQuery.error());
    return null;
  });

  private listParams(
    page: number,
    size: number,
    search: string,
    status: PromotionStatus | '',
  ): HttpParams {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);
    return params;
  }

  load(page: number = this.page(), size: number = this.size()): void {
    this.otherError.set(null);
    this.page.set(page);
    this.size.set(size);
    this.wantsPage.set(true);
  }

  loadActive(): void {
    this.wantsActive.set(true);
  }

  /** Carga la lista del banner de FR-025 (una vez al entrar al módulo). */
  loadClosedByRefactor(): void {
    this.wantsClosedByRefactor.set(true);
  }

  setSearch(term: string): void {
    this.search.set(term);
    this.load(1);
  }

  setStatusFilter(status: PromotionStatus | ''): void {
    this.statusFilter.set(status);
    this.load(1);
  }

  // ── Los 7 endpoints ──────────────────────────────────────────────────

  create(form: PromotionForm, status: 'draft' | 'active'): Promise<Promotion | null> {
    return this.submit(() =>
      this.http.post<Promotion>(this.baseUrl, this.toCreate(form, status)),
    );
  }

  /** `PATCH /promotions/{id}` — solo campos escalares (FR-018). `includeStartsAt`
   *  (spec 127, FR-005): el backend rechaza con 409 cualquier payload que
   *  incluya `starts_at` fuera de `draft` -- el campo del formulario queda
   *  deshabilitado (no editable) en ese caso, pero `toScalars()` siempre lo
   *  serializa, así que el caller debe pedir excluirlo explícitamente en vez
   *  de reenviar sin querer el mismo valor sin cambios. */
  update(id: string, form: PromotionForm, includeStartsAt = true): Promise<Promotion | null> {
    const payload: PromotionUpdatePayload = this.toScalars(form);
    if (!includeStartsAt) delete payload.starts_at;
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}`, payload));
  }

  /** `PATCH /promotions/{id}/shape` — reemplaza la lista **completa** de
   *  reglas, solo en `draft` (FR-001a/FR-018). */
  updateShape(id: string, form: PromotionForm): Promise<Promotion | null> {
    const payload: PromotionShapePayload = { rules: this.toRules(form) };
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}/shape`, payload));
  }

  changeStatus(id: string, status: PromotionStatus): Promise<Promotion | null> {
    const payload: PromotionStatusPayload = { status };
    return this.submit(() => this.http.patch<Promotion>(`${this.baseUrl}/${id}/status`, payload));
  }

  duplicate(id: string, name: string, replaceExisting = false): Promise<Promotion | null> {
    const payload: PromotionDuplicatePayload = replaceExisting
      ? { name, replace_existing: true }
      : { name };
    return this.submit(() => this.http.post<Promotion>(`${this.baseUrl}/${id}/duplicate`, payload));
  }

  async remove(id: string): Promise<boolean> {
    const done = await this.submit(() => this.http.delete<void>(`${this.baseUrl}/${id}`));
    return done !== null;
  }

  private async submit<T>(request: () => Observable<T>): Promise<T | null> {
    this.isSubmitting.set(true);
    this.otherError.set(null);
    this.overlapConflict.set(null);
    this.packageNotDiscount.set(null);
    this.ruleVariantConflict.set(null);
    try {
      const body = await firstValueFrom(request());
      await this.queryClient.invalidateQueries({ queryKey: ['promotions'] });
      return body ?? ({} as T);
    } catch (err) {
      const detail =
        err instanceof HttpErrorResponse
          ? (err.error as { detail?: unknown } | null)?.detail
          : null;
      if (
        err instanceof HttpErrorResponse &&
        err.status === 409 &&
        detail &&
        typeof detail === 'object' &&
        'conflicts' in detail
      ) {
        this.overlapConflict.set(detail as OverlapConflictError); // FR-014
      } else if (
        err instanceof HttpErrorResponse &&
        err.status === 409 &&
        detail &&
        typeof detail === 'object' &&
        'regular_price_sum' in detail
      ) {
        this.packageNotDiscount.set(detail as PackageNotDiscountError); // FR-016/FR-026
      } else if (
        err instanceof HttpErrorResponse &&
        err.status === 409 &&
        detail &&
        typeof detail === 'object' &&
        'rule_index_a' in detail
      ) {
        this.ruleVariantConflict.set(detail as RuleVariantConflictError); // FR-001a
      } else {
        this.otherError.set(this.extractError(err));
      }
      return null;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // ── Formulario → payload ─────────────────────────────────────────────

  private toCreate(form: PromotionForm, status: 'draft' | 'active'): PromotionCreatePayload {
    return {
      ...this.toScalars(form),
      status,
      // spec 127: respaldo con el día calendario LOCAL del tenant, no el día
      // UTC (`new Date().toISOString()` ya cae en "mañana" desde las 19:00
      // en Bogotá) — mismo defecto y misma corrección que
      // `continueToConfigure()` en `promotions-page.component.ts`.
      starts_at:
        form.starts_at ?? businessToday(this.tenantInfo.timezone()),
      rules: this.toRules(form),
    };
  }

  private toScalars(form: PromotionForm) {
    return {
      name: form.name.trim(),
      // spec 127 (FR-005): se suma a `update()` -- el backend solo la acepta
      // mientras la promoción sigue en `draft` (409 fuera de ese estado);
      // `toCreate()` la sobreescribe igual que antes con el respaldo
      // `businessToday()` cuando no se indicó explícitamente.
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      days_of_week: this.daysToStr(form.days_of_week),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
    };
  }

  /** spec 063 (revisión 2026-09-01): una fila del formulario por regla — la
   *  creación/edición por lote de FR-001. */
  private toRules(form: PromotionForm): PromotionRuleInPayload[] {
    return form.rules.map((rule) => ({
      type: rule.type,
      value: rule.value,
      min_qty: rule.min_qty,
      variant_ids: [...new Set(rule.variantIds)],
    }));
  }

  private daysToStr(days: number[]): string | null {
    return days.length ? [...days].sort((a, b) => a - b).join(',') : null;
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as PromotionErrorBody | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        const msgs = detail.map((d) => d?.msg).filter((m): m is string => !!m);
        if (msgs.length) return msgs.map((m) => m.replace(/^Value error, /, '')).join(' · ');
      }
      if (typeof body?.message === 'string') return body.message;
    }
    return 'No se pudo completar la operación.';
  }
}
