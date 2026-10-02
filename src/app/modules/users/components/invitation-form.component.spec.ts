import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { InvitationFormComponent } from './invitation-form.component';
import { InvitationsService } from '../services/invitations.service';
import { FULL_NAME_MESSAGES } from '../../../shared/validators/full-name.validator';

const URL = `${environment.apiBaseUrl}/invitations`;

describe('InvitationFormComponent — nombre completo (spec 091, A-100)', () => {
  let http: HttpTestingController;

  function crear() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [InvitationFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(InvitationFormComponent);
    fixture.detectChanges();
    return fixture;
  }

  function llenar(fixture: ReturnType<typeof crear>, name: string) {
    fixture.componentInstance.form.setValue({ name, email: 'maria@acme.com', role: 'CASHIER' });
  }

  function mensajes(fixture: ReturnType<typeof crear>): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  // ── US3 ──────────────────────────────────────────────────────────────────

  it('el campo "Nombre completo" aparece primero, antes de correo y rol', () => {
    const el = crear().nativeElement as HTMLElement;
    const controles = Array.from(el.querySelectorAll('[formControlName]')).map((c) =>
      c.getAttribute('formControlName'),
    );
    expect(controles).toEqual(['name', 'email', 'role']);
    expect(el.textContent).toContain('Nombre completo');
  });

  it('con nombre válido envía `name` ya recortado en el payload', async () => {
    const fixture = crear();
    llenar(fixture, '  María Pérez  ');

    const done = fixture.componentInstance.submit();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'María Pérez',
      email: 'maria@acme.com',
      role: 'CASHIER',
    });
    req.flush({ id: '1', name: 'María Pérez', email: 'maria@acme.com', role_name: 'CASHIER', sent_at: '' });
    await done;
  });

  it('el servicio expone `name` en PendingInvitation (puede ser null)', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(InvitationsService);
    const done = service.loadPendingInvitations(1, 20);
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url === URL)
      .flush({
        items: [
          { id: '1', name: 'María Pérez', email: 'm@x.co', role_name: 'CASHIER', sent_at: '' },
          { id: '2', name: null, email: 'v@x.co', role_name: 'ADMIN', sent_at: '' },
        ],
        total: 2, page: 1, size: 20, pages: 1,
      });
    await done;
    expect(service.pendingInvitations().map((i) => i.name)).toEqual(['María Pérez', null]);
  });

  // ── US4 ──────────────────────────────────────────────────────────────────

  const casos: [string, string][] = [
    ['', FULL_NAME_MESSAGES.required],
    ['     ', FULL_NAME_MESSAGES.required],
    ['A', FULL_NAME_MESSAGES.length],
    ['a'.repeat(101), FULL_NAME_MESSAGES.length],
    ['<script>alert(1)</script>', FULL_NAME_MESSAGES.format],
    ['Ana3', FULL_NAME_MESSAGES.format],
    ['Ana@', FULL_NAME_MESSAGES.format],
  ];

  for (const [valor, mensaje] of casos) {
    it(`bloquea el envío y muestra "${mensaje}" para ${JSON.stringify(valor.slice(0, 12))}`, async () => {
      const fixture = crear();
      llenar(fixture, valor);

      await fixture.componentInstance.submit();

      http.expectNone(URL);
      expect(mensajes(fixture)).toContain(mensaje);
    });
  }

  it('un 422 del servidor con `detail` en arreglo se muestra sin el prefijo "Value error, "', async () => {
    const fixture = crear();
    llenar(fixture, 'María Pérez');

    const done = fixture.componentInstance.submit();
    http.expectOne(URL).flush(
      { detail: [{ loc: ['body', 'name'], msg: `Value error, ${FULL_NAME_MESSAGES.required}`, type: 'value_error' }] },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await done;

    const service = TestBed.inject(InvitationsService);
    expect(service.error()).toBe(FULL_NAME_MESSAGES.required);
    expect(mensajes(fixture)).toContain(FULL_NAME_MESSAGES.required);
  });

  // ── US5 / FR-023 ─────────────────────────────────────────────────────────

  it('Cancelar deja los campos vacíos y limpia el error del servicio', () => {
    const fixture = crear();
    const service = TestBed.inject(InvitationsService);
    llenar(fixture, 'María Pérez');
    service.error.set('Ya existe una invitación pendiente para ese correo');
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);

    fixture.componentInstance.onCancel();

    expect(fixture.componentInstance.form.getRawValue()).toEqual({ name: '', email: '', role: '' });
    expect(service.error()).toBeNull();
    expect(cancelled).toBe(1);
  });

  it('tras un envío exitoso el formulario queda vacío', async () => {
    const fixture = crear();
    llenar(fixture, 'María Pérez');

    const done = fixture.componentInstance.submit();
    http.expectOne(URL).flush({});
    await done;

    expect(fixture.componentInstance.form.getRawValue()).toEqual({ name: '', email: '', role: '' });
  });

  it('al iniciar el componente descarta un error que sobrevivió en el servicio', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [InvitationFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(InvitationsService).error.set('error viejo');

    const fixture = TestBed.createComponent(InvitationFormComponent);
    fixture.detectChanges();

    expect(TestBed.inject(InvitationsService).error()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('error viejo');
  });
});
