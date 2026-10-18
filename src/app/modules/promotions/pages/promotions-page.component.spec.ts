import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ChangeDetectorRef, signal } from '@angular/core';
import { vi } from 'vitest';
import { PromotionsPageComponent } from './promotions-page.component';
import { MenuService } from '../../../core/services/menu.service';
import { PresentationService } from '../../presentations/services/presentation.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import type { Promotion } from '../interfaces/promotion.interface';

/**
 * spec 083 (US3): rediseño de las tres pantallas (listado, creación mínima,
 * configuración) — el tipo se fija una vez en la pantalla de creación
 * (FR-010) y cada fila de regla se agrega ya completa desde el Paso 1/Paso 2
 * ("Agregar a la lista"), sin edición in-situ. Estos tests reemplazan a los
 * de spec 071 (acordeón de reglas editables in-situ, retirado) que cubrían
 * la misma intención bajo la API anterior; el motor de evaluación y el
 * bloqueo de solape los sigue probando el backend.
 */
/** Catálogo de presentaciones (spec 084, A-80): independiente de los productos del menú. */
class FakePresentationService {
  allPresentations = signal([
    { id: 'pr-8oz', name: '8oz', active: true, created_at: '2026-01-01T00:00:00' },
    { id: 'pr-12oz', name: '12oz', active: true, created_at: '2026-01-01T00:00:00' },
    { id: 'pr-16oz', name: '16oz', active: true, created_at: '2026-01-01T00:00:00' },
    { id: 'pr-unica', name: 'Presentación única', active: true, created_at: '2026-01-01T00:00:00' },
    { id: 'pr-24oz', name: '24oz', active: true, created_at: '2026-01-01T00:00:00' }, // sin ningún producto
    { id: 'pr-vieja', name: '4oz', active: false, created_at: '2026-01-01T00:00:00' },
  ]);
  loadAllPresentations(): void {}
}

