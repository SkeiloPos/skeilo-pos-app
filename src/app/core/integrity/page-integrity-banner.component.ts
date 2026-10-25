import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { CANARY_TEXT } from './integrity-signals';
import { PageIntegrityService } from './page-integrity.service';

/**
 * Aviso de "página alterada por el navegador" (spec 134, FR-009).
 *
 * Se monta **una sola vez**, en `app.html` y fuera del `<router-outlet>`, así que
 * cubre el menú QR, el checkout, el panel, `/super-admin`, el login y la
 * recuperación de contraseña. Es una barra fija **no descartable** (sin botón de
 * cerrar, ni con Escape ni con clic fuera): su único control es "Recargar".
 *
 * Cada texto vive en su propio elemento y la línea de acción bloqueada se pinta
 * con `[textContent]`: así el propio aviso resiste a la alteración que denuncia
 * (FR-021) en vez de quedarse con un texto viejo sobre un nodo desconectado.
 *
 * También aloja el **canario** (S5): un nodo de texto oculto que la app escribe
 * una sola vez y que el servicio vigila. Está siempre presente, fuera del `@if`.
 *
 * Contrato: specs/134-bloqueo-traduccion-automatica/contracts/page-integrity.md.
 */
@Component({
  selector: 'app-page-integrity-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="sr-only print:hidden" aria-hidden="true" data-integrity-canary #canary>{{ canaryText }}</span>

    @if (integrity.altered()) {
      <div
        role="alert"
        aria-live="assertive"
        class="fixed inset-x-0 top-0 z-[100] bg-red-700 text-white shadow-lg print:hidden"
      >
        <!-- Título y botón en la misma fila: el aviso tapa lo que hay debajo (es fijo y no
             descartable), así que ocupa lo menos posible en un teléfono. -->
        <div class="mx-auto max-w-4xl space-y-1 px-4 py-2">
          <div class="flex items-center gap-3">
            <p class="min-w-0 flex-1 text-sm font-bold">La página fue alterada por el navegador</p>
            <button
              #recargar
              type="button"
              class="shrink-0 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              (click)="integrity.reload()"
            >
              Recargar
            </button>
          </div>
          <p class="text-xs leading-snug">
            Parece que el navegador o una extensión (por ejemplo, la traducción automática) cambió
            lo que ves. Puede no coincidir con tu pedido, por eso enviar el pedido y pagar están
            bloqueados. Recarga para continuar: lo que ya enviaste no se pierde.
          </p>
          @if (blockedLine()) {
            <p class="text-xs font-semibold" [textContent]="blockedLine()"></p>
          }
        </div>
      </div>
    }
  `,
})
export class PageIntegrityBannerComponent {
  protected readonly integrity = inject(PageIntegrityService);
  protected readonly canaryText = CANARY_TEXT;

  private readonly canary = viewChild.required<ElementRef<HTMLElement>>('canary');
  private readonly recargar = viewChild<ElementRef<HTMLButtonElement>>('recargar');

  protected readonly blockedLine = computed(() => {
    const accion = this.integrity.blockedNotice();
    return accion ? `No se pudo ${accion}: la página está alterada. Recarga para continuar.` : '';
  });

  constructor() {
    // El canario se registra cuando su texto ya está pintado.
    afterNextRender(() => this.integrity.registerCanary(this.canary().nativeElement));
    // "Recargar" recibe el foco al aparecer (lector de pantalla y teclado, D5).
    afterRenderEffect(() => this.recargar()?.nativeElement.focus());
  }
}
