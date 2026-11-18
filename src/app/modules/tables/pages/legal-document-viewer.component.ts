import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DinerService } from '../services/diner.service';

/**
 * spec 162 (FR-017, Decisión 8 de research.md): página pública, sin sesión,
 * que muestra el contenido completo del aviso legal vigente del tenant — el
 * enlace que el flujo de nombre del menú QR ofrece antes de pedir el nombre
 * (`public-menu.component.ts`). Direccionable por el id opaco del snapshot,
 * nunca necesita el token de mesa.
 */
@Component({
  selector: 'app-legal-document-viewer',
  standalone: true,
  template: `
    <div class="min-h-screen bg-gray-50 px-4 py-10">
      <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10">
        @if (loading()) {
          <div class="flex items-center justify-center py-16">
            <div class="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        } @else if (errorMessage()) {
          <p class="text-red-600 text-sm">{{ errorMessage() }}</p>
        } @else {
          <article class="prose prose-sm sm:prose-base max-w-none" [innerHTML]="html()"></article>
        }
      </div>
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
export class LegalDocumentViewerComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly diner = inject(DinerService);

  readonly loading = signal(true);
  readonly html = signal('');
  readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      const doc = await this.diner.getTenantLegalDocument(id);
      this.html.set(doc.contenido_html);
    } catch {
      this.errorMessage.set('No se pudo cargar el documento legal.');
    } finally {
      this.loading.set(false);
    }
  }
}
