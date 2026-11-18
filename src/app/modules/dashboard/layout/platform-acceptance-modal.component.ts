import { Component, computed, inject } from '@angular/core';
import { PlatformAcceptanceService } from './platform-acceptance.service';

const TIPO_LABEL: Record<string, string> = {
  privacidad: 'Política de privacidad',
  terminos: 'Términos y condiciones',
};

/** Modal que bloquea el panel del tenant hasta que el administrador acepta
 * cada documento de plataforma vigente pendiente (spec 162, FR-019). Se
 * monta una vez en `dashboard-layout.component.ts`, solo para usuarios de
 * tenant (no Super Admin, que no acepta nada aquí). */
@Component({
  selector: 'app-platform-acceptance-modal',
  standalone: true,
  template: `
    @if (current(); as doc) {
      <div class="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4">
          <div>
            <h2 class="text-lg font-bold text-gray-900">
              {{ TIPO_LABEL[doc.tipo] }} — versión {{ doc.version }}
            </h2>
            <p class="text-sm text-gray-500 mt-1">
              Antes de continuar, debes aceptar esta versión actualizada.
            </p>
          </div>
          <div
            class="max-h-72 overflow-y-auto rounded-xl border border-gray-200 p-4 text-sm text-gray-700 whitespace-pre-wrap"
          >{{ doc.contenido_markdown }}</div>

          @if (service.error()) {
            <p class="text-sm text-red-600">{{ service.error() }}</p>
          }

          <div class="flex justify-end">
            <button
              type="button"
              (click)="accept(doc.platform_document_id)"
              [disabled]="service.isAccepting()"
              class="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              He leído y acepto
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PlatformAcceptanceModalComponent {
  protected readonly service = inject(PlatformAcceptanceService);
  protected readonly TIPO_LABEL = TIPO_LABEL;

  // Uno a la vez: aceptar el primero recarga la lista y muestra el siguiente,
  // en vez de pedir todas las aceptaciones en un solo clic.
  protected readonly current = computed(() => this.service.pendientes()[0] ?? null);

  async accept(platformDocumentId: string): Promise<void> {
    await this.service.accept(platformDocumentId);
  }
}
