import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TenantLegalService } from '../../services/tenant-legal.service';
import { TenantDatePipe } from '../../../../shared/pipes/tenant-date.pipe';

const CAMPO_LABEL: Partial<Record<string, string>> = {
  razon_social: 'Razón social',
  identificacion_legal: 'Identificación legal (NIT/RUT)',
  direccion_legal: 'Dirección legal',
  ciudad: 'Ciudad',
  correo_contacto: 'Correo de contacto',
  telefono_contacto: 'Teléfono de contacto',
};

/** Perfil legal del tenant + vista previa + publicación de su documento
 * legal propio (spec 162, Historia de Usuario 3). La vista previa no
 * guarda nada (FR-013); publicar crea un snapshot inmutable que ni una
 * edición posterior del perfil ni una nueva versión de la plantilla
 * cambian (FR-014) — el banner de FR-015 solo informa que hay una versión
 * de plantilla más nueva disponible, no fuerza nada. */
@Component({
  selector: 'app-tenant-legal-document-page',
  standalone: true,
  imports: [FormsModule, TenantDatePipe],
  template: `
    <div class="ajustes-theme flex flex-col pt-2 gap-6">
      @if (service.templateUpdateStatus()?.actualizacion_pendiente) {
        <div class="rounded-xl px-4 py-3 text-sm bg-amber-50 border border-amber-200 text-amber-800">
          Hay una nueva versión de la plantilla legal (v{{
            service.templateUpdateStatus()?.version_disponible
          }}) — tu documento sigue vigente, pero puedes revisarlo y volver a publicarlo cuando
          quieras.
        </div>
      }

      @if (service.error()) {
        <div class="rounded-xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700">
          {{ service.error() }}
          @if (service.camposFaltantes().length > 0) {
            <ul class="mt-1 list-disc list-inside">
              @for (c of service.camposFaltantes(); track c) {
                <li>{{ campoLabel[c] ?? c }}</li>
              }
            </ul>
          }
        </div>
      }

      <div class="aj-row">
        <div>
          <div class="aj-row-title">Datos del negocio</div>
          <div class="aj-row-desc">
            Se usan para rellenar la plantilla legal de la plataforma y generar tu propio
            documento.
          </div>
        </div>
        <div class="min-w-0 flex flex-col gap-3">
          <label class="text-sm font-medium" for="razon_social">Razón social</label>
          <input id="razon_social" class="aj-input" [(ngModel)]="form.razon_social" />

          <label class="text-sm font-medium" for="identificacion_legal">Identificación legal (NIT/RUT)</label>
          <input id="identificacion_legal" class="aj-input" [(ngModel)]="form.identificacion_legal" />

          <label class="text-sm font-medium" for="direccion_legal">Dirección legal</label>
          <input id="direccion_legal" class="aj-input" [(ngModel)]="form.direccion_legal" />

          <label class="text-sm font-medium" for="ciudad">Ciudad</label>
          <input id="ciudad" class="aj-input" [(ngModel)]="form.ciudad" />

          <label class="text-sm font-medium" for="correo_contacto">Correo de contacto</label>
          <input id="correo_contacto" type="email" class="aj-input" [(ngModel)]="form.correo_contacto" />

          <label class="text-sm font-medium" for="telefono_contacto">Teléfono de contacto</label>
          <input id="telefono_contacto" class="aj-input" [(ngModel)]="form.telefono_contacto" />

          <div class="flex gap-3">
            <button
              (click)="saveProfile()"
              [disabled]="service.isSubmitting()"
              class="aj-btn-secondary text-sm"
            >
              Guardar datos
            </button>
            <button
              (click)="preview()"
              [disabled]="service.isSubmitting()"
              class="aj-btn-secondary text-sm"
            >
              Vista previa
            </button>
          </div>
        </div>
      </div>

      @if (service.previewHtml(); as html) {
        <div class="aj-row">
          <div>
            <div class="aj-row-title">Vista previa</div>
            <div class="aj-row-desc">Así se verá tu documento legal una vez publicado.</div>
          </div>
          <div class="min-w-0">
            <div class="rounded-xl border border-gray-200 p-4 text-sm whitespace-pre-wrap">{{ html }}</div>
            <button
              (click)="publish()"
              [disabled]="service.isSubmitting()"
              class="aj-btn-primary text-sm mt-3"
            >
              Publicar documento legal
            </button>
          </div>
        </div>
      }

      <div class="aj-row">
        <div>
          <div class="aj-row-title">Documento vigente</div>
          <div class="aj-row-desc">El snapshot publicado actualmente, visible para tus clientes.</div>
        </div>
        <div class="min-w-0">
          @if (service.currentDocument(); as doc) {
            <div class="aj-kv">
              <span class="aj-muted">Versión</span>
              <span>{{ doc.version }}</span>
            </div>
            <div class="aj-kv">
              <span class="aj-muted">Publicado</span>
              <span>{{ doc.published_at | tenantDate: 'dd/MM/yyyy HH:mm' }}</span>
            </div>
          } @else {
            <p class="aj-muted text-sm">Todavía no has publicado ningún documento legal.</p>
          }
        </div>
      </div>
    </div>
  `,
})
export class TenantLegalDocumentPageComponent implements OnInit {
  protected readonly service = inject(TenantLegalService);
  protected readonly campoLabel = CAMPO_LABEL;

  protected formValue: {
    razon_social: string | null;
    identificacion_legal: string | null;
    direccion_legal: string | null;
    ciudad: string | null;
    correo_contacto: string | null;
    telefono_contacto: string | null;
  } = { ...this.service.profile() };

  // Simplificado: `form` como plain object mutable para ngModel.
  protected get form() {
    return this.formValue;
  }

  async ngOnInit(): Promise<void> {
    await this.service.loadProfile();
    this.formValue = { ...this.service.profile() };
    await this.service.loadCurrentDocument();
    await this.service.loadTemplateUpdateStatus();
  }

  async saveProfile(): Promise<void> {
    await this.service.saveProfile(this.formValue);
  }

  async preview(): Promise<void> {
    await this.service.preview();
  }

  async publish(): Promise<void> {
    await this.service.publish();
  }
}
