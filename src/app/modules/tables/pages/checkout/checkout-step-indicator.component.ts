import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Indicador de paso (FR-002), compartido por los cuatro componentes de la
 * vista de revisión y pago — no hay un componente contenedor propio (cada
 * paso es su propia ruta, `app.routes.ts`), así que cada uno lo incluye en su
 * plantilla en vez de heredarlo de un padre común.
 */
@Component({
  selector: 'app-checkout-step-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="text-sm font-semibold text-violet-700">Paso {{ step }} de {{ total }}: {{ label }}</p>
  `,
})
export class CheckoutStepIndicatorComponent {
  @Input({ required: true }) step!: number;
  @Input({ required: true }) total!: number;
  @Input({ required: true }) label!: string;
}
