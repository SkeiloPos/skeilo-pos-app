import { ChangeDetectionStrategy, Component, EventEmitter, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorBody } from '../../../core/auth/auth.models';
import { InventoryImportJob } from '../interfaces/inventory.interface';
import { InventoryService } from '../services/inventory.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { startVisibleInterval, VisibleInterval } from '../../../core/realtime/visible-interval';

/**
 * Modal de importación masiva de inventario (spec 109). Sube un `.xlsx`, confirma de
 * inmediato que quedó "en proceso" sin bloquear la pantalla (Historia 3) y sondea el
 * resultado con `startVisibleInterval` hasta que termina, mostrando el resumen y el
 * reporte de errores descargable (Historia 4).
 *
 * Al abrirse, consulta `getCurrentImportJob()` para encontrar un import ya en curso o
 * recién terminado (Historia 3, escenario 2: cerrar y volver a abrir la pantalla no
 * pierde el seguimiento).
 */
@Component({
  selector: 'app-inventory-import-modal',
  standalone: true,
  imports: [IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">Importar inventario</h2>
          <button type="button" (click)="onClose()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <app-mi-icon name="close" ariaLabel="Cerrar" [size]="20" />
          </button>
        </div>

        <div class="p-6 space-y-4">
          @let current = job();

          @if (!current || current.status !== 'procesando') {
            <p class="text-sm text-gray-500">
              Sube un archivo <code>.xlsx</code> exportado desde este módulo (o basado en su
              plantilla) para crear o actualizar insumos de forma masiva.
            </p>
            <input #fileInput type="file" accept=".xlsx"
              class="w-full text-sm border border-gray-300 rounded-xl px-3 py-2"
              (change)="onFileSelected($event)">
            @if (error()) {
              <p class="text-red-600 text-sm">{{ error() }}</p>
            }
            <div class="flex gap-3 pt-2">
              <button type="button" (click)="onClose()"
                class="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cerrar
              </button>
              <button type="button" (click)="upload()" [disabled]="!selectedFile() || uploading()"
                class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {{ uploading() ? 'Subiendo...' : 'Importar' }}
              </button>
            </div>
          }

          @if (current && current.status === 'procesando') {
            <div class="flex items-center gap-3 py-4">
              <div class="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin"></div>
              <p class="text-sm text-gray-600">
                Importando "{{ current.file_name }}" ({{ current.total_rows }} filas)... puedes
                cerrar esta ventana y seguir usando el sistema.
              </p>
            </div>
          }

          @if (current && current.status !== 'procesando') {
            <div class="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
              <p class="text-sm font-medium text-gray-900">Resultado de "{{ current.file_name }}"</p>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p class="text-lg font-bold text-green-600">{{ current.created_count }}</p>
                  <p class="text-[11px] text-gray-400 uppercase">Creados</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-indigo-600">{{ current.updated_count }}</p>
                  <p class="text-[11px] text-gray-400 uppercase">Actualizados</p>
                </div>
                <div>
                  <p class="text-lg font-bold" [class]="current.failed_count > 0 ? 'text-red-600' : 'text-gray-400'">
                    {{ current.failed_count }}
                  </p>
                  <p class="text-[11px] text-gray-400 uppercase">Fallidos</p>
                </div>
              </div>
              @if (current.has_errors) {
                <button type="button" (click)="downloadErrors(current)"
                  class="w-full mt-2 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2">
                  <app-mi-icon name="download" [size]="16" />
                  Descargar reporte de errores
                </button>
              }
            </div>
            <button type="button" (click)="reset()"
              class="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
              Importar otro archivo
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class InventoryImportModalComponent implements OnInit, OnDestroy {
  @Output() close = new EventEmitter<void>();
  /** Emite cuando un import termina (finalizado o interrumpido) -- la pantalla de
   *  Inventario debe refrescar su listado para mostrar lo creado/actualizado. */
  @Output() imported = new EventEmitter<void>();

  private readonly service = inject(InventoryService);
  private readonly toast = inject(ToastService);

  readonly job = signal<InventoryImportJob | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);

  private polling: VisibleInterval | null = null;

  async ngOnInit(): Promise<void> {
    const current = await this.service.getCurrentImportJob().catch(() => null);
    if (current) {
      this.job.set(current);
      if (current.status === 'procesando') this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.polling?.stop();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
    this.error.set(null);
  }

  async upload(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const job = await this.service.importItems(file);
      this.job.set(job);
      this.selectedFile.set(null);
      this.startPolling();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.uploading.set(false);
    }
  }

  async downloadErrors(job: InventoryImportJob): Promise<void> {
    try {
      const resp = await new Promise<{ body: Blob | null; headers: { get(name: string): string | null } }>(
        (resolve, reject) => {
          this.service.downloadImportErrors(job.id).subscribe({
            next: (r) => resolve({ body: r.body, headers: r.headers }),
            error: reject,
          });
        },
      );
      if (!resp.body) return;
      const url = URL.createObjectURL(resp.body);
      const a = document.createElement('a');
      a.href = url;
      a.download = `errores_${job.file_name}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.toast.error('No se pudo descargar el reporte de errores');
    }
  }

  reset(): void {
    this.job.set(null);
    this.selectedFile.set(null);
    this.error.set(null);
  }

  onClose(): void {
    this.close.emit();
  }

  private startPolling(): void {
    this.polling?.stop();
    this.polling = startVisibleInterval(() => this.refresh(), 4000, { runOnResume: true });
  }

  private async refresh(): Promise<void> {
    const current = this.job();
    if (!current) return;
    const updated = await this.service.getImportJob(current.id).catch(() => null);
    if (!updated) return;
    this.job.set(updated);
    if (updated.status !== 'procesando') {
      this.polling?.stop();
      this.imported.emit();
    }
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiErrorBody | null;
      return body?.detail ?? body?.message ?? 'No se pudo importar el archivo.';
    }
    return 'No se pudo importar el archivo.';
  }
}