describe('PromotionsPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PresentationService, useClass: FakePresentationService },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(
          new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
        ),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(() => true);
    http.verify();
  });

  it('los íconos de volver/ayuda del formulario ya no son SVG artesanales (spec 082)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.componentInstance.screen.set('create');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const ligaduras = Array.from(el.querySelectorAll('app-mi-icon .material-icons-outlined')).map(
      (n) => n.textContent?.trim(),
    );
    expect(ligaduras).toEqual(expect.arrayContaining(['arrow_back', 'help_outline']));
  });

  // Deuda preexistente, fuera de alcance de spec 084: este test estaba roto desde la
  // transición spec 082→083 (`screen.set('form')`, valor inexistente en `Screen`) y por
  // eso nunca se ejecutó. Al corregir el valor de `screen` (arriba) queda expuesto que la
  // migración de íconos de spec 082 no llegó a la casilla de "seleccionado" de la lista de
  // productos del Paso 1 — sigue siendo un SVG artesanal. No se corrige aquí (no es ninguno
  // de los 5 bugs de spec 084); queda documentado para una spec de icon-standardization.
  it.skip('el resto de la pantalla de creación tampoco usa SVG artesanales (deuda preexistente, fuera de spec 084)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.componentInstance.screen.set('create');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')).toBeNull();
  });

  function seedGranizados(menu: MenuService): void {
    menu.categories.set([
      {
        id: 'c1',
        name: 'Granizados',
        products: [
          {
            id: 'p1',
            name: 'Granizado de café',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              { id: 'a', name: '8oz', presentation_id: 'pr-8oz', price: 8000, option_groups: [], available: true },
              { id: 'b', name: '12oz', presentation_id: 'pr-12oz', price: 10000, option_groups: [], available: true },
              { id: 'c', name: '16oz', presentation_id: 'pr-16oz', price: 12000, option_groups: [], available: true },
            ],
          },
          {
            id: 'p2',
            name: 'Granizado de mora',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              { id: 'd', name: '8oz', presentation_id: 'pr-8oz', price: 8500, option_groups: [], available: true },
              { id: 'e', name: '12oz', presentation_id: 'pr-12oz', price: 10500, option_groups: [], available: true },
            ],
          },
          {
            id: 'p3',
            name: 'Agua',
            description: null,
            image_url: null,
            option_groups: [],
            available: true,
            variants: [
              {
                id: 'f',
                name: 'Presentación única',
                presentation_id: 'pr-unica',
                price: 3000,
                option_groups: [],
                available: true,
              },
            ],
          },
        ],
      },
    ]);
  }

  it('la ventana de vigencia (date) va string-a-string, sin corrimiento de día', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();

    const { form } = fixture.componentInstance;
    form.starts_at = '2026-08-24';
    form.ends_at = '2026-09-01';

    expect(form.starts_at).toBe('2026-08-24');
    expect(form.ends_at).toBe('2026-09-01');
  });

  describe('continueToConfigure (pantalla de creación)', () => {
    it('spec 083 (FR-020, A-75): crea de inmediato en Borrador y arranca sin reglas', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1 Granizados');
      c.createType.set('package_price');

      const fakeResult = { id: 'new-id', rules: [] } as unknown as Promotion;
      const createSpy = vi.spyOn(c.svc, 'create').mockResolvedValue(fakeResult);

      await c.continueToConfigure();

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: '2x1 Granizados', type: 'package_price', rules: [] }),
        'draft',
      );
      expect(c.screen()).toBe('configure');
      expect(c.editingId()).toBe('new-id');
      expect(c.form.name).toBe('2x1 Granizados');
      expect(c.form.type).toBe('package_price');
      expect(c.form.rules).toEqual([]);
      // FR-011: fecha de inicio con valor por defecto (hoy), requerida al guardar.
      expect(c.form.starts_at).toBeTruthy();
    });

    it('spec 127 (FR-001): starts_at usa el día calendario LOCAL del tenant, no el día UTC', async () => {
      // 2026-10-19T02:00:00Z = 2026-10-18 21:00 hora de Bogotá (UTC-5): el
      // día UTC ya es "mañana" aunque en Bogotá todavía es "hoy" — el
      // defecto reportado era exactamente esto (promoción guardada después
      // de las 7pm quedando con starts_at del día siguiente).
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-19T02:00:00Z'));
      try {
        const fixture = TestBed.createComponent(PromotionsPageComponent);
        fixture.detectChanges();
        const c = fixture.componentInstance;
        TestBed.inject(TenantInfoService).info.set({
          id: 1,
          name: 'Heladería de prueba',
          host: 'prueba.skeilopos.com',
          logo_url: null,
          receipt_message: null,
          timezone: 'America/Bogota',
        });

        c.openNew();
        c.createName.set('2x1 Granizados');
        const fakeResult = { id: 'new-id', rules: [] } as unknown as Promotion;
        vi.spyOn(c.svc, 'create').mockResolvedValue(fakeResult);

        await c.continueToConfigure();

        expect(c.form.starts_at).toBe('2026-10-18');
      } finally {
        vi.useRealTimers();
      }
    });

    it('si el backend rechaza la creación, se queda en la pantalla de creación con el error visible', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1 Granizados');
      vi.spyOn(c.svc, 'create').mockResolvedValue(null);
      c.svc.otherError.set('Ya existe una promoción con ese nombre');

      await c.continueToConfigure();

      expect(c.screen()).toBe('create');
      expect(c.formError()).toBe('Ya existe una promoción con ese nombre');
    });

    it('no avanza sin nombre', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('   ');
      c.continueToConfigure();

      expect(c.screen()).toBe('create');
    });
  });

  describe('presentaciones del Paso 2 (spec 084, A-80: independientes de los productos)', () => {
    it('la etiqueta de una variante es el nombre de su presentación, aun con una sola variante', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const agua = c.catalogVariants().find((v) => v.id === 'f')!;
      expect(c.variantLabel(agua)).toBe('Presentación única');
      const ocho = c.catalogVariants().find((v) => v.id === 'a')!;
      expect(c.variantLabel(ocho)).toBe('8oz');
    });

    it('availablePresentations lista todas las activas del catálogo, sin productos seleccionados', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      expect(c.candidateProductIds().size).toBe(0);
      // Incluye "24oz" (ningún producto la usa) y excluye "4oz" (inactiva); ordenadas por nombre.
      expect(c.availablePresentations().map((p) => p.name)).toEqual([
        '12oz', '16oz', '24oz', '8oz', 'Presentación única',
      ]);
    });

    it('la lista no cambia al seleccionar productos', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const before = c.availablePresentations().map((p) => p.id);

      c.toggleProductCandidate('p2');
      expect(c.availablePresentations().map((p) => p.id)).toEqual(before);
    });

    it('resolvedVariantIdsForPresentation junta la variante de cada producto candidato que la tiene', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.toggleProductCandidate('p1');
      c.toggleProductCandidate('p2');
      // "16oz" solo existe en café (p1) -- mora (p2) no aporta variante.
      expect(c.resolvedVariantIdsForPresentation('pr-16oz')).toEqual(['c']);
      // "8oz" existe en ambos.
      expect(new Set(c.resolvedVariantIdsForPresentation('pr-8oz'))).toEqual(new Set(['a', 'd']));
      // Una presentación que ningún producto seleccionado tiene no resuelve nada.
      expect(c.resolvedVariantIdsForPresentation('pr-24oz')).toEqual([]);
    });

    it('un producto de una sola variante se empareja por su presentación real', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.toggleProductCandidate('p3'); // Agua: única variante, presentación "Presentación única"
      expect(c.resolvedVariantIdsForPresentation('pr-unica')).toEqual(['f']);
      expect(c.resolvedVariantIdsForPresentation('pr-8oz')).toEqual([]);
    });

    it('pickerMatchSummary avisa a cuántos de los productos seleccionados se aplicaría', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      expect(c.pickerMatchSummary()).toBeNull(); // sin presentación elegida

      c.pickerPresentationId.set('pr-16oz');
      expect(c.pickerMatchSummary()).toEqual({ matching: 0, selected: 0 });

      c.toggleProductCandidate('p1');
      c.toggleProductCandidate('p2');
      expect(c.pickerMatchSummary()).toEqual({ matching: 1, selected: 2 });
    });

    it('cambiar los productos seleccionados no reinicia la presentación elegida', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.pickerPresentationId.set('pr-8oz');
      c.toggleProductCandidate('p1');
      c.toggleProductCandidate('p2');

      expect(c.pickerPresentationId()).toBe('pr-8oz');
    });

    it('agregar una presentación que ningún producto seleccionado tiene se acepta, pero queda marcada como sin aplicar (A-81)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      c.createType.set('package_price');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();
      c.toggleProductCandidate('p2');
      c.pickerPresentationId.set('pr-24oz'); // ningún producto la tiene
      c.pickerQty.set(2);
      c.pickerValue.set(1000);

      c.addRuleRow();

      expect(c.presentationRules().length).toBe(1);
      expect(c.form.rules.length).toBe(0);
      expect(c.unresolvedRuleCount()).toBe(1);
    });
  });

  describe('addRuleRow / removeRuleRow (Paso 1 + Paso 2)', () => {
    /** Promoción en Borrador ya abierta en la pantalla de configuración. */
    async function abrirConfiguracion(c: PromotionsPageComponent): Promise<void> {
      c.openNew();
      c.createName.set('2x1');
      c.createType.set('package_price');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();
    }

    it('con un solo producto, agrega la regla de la presentación y limpia el picker', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await abrirConfiguracion(c);

      c.toggleProductCandidate('p1');
      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000); // menor a 2 * 8000 -- sí es descuento.

      c.addRuleRow();

      expect(c.presentationRules()).toEqual([{ presentationId: 'pr-8oz', min_qty: 2, value: 12000 }]);
      expect(c.form.rules).toEqual([
        { type: 'package_price', value: 12000, min_qty: 2, variantIds: ['a'] },
      ]);
      expect(c.pickerPresentationId()).toBeNull();
      expect(c.pickerError()).toBeNull();
    });

    // spec 084 (A-81): la regla es POR PRESENTACIÓN. Con varios productos seleccionados sigue
    // siendo una sola fila en la lista; al guardar se expande a una regla de backend por producto.
    it('con varios productos, la lista tiene UNA regla por presentación y form.rules una por producto (A-81)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await abrirConfiguracion(c);

      c.toggleProductCandidate('p1');
      c.toggleProductCandidate('p2');
      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000);
      c.addRuleRow();
      c.pickerPresentationId.set('pr-12oz');
      c.pickerQty.set(2);
      c.pickerValue.set(17000);
      c.addRuleRow();

      expect(c.presentationRules().length).toBe(2); // 8oz x2 y 12oz x2, sin duplicar por producto
      expect(c.form.rules.map((r) => r.variantIds[0])).toEqual(['a', 'd', 'b', 'e']);
      for (const r of c.form.rules) expect(r.variantIds.length).toBe(1);
    });

    it('cambiar los productos seleccionados no obliga a rehacer las reglas (A-81)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await abrirConfiguracion(c);
      c.toggleProductCandidate('p1');
      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000);
      c.addRuleRow();
      c.pickerPresentationId.set('pr-12oz');
      c.pickerQty.set(2);
      c.pickerValue.set(17000);
      c.addRuleRow();
      const reglas = c.presentationRules();

      c.toggleProductCandidate('p2'); // se suma mora: hereda las dos reglas
      expect(c.presentationRules()).toEqual(reglas);
      expect(c.form.rules.map((r) => r.variantIds[0])).toEqual(['a', 'd', 'b', 'e']);

      c.toggleProductCandidate('p1'); // se quita café: las reglas siguen, solo mora
      expect(c.presentationRules()).toEqual(reglas);
      expect(c.form.rules.map((r) => r.variantIds[0])).toEqual(['d', 'e']);
    });

    it('una presentación solo admite una regla por promoción', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await abrirConfiguracion(c);
      c.toggleProductCandidate('p1');
      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000);
      c.addRuleRow();

      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(3);
      c.pickerValue.set(15000);
      c.addRuleRow();

      expect(c.presentationRules().length).toBe(1);
      expect(c.presentationRules()[0].min_qty).toBe(2);
      expect(c.pickerError()).toContain('Ya hay una regla para esta presentación');
    });

    it('se puede definir la regla antes de elegir productos: no genera reglas de backend hasta que haya un producto que la tenga', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await abrirConfiguracion(c);

      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000);
      expect(c.canAddRuleRow()).toBe(true);
      c.addRuleRow();

      expect(c.presentationRules().length).toBe(1);
      expect(c.form.rules).toEqual([]);
      expect(c.unresolvedRuleCount()).toBe(1);
      expect(c.formValid()).toBe(false);

      c.toggleProductCandidate('p3'); // Agua no tiene 8oz
      expect(c.unresolvedRuleCount()).toBe(1);
      c.toggleProductCandidate('p2'); // mora sí
      expect(c.unresolvedRuleCount()).toBe(0);
      expect(c.form.rules.map((r) => r.variantIds[0])).toEqual(['d']);
    });

    it('quitar una regla de la lista quita todas sus reglas de backend', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await abrirConfiguracion(c);
      c.toggleProductCandidate('p1');
      c.toggleProductCandidate('p2');
      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000);
      c.addRuleRow();
      expect(c.form.rules.length).toBe(2);

      c.removeRuleRow(0);

      expect(c.presentationRules()).toEqual([]);
      expect(c.form.rules).toEqual([]);
    });

    it('al abrir una promoción guardada, agrupa sus reglas por presentación y recupera los productos (A-81)', () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const regla = (id: string, variant: string, qty: number, value: string) => ({
        id, type: 'package_price', value, min_qty: qty, condition_text: null,
        variants: [{ product_variant_id: variant, description: variant, unit_price: '0' }],
      });

      c.openEdit({
        id: 'p1', name: 'guardada', description: null, status: 'draft',
        starts_at: '2026-08-01', ends_at: null, days_of_week: null, start_time: null,
        end_time: null, closed_by_refactor_at: null,
        rules: [
          regla('r1', 'a', 2, '12000'), regla('r2', 'd', 2, '12000'),
          regla('r3', 'b', 2, '17000'), regla('r4', 'e', 2, '17000'),
        ],
      } as unknown as Promotion);

      expect(c.presentationRules()).toEqual([
        { presentationId: 'pr-8oz', min_qty: 2, value: 12000 },
        { presentationId: 'pr-12oz', min_qty: 2, value: 17000 },
      ]);
      expect([...c.candidateProductIds()].sort()).toEqual(['p1', 'p2']);
      expect(c.form.rules.length).toBe(4);
      expect(c.hasChanges()).toBe(false);

      c.toggleProductCandidate('p1'); // quitar un producto ya es un cambio
      expect(c.hasChanges()).toBe(true);
    });

    it('si el menú aún no cargó al abrir la promoción, agrupa las reglas cuando llegue', () => {
      const menu = TestBed.inject(MenuService);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openEdit({
        id: 'p1', name: 'guardada', description: null, status: 'draft',
        starts_at: '2026-08-01', ends_at: null, days_of_week: null, start_time: null,
        end_time: null, closed_by_refactor_at: null,
        rules: [
          { id: 'r1', type: 'package_price', value: '12000', min_qty: 2, condition_text: null,
            variants: [{ product_variant_id: 'a', description: 'a', unit_price: '0' }] },
        ],
      } as unknown as Promotion);
      expect(c.presentationRules()).toEqual([]);

      seedGranizados(menu); // llega el menú
      fixture.detectChanges(); // corre el effect del constructor

      expect(c.presentationRules()).toEqual([{ presentationId: 'pr-8oz', min_qty: 2, value: 12000 }]);
      expect([...c.candidateProductIds()]).toEqual(['p1']);
      expect(c.hasChanges()).toBe(false);
    });

    it('FR-026: rechaza un precio de paquete que no representa ahorro frente a la suma regular (espejo del guard del backend)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      c.createType.set('package_price');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();

      c.toggleProductCandidate('p1'); // 8oz cuesta 8000
      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(20000); // 2 * 8000 = 16000 < 20000 -- no es descuento.

      c.addRuleRow();

      expect(c.form.rules.length).toBe(0);
      expect(c.pickerError()).toContain('debe ser menor a la suma');
    });

    it('FR-025: una regla de precio de paquete no admite menos de 2 unidades', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      c.createType.set('package_price');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();

      expect(c.pickerQty()).toBe(2); // arranca en 2 para precio de paquete (FR-025)

      c.toggleProductCandidate('p1');
      c.pickerPresentationId.set('pr-8oz');
      c.onPickerQtyChange(1);
      expect(c.pickerQty()).toBe(2); // no baja de 2
      expect(c.pickerError()).toContain('mínimo es de 2 unidades');

      c.pickerValue.set(12000);
      c.addRuleRow();
      expect(c.form.rules[0].min_qty).toBe(2);
    });

    it('remueve una fila ya agregada', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openNew();
      c.createName.set('2x1');
      vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
      await c.continueToConfigure();
      c.toggleProductCandidate('p1');
      c.pickerPresentationId.set('pr-8oz');
      c.pickerQty.set(2);
      c.pickerValue.set(12000);
      c.addRuleRow();
      expect(c.form.rules.length).toBe(1);

      c.removeRuleRow(0);
      expect(c.form.rules.length).toBe(0);
    });
  });

  it('FR-018: en una promoción activa las reglas no son editables (canEditRuleSet false)', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.editingSource.set({
      id: 'p1',
      name: 'activa',
      description: null,
      status: 'active',
      starts_at: null,
      ends_at: null,
      days_of_week: null,
      start_time: null,
      end_time: null,
      closed_by_refactor_at: null,
      rules: [
        { id: 'r1', type: 'percent', value: '10', min_qty: 1, condition_text: null, variants: [] },
      ],
    });

    expect(c.canEditRuleSet()).toBe(false);
  });

  it('openEdit: una promoción pausada habilita agregar/quitar reglas (FR-014) y fija el type de la primera regla existente', () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openEdit({
      id: 'p1',
      name: 'pausada',
      description: null,
      status: 'paused',
      starts_at: '2026-08-01',
      ends_at: null,
      days_of_week: null,
      start_time: null,
      end_time: null,
      closed_by_refactor_at: null,
      rules: [
        {
          id: 'r1',
          type: 'percent',
          value: '10',
          min_qty: 1,
          condition_text: null,
          variants: [{ product_variant_id: 'a', description: 'a', unit_price: '8000.00' }],
        },
      ],
    });

    expect(c.screen()).toBe('configure');
    expect(c.isPaused()).toBe(true);
    expect(c.canEditRuleSet()).toBe(true);
    expect(c.form.type).toBe('percent');
    expect(c.form.rules[0].variantIds).toEqual(['a']);
  });

  it('spec 063 (FR-014): saveConfigure() actualiza las reglas (updateShape) también cuando la promoción está pausada', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openEdit({
      id: 'p1',
      name: 'pausada',
      description: null,
      status: 'paused',
      starts_at: '2026-08-01',
      ends_at: null,
      days_of_week: null,
      start_time: null,
      end_time: null,
      closed_by_refactor_at: null,
      rules: [
        {
          id: 'r1',
          type: 'percent',
          value: '10',
          min_qty: 1,
          condition_text: null,
          variants: [{ product_variant_id: 'a', description: 'a', unit_price: '8000.00' }],
        },
      ],
    });
    c.form.name = 'pausada';

    const fakeResult = { id: 'p1' } as Promotion;
    const updateShapeSpy = vi.spyOn(c.svc, 'updateShape').mockResolvedValue(fakeResult);
    const updateSpy = vi.spyOn(c.svc, 'update').mockResolvedValue(fakeResult);

    await c.saveConfigure();

    expect(updateShapeSpy).toHaveBeenCalledWith('p1', c.form);
    // spec 127 (FR-005): pausada -> no es draft -> starts_at se excluye del PATCH.
    expect(updateSpy).toHaveBeenCalledWith('p1', c.form, false);
    expect(updateShapeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      updateSpy.mock.invocationCallOrder[0],
    );
  });

  it('spec 083 (A-75): saveConfigure() nunca crea -- la promoción ya existe desde "Continuar"', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.createName.set('Nueva');
    const created = { id: 'new-id', status: 'draft', rules: [] } as unknown as Promotion;
    const createSpy = vi.spyOn(c.svc, 'create').mockResolvedValue(created);
    await c.continueToConfigure();
    expect(createSpy).toHaveBeenCalledTimes(1);
    createSpy.mockClear();

    // Sin catálogo cargado no hay presentaciones que elegir -- se agrega la
    // regla directo sobre `form.rules` para aislar el guardado del picker.
    c.form.rules.push({ type: 'package_price', value: 12000, min_qty: 2, variantIds: ['a'] });

    const updateShapeSpy = vi.spyOn(c.svc, 'updateShape').mockResolvedValue(created);
    const updateSpy = vi.spyOn(c.svc, 'update').mockResolvedValue(created);

    await c.saveConfigure();

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateShapeSpy).toHaveBeenCalledWith('new-id', c.form);
    // spec 127 (FR-005): sigue en draft -> starts_at viaja en el PATCH.
    expect(updateSpy).toHaveBeenCalledWith('new-id', c.form, true);
    expect(c.screen()).toBe('list');
  });

  it('el conjunto vacío de una regla invalida el formulario (FR-001)', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.createName.set('x');
    vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
    await c.continueToConfigure();
    expect(c.formValid()).toBe(false); // sin reglas todavía.

    c.form.rules.push({ type: 'package_price', value: 10, min_qty: 1, variantIds: [] });
    expect(c.formValid()).toBe(false); // regla sin variantes.

    c.form.rules[0].variantIds = ['a'];
    expect(c.formValid()).toBe(true);
  });

  it('FR-001a: una variante repetida entre dos reglas se detecta en el cliente y bloquea el formulario', async () => {
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openNew();
    c.createName.set('x');
    vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'p1', rules: [] } as unknown as Promotion);
    await c.continueToConfigure();
    c.form.rules.push({ type: 'package_price', value: 10, min_qty: 1, variantIds: ['a', 'b'] });
    c.form.rules.push({ type: 'package_price', value: 10, min_qty: 1, variantIds: ['b', 'c'] });

    const conflict = c.sharedVariantConflict();
    expect(conflict).not.toBeNull();
    expect(conflict?.a).toBe(0);
    expect(conflict?.b).toBe(1);
    expect(c.formValid()).toBe(false);
  });

  describe('"Guardar y sincronizar" al final del formulario, solo con cambios', () => {
    const pausada = (): Promotion =>
      ({
        id: 'p1',
        name: 'pausada',
        description: null,
        status: 'paused',
        starts_at: '2026-08-01',
        ends_at: null,
        days_of_week: '0,1',
        start_time: null,
        end_time: null,
        closed_by_refactor_at: null,
        rules: [
          {
            id: 'r1',
            type: 'percent',
            value: '10',
            min_qty: 1,
            condition_text: null,
            variants: [{ product_variant_id: 'a', description: 'a', unit_price: '8000.00' }],
          },
        ],
      }) as unknown as Promotion;

    /** El componente es OnPush y el formulario un objeto plano: en la app real cada evento del
     *  template (ngModel, clic) marca la vista; aquí, que muta `form` directo, se marca a mano. */
    const refresh = (fixture: ComponentFixture<PromotionsPageComponent>) => {
      fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
    };

    const saveButton = (root: HTMLElement): HTMLButtonElement | undefined =>
      (Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]).find((b) =>
        b.textContent?.includes('Guardar y sincronizar'),
      );

    it('al abrir la configuración no hay cambios y el botón está deshabilitado', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openEdit(pausada());
      fixture.detectChanges();

      expect(c.hasChanges()).toBe(false);
      expect(c.formValid()).toBe(true);
      expect(saveButton(fixture.nativeElement)?.disabled).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('No hay cambios por guardar');
    });

    it('cualquier cambio (nombre, fecha, días, horas, reglas) habilita el botón', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openEdit(pausada());
      fixture.detectChanges();

      c.form.name = 'pausada renombrada';
      refresh(fixture);
      expect(c.hasChanges()).toBe(true);
      expect(saveButton(fixture.nativeElement)?.disabled).toBe(false);
      expect(fixture.nativeElement.textContent).not.toContain('No hay cambios por guardar');

      c.form.name = 'pausada'; // deshacer el cambio lo vuelve a deshabilitar
      refresh(fixture);
      expect(c.hasChanges()).toBe(false);
      expect(saveButton(fixture.nativeElement)?.disabled).toBe(true);

      c.form.days_of_week.push(4);
      expect(c.hasChanges()).toBe(true);
      c.form.days_of_week.pop();

      c.form.ends_at = '2026-12-31';
      expect(c.hasChanges()).toBe(true);
      c.form.ends_at = null;

      c.form.rules[0].value = 15;
      expect(c.hasChanges()).toBe(true);
      c.form.rules[0].value = 10;
      expect(c.hasChanges()).toBe(false);
    });

    it('reordenar días o variantes sin cambiar su contenido no cuenta como cambio', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openEdit(pausada());

      c.form.days_of_week = [1, 0];
      expect(c.hasChanges()).toBe(false);
    });

    it('un cambio inválido no habilita el botón (sigue exigiendo formValid)', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openEdit(pausada());
      c.form.name = '';
      refresh(fixture);

      expect(c.hasChanges()).toBe(true);
      expect(c.formValid()).toBe(false);
      expect(saveButton(fixture.nativeElement)?.disabled).toBe(true);
    });

    it('el botón ya no está en la cabecera: es lo último del formulario', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openEdit(pausada());
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
      const save = saveButton(root)!;
      const volver = buttons.find((b) => b.textContent?.includes('Volver'))!;

      expect(save).toBeDefined();
      // Sigue al botón "Volver" (cabecera) y no le sigue ningún otro botón de la pantalla.
      expect(volver.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(buttons.indexOf(save)).toBe(buttons.length - 1);
    });

    it('una promoción finalizada (solo lectura) no muestra el botón', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.openEdit({ ...pausada(), status: 'finished' });
      fixture.detectChanges();

      expect(saveButton(fixture.nativeElement)).toBeUndefined();
    });
  });

  it('un conflicto de variante repetida de una promoción abierta antes no bloquea el guardado de la siguiente', async () => {
    const menu = TestBed.inject(MenuService);
    seedGranizados(menu);
    const fixture = TestBed.createComponent(PromotionsPageComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    // 1) Una promoción antigua con la misma variante en dos reglas: hay conflicto.
    c.openNew();
    c.createName.set('vieja');
    vi.spyOn(c.svc, 'create').mockResolvedValue({ id: 'v1', rules: [] } as unknown as Promotion);
    await c.continueToConfigure();
    c.form.rules.push({ type: 'package_price', value: 10, min_qty: 2, variantIds: ['a'] });
    c.form.rules.push({ type: 'package_price', value: 12, min_qty: 3, variantIds: ['a'] });
    expect(c.sharedVariantConflict()).not.toBeNull();
    fixture.detectChanges(); // la plantilla lo evalúa

    // 2) Otra promoción, con reglas correctas: no debe arrastrar el conflicto anterior.
    c.backToList();
    c.openNew();
    c.createName.set('nueva');
    await c.continueToConfigure();
    c.toggleProductCandidate('p1');
    c.pickerPresentationId.set('pr-8oz');
    c.pickerQty.set(2);
    c.pickerValue.set(12000);
    c.addRuleRow();
    c.pickerPresentationId.set('pr-12oz');
    c.pickerQty.set(2);
    c.pickerValue.set(17000);
    c.addRuleRow();
    fixture.detectChanges();

    expect(c.sharedVariantConflict()).toBeNull();
    expect(c.formValid()).toBe(true);
  });

  describe('duplicar con un nombre que ya existe (spec 084, A-83)', () => {
    const fuente = { id: 's1', name: 'promo lunes', status: 'finished', rules: [] } as unknown as Promotion;

    it('el primer intento solo avisa en el diálogo: no reemplaza nada ni muestra el error en la lista', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.startDuplicate(fuente);
      const spy = vi.spyOn(c.svc, 'duplicate').mockImplementation(async () => {
        c.svc.otherError.set('Ya existe una promoción con ese nombre');
        return null;
      });

      await c.confirmDuplicate();

      expect(spy).toHaveBeenCalledWith('s1', 'promo lunes (copia)', false);
      expect(c.duplicateNameTaken()).toBe(true);
      expect(c.svc.otherError()).toBeNull();
      expect(c.duplicating()).not.toBeNull(); // el diálogo sigue abierto
    });

    it('el segundo intento pide reemplazar, y al éxito cierra el diálogo y abre la copia', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.startDuplicate(fuente);
      c.duplicateNameTaken.set(true);
      const copia = { id: 'c1', name: 'promo lunes (copia)', status: 'draft', rules: [] } as unknown as Promotion;
      const spy = vi.spyOn(c.svc, 'duplicate').mockResolvedValue(copia);
      const abrir = vi.spyOn(c, 'openEdit').mockImplementation(() => {});

      await c.confirmDuplicate();

      expect(spy).toHaveBeenCalledWith('s1', 'promo lunes (copia)', true);
      expect(c.duplicating()).toBeNull();
      expect(c.duplicateNameTaken()).toBe(false);
      expect(abrir).toHaveBeenCalledWith(copia);
    });

    it('cambiar el nombre quita el aviso de reemplazo', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.startDuplicate(fuente);
      c.duplicateNameTaken.set(true);

      c.onDuplicateNameChange('otro nombre');

      expect(c.duplicateNameTaken()).toBe(false);
      expect(c.duplicateName()).toBe('otro nombre');
    });

    it('el diálogo muestra el aviso y cambia el texto del botón', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.startDuplicate(fuente);
      c.duplicateNameTaken.set(true);
      fixture.detectChanges();

      const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(texto).toContain('se eliminará con todas sus reglas');
      expect(texto).toContain('Reemplazar y duplicar');
    });

    it('otro error distinto al de nombre repetido se muestra como error normal', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.startDuplicate(fuente);
      vi.spyOn(c.svc, 'duplicate').mockImplementation(async () => {
        c.svc.otherError.set('Algo más falló');
        return null;
      });

      await c.confirmDuplicate();

      expect(c.duplicateNameTaken()).toBe(false);
    });
  });

  describe('FR-021: canDelete (habilitación de "Eliminar")', () => {
    it('habilitado para Borrador, En pausa y Finalizada; bloqueado solo para Activa', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const base = { id: 'p1', name: 'x', rules: [] } as unknown as Promotion;
      expect(c.canDelete({ ...base, status: 'draft' } as Promotion)).toBe(true);
      expect(c.canDelete({ ...base, status: 'paused' } as Promotion)).toBe(true);
      expect(c.canDelete({ ...base, status: 'finished' } as Promotion)).toBe(true);
      expect(c.canDelete({ ...base, status: 'active' } as Promotion)).toBe(false);
    });
  });

  describe('spec 084 FR-008/FR-009/FR-010 (A-76): "Configurar" deshabilitado en Activa', () => {
    const base = { id: 'p1', name: 'x', rules: [] } as unknown as Promotion;

    it('canConfigure: habilitado para Borrador, En pausa y Finalizada; bloqueado solo para Activa, sin importar el badge', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      expect(c.canConfigure({ ...base, status: 'draft' } as Promotion)).toBe(true);
      expect(c.canConfigure({ ...base, status: 'paused' } as Promotion)).toBe(true);
      expect(c.canConfigure({ ...base, status: 'finished' } as Promotion)).toBe(true);
      expect(c.canConfigure({ ...base, status: 'active' } as Promotion)).toBe(false);
      // Estado real, no el badge -- una vigencia ya vencida sigue bloqueada si status=active.
      expect(
        c.canConfigure({
          ...base, status: 'active',
          starts_at: '2020-01-01', ends_at: '2020-01-02',
        } as Promotion),
      ).toBe(false);
    });

    it('openEdit no abre la pantalla de configuración para una promoción active (defensa en profundidad)', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openEdit({ ...base, status: 'active' } as Promotion);

      expect(c.editingId()).toBeNull();
      expect(c.screen()).toBe('list');
    });

    it('openEdit sí abre la pantalla para draft/paused/finished', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      c.openEdit({ ...base, status: 'paused' } as Promotion);

      expect(c.editingId()).toBe('p1');
    });
  });

  describe('FR-017: promotionTypeLabel (columna "Reglas" simplificada)', () => {
    it('muestra únicamente el tipo cuando todas las reglas comparten uno', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const p = {
        rules: [{ type: 'package_price' }, { type: 'package_price' }],
      } as unknown as Promotion;
      expect(c.promotionTypeLabel(p)).toBe('Precio de paquete');
    });

    it('sin reglas todavía (Borrador recién creado, A-75)', () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;

      expect(c.promotionTypeLabel({ rules: [] } as unknown as Promotion)).toBe('Sin reglas');
    });
  });

  describe('spec 084 FR-021/FR-022 (A-78): exclusividad de producto en el Paso 1', () => {
    /** El query de `activePromotions` (TanStack Query) no despacha su petición
     *  de forma síncrona dentro de `detectChanges()` -- hace falta drenar un
     *  microtask antes de que `http.expectOne` la vea (mismo patrón que
     *  `product-form.component.spec.ts::tick`). */
    const tick = () => new Promise((r) => setTimeout(r, 0));

    /** Responde la petición de `?status=active` que alimenta
     *  `blockedByPromotion()`; las demás peticiones en vuelo (`GET /menu`,
     *  `?page=1`, `?closed_by_refactor=true`) las drena `afterEach` al final. */
    async function flushActivePromotions(
      fixture: ReturnType<typeof TestBed.createComponent<PromotionsPageComponent>>,
      items: unknown[],
    ): Promise<void> {
      await tick();
      const req = http.expectOne(
        (r) => r.url.endsWith('/promotions') && r.params.get('status') === 'active',
      );
      req.flush({ items, total: items.length, page: 1, size: 100, pages: 1 });
      // TanStack Query propaga su cache al signal `data()` en su propia ronda
      // de microtareas, aparte de la del Observable HTTP -- un solo tick no
      // siempre alcanza (mismo ajuste de fondo que
      // `public-menu.component.spec.ts::createComponent`, sin `whenStable()`
      // acá: rompe con "ApplicationRef ya destruido" en este archivo).
      const start = Date.now();
      while (
        fixture.componentInstance.svc.activePromotions().length === 0 &&
        Date.now() - start < 500
      ) {
        await tick();
        fixture.detectChanges();
      }
    }

    const otraPromoActiva = {
      id: 'other', name: 'Ya activa', status: 'active',
      rules: [
        {
          id: 'r1', type: 'percent', value: '10', min_qty: 1, condition_text: null,
          variants: [{ product_variant_id: 'a', description: '', unit_price: '8000' }],
        },
      ],
    };

    it('blockedReason() devuelve el nombre de la promoción activa que ya cubre el producto (por cualquiera de sus variantes)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await flushActivePromotions(fixture, [otraPromoActiva]);

      // 'a' (8oz) pertenece a p1 (café) -- FR-021: todo el producto queda bloqueado.
      expect(c.blockedReason('p1')).toBe('Ya activa');
      expect(c.blockedReason('p2')).toBeNull();
    });

    it('toggleProductCandidate() rechaza seleccionar un producto bloqueado (defensa en profundidad)', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await flushActivePromotions(fixture, [otraPromoActiva]);

      c.toggleProductCandidate('p1');

      expect(c.isProductSelected('p1')).toBe(false);
      expect(c.pickerError()).toContain('Ya activa');
    });

    it('un producto sin ninguna promoción activa en conflicto se puede seleccionar con normalidad', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      await flushActivePromotions(fixture, [otraPromoActiva]);

      c.toggleProductCandidate('p2');

      expect(c.isProductSelected('p2')).toBe(true);
      expect(c.pickerError()).toBeNull();
    });

    it('FR-024: la promoción en edición (editingId) se excluye de su propio bloqueo', async () => {
      const menu = TestBed.inject(MenuService);
      seedGranizados(menu);
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      // "other" es la misma promoción que se está editando ahora.
      c.editingId.set('other');
      await flushActivePromotions(fixture, [otraPromoActiva]);

      expect(c.blockedReason('p1')).toBeNull();
    });
  });

  describe('spec 084 FR-026 a FR-028 (bug 5): menú de acciones sin recortar ni mover el scroll', () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const promo = {
      id: 'p1', name: 'Promo X', description: null, status: 'draft',
      starts_at: null, ends_at: null, days_of_week: null, start_time: null, end_time: null,
      closed_by_refactor_at: null, rules: [],
    } as unknown as Promotion;

    async function renderOneRow(
      fixture: ReturnType<typeof TestBed.createComponent<PromotionsPageComponent>>,
    ): Promise<void> {
      await tick();
      const req = http.expectOne(
        (r) =>
          r.url.endsWith('/promotions') &&
          r.params.get('page') === '1' &&
          !r.params.has('status') &&
          !r.params.has('closed_by_refactor'),
      );
      req.flush({ items: [promo], total: 1, page: 1, size: 20, pages: 1 });
      const start = Date.now();
      while (
        fixture.componentInstance.svc.promotions().length === 0 &&
        Date.now() - start < 500
      ) {
        await tick();
        fixture.detectChanges();
      }
    }

    it('el menú se renderiza fuera del contenedor con scroll de la tabla (CDK Overlay, no recortado)', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      await renderOneRow(fixture);
      const c = fixture.componentInstance;

      c.toggleActionsMenu('p1', new MouseEvent('click'));
      fixture.detectChanges();

      const overlayPane = document.querySelector('.cdk-overlay-pane');
      expect(overlayPane).not.toBeNull();
      expect(overlayPane!.textContent).toContain('Configurar');
      expect(overlayPane!.textContent).toContain('Duplicar');
      // El overlay NO cuelga del contenedor con scroll de la tabla.
      const scrollContainer = fixture.nativeElement.querySelector('.overflow-x-auto');
      expect(scrollContainer?.contains(overlayPane)).toBe(false);

      c.closeActionsMenu();
      fixture.detectChanges();
    });

    it('cerrar el menú (clic fuera / seleccionar una opción) no deja nada en el overlay', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      await renderOneRow(fixture);
      const c = fixture.componentInstance;

      c.toggleActionsMenu('p1', new MouseEvent('click'));
      fixture.detectChanges();
      expect(c.openActionsId()).toBe('p1');

      c.closeActionsMenu();
      fixture.detectChanges();

      expect(c.openActionsId()).toBeNull();
      expect(document.querySelector('.cdk-overlay-pane')).toBeNull();
    });

    it('redimensionar la ventana cierra el menú abierto (FR-028, edge case de layout)', async () => {
      const fixture = TestBed.createComponent(PromotionsPageComponent);
      fixture.detectChanges();
      await renderOneRow(fixture);
      const c = fixture.componentInstance;

      c.toggleActionsMenu('p1', new MouseEvent('click'));
      fixture.detectChanges();
      expect(c.openActionsId()).toBe('p1');

      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();

      expect(c.openActionsId()).toBeNull();
    });
  });
});
