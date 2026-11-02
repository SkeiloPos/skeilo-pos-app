import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveStatusIndicatorComponent } from './live-status-indicator.component';
import { LiveStatusService } from './live-status.service';

describe('LiveStatusIndicatorComponent', () => {
  let liveLost: ReturnType<typeof signal<boolean>>;
  let fixture: ComponentFixture<LiveStatusIndicatorComponent>;

  beforeEach(() => {
    liveLost = signal(false);
    TestBed.configureTestingModule({
      imports: [LiveStatusIndicatorComponent],
      providers: [{ provide: LiveStatusService, useValue: { liveLost } }],
    });
    fixture = TestBed.createComponent(LiveStatusIndicatorComponent);
  });

  it('no muestra nada mientras liveLost() es false', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('muestra el texto fijo con role="status" y aria-live="polite" cuando liveLost() es true', () => {
    liveLost.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('[role="status"]');
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.textContent.trim()).toBe('Sin actualización en vivo');
  });
});
