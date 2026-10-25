import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { AuthService } from './core/services/auth.service';
import { PageIntegrityBannerComponent } from './core/integrity/page-integrity-banner.component';
import { TenantInfoService } from './core/tenant/tenant-info.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PageIntegrityBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly authService = inject(AuthService);
  private readonly titleService = inject(Title);
  private readonly tenantInfo = inject(TenantInfoService);

  constructor() {
    // Título de la pestaña: nombre del tenant (o su slug mientras
    // `TenantInfoService.info()` aún no cargó) seguido de la marca del
    // producto -- se actualiza solo en cuanto llega el nombre real del
    // negocio (spec 033, `businessName()`).
    effect(() => {
      this.titleService.setTitle(`${this.tenantInfo.businessName()} | SkeiloPOS`);
    });
  }
}
