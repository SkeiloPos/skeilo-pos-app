import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Destino seguro para cualquier rol cuando ni `roleGuard` ni `planModuleGuard`
 * encuentran una pantalla a la que mandarlo (spec: bucle de redirección KITCHEN).
 *
 * Bug real que motivó esta página: un usuario con rol KITCHEN cuyo tenant no
 * tiene el módulo "cocina" en su plan quedaba en un bucle infinito --
 * `planModuleGuard('cocina')` lo mandaba a `/dashboard` (= `/dashboard/admin`,
 * solo ADMIN), y `roleGuard` ahí lo devolvía a `/dashboard/cocina` (su home por
 * rol), una y otra vez, cada vuelta disparando un `GET /plan` nuevo (sin caché,
 * a diferencia de `PlanSummaryService.load()`). Esta ruta no lleva
 * `roleGuard`/`planModuleGuard` a propósito: tiene que ser alcanzable por
 * cualquier rol, sin condición, para cortar cualquier bucle futuro parecido.
 */
@Component({
  selector: 'app-module-unavailable-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div class="text-5xl mb-4">🔒</div>
      <h1 class="text-xl font-bold text-gray-800">Esta sección no está disponible</h1>
      <p class="text-gray-500 text-sm mt-2 max-w-sm">
        Tu usuario no tiene acceso a ninguna otra pantalla desde acá. Si creés que esto es un
        error, contactá al administrador de tu negocio.
      </p>
      <div class="flex items-center gap-3 mt-6">
        <a
          routerLink="/dashboard/mi-cuenta"
          class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Mi cuenta
        </a>
        <button
          type="button"
          (click)="logout()"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  `,
})
export class ModuleUnavailablePageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
