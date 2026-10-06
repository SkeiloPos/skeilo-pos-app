import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { environment } from '../../../../environments/environment';

/**
 * Cascarón compartido de las tres pantallas de autenticación (spec 095).
 *
 * La estructura, las medidas y los colores salen **literalmente** de
 * `Login.dc.html` y de los tokens del sistema de diseño entregado: rejilla de
 * `minmax(360px,1fr) minmax(0,1.15fr)` con 24 px de separación sobre un lienzo
 * de 20 px, columna izquierda de 420 px centrada con 40 px entre el logotipo y
 * el formulario, y pie repartido a los extremos.
 *
 * Pone el logotipo, la insignia de contexto, el pie y el panel de marca; cada
 * pantalla aporta solo su formulario vía `<ng-content>`. Eso hace de FR-001 y
 * FR-002 una propiedad estructural en lugar de una coincidencia que se rompe en
 * el primer arreglo, y concentra en un archivo —con sus tests— los requisitos
 * transversales.
 *
 * **Lee el contexto, no lo clasifica** (FR-010): la decisión de qué es este host
 * la tomó el resolvedor de la spec 091 en el arranque, de forma síncrona y sin
 * red. Por eso la etiqueta sale ya con su texto definitivo (FR-007c) y por eso
 * el cascarón no emite ninguna petición en ningún contexto (FR-007a).
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconMiComponent],
  template: `
    <div
      class="auth-theme min-h-screen bg-white grid grid-cols-1 lg:grid-cols-[minmax(360px,1fr)_minmax(0,1.15fr)] gap-6 p-5 overflow-auto"
    >
      <!-- Columna del formulario. El pie se separa con space-between y el bloque
           central se centra con margin auto, como en el diseño. Orden fijo:
           logotipo → insignia → contenido → pie (FR-002). -->
      <div class="flex flex-col justify-between px-[4vw] pt-3 pb-1 lg:min-h-[560px]">
        <div class="flex flex-col items-center gap-10 my-auto w-full max-w-[420px] self-center">
          <img
            data-testid="auth-brand-logo"
            src="/images/logo-horizontal.webp"
            alt="SkeiloPOS"
            width="140"
            height="48"
            class="h-12 w-[140px] object-contain object-left shrink-0"
          />

          @if (tenant.isUnrecognized()) {
            <!-- Host sin acceso (dominio raíz, slug reservado o desconocido): sin
                 formulario y sin llamadas al API. La spec 091 lo aplicaba solo al
                 inicio de sesión; aquí cubre las tres pantallas (FR-009, R6). -->
            <div data-testid="unrecognized-host" class="w-full flex flex-col gap-5">
              <div>
                <h1 class="auth-title">No encontramos este negocio</h1>
                <p class="auth-subtitle leading-relaxed">
                  Verifica la dirección e ingresa desde el enlace de tu negocio o desde el acceso de
                  administración de la plataforma.
                </p>
              </div>
              <a [href]="publicSiteUrl" class="auth-link-button">
                Ir al sitio de SkeiloPOS
              </a>
            </div>
          } @else {
            <!-- Sin separación propia: los 14 px entre la insignia y el título
                 los pone el margen de la insignia, como en el diseño, y el resto
                 del espaciado lo gobierna el formulario que se proyecta. -->
            <main class="w-full flex flex-col">
              @if (tenant.isSuperAdmin()) {
                <span data-testid="auth-context-badge" class="auth-badge self-start mb-3.5">
                  <app-mi-icon name="admin_panel_settings" [size]="13" />
                  Administración de la plataforma
                </span>
              } @else {
                <!-- El slug se muestra **sin transformar** (FR-007). El recorte es
                     puramente visual: el valor completo sigue en el DOM y en "title". -->
                <span
                  data-testid="auth-context-badge"
                  [title]="tenant.tenantSlug()"
                  class="auth-badge self-start mb-3.5"
                >
                  <app-mi-icon name="storefront" [size]="13" />
                  <span class="max-w-[16rem] truncate">{{ tenant.tenantSlug() }}</span>
                </span>
              }

              <ng-content />
            </main>
          }
        </div>

        <footer
          data-testid="auth-footer"
          class="flex justify-between gap-3 flex-wrap text-[13px]"
          style="color: var(--auth-text-muted)"
        >
          <!-- Calculado, no escrito a mano: un año fijo en el pie envejece solo. -->
          <span>© {{ year }} SkeiloPOS</span>
          <a [href]="publicSiteUrl + '/privacidad'" class="hover:underline">
            Política de privacidad
          </a>
        </footer>
      </div>

      <!-- Panel de marca. Oculto por debajo de 1024 px, y la vista previa entra
           por CSS (.auth-brand-preview, tras su media query) en vez de por una
           etiqueta de imagen: así el archivo no se descarga donde no se ve
           (FR-005, SC-007). El color de fondo es propio, de modo que si el
           activo falta queda un panel liso con su lema, no un hueco roto. -->
      <div
        data-testid="auth-brand-panel"
        class="auth-brand-panel hidden lg:flex flex-col gap-3 relative"
      >
        <h2 class="auth-brand-title">Tu negocio. Más rápido.</h2>
        <p class="auth-brand-text">
          Del caos de las comandas en papel a la velocidad digital en un tap.
        </p>
        <div class="flex-1 min-h-0 mt-6 flex items-center justify-center">
          <div class="auth-brand-preview"></div>
        </div>
      </div>
    </div>
  `,
})
export class AuthShellComponent {
  readonly tenant = inject(TenantContextService);

  readonly year = new Date().getFullYear();
  readonly publicSiteUrl = environment.publicSiteUrl;
}
