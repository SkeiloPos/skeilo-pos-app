import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchableSelectComponent, SearchableSelectOption } from './searchable-select.component';

/**
 * El filtro comparaba con `toLowerCase()`: escribir "cafe" no encontraba "Café".
 * En la despensa de una heladería media docena de insumos lleva tilde y nadie
 * la teclea, así que la búsqueda no servía justo donde más falta hacía.
 */
describe('SearchableSelectComponent', () => {
  let component: SearchableSelectComponent;
  let fixture: ComponentFixture<SearchableSelectComponent>;

  const OPCIONES = [
    { id: '1', label: 'Café · kg' },
    { id: '2', label: 'Limón · und' },
    { id: '3', label: 'Azúcar · kg' },
    { id: '4', label: 'Chocolate · g' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SearchableSelectComponent] });
    fixture = TestBed.createComponent(SearchableSelectComponent);
    component = fixture.componentInstance;
    component.options = OPCIONES;
  });

  function buscar(termino: string): string[] {
    component.query.set(termino);
    return component.filteredOptions().map((o) => o.label);
  }

  it('encuentra las opciones con tilde escribiendo sin ella', () => {
    expect(buscar('cafe')).toEqual(['Café · kg']);
    expect(buscar('limon')).toEqual(['Limón · und']);
    expect(buscar('azucar')).toEqual(['Azúcar · kg']);
  });

  it('sigue encontrándolas si se escribe la tilde', () => {
    expect(buscar('café')).toEqual(['Café · kg']);
  });

  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(buscar('  CHOCOLATE ')).toEqual(['Chocolate · g']);
  });

  it('busca en cualquier parte de la etiqueta, no solo al principio', () => {
    // La unidad forma parte de la etiqueta: buscar por ella también vale.
    expect(buscar('kg')).toEqual(['Café · kg', 'Azúcar · kg']);
  });

  it('sin término devuelve todas las opciones', () => {
    expect(buscar('')).toHaveLength(4);
    expect(buscar('   ')).toHaveLength(4);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(buscar('sushi')).toEqual([]);
  });

  it('resuelve la etiqueta de lo seleccionado', () => {
    component.writeValue('2');
    expect(component.selectedLabel()).toBe('Limón · und');
  });

  it('al seleccionar, emite el id y cierra la lista', () => {
    const cambios: string[] = [];
    component.registerOnChange((v) => cambios.push(v));
    component.open.set(true);

    component.selectOption(OPCIONES[0]);

    expect(cambios).toEqual(['1']);
    expect(component.value()).toBe('1');
    expect(component.open()).toBe(false);
  });

  it('una opción disabled no se puede seleccionar (spec 053)', () => {
    const cambios: string[] = [];
    component.registerOnChange((v) => cambios.push(v));
    component.open.set(true);
    const opcionDeshabilitada = { id: '5', label: 'Mesa 5 · Ocupada', disabled: true };

    component.selectOption(opcionDeshabilitada);

    expect(cambios).toEqual([]);
    expect(component.value()).toBe('');
    expect(component.open()).toBe(true);
  });

  it('una opción disabled sigue apareciendo en el listado filtrado (spec 053)', () => {
    component.options = [...OPCIONES, { id: '5', label: 'Mesa 5 · Ocupada', disabled: true }];
    expect(buscar('Mesa 5')).toEqual(['Mesa 5 · Ocupada']);
  });

  it('el chevron desplegable ya no es un SVG artesanal (spec 082)', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('expand_more');
  });
});

/**
 * Modo remoto opt-in (spec 098): el selector de insumos de la receta cargaba una sola
 * página de 100 y filtraba en memoria, así que un insumo fuera de esa página nunca
 * aparecía. `[search]` permite que, al escribir, el resultado venga del servidor en vez
 * de filtrarse sobre una lista acotada — sin tocar el comportamiento de quien no lo usa
 * (p. ej. el selector de mesa).
 */
