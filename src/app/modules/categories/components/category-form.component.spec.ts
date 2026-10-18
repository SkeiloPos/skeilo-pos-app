import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { environment } from '../../../../environments/environment';
import { CategoryFormComponent } from './category-form.component';
import { Category } from '../interfaces/category.interface';

const API = environment.apiBaseUrl;
const CATEGORIES = `${API}/categories`;
const PRESENTATIONS = `${API}/presentations`;

function makeCategory(partial: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    name: 'Bebidas',
    description: 'Gaseosas, jugos y aguas',
    active: true,
    visible_en_qr: true,
    display_order: 10,
    created_at: '2026-09-01T00:00:00Z',
    ...partial,
    presentations: partial.presentations ?? [],
  };
}

describe('CategoryFormComponent', () => {
  let fixture: ComponentFixture<CategoryFormComponent>;
  let component: CategoryFormComponent;
  let http: HttpTestingController;

  async function create(category: Category | null): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CategoryFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    fixture = TestBed.createComponent(CategoryFormComponent);
    component = fixture.componentInstance;
    component.category = category;
    http = TestBed.inject(HttpTestingController);
    // Sin binding de plantilla sobre `@Input() category`, Angular no dispara
    // `ngOnChanges()` por sí solo al asignar la propiedad directo -- se invoca
    // a mano, igual que lo haría el binding real del padre.
    component.ngOnChanges();
    fixture.detectChanges();
    // spec 083: `ngOnInit()` carga el picker de presentaciones (FR-004) -- se
    // responde vacío acá, sin datos, salvo que el test lo necesite distinto.
    http.expectOne((r) => r.url === PRESENTATIONS).flush({
      items: [], total: 0, page: 1, size: 100, pages: 0,
    });
  }

  afterEach(() => http.verify());

  // spec 067 (US1): campo de orden en el formulario de categorías (FR-001 a FR-004)

  it('al editar una categoría, el campo de orden se pre-llena con su display_order actual', async () => {
    await create(makeCategory({ display_order: 25 }));
    expect(component.form.controls.display_order.value).toBe(25);
  });

  it('guardar con un valor de orden lo incluye en el payload enviado', async () => {
    await create(null);
    component.form.setValue({
      name: 'Bebidas',
      description: '',
      display_order: 10,
    });

    const submitPromise = component.onSubmit();
    const req = http.expectOne(CATEGORIES);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.display_order).toBe(10);
    req.flush(makeCategory({ display_order: 10 }));
    await submitPromise;
  });

  it('guardar dejando el campo vacío envía null (el backend asigna el valor por defecto)', async () => {
    await create(null);
    component.form.setValue({
      name: 'Bebidas',
      description: '',
      display_order: null,
    });

    const submitPromise = component.onSubmit();
    const req = http.expectOne(CATEGORIES);
    expect(req.request.body.display_order).toBeNull();
    req.flush(makeCategory({ display_order: 1 }));
    await submitPromise;
  });

  it('el formulario no bloquea el guardado por dejar el campo de orden vacío', async () => {
    await create(null);
    component.form.setValue({
      name: 'Bebidas',
      description: '',
      display_order: null,
    });
    fixture.detectChanges();

    expect(component.form.valid).toBe(true);

    const submitPromise = component.onSubmit();
    http.expectOne(CATEGORIES).flush(makeCategory({ display_order: 1 }));
    await submitPromise;
  });

  it('el botón de cerrar ya no es un emoji (spec 082)', async () => {
    await create(null);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('✕');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('close');
  });
});
