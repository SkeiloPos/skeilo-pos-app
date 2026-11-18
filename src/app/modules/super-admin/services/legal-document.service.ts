import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  MasterLegalTemplate,
  PlatformLegalDocument,
  PlatformLegalDocumentType,
} from '../interfaces/legal-document.interface';

/** Transport for los documentos legales de plataforma
 * (`/api/v1/super-admin/legal/platform-documents`, spec 162, US1). */
@Injectable({ providedIn: 'root' })
export class LegalDocumentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/super-admin/legal`;

  readonly history = signal<PlatformLegalDocument[]>([]);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  async loadHistory(tipo: PlatformLegalDocumentType): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.history.set(
        await firstValueFrom(
          this.http.get<PlatformLegalDocument[]>(
            `${this.baseUrl}/platform-documents/${tipo}/history`,
          ),
        ),
      );
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar el historial.'));
    } finally {
      this.loading.set(false);
    }
  }

  async createDraft(
    tipo: PlatformLegalDocumentType,
    contenido_markdown: string,
  ): Promise<boolean> {
    return this.submit(
      () =>
        this.http.post<PlatformLegalDocument>(`${this.baseUrl}/platform-documents`, {
          tipo,
          contenido_markdown,
        }),
      tipo,
      'No se pudo crear el borrador.',
    );
  }

  async editDraft(
    id: string,
    contenido_markdown: string,
    tipo: PlatformLegalDocumentType,
  ): Promise<boolean> {
    return this.submit(
      () =>
        this.http.patch<PlatformLegalDocument>(`${this.baseUrl}/platform-documents/${id}`, {
          contenido_markdown,
        }),
      tipo,
      'No se pudo editar el borrador — ¿ya se publicó?',
    );
  }

  async publish(
    id: string,
    fecha_vigencia: string,
    tipo: PlatformLegalDocumentType,
  ): Promise<boolean> {
    return this.submit(
      () =>
        this.http.post<PlatformLegalDocument>(
          `${this.baseUrl}/platform-documents/${id}/publish`,
          { fecha_vigencia },
        ),
      tipo,
      'No se pudo publicar — revisa la fecha de vigencia.',
    );
  }

  async deleteDraft(id: string, tipo: PlatformLegalDocumentType): Promise<boolean> {
    return this.submit(
      () => this.http.delete<void>(`${this.baseUrl}/platform-documents/${id}`),
      tipo,
      'No se pudo eliminar el borrador — ¿ya se publicó?',
    );
  }

  /** Vista previa renderizada de cualquier versión (borrador, publicada o
   * superada) — reutiliza el mismo `markdown-it-py` del backend, no un
   * renderer nuevo en el frontend (Principio IX). */
  async previewDocument(id: string): Promise<string> {
    const res = await firstValueFrom(
      this.http.get<{ contenido_html: string }>(
        `${this.baseUrl}/platform-documents/${id}/preview`,
      ),
    );
    return res.contenido_html;
  }

  private async submit(
    request: () =>
      | ReturnType<HttpClient['post']>
      | ReturnType<HttpClient['patch']>
      | ReturnType<HttpClient['delete']>,
    tipo: PlatformLegalDocumentType,
    fallbackError: string,
  ): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(request());
      await this.loadHistory(tipo);
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, fallbackError));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse && typeof err.error?.detail === 'string') {
      return err.error.detail;
    }
    return fallback;
  }

  // ----------------------------------------------------------- Plantilla legal maestra (US2)

  readonly templateHistory = signal<MasterLegalTemplate[]>([]);
  readonly templateVariablesNoPermitidas = signal<string[]>([]);

  async loadMasterTemplateHistory(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.templateHistory.set(
        await firstValueFrom(
          this.http.get<MasterLegalTemplate[]>(`${this.baseUrl}/master-template/history`),
        ),
      );
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar el historial de la plantilla.'));
    } finally {
      this.loading.set(false);
    }
  }

  async createMasterTemplateDraft(contenido_markdown: string): Promise<boolean> {
    return this.submitTemplate(
      () => this.http.post<MasterLegalTemplate>(`${this.baseUrl}/master-template`, { contenido_markdown }),
      'No se pudo crear el borrador de la plantilla.',
    );
  }

  async editMasterTemplateDraft(id: string, contenido_markdown: string): Promise<boolean> {
    return this.submitTemplate(
      () =>
        this.http.patch<MasterLegalTemplate>(`${this.baseUrl}/master-template/${id}`, {
          contenido_markdown,
        }),
      'No se pudo editar el borrador — ¿ya se publicó?',
    );
  }

  async publishMasterTemplate(id: string, fecha_vigencia: string): Promise<boolean> {
    return this.submitTemplate(
      () =>
        this.http.post<MasterLegalTemplate>(`${this.baseUrl}/master-template/${id}/publish`, {
          fecha_vigencia,
        }),
      'No se pudo publicar — revisa la fecha de vigencia.',
    );
  }

  async deleteMasterTemplateDraft(id: string): Promise<boolean> {
    return this.submitTemplate(
      () => this.http.delete<void>(`${this.baseUrl}/master-template/${id}`),
      'No se pudo eliminar el borrador — ¿ya se publicó?',
    );
  }

  /** Vista previa renderizada de cualquier versión de la plantilla, con los
   * placeholders `{{variable}}` tal cual (sin datos de un tenant real). */
  async previewMasterTemplate(id: string): Promise<string> {
    const res = await firstValueFrom(
      this.http.get<{ contenido_html: string }>(
        `${this.baseUrl}/master-template/${id}/preview`,
      ),
    );
    return res.contenido_html;
  }

  private async submitTemplate(
    request: () =>
      | ReturnType<HttpClient['post']>
      | ReturnType<HttpClient['patch']>
      | ReturnType<HttpClient['delete']>,
    fallbackError: string,
  ): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    this.templateVariablesNoPermitidas.set([]);
    try {
      await firstValueFrom(request());
      await this.loadMasterTemplateHistory();
      return true;
    } catch (err) {
      const detail =
        err instanceof HttpErrorResponse && err.error?.detail && typeof err.error.detail === 'object'
          ? err.error.detail
          : null;
      if (detail?.variables_no_permitidas) {
        this.templateVariablesNoPermitidas.set(detail.variables_no_permitidas);
        this.error.set(detail.detail ?? 'Variables no permitidas en la plantilla.');
      } else {
        this.error.set(this.extractError(err, fallbackError));
      }
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