describe('SearchableSelectComponent — modo remoto (spec 098)', () => {
  let component: SearchableSelectComponent;
  let fixture: ComponentFixture<SearchableSelectComponent>;

  const OPCIONES = [{ id: '1', label: 'Pan' }];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SearchableSelectComponent] });
    fixture = TestBed.createComponent(SearchableSelectComponent);
    component = fixture.componentInstance;
    component.options = OPCIONES;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin [search], el modo remoto no se activa: sigue filtrando localmente', () => {
    component.onQueryInput('pan');
    expect(component.filteredOptions().map((o) => o.label)).toEqual(['Pan']);
  });

  it('con [search] y texto vacío, muestra `options` tal cual (sin llamar a search)', () => {
    const search = vi.fn();
    component.search = search;

    component.onQueryInput('');

    expect(search).not.toHaveBeenCalled();
    expect(component.filteredOptions()).toEqual(OPCIONES);
  });

  it('con [search] y texto, espera 300ms de debounce antes de invocar search(query)', async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue([]);
    component.search = search;

    component.onQueryInput('mozar');
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(299);
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledExactlyOnceWith('mozar');
  });

  it('al resolver, filteredOptions() devuelve los resultados remotos, no el filtrado local', async () => {
    vi.useFakeTimers();
    const resultadoRemoto = [{ id: '2', label: 'Queso mozarela' }];
    component.search = vi.fn().mockResolvedValue(resultadoRemoto);

    component.onQueryInput('mozar');
    await vi.advanceTimersByTimeAsync(300);

    // "mozar" no coincide con la opción local ("Pan"): si filtrara en cliente, sería [].
    expect(component.filteredOptions()).toEqual(resultadoRemoto);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('mientras la búsqueda está en curso, loading() es true (no debe leerse como "Sin resultados")', async () => {
    vi.useFakeTimers();
    let resolver!: (v: SearchableSelectOption[]) => void;
    component.search = vi.fn(
      () => new Promise<SearchableSelectOption[]>((r) => (resolver = r)),
    );

    component.onQueryInput('mozar');
    await vi.advanceTimersByTimeAsync(300);

    expect(component.loading()).toBe(true);
    expect(component.filteredOptions()).toEqual([]);

    resolver([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(component.loading()).toBe(false);
  });

  it('si search() rechaza, error() queda distinto de null y loading() vuelve a false', async () => {
    vi.useFakeTimers();
    component.search = vi.fn().mockRejectedValue(new Error('network down'));

    component.onQueryInput('mozar');
    await vi.advanceTimersByTimeAsync(300);

    expect(component.loading()).toBe(false);
    expect(component.error()).not.toBeNull();
  });

  it('reintentar() vuelve a invocar search() con el mismo texto tras un error', async () => {
    vi.useFakeTimers();
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([{ id: '2', label: 'Queso mozarela' }]);
    component.search = search;

    component.onQueryInput('mozar');
    await vi.advanceTimersByTimeAsync(300);
    expect(component.error()).not.toBeNull();

    component.retry();
    await vi.advanceTimersByTimeAsync(0);

    expect(search).toHaveBeenCalledTimes(2);
    expect(component.error()).toBeNull();
    expect(component.filteredOptions()).toEqual([{ id: '2', label: 'Queso mozarela' }]);
  });

  it('descarta una respuesta vieja si llega después de una búsqueda más reciente', async () => {
    vi.useFakeTimers();
    let resolveVieja!: (v: SearchableSelectOption[]) => void;
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveVieja = r)))
      .mockImplementationOnce(() => Promise.resolve([{ id: '2', label: 'Nueva' }]));
    component.search = search;

    component.onQueryInput('vie');
    await vi.advanceTimersByTimeAsync(300);
    component.onQueryInput('nue');
    await vi.advanceTimersByTimeAsync(300);

    expect(component.filteredOptions()).toEqual([{ id: '2', label: 'Nueva' }]);

    resolveVieja([{ id: '3', label: 'Vieja' }]);
    await vi.advanceTimersByTimeAsync(0);

    expect(component.filteredOptions()).toEqual([{ id: '2', label: 'Nueva' }]);
  });

  it('al borrar el texto tras una búsqueda remota, vuelve a mostrar `options`', async () => {
    vi.useFakeTimers();
    component.search = vi.fn().mockResolvedValue([{ id: '2', label: 'Queso mozarela' }]);

    component.onQueryInput('mozar');
    await vi.advanceTimersByTimeAsync(300);
    expect(component.filteredOptions()).toEqual([{ id: '2', label: 'Queso mozarela' }]);

    component.onQueryInput('');
    expect(component.filteredOptions()).toEqual(OPCIONES);
  });
});
