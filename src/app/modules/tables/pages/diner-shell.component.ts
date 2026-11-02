import { Component, OnDestroy, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DinerTokenStore } from '../services/diner-token.store';
import { DinerService } from '../services/diner.service';
import { AvailabilitySyncService } from '../../../core/availability/availability-sync.service';
import { DiningCartService } from '../services/dining-cart.service';
import { LiveStatusIndicatorComponent } from '../../../core/availability/live-status-indicator.component';

/** Ambos hijos llevan el token firmado en su propio segmento (`menu/t/:token`
 *  o `menu/t/:token/checkout/**`) — el shell en sí no tiene ese parámetro
 *  de ruta (research.md H9), así que se extrae de la URL completa. */
const QR_TOKEN_PATTERN = /\/menu\/t\/([^/?]+)/;

/**
 * Shell sin `path` que envuelve `/menu/t/:token` (`PublicMenuComponent`) y
 * `/menu/t/:token/checkout/**` (spec 077, corrección post-implementación).
 *
 * Antes cada uno abría/cerraba su propia conexión SSE del comensal
 * (`RealtimeService.connectDiner()`/`.disconnect()`), y al ser rutas
 * hermanas, navegar del menú al checkout destruía `PublicMenuComponent` y con
 * él la única conexión — el comensal quedaba sin tiempo real mientras
 * pagaba, justo cuando podía llegarle la confirmación de pago. Este shell es
 * ahora el único dueño de esa conexión (mismo rol que `DashboardLayoutComponent`
 * ya cumple del lado del staff), así que sobrevive a la navegación entre el
 * menú y el checkout.
 *
 * El comensal no tiene sesión hasta que confirma su nombre, así que no hay un
 * `ngOnInit` imperativo: se reacciona al signal de `DinerTokenStore`, que es
 * la misma señal que ya usan `exit()`/`expireSession()` de `PublicMenuComponent`
 * para marcar "se acabó la sesión".
 *
 * Spec 148 (D10/H9): el sincronizador de disponibilidad del comensal vive
 * aquí también, por la misma razón — no puede depender de que
 * `PublicMenuComponent` esté viva, porque se destruye al navegar al checkout.
 * A diferencia de la conexión SSE (que depende del `session_token`), la
 * consulta de reconciliación necesita el token **firmado** del QR, que viaja
 * en la URL de cada hijo, no en `DinerTokenStore`.
 */
@Component({
  selector: 'app-diner-shell',
  standalone: true,
  imports: [RouterOutlet, LiveStatusIndicatorComponent],
  template: `
    <div class="pointer-events-none fixed inset-x-0 top-2 z-40 flex justify-center">
      <div class="pointer-events-auto">
        <app-live-status-indicator />
      </div>
    </div>
    <router-outlet />
  `,
})
export class DinerShellComponent implements OnDestroy {
  private readonly realtime = inject(RealtimeService);
  private readonly tokenStore = inject(DinerTokenStore);
  private readonly router = inject(Router);
  private readonly dinerService = inject(DinerService);
  private readonly availabilitySync = inject(AvailabilitySyncService);
  private readonly diningCart = inject(DiningCartService);

  private readonly qrToken = signal<string | null>(this.extractQrToken(this.router.url));
  private unregisterCartTarget: (() => void) | null = null;

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.qrToken.set(this.extractQrToken(e.urlAfterRedirects)));

    effect(() => {
      const token = this.tokenStore.token();
      if (token) {
        this.realtime.connectDiner(token);
      } else {
        this.realtime.disconnect();
      }
    });

    effect(() => {
      const token = this.qrToken();
      if (token) {
        this.unregisterCartTarget ??= this.availabilitySync.registerTarget(this.diningCart);
        this.availabilitySync.start(() => this.dinerService.getAvailability(token));
      } else {
        this.availabilitySync.stop();
        this.unregisterCartTarget?.();
        this.unregisterCartTarget = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
    this.availabilitySync.stop();
    this.unregisterCartTarget?.();
    this.unregisterCartTarget = null;
  }

  private extractQrToken(url: string): string | null {
    return QR_TOKEN_PATTERN.exec(url)?.[1] ?? null;
  }
}
