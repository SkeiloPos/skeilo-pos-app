import { TestBed } from '@angular/core/testing';
import { ConfirmSensitiveActionModalComponent } from './confirm-sensitive-action-modal.component';

describe('ConfirmSensitiveActionModalComponent (spec 159, User Story 5, FR-025)', () => {
  function crear(userEmail = 'ana@example.invalid') {
    TestBed.configureTestingModule({ imports: [ConfirmSensitiveActionModalComponent] });
    const fixture = TestBed.createComponent(ConfirmSensitiveActionModalComponent);
    fixture.componentInstance.userEmail = userEmail;
    fixture.detectChanges();
    return fixture;
  }

  function click(fixture: ReturnType<typeof crear>, testid: string) {
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!
      .click();
  }

  it('bloquea la confirmación si el correo escrito no coincide', () => {
    const fixture = crear('ana@example.invalid');
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.typedEmail = 'otro@example.invalid';

    click(fixture, 'confirm-sensitive-action');
    fixture.detectChanges();

    expect(confirmed).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="confirm-email-error"]'),
    ).not.toBeNull();
  });

  it('bloquea si el campo está vacío', () => {
    const fixture = crear('ana@example.invalid');
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);

    click(fixture, 'confirm-sensitive-action');

    expect(confirmed).not.toHaveBeenCalled();
  });

  it('emite `confirmed` cuando el correo coincide exactamente', () => {
    const fixture = crear('ana@example.invalid');
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.typedEmail = 'ana@example.invalid';

    click(fixture, 'confirm-sensitive-action');

    expect(confirmed).toHaveBeenCalled();
  });

  it('es sensible a mayúsculas (FR-025: coincidencia exacta)', () => {
    const fixture = crear('ana@example.invalid');
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.typedEmail = 'ANA@example.invalid';

    click(fixture, 'confirm-sensitive-action');

    expect(confirmed).not.toHaveBeenCalled();
  });

  it('cancelar emite `cancelled`', () => {
    const fixture = crear();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    fixture.componentInstance.onCancel();

    expect(cancelled).toHaveBeenCalled();
  });
});
