import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { TenantsPageComponent } from './tenants-page.component';
import { Tenant } from '../interfaces/tenant.interface';

const listUrl = `${environment.apiBaseUrl}/super-admin/tenants`;

function tenant(partial: Partial<Tenant>): Tenant {
  return {
    id: 1,
    name: 'Tenant',
    schema: 'tenant',
    host: 'tenant.skeilopos.com',
    plan_id: 'plan-basic',
    plan_name: 'Básico',
    ciclo_facturacion: 'mensual',
    timezone: 'America/Bogota',
    plan_vence_en: null,
    created_at: '2026-01-01T00:00:00+00:00',
    ...partial,
  };
}

/**
 * spec 138 (FR-008, US1-7): el Super Admin no pertenece a ningún tenant; el vencimiento del plan de cada fila se
 * muestra en la zona de ESE tenant (la lista entrega la zona de cada uno), no en la del navegador.
 */
describe('TenantsPageComponent — «Vence» en la zona de cada tenant (spec 138)', () => {
  // 2026-11-01T16:00Z = 11:00 del 1/nov en Bogotá, pero 01:00 del 2/nov en Tokio.
  const VENCE = '2026-11-01T16:00:00+00:00';

  function render(tenants: Tenant[]): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TenantsPageComponent],
      // `mediumDate` depende del idioma; se fija para que la aserción no dependa del entorno.
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LOCALE_ID, useValue: 'en-US' }],
    });
    const fixture = TestBed.createComponent(TenantsPageComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(listUrl).flush({ items: tenants, total: tenants.length, page: 1, size: 20, pages: 1 });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const filas = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('tbody tr')).map((tr) => (tr.textContent ?? '').replace(/\s+/g, ' '));

  it('un tenant de Tokio vence el 2 de noviembre de 2026, no el 1.º', () => {
    const [fila] = filas(render([tenant({ name: 'Sushi', timezone: 'Asia/Tokyo', plan_vence_en: VENCE })]));
    expect(fila).toContain('Nov 2, 2026');
    expect(fila).not.toContain('Nov 1, 2026');
  });

  it('el mismo instante en un tenant de Bogotá vence el 1.º de noviembre', () => {
    const [fila] = filas(render([tenant({ name: 'Granizados', timezone: 'America/Bogota', plan_vence_en: VENCE })]));
    expect(fila).toContain('Nov 1, 2026');
  });

  it('cada fila usa su propia zona aunque el navegador esté en otra', () => {
    const resultado = filas(
      render([
        tenant({ id: 1, name: 'Sushi', timezone: 'Asia/Tokyo', plan_vence_en: VENCE }),
        tenant({ id: 2, name: 'Granizados', timezone: 'America/Bogota', plan_vence_en: VENCE }),
        tenant({ id: 3, name: 'Tacos', timezone: 'America/Mexico_City', plan_vence_en: VENCE }),
      ]),
    );
    expect(resultado[0]).toContain('Nov 2, 2026');
    expect(resultado[1]).toContain('Nov 1, 2026');
    expect(resultado[2]).toContain('Nov 1, 2026');
  });

  it('sin vencimiento muestra «Sin vencimiento»', () => {
    const [fila] = filas(render([tenant({ plan_vence_en: null })]));
    expect(fila).toContain('Sin vencimiento');
  });
});
