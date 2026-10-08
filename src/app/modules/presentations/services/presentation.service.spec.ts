import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { PresentationService } from './presentation.service';

const base = `${environment.apiBaseUrl}/presentations`;

describe('PresentationService.searchActivePresentations() (spec 102)', () => {
  let service: PresentationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PresentationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(PresentationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('busca con search/active=true/page=1/size=20, sin depender de allPresentations()', async () => {
    const promise = service.searchActivePresentations('grande');

    const req = http.expectOne(
      (r) => r.url === base && r.params.get('search') === 'grande',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('active')).toBe('true');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');

    req.flush({
      items: [
        { id: 'pres-105', name: 'Grande 16 onz', active: true, created_at: '2026-01-01T00:00:00' },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
    });

    const items = await promise;
    expect(items.map((p) => p.id)).toEqual(['pres-105']);
    expect(items[0].name).toBe('Grande 16 onz');
  });

  it('recorta el texto de búsqueda antes de enviarlo', () => {
    service.searchActivePresentations('  grande  ');

    const req = http.expectOne(
      (r) => r.url === base && r.params.get('search') === 'grande',
    );
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
  });
});
