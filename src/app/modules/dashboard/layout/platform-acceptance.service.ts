import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

/** Un documento de plataforma vigente que el admin del tenant aún no aceptó
 * (`GET /legal/platform-acceptance/pending`, spec 162, FR-019). */
export interface PendingPlatformAcceptance {
  tipo: 'privacidad' | 'terminos';
  platform_document_id: string;
  version: number;
  contenido_markdown: string;
}

/** Bloqueo del panel del tenant hasta aceptar los documentos legales de
 * plataforma vigentes (spec 162, Historia de Usuario 1, AC6/AC7). Se
 * consulta al cargar el shell (`dashboard-layout.component.ts`) y cada vez
 * que el super admin publica una versión nueva reabre el bloqueo para quien
 * no la haya aceptado todavía — no hay forma de "recordar" una aceptación
 * fuera de la fila que crea `POST .../accept`. */
@Injectable({ providedIn: 'root' })
export class PlatformAcceptanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/legal`;

  readonly pendientes = signal<PendingPlatformAcceptance[]>([]);
  readonly isAccepting = signal(false);
  readonly error = signal<string | null>(null);

  async loadPending(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ pendientes: PendingPlatformAcceptance[] }>(
          `${this.baseUrl}/platform-acceptance/pending`,
        ),
      );
      this.pendientes.set(res.pendientes);
    } catch {
      // Fail-open: si la consulta falla (red, 401 en medio de un refresh,
      // etc.) no se bloquea el panel por un problema de transporte — solo se
      // vuelve a intentar en la siguiente carga del shell.
      this.pendientes.set([]);
    }
  }

  async accept(platformDocumentId: string): Promise<void> {
    this.isAccepting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/platform-acceptance/accept`, {
          platform_document_id: platformDocumentId,
        }),
      );
      this.pendientes.update((list) =>
        list.filter((p) => p.platform_document_id !== platformDocumentId),
      );
    } catch {
      this.error.set('No se pudo registrar la aceptación. Inténtalo de nuevo.');
    } finally {
      this.isAccepting.set(false);
    }
  }
}
