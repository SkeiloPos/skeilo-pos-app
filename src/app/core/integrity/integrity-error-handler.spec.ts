import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RELOAD_PAGE } from '../reload-page';
import { IntegrityAwareErrorHandler } from './integrity-error-handler';
import { PageIntegrityService } from './page-integrity.service';

describe('IntegrityAwareErrorHandler (spec 134, FR-011)', () => {
  let handler: IntegrityAwareErrorHandler;
  let integrity: PageIntegrityService;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: RELOAD_PAGE, useValue: () => undefined },
        { provide: ErrorHandler, useClass: IntegrityAwareErrorHandler },
      ],
    });
    handler = TestBed.inject(ErrorHandler) as IntegrityAwareErrorHandler;
    integrity = TestBed.inject(PageIntegrityService);
    // El ErrorHandler por defecto de Angular escribe en `console.error`.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('pasa el error a reportDomError y sigue llamando al console.error por defecto (no lo traga)', () => {
    const reporte = vi.spyOn(integrity, 'reportDomError');
    const err = new Error('algo falló');

    handler.handleError(err);

    expect(reporte).toHaveBeenCalledWith(err);
    expect(consoleError).toHaveBeenCalled();
  });

  it('un NotFoundError de removeChild activa la señal S6 (latched) y se sigue registrando', () => {
    const err = new DOMException("Failed to execute 'removeChild' on 'Node'", 'NotFoundError');

    handler.handleError(err);

    expect(integrity.altered()).toBe(true);
    expect(integrity.reasons()).toContain('dom-error');
    expect(consoleError).toHaveBeenCalled();
  });

  it('un NotFoundError de insertBefore también la activa', () => {
    handler.handleError(new DOMException("Failed to execute 'insertBefore' on 'Node'", 'NotFoundError'));

    expect(integrity.altered()).toBe(true);
  });

  it('TypeError, errores HTTP 401/404/409/500 y Error("network") no activan nada', () => {
    const errores: unknown[] = [
      new TypeError("Cannot read properties of undefined (reading 'removeChild')"),
      new HttpErrorResponse({ status: 401 }),
      new HttpErrorResponse({ status: 404 }),
      new HttpErrorResponse({ status: 409 }),
      new HttpErrorResponse({ status: 500 }),
      new Error('network'),
    ];

    for (const err of errores) handler.handleError(err);

    expect(integrity.altered()).toBe(false);
    expect(integrity.reasons()).toEqual([]);
    expect(consoleError).toHaveBeenCalledTimes(errores.length);
  });

  it('si reportar falla, el error original igual se registra (el aviso nunca esconde errores)', () => {
    vi.spyOn(integrity, 'reportDomError').mockImplementation(() => {
      throw new Error('fallo del reporte');
    });

    expect(() => handler.handleError(new Error('original'))).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
  });
});
