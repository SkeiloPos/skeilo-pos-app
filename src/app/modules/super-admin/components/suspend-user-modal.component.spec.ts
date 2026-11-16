import { TestBed } from '@angular/core/testing';
import { SuspendUserModalComponent } from './suspend-user-modal.component';

describe('SuspendUserModalComponent (spec 159, User Story 4, FR-019)', () => {
  function crear() {
    TestBed.configureTestingModule({ imports: [SuspendUserModalComponent] });
    const fixture = TestBed.createComponent(SuspendUserModalComponent);
    fixture.detectChanges();
    return fixture;
  }

  function click(fixture: ReturnType<typeof crear>, testid: string) {
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!
      .click();
  }

  it('bloquea la confirmación si el motivo está vacío', () => {
    const fixture = crear();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);

    click(fixture, 'confirm-suspend');
    fixture.detectChanges();

    expect(confirmed).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="suspend-reason-error"]'),
    ).not.toBeNull();
  });

  it('bloquea con un motivo solo de espacios', () => {
    const fixture = crear();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.reason = '   ';

    click(fixture, 'confirm-suspend');

    expect(confirmed).not.toHaveBeenCalled();
  });

  it('emite el motivo recortado y la casilla de revocar sesiones', () => {
    const fixture = crear();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.reason = '  Fraude reportado  ';
    fixture.componentInstance.revokeSessions = true;

    click(fixture, 'confirm-suspend');

    expect(confirmed).toHaveBeenCalledWith({ reason: 'Fraude reportado', revoke_sessions: true });
  });

  it('cancelar emite `cancelled`', () => {
    const fixture = crear();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    click(fixture, 'confirm-suspend'); // no-op: motivo vacío
    fixture.componentInstance.onCancel();

    expect(cancelled).toHaveBeenCalled();
  });
});
