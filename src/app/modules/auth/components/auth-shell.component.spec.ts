import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthShellComponent } from './auth-shell.component';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { environment } from '../../../../environments/environment';

type Ctx = 'SUPER_ADMIN' | 'TENANT' | 'UNRECOGNIZED';

/** Host mínimo para comprobar que el contenido proyectado se renderiza (o no). */
@Component({
  standalone: true,
  imports: [AuthShellComponent],
  template: `<app-auth-shell><p data-testid="contenido-proyectado">formulario</p></app-auth-shell>`,
})
class HostDePrueba {}

/**
 * Spec 095 — garantías C1 a C8 del contrato del cascarón
 * (contracts/auth-shell-contract.md §1). El cascarón **lee** el contexto que la
 * spec 091 resolvió en el arranque; no lo clasifica (FR-010) y no habla con el
 * servidor en ningún contexto (FR-007a, SC-011, SC-012).
 */
describe('AuthShellComponent', () => {
  let http: HttpTestingController;

  function crear(ctx: Ctx = 'TENANT', slug = 'acme') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HostDePrueba],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Doble del contexto de tenant, como en login.component.spec.ts: el
        // servicio real exige provideTenantInitializer() en el arranque.
        {
          provide: TenantContextService,
          useValue: {
            isSuperAdmin: () => ctx === 'SUPER_ADMIN',
            isTenant: () => ctx === 'TENANT',
            isUnrecognized: () => ctx === 'UNRECOGNIZED',
            tenantSlug: () => (ctx === 'TENANT' ? slug : null),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HostDePrueba);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const q = (el: HTMLElement, testid: string) => el.querySelector(`[data-testid="${testid}"]`);

  // ── C1 · rejilla de dos columnas desde 1024 px ───────────────────────────

  it('C1: la rejilla es de dos columnas solo desde 1024 px, con las proporciones del diseño', () => {
    const el = crear();
    const rejilla = el.querySelector('app-auth-shell > div')!;

    // Una sola columna por defecto; desde `lg`, las dos del diseño — el panel
    // de marca es algo más ancho que el formulario (1.15fr contra 1fr).
    expect(rejilla.className).toContain('grid-cols-1');
    expect(rejilla.className).toContain('lg:grid-cols-[minmax(360px,1fr)_minmax(0,1.15fr)]');
    // Los tokens del sistema de diseño entran por aquí, acotados al cascarón.
    expect(rejilla.className).toContain('auth-theme');
  });

  // ── C2 · orden fijo de la columna izquierda ──────────────────────────────

  it('C2: el orden es logotipo → etiqueta → contenido proyectado → pie (FR-002)', () => {
    const el = crear();
    const orden = ['auth-brand-logo', 'auth-context-badge', 'contenido-proyectado', 'auth-footer'];
    const posiciones = orden.map((id) => {
      const nodo = q(el, id);
      expect(nodo, `falta [data-testid="${id}"]`).not.toBeNull();
      return nodo!;
    });

    for (let i = 0; i < posiciones.length - 1; i++) {
      const relacion = posiciones[i].compareDocumentPosition(posiciones[i + 1]);
      expect(
        relacion & Node.DOCUMENT_POSITION_FOLLOWING,
        `${orden[i]} debería preceder a ${orden[i + 1]}`,
      ).toBeTruthy();
    }
  });

  it('C2: el logotipo es el imagotipo horizontal del diseño, con texto alternativo', () => {
    const logo = q(crear(), 'auth-brand-logo') as HTMLImageElement;
    // El diseño usa el logotipo horizontal (icono + palabra), no el cuadrado.
    expect(logo.getAttribute('src')).toBe('/images/logo-horizontal.webp');
    expect(logo.getAttribute('alt')).toBe('SkeiloPOS');
    expect(logo.getAttribute('width')).toBe('140');
    expect(logo.getAttribute('height')).toBe('48');
  });

  // ── Etiqueta de contexto (FR-007, FR-008) ────────────────────────────────

  it('en TENANT muestra el slug sin transformar, con ícono storefront (FR-007)', () => {
    const el = crear('TENANT', 'granizados-del-sol');
    const badge = q(el, 'auth-context-badge')!;

    expect(badge.textContent).toContain('granizados-del-sol');
    expect(badge.textContent).not.toContain('Granizados');
    expect(badge.querySelector('.material-icons-outlined')?.textContent?.trim()).toBe('storefront');
  });

  it('en TENANT el slug completo queda en title y el recorte es solo visual (FR-007)', () => {
    const largo = 'un-negocio-con-nombre-larguisimo';
    const badge = q(crear('TENANT', largo), 'auth-context-badge')!;

    expect(badge.getAttribute('title')).toBe(largo);
    expect(badge.textContent).toContain(largo);
    expect(badge.querySelector('.truncate')).not.toBeNull();
  });

  it('en SUPER_ADMIN dice "Administración de la plataforma" y ningún slug (FR-008, D8)', () => {
    const el = crear('SUPER_ADMIN');
    const badge = q(el, 'auth-context-badge')!;

    expect(badge.textContent).toContain('Administración de la plataforma');
    expect(el.textContent).not.toContain('acme');
    expect(el.textContent).not.toContain('Acceso Super Admin');
    expect(badge.querySelector('.material-icons-outlined')?.textContent?.trim()).toBe(
      'admin_panel_settings',
    );
  });

  // ── C5 · la etiqueta sale ya con su texto definitivo ─────────────────────

  it('C5: la etiqueta se pinta en el primer render, sin estado de carga (FR-007c, SC-011)', () => {
    const el = crear('TENANT', 'acme');
    expect(q(el, 'auth-context-badge')!.textContent).toContain('acme');
    expect(el.textContent).not.toContain('Cargando');
  });

  // ── C6 · host no reconocido ──────────────────────────────────────────────

  it('C6: con UNRECOGNIZED muestra el aviso y NO proyecta el contenido (FR-009, R6)', () => {
    const el = crear('UNRECOGNIZED');
    const aviso = q(el, 'unrecognized-host')!;

    expect(aviso).not.toBeNull();
    expect(aviso.textContent).toContain('No encontramos este negocio');
    expect(q(el, 'contenido-proyectado')).toBeNull();
    expect(q(el, 'auth-context-badge')).toBeNull();
    expect(el.querySelector('form')).toBeNull();
  });

  it('C6: el aviso enlaza al sitio público de SkeiloPOS (FR-009)', () => {
    const enlace = q(crear('UNRECOGNIZED'), 'unrecognized-host')!.querySelector('a')!;
    expect(enlace.getAttribute('href')).toBe(environment.publicSiteUrl);
    expect(enlace.textContent).toContain('Ir al sitio de SkeiloPOS');
  });

  // ── C7 · pie ─────────────────────────────────────────────────────────────

  it('C7: el pie muestra el año actual calculado, no uno escrito a mano (FR-003)', () => {
    const pie = q(crear(), 'auth-footer')!;
    expect(pie.textContent).toContain(`© ${new Date().getFullYear()} SkeiloPOS`);
  });

  it('C7: el pie enlaza la Política de privacidad del sitio público (FR-003, FR-003a)', () => {
    const pie = q(crear(), 'auth-footer')!;
    const enlace = pie.querySelector('a')!;

    expect(enlace.textContent).toContain('Política de privacidad');
    expect(enlace.getAttribute('href')).toBe(`${environment.publicSiteUrl}/privacidad`);
  });

  it('C7: el pie también aparece en un host no reconocido', () => {
    expect(q(crear('UNRECOGNIZED'), 'auth-footer')).not.toBeNull();
  });

  // ── C3 · panel de marca ──────────────────────────────────────────────────

  it('C3: el panel de marca está ausente del layout por debajo de 1024 px (FR-005)', () => {
    const panel = q(crear(), 'auth-brand-panel')!;
    expect(panel.className).toContain('hidden');
    expect(panel.className).toContain('lg:flex');
  });

  it('C3: la vista previa es un background-image tras la media query, nunca un <img> (FR-005, SC-007)', () => {
    const el = crear();
    // Un <img> se descargaría aunque estuviera oculto — que es justo lo que
    // FR-005 prohíbe en el celular del negocio. El diseño la dibuja con una
    // etiqueta de imagen; aquí es el fondo de un div, con el mismo resultado
    // visual (`contain`, esquinas redondeadas y sombra) y sin la descarga.
    const imagenes = Array.from(el.querySelectorAll('img'));
    expect(imagenes.some((i) => (i.getAttribute('src') ?? '').includes('auth-preview'))).toBe(false);
    expect(q(el, 'auth-brand-panel')!.querySelector('.auth-brand-preview')).not.toBeNull();
  });

  it('el lema y su texto de apoyo son texto real, no una imagen (FR-004, FR-042)', () => {
    const panel = q(crear(), 'auth-brand-panel')!;
    expect(panel.textContent).toContain('Tu negocio. Más rápido.');
    expect(panel.textContent).toContain(
      'Del caos de las comandas en papel a la velocidad digital en un tap.',
    );
  });

  // ── C8 · cero peticiones ─────────────────────────────────────────────────

  it.each<Ctx>(['TENANT', 'SUPER_ADMIN', 'UNRECOGNIZED'])(
    'C8: en %s el cascarón no emite ninguna petición (FR-007a, SC-011, SC-012)',
    (ctx) => {
      crear(ctx);
      http.verify();
    },
  );
});
