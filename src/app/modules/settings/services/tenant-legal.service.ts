import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CamposFaltantesError,
  TemplateUpdateStatus,
  TenantLegalDocument,
  TenantLegalProfile,
} from '../interfaces/tenant-legal.interface';

const EMPTY_PROFILE: TenantLegalProfile = {
  razon_social: null,
  identificacion_legal: null,
  direccion_legal: null,
  ciudad: null,
  correo_contacto: null,
  telefono_contacto: null,
};

/** Transport for el perfil legal y el documento legal propio del tenant
 * (`/api/v1/legal/tenant-profile`, `/tenant-document/*`, spec 162, US3). */
@Injectable({ providedIn: 'root' })
export class TenantLegalService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/legal`;

  readonly profile = signal<TenantLegalProfile>(EMPTY_PROFILE);
  readonly currentDocument = signal<TenantLegalDocument | null>(null);
  readonly templateUpdateStatus = signal<TemplateUpdateStatus | null>(null);

  readonly previewHtml = signal<string | null>(null);
  readonly camposFaltantes = signal<string[]>([]);

  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.profile.set(
        await firstValueFrom(this.http.get<TenantLegalProfile>(`${this.baseUrl}/tenant-profile`)),
      );
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar el perfil legal.'));
    } finally {
      this.loading.set(false);
    }
  }

  async saveProfile(profile: Partial<TenantLegalProfile>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      this.profile.set(
        await firstValueFrom(
          this.http.put<TenantLegalProfile>(`${this.baseUrl}/tenant-profile`, profile),
        ),
      );
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo guardar el perfil legal.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async loadCurrentDocument(): Promise<void> {
    try {
      this.currentDocument.set(
        await firstValueFrom(
          this.http.get<TenantLegalDocument | null>(`${this.baseUrl}/tenant-document/current`),
        ),
      );
    } catch {
      this.currentDocument.set(null);
    }
  }

  async loadTemplateUpdateStatus(): Promise<void> {
    try {
      this.templateUpdateStatus.set(
        await firstValueFrom(
          this.http.get<TemplateUpdateStatus>(
            `${this.baseUrl}/tenant-document/template-update-status`,
          ),
        ),
      );
    } catch {
      this.templateUpdateStatus.set(null);
    }
  }

  /** Vista previa sin guardar nada (FR-013). 422 con `campos_faltantes` si
   * el perfil no está completo — se refleja en `camposFaltantes`, no es un
   * error de transporte genérico. */
  async preview(): Promise<void> {
    this.isSubmitting.set(true);
    this.error.set(null);
    this.camposFaltantes.set([]);
    this.previewHtml.set(null);
    try {
      const result = await firstValueFrom(
        this.http.get<{ contenido_renderizado: string }>(`${this.baseUrl}/tenant-document/preview`),
      );
      this.previewHtml.set(result.contenido_renderizado);
    } catch (err) {
      this.handleCamposFaltantes(err, 'No se pudo generar la vista previa.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async publish(): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    this.camposFaltantes.set([]);
    try {
      const doc = await firstValueFrom(
        this.http.post<TenantLegalDocument>(`${this.baseUrl}/tenant-document/publish`, {}),
      );
      this.currentDocument.set(doc);
      await this.loadTemplateUpdateStatus();
      return true;
    } catch (err) {
      this.handleCamposFaltantes(err, 'No se pudo publicar el documento legal.');
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private handleCamposFaltantes(err: unknown, fallback: string): void {
    const detail =
      err instanceof HttpErrorResponse && err.error?.detail && typeof err.error.detail === 'object'
        ? (err.error.detail as CamposFaltantesError)
        : null;
    if (detail?.campos_faltantes) {
      this.camposFaltantes.set(detail.campos_faltantes);
      this.error.set(detail.detail ?? 'Faltan datos legales obligatorios.');
    } else {
      this.error.set(this.extractError(err, fallback));
    }
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse && typeof err.error?.detail === 'string') {
      return err.error.detail;
    }
    return fallback;
  }
}
