import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CategoriesPageComponent } from './categories-page.component';
import { CategoryService } from '../services/category.service';
import { Category } from '../interfaces/category.interface';

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

/**
 * `CategoryService` real depende de TanStack Query + HTTP -- se reemplaza por
 * un fake liviano (mismo patrón que `product-form.component.spec.ts`) para
 * poder verificar la tabla sin sincronizar sus queries.
 */
class FakeCategoryService {
  categories = signal<Category[]>([]);
  allCategories = signal<Category[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  otherError = signal<string | null>(null);
  total = signal(0);
  totalPages = signal(0);
  page = signal(1);
  size = signal(20);
  loadCategories(): void {}
  loadAllCategories(): void {}
  setSearch(): void {}
  setActiveFilter(): void {}
  setVisibleQrFilter(): void {}
  async toggleActive(): Promise<void> {}
  async toggleVisibleQr(): Promise<void> {}
}

describe('CategoriesPageComponent', () => {
  let fixture: ComponentFixture<CategoriesPageComponent>;
  let categoryService: FakeCategoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CategoriesPageComponent],
      providers: [{ provide: CategoryService, useClass: FakeCategoryService }],
    });
    fixture = TestBed.createComponent(CategoriesPageComponent);
    categoryService = TestBed.inject(CategoryService) as unknown as FakeCategoryService;
  });

  // spec 067 (US3): columna "Orden" en el listado de administración de categorías

  it('la tabla renderiza el display_order de cada categoría en la nueva columna', () => {
    categoryService.categories.set([
      makeCategory({ id: 'c1', name: 'Bebidas', display_order: 25 }),
      makeCategory({ id: 'c2', name: 'Postres', display_order: 5 }),
    ]);
    fixture.detectChanges();

    const rows: HTMLTableRowElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('25');
    expect(rows[1].textContent).toContain('5');
  });

  it('la columna "Orden" aparece en el encabezado de la tabla', () => {
    categoryService.categories.set([makeCategory()]);
    fixture.detectChanges();

    const headers: string[] = Array.from(
      fixture.nativeElement.querySelectorAll('thead th'),
    ).map((th) => (th as HTMLElement).textContent?.trim() ?? '');
    expect(headers).toContain('Orden');
  });

  it('ningún ícono se renderiza ya como emoji ni SVG artesanal (spec 082)', () => {
    categoryService.categories.set([makeCategory()]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    for (const emoji of ['📂', '✏️', '🔴', '🟢']) {
      expect(el.textContent).not.toContain(emoji);
    }
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['add', 'category', 'edit', 'circle']));
  });
});

/** spec 128 (US1): columna "Menú QR" con toggle en línea. */
describe('CategoriesPageComponent — visibilidad en el menú QR (spec 128)', () => {
  let fixture: ComponentFixture<CategoriesPageComponent>;
  let categoryService: FakeCategoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CategoriesPageComponent],
      providers: [{ provide: CategoryService, useClass: FakeCategoryService }],
    });
    fixture = TestBed.createComponent(CategoriesPageComponent);
    categoryService = TestBed.inject(CategoryService) as unknown as FakeCategoryService;
  });

  const qrRow = (name: string): HTMLElement =>
    Array.from(fixture.nativeElement.querySelectorAll('tbody tr')).find((tr) =>
      (tr as HTMLElement).textContent?.includes(name),
    ) as HTMLElement;

  /** El switch accesible (`role="switch"`, mismo patrón que product-form.component.ts). */
  const qrToggle = (name: string): HTMLButtonElement =>
    qrRow(name).querySelector('button[role="switch"]') as HTMLButtonElement;

  /** La etiqueta "Visible"/"Oculta en QR" vive junto al switch, no dentro de él --
   *  `span.text-xs` la distingue del `span` interno del switch (el punto deslizante). */
  const qrLabel = (name: string): string | undefined =>
    qrToggle(name).parentElement?.querySelector('span.text-xs')?.textContent?.trim();

  it('la columna "Menú QR" aparece en el encabezado', () => {
    categoryService.categories.set([makeCategory()]);
    fixture.detectChanges();

    const headers: string[] = Array.from(
      fixture.nativeElement.querySelectorAll('thead th'),
    ).map((th) => (th as HTMLElement).textContent?.trim() ?? '');
    expect(headers).toContain('Menú QR');
  });

  it('muestra "Visible" u "Oculta en QR" según el estado de cada categoría', () => {
    categoryService.categories.set([
      makeCategory({ id: 'c1', name: 'Con licor', visible_en_qr: true }),
      makeCategory({ id: 'c2', name: 'Helados', visible_en_qr: false }),
    ]);
    fixture.detectChanges();

    expect(qrLabel('Con licor')).toBe('Visible');
    expect(qrLabel('Helados')).toBe('Oculta en QR');
    expect(qrToggle('Con licor').getAttribute('aria-checked')).toBe('true');
    expect(qrToggle('Helados').getAttribute('aria-checked')).toBe('false');
  });

  it('accionar el toggle llama a toggleVisibleQr() y muestra un toast de confirmación', async () => {
    const spy = vi.spyOn(categoryService, 'toggleVisibleQr').mockResolvedValue(undefined);
    categoryService.categories.set([
      makeCategory({ id: 'c1', name: 'Con licor', active: true, visible_en_qr: true }),
    ]);
    fixture.detectChanges();

    qrToggle('Con licor').click();
    await fixture.whenStable();

    expect(spy).toHaveBeenCalledWith('c1', true);
  });

  it('una categoría inactiva deja el toggle deshabilitado con el texto de ayuda (FR-006)', () => {
    categoryService.categories.set([
      makeCategory({ id: 'c1', name: 'Helados', active: false, visible_en_qr: true }),
    ]);
    fixture.detectChanges();

    const btn = qrToggle('Helados');
    expect(btn.disabled).toBe(true);
    const row = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')).find((tr) =>
      (tr as HTMLElement).textContent?.includes('Helados'),
    ) as HTMLElement;
    expect(row.textContent).toContain('Activa la categoría para controlar su visibilidad en QR');
  });

  it('el selector de filtro ofrece "Ocultas en QR" y lo aplica (FR-011)', () => {
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('hidden_qr');

    const setVisibleQrSpy = vi.spyOn(categoryService, 'setVisibleQrFilter');
    const setActiveSpy = vi.spyOn(categoryService, 'setActiveFilter');
    select.value = 'hidden_qr';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(setVisibleQrSpy).toHaveBeenCalledWith('hidden');
    expect(setActiveSpy).toHaveBeenCalledWith('');
  });
});
