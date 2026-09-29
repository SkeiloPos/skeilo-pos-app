import { TestBed } from '@angular/core/testing';
import { HttpHeaders, HttpResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { InventoryPageComponent } from './inventory-page.component';
import { InventoryService } from '../services/inventory.service';
import { ToastService } from '../../../shared/feedback/toast.service';

describe('InventoryPageComponent — íconos estandarizados (spec 082)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [InventoryPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    const fixture = TestBed.createComponent(InventoryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('el botón "Nuevo insumo" ya no usa un SVG artesanal', () => {
    const fixture = crear();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('add');
  });

  it('el botón de cerrar del panel de recepción de compra usa el nuevo componente', () => {
    const fixture = crear();
    fixture.componentInstance.receivePurchase.set({
      id: 'p1',
      status: 'pendiente',
      items: [],
    } as never);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('✕');
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toContain('close');
  });
});

describe('InventoryPageComponent — exportar inventario (spec 086)', () => {
  function crear() {
    TestBed.configureTestingModule({
      imports: [InventoryPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })),
      ],
    });
    const fixture = TestBed.createComponent(InventoryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.restoreAllMocks());

  /** Mismo patrón que `transfer-details-step.component.spec.ts`: intercepta
   *  `document.createElement('a')` para espiar el `click()` de la ancla
   *  temporal de descarga, sin tocar el resto del DOM. */
  function installAnchorSpy(): { clicks: () => { download: string }[] } {
    const clicks: { download: string }[] = [];
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {
          clicks.push({ download: (el as HTMLAnchorElement).download });
        });
      }
      return el;
    });
    return { clicks: () => clicks };
  }

  function exportButton(fixture: ReturnType<typeof crear>): HTMLButtonElement {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const btn = buttons.find((b) => b.textContent?.includes('Exportar Inventario'));
    if (!btn) throw new Error('Botón "Exportar Inventario" no encontrado');
    return btn;
  }

  it('en éxito, llama a service.exportItems() y dispara la descarga vía blob URL + <a download>', () => {
    const fixture = crear();
    const service = TestBed.inject(InventoryService);
    const blob = new Blob(['contenido'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const response = new HttpResponse({
      body: blob,
      headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="inventario_2026-09-22.xlsx"' }),
      status: 200,
    });
    const exportSpy = vi.spyOn(service, 'exportItems').mockReturnValue(of(response));
    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    const { clicks } = installAnchorSpy();

    exportButton(fixture).click();

    expect(exportSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicks()).toEqual([{ download: 'inventario_2026-09-22.xlsx' }]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('sin encabezado Content-Disposition, arma el nombre de respaldo inventario_<fecha-local>.xlsx', () => {
    const fixture = crear();
    const service = TestBed.inject(InventoryService);
    const blob = new Blob(['contenido']);
    const response = new HttpResponse({ body: blob, headers: new HttpHeaders(), status: 200 });
    vi.spyOn(service, 'exportItems').mockReturnValue(of(response));
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn().mockReturnValue('blob:fake');
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
    const { clicks } = installAnchorSpy();

    exportButton(fixture).click();

    const today = new Date().toISOString().slice(0, 10);
    expect(clicks()).toEqual([{ download: `inventario_${today}.xlsx` }]);
  });

  it('en error, llama a toast.error(...) y no crea ningún enlace de descarga', () => {
    const fixture = crear();
    const service = TestBed.inject(InventoryService);
    const toast = TestBed.inject(ToastService);
    vi.spyOn(service, 'exportItems').mockReturnValue(throwError(() => new Error('fallo simulado')));
    const errorSpy = vi.spyOn(toast, 'error');
    const createObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    const { clicks } = installAnchorSpy();

    exportButton(fixture).click();

    expect(errorSpy).toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicks()).toEqual([]);
  });
});
