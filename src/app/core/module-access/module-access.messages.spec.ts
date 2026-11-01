import { HttpErrorResponse } from '@angular/common/http';
import { MODULE_NOT_IN_PLAN_MESSAGE, isModuleNotInPlan } from './module-access.messages';

describe('isModuleNotInPlan (spec 141)', () => {
  it('reconoce el error que entrega el interceptor (cuerpo objeto con el código)', () => {
    const err = new HttpErrorResponse({
      status: 403,
      error: { code: 'MODULE_NOT_IN_PLAN', module: 'inventario', detail: MODULE_NOT_IN_PLAN_MESSAGE },
    });

    expect(isModuleNotInPlan(err)).toBe(true);
  });

  it('no confunde otros 403 (rol, límite, plan vencido) ni otros errores', () => {
    expect(isModuleNotInPlan(new HttpErrorResponse({ status: 403, error: { detail: 'Tu plan venció.' } }))).toBe(false);
    expect(isModuleNotInPlan(new HttpErrorResponse({ status: 500, error: null }))).toBe(false);
    expect(isModuleNotInPlan(new HttpErrorResponse({ status: 403, error: 'Forbidden' }))).toBe(false);
    expect(isModuleNotInPlan(new Error('boom'))).toBe(false);
    expect(isModuleNotInPlan(null)).toBe(false);
    expect(isModuleNotInPlan(undefined)).toBe(false);
  });
});
