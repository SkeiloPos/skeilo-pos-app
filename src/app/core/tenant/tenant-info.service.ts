import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TenantContextService } from './tenant-context.service';

/** `TenantInfoResponse` — datos del negocio del tenant actual. */
export interface TenantInfo {
  id: number;
  name: string;
  host: string;
  // `plan` (texto libre heredado) se elimina en spec 033 — el plan de
  // suscripción real vive en `dashboard/mi-plan` (Historia de Usuario 6).
  logo_url: string | null;
  /** Mensaje que cierra la factura impresa. `null` = usar el texto por defecto. */
  receipt_message: string | null;
  /** Zona horaria IANA del negocio (spec 030). Solo lectura — `update()` no la persiste. */
  timezone: string;
}

/** Cierre de la factura cuando el negocio no ha configurado uno propio. */
export const DEFAULT_RECEIPT_MESSAGE = '¡Gracias por su compra!';

/** Respuesta de `POST /uploads/presign`. */
interface PresignResponse {
  upload_url: string;
  key: string;
  public_url: string;
  expires_in: number;
}

/** Tamaño máximo del logo. El presign del backend no impone límite, así que se
 *  valida en cliente antes de subir a R2. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Información del negocio (`GET/PATCH /api/v1/tenant`) y subida del logotipo.
 *
 * Es root-provided porque lo consumen tanto Ajustes (que lo edita) como el
 * sidebar (que solo lee `businessName`/`logoUrl`), de modo que al subir un logo
 * la barra lateral se actualiza sola.
 *
 * A diferencia de `TenantContextService` —que resuelve el slug del hostname de
 * forma síncrona al arrancar— este servicio habla con el backend.
 */
@Injectable({ providedIn: 'root' })
export class TenantInfoService {
  private readonly http = inject(HttpClient);
  private readonly tenantContext = inject(TenantContextService);
  private readonly baseUrl = `${environment.apiBaseUrl}/tenant`;
  private readonly uploadsUrl = `${environment.apiBaseUrl}/uploads`;

  readonly info = signal<TenantInfo | null>(null);
  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  /** Nombre del negocio; cae al slug capitalizado mientras no haya datos. */
  readonly businessName = computed(() => {
    const name = this.info()?.name;
    if (name) return name;
    const slug = this.tenantContext.tenantSlug();
    return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Heladería';
  });

  readonly logoUrl = computed(() => this.info()?.logo_url ?? null);

  /** Mensaje de cierre de la factura; nunca vacío. */
  readonly receiptMessage = computed(
    () => this.info()?.receipt_message?.trim() || DEFAULT_RECEIPT_MESSAGE,
  );

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.info.set(await firstValueFrom(this.http.get<TenantInfo>(this.baseUrl)));
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo cargar la información del negocio.'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Guarda cambios sueltos del negocio (`PATCH /tenant`). Devuelve `true` si se
   * guardó. La respuesta trae el tenant completo, así que refresca `info` y con
   * ella el sidebar y todo lo que lea sus señales.
   *
   * spec 088: este método **nunca** reenvía `logo_url` (el tipo lo impide): el logo solo
   * cambia con `uploadLogo`, que envía además su base. Reenviar el logo sin tocar era lo que
   * un formulario desactualizado usaba para deshacer un logo más nuevo.
   */
  async update(patch: Partial<Omit<TenantInfo, 'logo_url'>>): Promise<boolean> {
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      this.info.set(await firstValueFrom(this.http.patch<TenantInfo>(this.baseUrl, patch)));
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo guardar la información del negocio.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Sube el logo a R2 y lo persiste en el tenant.
   *
   * Pide una URL prefirmada (`folder: 'logo'`), sube los bytes **directo a R2**
   * (el `authTokenInterceptor` no decora esa URL porque no cuelga de
   * `apiBaseUrl`) y guarda la URL pública con `PATCH /tenant`; el backend borra
   * el logo anterior. Devuelve `true` si se guardó.
   *
   * spec 088 (FR-002): junto con el logo nuevo viaja `logo_url_base`, el logo que este
   * navegador conoce (`null` explícito si el negocio no tenía). Si otra sesión ya lo cambió,
   * el backend ignora en silencio el logo de este formulario en vez de pisarlo.
   */
  async uploadLogo(file: File): Promise<boolean> {
    if (!file.type.startsWith('image/')) {
      this.error.set('El archivo debe ser una imagen.');
      return false;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.error.set('La imagen supera el máximo de 2 MB.');
      return false;
    }

    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const presign = await firstValueFrom(
        this.http.post<PresignResponse>(`${this.uploadsUrl}/presign`, {
          filename: file.name,
          content_type: file.type,
          folder: 'logo',
        }),
      );
      await firstValueFrom(
        this.http.put(presign.upload_url, file, { headers: { 'Content-Type': file.type } }),
      );
      this.info.set(
        await firstValueFrom(
          this.http.patch<TenantInfo>(this.baseUrl, {
            logo_url: presign.public_url,
            logo_url_base: this.info()?.logo_url ?? null,
          }),
        ),
      );
      return true;
    } catch (err) {
      this.error.set(this.extractError(err, 'No se pudo subir el logotipo.'));
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: unknown; message?: string } | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return (detail[0] as { msg?: string })?.msg ?? fallback;
      }
      return body?.message ?? fallback;
    }
    return fallback;
  }
}
