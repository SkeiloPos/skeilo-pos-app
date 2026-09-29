import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { InventoryService } from './inventory.service';

const base = `${environment.apiBaseUrl}/inventory`;

describe('InventoryService.exportItems() (spec 086)', () => {
  let service: InventoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(InventoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('hace GET a items/export pidiendo un blob con la respuesta completa', () => {
    let result: unknown;
    service.exportItems().subscribe((resp) => (result = resp));

    const req = http.expectOne(`${base}/items/export`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');

    const blob = new Blob(['contenido'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    req.flush(blob, {
      headers: { 'Content-Disposition': 'attachment; filename="inventario_2026-09-22.xlsx"' },
    });

    expect((result as { body: Blob }).body).toBe(blob);
    expect((result as { headers: { get(name: string): string | null } }).headers.get('Content-Disposition'))
      .toBe('attachment; filename="inventario_2026-09-22.xlsx"');
  });
});
