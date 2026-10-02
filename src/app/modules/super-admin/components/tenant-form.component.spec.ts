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
