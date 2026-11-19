import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LegalDocumentService } from '../../services/legal-document.service';
import { ALLOWED_TEMPLATE_VARIABLES, MasterLegalTemplate } from '../../interfaces/legal-document.interface';
import { TenantDatePipe } from '../../../../shared/pipes/tenant-date.pipe';
import { FALLBACK_TIMEZONE } from '../../../../shared/date-format.util';

const ESTADO_BADGE: Record<string, string> = {
  borrador: 'bg-amber-50 text-amber-700 border-amber-200',
  publicado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  superado: 'bg-gray-50 text-gray-500 border-gray-200',
};

/** Administración de la plantilla legal maestra (spec 162, Historia de
 * Usuario 2): un borrador a la vez, con la lista cerrada de variables como
 * ayuda visual y el error 422 de `variables_no_permitidas` resaltado en el
 * editor. Publicar nunca recalcula los documentos ya publicados de los
 * tenants (FR-010) — esta pantalla solo gestiona la plantilla en sí. */
@Component({
  selector: 'app-legal-master-template-page',
  standalone: true,
  imports: [FormsModule, TenantDatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Plantilla legal maestra</h1>
        <p class="text-gray-500 text-sm mt-1">
          El texto base que cada tenant rellena con sus propios datos para publicar su
          documento legal.
        </p>
      </div>

      @if (service.error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {{ service.error() }}
          @if (service.templateVariablesNoPermitidas().length > 0) {
            <ul class="mt-1 list-disc list-inside">
              @for (v of service.templateVariablesNoPermitidas(); track v) {
                <li><code>{{ '{{' + v + '}}' }}</code></li>
              }
            </ul>
          }
        </div>
      }

      @if (service.loading()) {
        <div class="flex justify-center py-12">
          <div
            class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
          ></div>
        </div>
      } @else {
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div class="text-xs text-gray-500">
            Variables permitidas:
            @for (v of allowedVariables; track v) {
              <code class="mx-0.5 px-1.5 py-0.5 rounded bg-gray-100">{{ '{{' + v + '}}' }}</code>
            }
          </div>

          @if (draft(); as d) {
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-gray-900">Borrador — versión {{ d.version }}</h2>
              <span class="text-xs px-2 py-1 rounded-full border {{ ESTADO_BADGE[d.estado] }}">{{
                d.estado
              }}</span>
            </div>
            <textarea
              [(ngModel)]="editorText"
              (input)="onEditorInput()"
              rows="14"
              class="w-full rounded-xl border border-gray-200 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Contenido en Markdown, usa las variables de la lista de arriba..."
            ></textarea>
            <div class="flex items-center gap-3">
              <button
                (click)="saveDraft(d)"
                [disabled]="service.isSubmitting() || !editorText.trim()"
                class="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 disabled:opacity-50"
              >
                Guardar borrador
              </button>
              <input
                type="datetime-local"
                [(ngModel)]="fechaVigencia"
                class="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              <button
                (click)="publish(d)"
                [disabled]="service.isSubmitting() || !fechaVigencia || !editorText.trim()"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                Publicar
              </button>
            </div>
          } @else {
            @if (history().length > 0) {
              <p class="text-sm text-gray-500">
                La versión publicada no se puede editar directamente. Para hacer cambios, crea
                un nuevo borrador a partir de ella — al publicarlo, reemplazará a la versión
                actual.
              </p>
            }
            <button
              (click)="createDraft()"
              [disabled]="service.isSubmitting()"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50"
            >
              + Crear nuevo borrador de la plantilla
            </button>
          }
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-3 border-b border-gray-100 font-medium text-gray-900 text-sm">
            Historial de versiones
          </div>
          @if (history().length === 0) {
            <p class="px-5 py-8 text-center text-sm text-gray-500">
              Todavía no hay ninguna versión de la plantilla.
            </p>
          } @else {
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th class="text-left px-5 py-2">Versión</th>
                  <th class="text-left px-5 py-2">Estado</th>
                  <th class="text-left px-5 py-2">Vigencia</th>
                  <th class="text-left px-5 py-2">Publicado</th>
                  <th class="text-left px-5 py-2"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (t of history(); track t.id) {
                  <tr>
                    <td class="px-5 py-2">{{ t.version }}</td>
                    <td class="px-5 py-2">
                      <span class="text-xs px-2 py-1 rounded-full border {{ ESTADO_BADGE[t.estado] }}">{{
                        t.estado
                      }}</span>
                    </td>
                    <td class="px-5 py-2">
                      {{ t.fecha_vigencia ? (t.fecha_vigencia | tenantDate: 'dd/MM/yyyy HH:mm' : fallbackTimezone) : '—' }}
                    </td>
                    <td class="px-5 py-2">
                      {{ t.published_at ? (t.published_at | tenantDate: 'dd/MM/yyyy HH:mm' : fallbackTimezone) : '—' }}
                    </td>
                    <td class="px-5 py-2 text-right whitespace-nowrap">
                      <button
                        (click)="openPreview(t)"
                        class="text-xs font-medium text-indigo-600 hover:text-indigo-800 mr-3"
                      >
                        Vista previa
                      </button>
                      @if (t.estado === 'borrador') {
                        <button
                          (click)="deleteDraft(t.id)"
                          [disabled]="service.isSubmitting()"
                          class="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Eliminar borrador
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }

      @if (previewOpen()) {
        <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="closePreview()">
          <div
            class="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
            (click)="$event.stopPropagation()"
          >
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-semibold text-gray-900">
                Vista previa — versión {{ previewVersion() }}
              </h2>
              <button (click)="closePreview()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">
                &times;
              </button>
            </div>
            @if (previewLoading()) {
              <div class="flex justify-center py-10">
                <div class="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            } @else {
              <article class="prose prose-sm max-w-none" [innerHTML]="previewHtml()"></article>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
    /* Tailwind v4 preflight strips list/table defaults and there is no
     * @tailwindcss/typography plugin installed; restore minimal readable
     * structure for the raw HTML injected via [innerHTML] (::ng-deep: that
     * content bypasses Angular's view-encapsulation attribute, so scoped
     * selectors without it never match). */
    :host ::ng-deep .prose :is(ul, ol) {
      list-style: revert;
      padding-left: 1.5rem;
      margin: 0.5rem 0;
    }
    :host ::ng-deep .prose li {
      margin: 0.25rem 0;
    }
    :host ::ng-deep .prose p {
      margin: 0.5rem 0;
    }
    :host ::ng-deep .prose :is(h1, h2, h3) {
      font-weight: 600;
      margin: 1rem 0 0.5rem;
    }
    :host ::ng-deep .prose table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.75rem 0;
    }
    :host ::ng-deep .prose :is(th, td) {
      border: 1px solid #e5e7eb;
      padding: 0.5rem;
      text-align: left;
    }
    :host ::ng-deep .prose strong {
      font-weight: 600;
    }
    `,
  ],
})
export class LegalMasterTemplatePageComponent implements OnInit {
  protected readonly service = inject(LegalDocumentService);

  protected readonly ESTADO_BADGE = ESTADO_BADGE;
  protected readonly allowedVariables = ALLOWED_TEMPLATE_VARIABLES;

  protected readonly history = computed(() => this.service.templateHistory());
  protected readonly draft = computed(() => this.history().find((t) => t.estado === 'borrador'));

  protected editorText = '';
  protected fechaVigencia = '';
  protected readonly fallbackTimezone = FALLBACK_TIMEZONE;

  protected readonly previewOpen = signal(false);
  protected readonly previewLoading = signal(false);
  protected readonly previewHtml = signal('');
  protected readonly previewVersion = signal<number | null>(null);

  private editorDirty = false;

  async ngOnInit(): Promise<void> {
    await this.service.loadMasterTemplateHistory();
    if (!this.editorDirty) {
      this.editorText = this.draft()?.contenido_markdown ?? '';
    }
  }

  onEditorInput(): void {
    this.editorDirty = true;
  }

  /** Nuevo borrador precargado con el contenido de la versión publicada
   * vigente (o, si todavía no hay ninguna publicada, la más reciente del
   * historial) — así el admin edita desde un punto de partida conocido en
   * vez de volver a escribir todo el texto. */
  async createDraft(): Promise<void> {
    const base =
      this.history().find((t) => t.estado === 'publicado') ?? this.history()[0];
    if (await this.service.createMasterTemplateDraft(base?.contenido_markdown ?? '')) {
      this.editorText = this.draft()?.contenido_markdown ?? '';
      this.editorDirty = false;
    }
  }

  async saveDraft(d: { id: string }): Promise<void> {
    await this.service.editMasterTemplateDraft(d.id, this.editorText);
  }

  /** Publicar no envía el textarea — el backend publica el contenido ya
   * persistido en la fila. Por eso se guarda el borrador con el texto
   * actual antes de publicar: de lo contrario, si el admin escribió pero
   * nunca le dio a "Guardar borrador", se publicaría el contenido viejo
   * (o vacío) que ya estaba guardado. */
  async publish(d: { id: string }): Promise<void> {
    if (!(await this.service.editMasterTemplateDraft(d.id, this.editorText))) {
      return;
    }
    const iso = new Date(this.fechaVigencia).toISOString();
    if (await this.service.publishMasterTemplate(d.id, iso)) {
      this.fechaVigencia = '';
    }
  }

  async deleteDraft(id: string): Promise<void> {
    if (await this.service.deleteMasterTemplateDraft(id)) {
      this.editorText = this.draft()?.contenido_markdown ?? '';
      this.editorDirty = false;
    }
  }

  async openPreview(t: MasterLegalTemplate): Promise<void> {
    this.previewVersion.set(t.version);
    this.previewOpen.set(true);
    this.previewLoading.set(true);
    this.previewHtml.set('');
    try {
      this.previewHtml.set(await this.service.previewMasterTemplate(t.id));
    } finally {
      this.previewLoading.set(false);
    }
  }

  closePreview(): void {
    this.previewOpen.set(false);
  }
}
