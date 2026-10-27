import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TenantFormComponent } from './tenant-form.component';
import { TenantService } from '../services/tenant.service';
import { PlanService } from '../services/plan.service';

describe('TenantFormComponent — host reservado (spec 091, A-101)', () => {
  let createTenant: ReturnType<typeof vi.fn>;

  function crear() {
    createTenant = vi.fn(async () => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TenantFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TenantService,
          useValue: { createTenant, error: () => null, isSubmitting: () => false },
        },
        { provide: PlanService, useValue: { load: () => undefined, plans: () => [] } },
      ],
    });
    const fixture = TestBed.createComponent(TenantFormComponent);
    fixture.detectChanges();
    return fixture;
  }

  function llenarValido(fixture: ReturnType<typeof crear>, host: string) {
    fixture.componentInstance.form.patchValue({
      tenant_name: 'Mi Negocio',
      schema_name: 'minegocio',
      host,
      name: 'Dueño Negocio',
      email: 'dueno@negocio.co',
      plan_id: 'plan-1',
      timezone: 'America/Bogota', // obligatoria y sin valor inicial desde la spec 138
    });
  }

  it('rechaza admin, Docs y " api " con el mensaje de palabra reservada', () => {
    const fixture = crear();
    const host = fixture.componentInstance.form.controls.host;
    for (const [value, shown] of [
      ['admin', 'admin'],
      ['Docs', 'docs'],
      [' api ', 'api'],
    ]) {
      host.setValue(value);
      expect(host.invalid).toBe(true);
      expect(host.errors?.['reserved'].message).toBe(
        `«${shown}» es una palabra reservada y no puede usarse como subdominio`,
      );
    }
  });

  it('muestra el mensaje en pantalla y bloquea el envío mientras sea inválido', async () => {
    const fixture = crear();
    llenarValido(fixture, 'admin');
    fixture.componentInstance.form.controls.host.markAsTouched();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '«admin» es una palabra reservada y no puede usarse como subdominio',
    );

    await fixture.componentInstance.onSubmit();
    expect(createTenant).not.toHaveBeenCalled();
  });

  it('acepta admin2 y envía el valor recortado', async () => {
    const fixture = crear();
    llenarValido(fixture, ' admin2 ');
    expect(fixture.componentInstance.form.controls.host.valid).toBe(true);

    await fixture.componentInstance.onSubmit();
    expect(createTenant).toHaveBeenCalledOnce();
    expect(createTenant.mock.calls[0][0].host).toBe('admin2');
  });

  it('la sugerencia automática desde el nombre "Admin" también se marca inválida', () => {
    const fixture = crear();
    const c = fixture.componentInstance;
    c.form.controls.tenant_name.setValue('Admin');
    c.onTenantNameInput();

    expect(c.form.controls.host.value).toBe('admin');
    expect(c.form.controls.host.invalid).toBe(true);
    expect(c.form.controls.host.touched).toBe(true);
  });
});

// spec 138 (FR-010): la zona horaria se elige de la lista curada, es obligatoria y NO tiene valor inicial.
describe('TenantFormComponent — zona horaria (spec 138, FR-010)', () => {
  let createTenant: ReturnType<typeof vi.fn>;

  function crear() {
    createTenant = vi.fn(async () => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TenantFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: TenantService,
          useValue: { createTenant, error: () => null, isSubmitting: () => false },
        },
        { provide: PlanService, useValue: { load: () => undefined, plans: () => [] } },
      ],
    });
    const fixture = TestBed.createComponent(TenantFormComponent);
    fixture.detectChanges();
    return fixture;
  }

  function llenarSinZona(fixture: ReturnType<typeof crear>) {
    fixture.componentInstance.form.patchValue({
      tenant_name: 'Mi Negocio',
      schema_name: 'minegocio',
      host: 'minegocio',
      name: 'Dueño Negocio',
      email: 'dueno@negocio.co',
      plan_id: 'plan-1',
    });
  }

  const select = (fixture: ReturnType<typeof crear>) =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="timezone"]') as HTMLSelectElement;

  it('nace vacía: sin zona preseleccionada y el formulario es inválido', () => {
    const fixture = crear();
    expect(fixture.componentInstance.form.controls.timezone.value).toBe('');
    expect(fixture.componentInstance.form.invalid).toBe(true);
    expect(select(fixture).value).toBe('');
  });

  it('el selector ofrece «Selecciona una zona» (deshabilitada) y las siete zonas en español', () => {
    const fixture = crear();
    const opciones = Array.from(select(fixture).options).map((o) => [o.value, o.textContent?.trim(), o.disabled]);
    expect(opciones).toEqual([
      ['', 'Selecciona una zona', true],
      ['America/Bogota', 'Bogotá (Colombia)', false],
      ['America/Mexico_City', 'Ciudad de México', false],
      ['America/Lima', 'Lima (Perú)', false],
      ['America/Santiago', 'Santiago (Chile)', false],
      ['America/Argentina/Buenos_Aires', 'Buenos Aires (Argentina)', false],
      ['Europe/Madrid', 'Madrid (España)', false],
      ['Asia/Tokyo', 'Tokio (Japón)', false],
    ]);
  });

  it('«Guardar» no avanza sin elegir una zona y muestra el aviso', async () => {
    const fixture = crear();
    llenarSinZona(fixture);

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(createTenant).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Debes elegir una zona horaria');
  });

  it('elegida «Ciudad de México», createTenant recibe timezone: America/Mexico_City', async () => {
    const fixture = crear();
    llenarSinZona(fixture);
    const el = select(fixture);
    el.value = 'America/Mexico_City';
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();

    expect(createTenant).toHaveBeenCalledOnce();
    expect(createTenant.mock.calls[0][0].timezone).toBe('America/Mexico_City');
  });

  it('elegir una zona hace válido el formulario completo', () => {
    const fixture = crear();
    llenarSinZona(fixture);
    expect(fixture.componentInstance.form.valid).toBe(false);
    fixture.componentInstance.form.controls.timezone.setValue('Asia/Tokyo');
    expect(fixture.componentInstance.form.valid).toBe(true);
  });
});

