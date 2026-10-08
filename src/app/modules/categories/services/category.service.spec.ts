import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { CategoryService } from './category.service';

const base = `${environment.apiBaseUrl}/categories`;

describe('CategoryService.searchActiveCategories() (spec 102)', () => {
  let service: CategoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CategoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(CategoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('busca con search/active=true/page=1/size=20, sin depender de allCategories()', async () => {
    const promise = service.searchActiveCategories('postre');

    const req = http.expectOne(
      (r) => r.url === base && r.params.get('search') === 'postre',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('active')).toBe('true');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('20');

    req.flush({
      items: [
        {
          id: 'cat-105',
          name: 'Postres fríos',
          description: null,
          active: true,
          display_order: 105,
          created_at: '2026-01-01T00:00:00',
          presentations: [],
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
    });

    const items = await promise;
    expect(items.map((c) => c.id)).toEqual(['cat-105']);
    expect(items[0].name).toBe('Postres fríos');
  });

  it('recorta el texto de búsqueda antes de enviarlo', () => {
    service.searchActiveCategories('  postre  ');

    const req = http.expectOne(
      (r) => r.url === base && r.params.get('search') === 'postre',
    );
    req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 });
  });
});
