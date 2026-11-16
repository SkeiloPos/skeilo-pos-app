import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  AdminAuditLogItem,
  SuspendUserPayload,
  UserDetail,
  UserMembership,
  UserSecurity,
  UserUpdatePayload,
} from '../interfaces/admin-user.interface';
import { Page } from '../interfaces/page.interface';

/** Ficha individual de usuario (spec 159, User Story 3/4/6, FR-010 a FR-022,
 * FR-030). Lectura de la ficha más las acciones de administración básica
 * (editar, activar/reactivar/desbloquear, suspender, enviar recuperación) y
 * la revocación de sesiones (individual/masiva, User Story 6). Anonimizar/
 * eliminar son Historia 5 (servicio separado). */
@Injectable({ providedIn: 'root' })
export class SuperAdminUserDetailService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin/users`;

  getUser(userId: string): Promise<UserDetail> {
    return firstValueFrom(this.http.get<UserDetail>(`${this.baseUrl}/${userId}`));
  }

  getActivity(userId: string, page = 1, size = 20): Promise<Page<AdminAuditLogItem>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return firstValueFrom(
      this.http.get<Page<AdminAuditLogItem>>(`${this.baseUrl}/${userId}/activity`, { params }),
    );
  }

  getMemberships(userId: string): Promise<UserMembership[]> {
    return firstValueFrom(
      this.http.get<UserMembership[]>(`${this.baseUrl}/${userId}/memberships`),
    );
  }

  getSecurity(userId: string): Promise<UserSecurity> {
    return firstValueFrom(this.http.get<UserSecurity>(`${this.baseUrl}/${userId}/security`));
  }

  updateUser(userId: string, payload: UserUpdatePayload): Promise<UserDetail> {
    return firstValueFrom(this.http.patch<UserDetail>(`${this.baseUrl}/${userId}`, payload));
  }

  activateUser(userId: string): Promise<UserDetail> {
    return firstValueFrom(this.http.post<UserDetail>(`${this.baseUrl}/${userId}/activate`, {}));
  }

  suspendUser(userId: string, payload: SuspendUserPayload): Promise<UserDetail> {
    return firstValueFrom(
      this.http.post<UserDetail>(`${this.baseUrl}/${userId}/suspend`, payload),
    );
  }

  sendPasswordReset(userId: string): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.post<{ message: string }>(`${this.baseUrl}/${userId}/send-password-reset`, {}),
    );
  }

  revokeAllSessions(userId: string): Promise<UserSecurity> {
    return firstValueFrom(
      this.http.post<UserSecurity>(`${this.baseUrl}/${userId}/sessions/revoke-all`, {}),
    );
  }

  revokeSession(userId: string, sessionId: string): Promise<UserSecurity> {
    return firstValueFrom(
      this.http.delete<UserSecurity>(`${this.baseUrl}/${userId}/sessions/${sessionId}`),
    );
  }

  /** Historia 5 (FR-023/FR-025): irreversible, exige `confirm_email`. */
  anonymizeUser(userId: string, confirmEmail: string): Promise<UserDetail> {
    return firstValueFrom(
      this.http.post<UserDetail>(`${this.baseUrl}/${userId}/anonymize`, {
        confirm_email: confirmEmail,
      }),
    );
  }

  /** Historia 5 (FR-024/FR-025): 409 con `retention_tenants` si hay
   * obligación de retención vigente en algún negocio del usuario. */
  deleteUser(userId: string, confirmEmail: string): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.delete<{ message: string }>(`${this.baseUrl}/${userId}`, {
        body: { confirm_email: confirmEmail },
      }),
    );
  }
}
