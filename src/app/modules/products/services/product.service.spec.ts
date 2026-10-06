import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { ProductService } from './product.service';
import { ProductDraft } from '../interfaces/product.interface';

const API = environment.apiBaseUrl;
const PRODUCTS = `${API}/products`;
const VARIANTS = `${API}/variants`;
const PID = 'p1';

/** Drain pending microtasks so the next request in a chained flow gets dispatched. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function productResponse() {
  return {
    id: PID,
    category_id: 'c1',
    category_name: 'Postres fríos',
    name: 'Banana Split',
    description: null,
    preparation_type: 'prepared',
    image_url: null,
    active: true,
    available: true,
    created_at: '2026-08-06T00:00:00',
  };
}

function variantResponse(partial: Partial<Record<string, unknown>>) {
  return {
    id: 'v1',
    product_id: PID,
    sku: null,
    price: '10000',
    active: true,
    presentation_id: 'pr-unica',
    presentation_name: 'Única',
    ...partial,
  };
}

function draft(partial: Partial<ProductDraft> = {}): ProductDraft {
  return {
    id: PID,
    name: 'Banana Split',
    category_id: 'c1',
    description: '',
    preparation_type: 'prepared',
    image_url: '',
    image_url_base: null,
    active: true,
    hasSizes: false,
    tracks_inventory: false,
    variants: [],
    deactivated: [],
    ...partial,
  };
}

describe('ProductService', () => {
  let service: ProductService;
  let http: HttpTestingController;

  beforeEach(() => {
    // Los ficheros de spec comparten entorno: resetear hace este spec independiente
    // del orden de ejecución (mismo motivo que en diner.service.spec.ts).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ProductService,
        provideHttpClient(),
        provideHttpClientTesting(),
        // QueryClient fresco por test (sin retry, gcTime 0) para que no haya
        // caché ni reintentos que crucen entre tests.
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    service = TestBed.inject(ProductService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getProductDraft', () => {
    it('separa las desactivadas y no les pide receta ni grupos', async () => {
      const promise = service.getProductDraft(PID);

      http.expectOne(`${PRODUCTS}/${PID}`).flush(productResponse());
      await tick();

      // Sin `?active=`: una sola lectura que trae ambos estados.
      const list = http.expectOne(`${PRODUCTS}/${PID}/variants`);
      expect(list.request.params.has('active')).toBe(false);
      list.flush([
        variantResponse({ id: 'viva', presentation_id: 'pr-mediana', presentation_name: 'Mediana', price: '9000', active: true }),
        variantResponse({ id: 'muerta', presentation_id: 'pr-pequeña', presentation_name: 'Pequeña', price: '6000', active: false }),
      ]);
      await tick();

      // Solo la viva pide su configuración; la desactivada no se edita.
      http.expectOne(`${VARIANTS}/viva/recipe`).flush([]);
      http.expectOne(`${VARIANTS}/viva/option-groups`).flush([]);
      http.expectOne(`${API}/option-groups`).flush([]);

      const result = await promise;
      expect(result!.variants.map((v) => v.presentationName)).toEqual(['Mediana']);
      expect(result!.deactivated).toEqual([
        { id: 'muerta', price: 6000, presentationId: 'pr-pequeña', presentationName: 'Pequeña' },
      ]);
      // Una sola presentación viva: el toggle de tamaños queda apagado.
      expect(result!.hasSizes).toBe(false);
    });
  });

  describe('saveProduct para un producto nuevo (spec 043: guardado consolidado)', () => {
    it('hace una sola petición POST con el árbol completo de presentaciones', async () => {
      const promise = service.saveProduct(
        draft({
          id: null,
          variants: [
            { id: null, localId: 'l1', price: 6000, presentationId: 'pr-pequeña', presentationName: 'Pequeña', recipe: [], optionGroups: [] },
            { id: null, localId: 'l2', price: 9000, presentationId: 'pr-grande', presentationName: 'Grande', recipe: [], optionGroups: [] },
          ],
        }),
      );

      const req = http.expectOne(PRODUCTS);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.variants).toEqual([
        { price: 6000, presentation_id: 'pr-pequeña', recipe: [], option_groups: [] },
        { price: 9000, presentation_id: 'pr-grande', recipe: [], option_groups: [] },
      ]);
      req.flush({ ...productResponse(), variants: [] });

      expect(await promise).toBe(PID);
    });
  });

  describe('saveProduct sobre un producto existente (spec 043: guardado consolidado)', () => {
    it('hace una sola petición PATCH con el árbol completo, en vez de una por presentación', async () => {
      const promise = service.saveProduct(
        draft({
          variants: [
            { id: 'viva', localId: 'viva', price: 9000, presentationId: 'pr-mediana', presentationName: 'Mediana', recipe: [], optionGroups: [] },
          ],
          deactivated: [{ id: 'muerta', price: 6000, presentationId: 'pr-pequeña', presentationName: 'Pequeña' }],
        }),
      );

      const req = http.expectOne(`${PRODUCTS}/${PID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.variants).toEqual([
        { id: 'viva', price: 9000, presentation_id: 'pr-mediana', recipe: [], option_groups: [] },
      ]);
      req.flush({ ...productResponse(), variants: [] });

      // `saveProduct` invalida la query paginada de productos al terminar, pero
      // este test nunca la activó (no llamó `loadProducts()`), así que no hay
      // ningún observer activo al que refrescar — invalidar una query inactiva
      // no dispara petición alguna.
      expect(await promise).toBe(PID);
    });

    // spec 088 (FR-002, A-92): la imagen base viaja siempre; la imagen solo si cambió.
    describe('imagen base (spec 088)', () => {
      const ASSET = 'https://assets.skeilopos.com/acme/products/vigente.png';
      const NUEVA = 'https://pub-x.r2.dev/acme/products/nueva.png';

      async function patchBody(partial: Partial<ProductDraft>) {
        const promise = service.saveProduct(draft(partial));
        const req = http.expectOne(`${PRODUCTS}/${PID}`);
        expect(req.request.method).toBe('PATCH');
        const body = req.request.body;
        req.flush({ ...productResponse(), variants: [] });
        await promise;
        return body;
      }

      it('sin tocar la imagen: envía la base y NO reenvía image_url', async () => {
        const body = await patchBody({ image_url: ASSET, image_url_base: ASSET });
        expect(body.image_url_base).toBe(ASSET);
        expect(body.image_url).toBeNull();
      });

      it('con imagen nueva: envía image_url y la base (la imagen vigente al abrir)', async () => {
        const body = await patchBody({ image_url: NUEVA, image_url_base: ASSET });
        expect(body.image_url).toBe(NUEVA);
        expect(body.image_url_base).toBe(ASSET);
      });

      it('producto que no tenía imagen: la base viaja como null explícito', async () => {
        const body = await patchBody({ image_url: '', image_url_base: null });
        expect('image_url_base' in body).toBe(true);
        expect(body.image_url_base).toBeNull();
        expect(body.image_url).toBeNull();
      });

      it('producto sin imagen que sube la primera: image_url con base null', async () => {
        const body = await patchBody({ image_url: NUEVA, image_url_base: null });
        expect(body.image_url).toBe(NUEVA);
        expect(body.image_url_base).toBeNull();
      });

      it('un producto nuevo no envía base y sí su imagen', async () => {
        const promise = service.saveProduct(draft({ id: null, image_url: NUEVA }));
        const req = http.expectOne(PRODUCTS);
        expect(req.request.method).toBe('POST');
        expect(req.request.body.image_url).toBe(NUEVA);
        expect('image_url_base' in req.request.body).toBe(false);
        req.flush({ ...productResponse(), variants: [] });
        await promise;
      });

      it('getProductDraft guarda la imagen cargada como base', async () => {
        const promise = service.getProductDraft(PID);
        http.expectOne(`${PRODUCTS}/${PID}`).flush({ ...productResponse(), image_url: ASSET });
        await tick();
        http.expectOne(`${PRODUCTS}/${PID}/variants`).flush([]);
        const result = await promise;
        expect(result!.image_url).toBe(ASSET);
        expect(result!.image_url_base).toBe(ASSET);
      });

      it('getProductDraft de un producto sin imagen deja la base en null', async () => {
        const promise = service.getProductDraft(PID);
        http.expectOne(`${PRODUCTS}/${PID}`).flush(productResponse());
        await tick();
        http.expectOne(`${PRODUCTS}/${PID}/variants`).flush([]);
        const result = await promise;
        expect(result!.image_url_base).toBeNull();
      });
    });

    it('traduce el 409 de nombre tomado por una desactivada en un mensaje accionable', async () => {
      const promise = service.saveProduct(
        draft({
          variants: [
            { id: null, localId: 'l1', price: 6000, presentationId: 'pr-pequeña', presentationName: 'Pequeña', recipe: [], optionGroups: [] },
          ],
        }),
      );

      http.expectOne(`${PRODUCTS}/${PID}`).flush(
        {
          detail: {
            error: 'Ya existe una variante «Pequeña» desactivada en este producto. Reactívala en vez de crear otra.',
            variant_id: 'muerta',
            variant_index: 0,
            active: false,
          },
        },
        { status: 409, statusText: 'Conflict' },
      );

      expect(await promise).toBeNull();
      expect(service.lastVariantConflict()?.variant_id).toBe('muerta');
      // Sin el parseo del detalle-objeto, el banner mostraría '[object Object]'.
      expect(service.error()).toContain('«Pequeña» desactivada');
      expect(service.error()).toContain('Presentaciones desactivadas');
    });
  });

  describe('orden de presentaciones al guardar (spec 043, sustituye a spec 042)', () => {
    it('el orden de variants[] en el payload es el orden final -- ya no hay un endpoint aparte de reorder', async () => {
      const promise = service.saveProduct(
        draft({
          variants: [
            { id: 'v2', localId: 'v2', price: 8000, presentationId: 'pr-grande', presentationName: 'Grande', recipe: [], optionGroups: [] },
            { id: null, localId: 'nueva', price: 6500, presentationId: 'pr-mediana', presentationName: 'Mediana', recipe: [], optionGroups: [] },
            { id: 'v1', localId: 'v1', price: 5000, presentationId: 'pr-pequeña', presentationName: 'Pequeña', recipe: [], optionGroups: [] },
          ],
        }),
      );

      const req = http.expectOne(`${PRODUCTS}/${PID}`);
      const ids = (req.request.body.variants as Array<{ id?: string }>).map((v) => v.id ?? null);
      expect(ids).toEqual(['v2', null, 'v1']);
      req.flush({ ...productResponse(), variants: [] });

      expect(await promise).toBe(PID);
    });
  });

  it('restoreVariant reactiva la presentación', async () => {
    const promise = service.restoreVariant('muerta');
    const req = http.expectOne(`${VARIANTS}/muerta`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: true });
    req.flush(variantResponse({ id: 'muerta', active: true }));
    expect(await promise).toBe(true);
  });

  it('loadDeactivated pide solo las inactivas', async () => {
    const promise = service.loadDeactivated(PID);
    const req = http.expectOne((r) => r.url === `${PRODUCTS}/${PID}/variants`);
    expect(req.request.params.get('active')).toBe('false');
    req.flush([variantResponse({ id: 'muerta', presentation_id: 'pr-pequeña', presentation_name: 'Pequeña', price: '6000', active: false })]);
    expect(await promise).toEqual([
      { id: 'muerta', price: 6000, presentationId: 'pr-pequeña', presentationName: 'Pequeña' },
    ]);
  });

  describe('mensajes de error del backend', () => {
    // FastAPI manda `detail` en tres formas y las tres tienen que llegar legibles al
    // usuario: texto, la lista de pydantic (422) y el objeto de los 409 con datos.
    const casos: [string, Record<string, unknown>, string][] = [
      ['texto', { detail: 'Product not found' }, 'Product not found'],
      ['lista de pydantic', { detail: [{ msg: 'El precio no puede ser negativo' }] }, 'El precio no puede ser negativo'],
      ['objeto con error', { detail: { error: 'El grupo está en uso', variantes_en_uso: [] } }, 'El grupo está en uso'],
    ];

    for (const [nombre, body, esperado] of casos) {
      it(`entiende un detail en ${nombre}`, async () => {
        const promise = service.updateVariant('v1', { price: 1 });
        http.expectOne(`${VARIANTS}/v1`).flush(body, { status: 409, statusText: 'Conflict' });
        expect(await promise).toBe(false);
        expect(service.error()).toBe(esperado);
      });
    }
  });

  describe('listado de productos — category_name resuelto por el backend (spec 097)', () => {
    it('toProduct() mapea category_name tal cual desde la respuesta cruda', async () => {
      service.loadProducts();
      await tick();
      const req = http.expectOne((r) => r.url === PRODUCTS && r.method === 'GET');
      req.flush({ items: [productResponse()], total: 1, page: 1, size: 20, pages: 1 });
      await tick();

      expect(service.products()[0]?.category_name).toBe('Postres fríos');
    });

    it('category_name ausente en la respuesta cruda se mapea a null (defensivo, research.md D4)', async () => {
      service.loadProducts();
      await tick();
      const req = http.expectOne((r) => r.url === PRODUCTS && r.method === 'GET');
      const sinCategoryName: Record<string, unknown> = { ...productResponse() };
      delete sinCategoryName['category_name'];
      req.flush({ items: [sinCategoryName], total: 1, page: 1, size: 20, pages: 1 });
      await tick();

      expect(service.products()[0]?.category_name).toBeNull();
    });
  });
});
