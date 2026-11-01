import { TestBed } from '@angular/core/testing';
import { PlanFormComponent } from './plan-form.component';
import { PlanService } from '../services/plan.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { Plan } from '../interfaces/plan.interface';

const TEXTO_CONFIRMACION = 'Los negocios con este plan perderán Inventario, Proveedores y Compras de inmediato';

function makePlan(partial: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    name: 'Pro',
    description: null,
    mesas_limit: 5,
    cajas_limit: 1,
    usuarios_limit: 3,
    productos_limit: null,
    metodos_pago_activos_limit: 4,
    inventario_access: true,
    promociones_access: true,
    precio_mensual: null,
    precio_anual: null,
    created_at: '2026-10-01T00:00:00+00:00',
    ...partial,
  };
}

describe('PlanFormComponent — un solo módulo «Inventario» (spec 141, FR-019, SC-007)', () => {
  let create: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let ask: ReturnType<typeof vi.fn>;

  function crear(plan: Plan | null = null, confirma = true) {
    create = vi.fn(async () => true);
    update = vi.fn(async () => true);
    ask = vi.fn(async () => confirma);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlanFormComponent],
      providers: [
        {
          provide: PlanService,
          useValue: { create, update, error: () => null, isSubmitting: () => false },
        },
        { provide: ConfirmService, useValue: { ask } },
      ],
    });
    const fixture = TestBed.createComponent(PlanFormComponent);
    fixture.componentInstance.plan = plan;
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.detectChanges();
    return { fixture, saved };
  }

  function desmarcar(fixture: ReturnType<typeof crear>['fixture'], control: 'inventario_access' | 'promociones_access') {
    fixture.componentInstance.form.controls[control].setValue(false);
  }

  // ── US1.6: un solo interruptor ────────────────────────────────────────────

  it('ofrece un solo interruptor «Inventario» con la ayuda «Incluye Proveedores y Compras» y ningún «Compras»', () => {
    const { fixture } = crear();
    const seccion = (fixture.nativeElement as HTMLElement).textContent ?? '';

    const etiquetas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('label'))
      .map((l) => l.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((t) => /Inventario|Compras|Promociones/.test(t));

    expect(etiquetas.some((t) => t.startsWith('Inventario'))).toBe(true);
    expect(etiquetas.some((t) => t.startsWith('Promociones'))).toBe(true);
    expect(seccion).toContain('Incluye Proveedores y Compras');
    expect(etiquetas.some((t) => t.startsWith('Compras'))).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('[formControlName="compras_access"]')).toBeNull();
  });

  it('el formulario no tiene un control `compras_access`', () => {
    const { fixture } = crear();

    expect(Object.keys(fixture.componentInstance.form.controls)).not.toContain('compras_access');
  });

  // ── US1.8: confirmación al quitar Inventario de un plan existente ─────────

  it('editar un plan con Inventario y desmarcarlo pide confirmación con el texto fijo y tono de peligro', async () => {
    const { fixture } = crear(makePlan({ inventario_access: true }));
    desmarcar(fixture, 'inventario_access');

    await fixture.componentInstance.onSubmit();

    expect(ask).toHaveBeenCalledOnce();
    const opciones = ask.mock.calls[0][0];
    expect(opciones.message).toBe(TEXTO_CONFIRMACION);
    expect(opciones.tone).toBe('danger');
    expect(typeof opciones.title).toBe('string');
    expect(opciones.title.length).toBeGreaterThan(0);
  });

  it('si el Super Admin cancela, NO se guarda y el formulario queda abierto', async () => {
    const { fixture, saved } = crear(makePlan({ inventario_access: true }), false);
    desmarcar(fixture, 'inventario_access');

    await fixture.componentInstance.onSubmit();

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });

  it('si confirma, se guarda con inventario_access en false', async () => {
    const { fixture, saved } = crear(makePlan({ inventario_access: true }), true);
    desmarcar(fixture, 'inventario_access');

    await fixture.componentInstance.onSubmit();

    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toBe('p1');
    expect(update.mock.calls[0][1].inventario_access).toBe(false);
    expect(saved).toHaveBeenCalledOnce();
  });

  // ── US1.9: sin confirmación en los demás casos ────────────────────────────

  it('editar sin desmarcar Inventario guarda SIN preguntar', async () => {
    const { fixture } = crear(makePlan({ inventario_access: true }));
    fixture.componentInstance.form.controls.name.setValue('Pro renombrado');

    await fixture.componentInstance.onSubmit();

    expect(ask).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('crear un plan nuevo con Inventario desmarcado guarda SIN preguntar', async () => {
    const { fixture } = crear(null);
    fixture.componentInstance.form.controls.name.setValue('Nuevo');
    fixture.componentInstance.form.controls.inventario_access.setValue(false);

    await fixture.componentInstance.onSubmit();

    expect(ask).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });

  it('quitar solo «Promociones» guarda SIN preguntar', async () => {
    const { fixture } = crear(makePlan({ inventario_access: true, promociones_access: true }));
    desmarcar(fixture, 'promociones_access');

    await fixture.componentInstance.onSubmit();

    expect(ask).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][1].promociones_access).toBe(false);
  });

  it('editar un plan que ya NO tenía Inventario no pregunta aunque siga sin él', async () => {
    const { fixture } = crear(makePlan({ inventario_access: false }));

    await fixture.componentInstance.onSubmit();

    expect(ask).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  // ── (d) el payload ya no lleva compras_access ─────────────────────────────

  it('el payload enviado no contiene compras_access', async () => {
    const { fixture } = crear(makePlan({ inventario_access: true }));

    await fixture.componentInstance.onSubmit();

    expect(Object.keys(update.mock.calls[0][1])).not.toContain('compras_access');
  });

  it('el payload de un alta tampoco contiene compras_access', async () => {
    const { fixture } = crear(null);
    fixture.componentInstance.form.controls.name.setValue('Nuevo');

    await fixture.componentInstance.onSubmit();

    expect(Object.keys(create.mock.calls[0][0])).not.toContain('compras_access');
  });
});
