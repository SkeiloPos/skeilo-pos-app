import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { stripValueErrorPrefix } from '../../../shared/api-error.util';
import { FULL_NAME_MESSAGES, normalizeFullName } from '../../../shared/validators/full-name.validator';
import {
  InvitationCreatePayload,
  InvitationForm,
  Page,
  PendingInvitation,
} from '../interfaces/user-profile.interface';

@Injectable({ providedIn: 'root' })
export class InvitationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/invitations`;

  readonly error = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  // Estado de "Invitaciones pendientes" (US3).
  readonly pendingInvitations = signal<PendingInvitation[]>([]);
  readonly pendingLoading = signal(false);
  readonly pendingPage = signal(1);
  readonly pendingSize = signal(20);
  readonly pendingTotal = signal(0);
  readonly pendingTotalPages = signal(0);

  async createInvitation(form: InvitationForm): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);

    if (form.role === '') {
      this.error.set('Debes seleccionar un rol.');
      this.isSubmitting.set(false);
      return false;
    }

    const normalized = normalizeFullName(form.name);
    if ('error' in normalized) {
      this.error.set(FULL_NAME_MESSAGES[normalized.error]);
      this.isSubmitting.set(false);
      return false;
    }

    const payload: InvitationCreatePayload = {
      name: normalized.value,
      email: form.email.trim(),
      role: form.role,
    };

    try {
      await firstValueFrom(this.http.post<PendingInvitation>(this.baseUrl, payload));
      return true;
    } catch (err) {
      this.error.set(this.extractError(err));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async loadPendingInvitations(
    page: number = this.pendingPage(),
    size: number = this.pendingSize(),
  ): Promise<void> {
    this.pendingLoading.set(true);
    this.error.set(null);

    const params = new HttpParams().set('page', page).set('size', size);

    try {
      const data = await firstValueFrom(
        this.http.get<Page<PendingInvitation>>(this.baseUrl, { params }),
      );
      this.pendingInvitations.set(data.items);
      this.pendingPage.set(data.page);
      this.pendingSize.set(data.size);
      this.pendingTotal.set(data.total);
      this.pendingTotalPages.set(data.pages);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.pendingLoading.set(false);
    }
  }

  async resendInvitation(id: string): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.http.post(`${this.baseUrl}/${id}/resend`, {}));
      await this.loadPendingInvitations();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async cancelInvitation(id: string): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.http.post(`${this.baseUrl}/${id}/cancel`, {}));
      await this.loadPendingInvitations();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      const detail: unknown = body?.detail;
      // FastAPI 422: `detail` es un arreglo de `{ msg, loc, ... }` con el prefijo `Value error, `.
      if (Array.isArray(detail)) {
        const first = detail[0] as { msg?: string } | undefined;
        if (first?.msg) return stripValueErrorPrefix(first.msg);
      } else if (typeof detail === 'string') {
        return detail;
      }
      return body?.message ?? 'No se pudo completar la operación.';
    }
    return 'No se pudo completar la operación.';
  }
}
