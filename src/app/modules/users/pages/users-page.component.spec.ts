import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UsersPageComponent } from './users-page.component';
import { AuthService } from '../../../core/services/auth.service';

describe('UsersPageComponent — estado vacío (spec 082)', () => {
  it('el estado vacío ya no muestra el emoji 👥 como ícono', async () => {
    TestBed.configureTestingModule({
      imports: [UsersPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(UsersPageComponent);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http
      .match(() => true)
      .forEach((req) => req.flush({ items: [], total: 0, page: 1, size: 20, pages: 0 }));
    await Promise.resolve();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('👥');
    const icon = el.querySelector('app-mi-icon .material-icons-outlined');
    expect(icon?.textContent?.trim()).toBe('group');
  });
});

describe('UsersPageComponent — nombre y avatar (spec 091, A-100)', () => {
  async function render(users: Record<string, unknown>[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [UsersPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
    const fixture = TestBed.createComponent(UsersPageComponent);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http.match(() => true).forEach((req) =>
      req.flush(
        req.request.url.includes('/invitations')
          ? { items: [], total: 0, page: 1, size: 20, pages: 0 }
          : { items: users, total: users.length, page: 1, size: 20, pages: 1 },
      ),
    );
    await Promise.resolve();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const user = (over: Record<string, unknown>) => ({
    id: '1', name: 'x', email: 'x@acme.co', phone: null, active: true, role_name: 'CASHIER',
    tenant_id: 1, tenant_name: 'Acme', created_at: '', updated_at: null, ...over,
  });
  const titulo = (el: HTMLElement) => el.querySelector('[data-testid="user-title"]') as HTMLElement;
  const avatar = (el: HTMLElement) => el.querySelector('[data-testid="user-avatar"]') as HTMLElement;

  it('usuario con nombre: título con el nombre y avatar con su inicial', async () => {
    const el = await render([user({ name: 'María Pérez', email: 'maria@acme.co' })]);
    expect(titulo(el).textContent?.trim()).toBe('María Pérez');
    expect(avatar(el).textContent?.trim()).toBe('M');
  });

  it('nombre igual al correo o vacío: título = correo y avatar = inicial del correo', async () => {
    const el = await render([
      user({ id: '1', name: 'ana@acme.co', email: 'ana@acme.co' }),
      user({ id: '2', name: '', email: 'beto@acme.co' }),
    ]);
    const titulos = Array.from(el.querySelectorAll('[data-testid="user-title"]')).map((e) => e.textContent?.trim());
    const avatares = Array.from(el.querySelectorAll('[data-testid="user-avatar"]')).map((e) => e.textContent?.trim());
    // El servicio puede reordenar la lista: se compara sin depender del orden.
    expect([...titulos].sort()).toEqual(['ana@acme.co', 'beto@acme.co']);
    expect([...avatares].sort()).toEqual(['A', 'B']);
  });

  it("muestra O'Brien-Díaz idéntico y un nombre con <b> como texto, no como HTML", async () => {
    const el = await render([
      user({ id: '1', name: "O'Brien-Díaz" }),
      user({ id: '2', name: '<b>Ana</b>', email: 'b@acme.co' }),
    ]);
    const titulos = Array.from(el.querySelectorAll('[data-testid="user-title"]'));
    const textos = titulos.map((t) => t.textContent?.trim());
    expect(textos).toContain("O'Brien-Díaz");
    expect(textos).toContain('<b>Ana</b>');
    expect(titulos.every((t) => t.querySelector('b') === null)).toBe(true);
  });

  it('un nombre de 100 caracteres no desborda: truncate y min-w-0', async () => {
    const el = await render([user({ name: 'a'.repeat(100) })]);
    expect(titulo(el).className).toContain('truncate');
    expect((titulo(el).parentElement?.parentElement as HTMLElement).className).toContain('min-w-0');
  });
});
