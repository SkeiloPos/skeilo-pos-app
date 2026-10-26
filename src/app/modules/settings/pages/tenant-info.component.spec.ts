import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { TenantInfoComponent } from './tenant-info.component';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { AuthService } from '../../../core/services/auth.service';
import { PrinterSettingsStore } from '../../../core/printing/printer-settings.store';

describe('TenantInfoComponent — íconos estandarizados (spec 082)', () => {
  function crear() {
    const fakeTenantInfo = {
      businessName: signal(''),
      error: signal<string | null>(null),
      info: signal(null),
      isSubmitting: signal(false),
      load: vi.fn(),
      logoUrl: signal<string | null>(null),
      receiptMessage: signal(''),
      update: vi.fn(),
      uploadLogo: vi.fn(),
    };
    const fakePrinter = {
      paperWidthMm: signal(80),
      setPaperWidth: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [TenantInfoComponent],
      providers: [
        { provide: TenantInfoService, useValue: fakeTenantInfo },
        { provide: PrinterSettingsStore, useValue: fakePrinter },
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(TenantInfoComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ninguna sección usa ya emoji (🎨🏪🧾🖨️👤) como ícono', () => {
    const el = crear();
    for (const emoji of ['🎨', '🏪', '🧾', '🖨️', '👤']) {
      expect(el.textContent).not.toContain(emoji);
    }
  });

  it('cada sección renderiza su ícono equivalente con el nuevo componente', () => {
    // spec 137: el rediseño de Ajustes (design/ajustes.html) quita los íconos
    // decorativos de encabezado por sección (palette/receipt/person) -- la
    // pestaña pasa a filas etiqueta+control sin esos badges. Los íconos que
    // sobreviven (placeholder del logo, subir imagen, imprimir prueba) siguen
    // siendo `app-mi-icon`, nunca emoji (primer test de este archivo).
    const el = crear();
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['storefront', 'upload', 'print']));
  });
});
