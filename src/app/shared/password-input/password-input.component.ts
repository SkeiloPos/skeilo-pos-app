import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { IconMiComponent } from '../icon-mi/icon-mi.component';

/**
 * Reusable password field with a show/hide toggle. Implements
 * `ControlValueAccessor` so it drops into Reactive Forms via `formControlName`.
 *
 * Label and error messages stay in the parent form (they vary per case); this
 * component owns only the input + eye toggle. The neutral/invalid border color
 * is managed here, so `sizeClass` should carry padding/rounding/text only (no
 * `border-*`).
 */
@Component({
  selector: 'app-password-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconMiComponent],
  template: `
    <div class="relative">
      <input
        #field
        [id]="id"
        [type]="show() ? 'text' : 'password'"
        [value]="value()"
        [placeholder]="placeholder"
        [attr.autocomplete]="autocomplete"
        [disabled]="disabled()"
        (input)="onInput($event)"
        (blur)="onTouched()"
        class="w-full border focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-gray-400 text-gray-900 pr-10 disabled:bg-gray-50 disabled:text-gray-400"
        [class]="sizeClass"
        [class.border-red-400]="invalid"
        [class.border-gray-200]="!invalid"
      />
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-label]="show() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        [attr.aria-pressed]="show()"
        class="auth-tap-target absolute right-1 inset-y-0 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span class="w-5 h-5 block">
          <app-mi-icon [name]="show() ? 'eye-off' : 'eye'" [size]="20" />
        </span>
      </button>
    </div>
  `,
})
export class PasswordInputComponent implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() id?: string;
  @Input() autocomplete = 'current-password';
  @Input() invalid = false;
  @Input() sizeClass = 'px-3 py-2.5 rounded-xl text-sm';

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly show = signal(false);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    // Wire the CVA without an NG_VALUE_ACCESSOR provider (avoids the circular
    // dependency between the control and its value accessor).
    const ngControl = inject(NgControl, { self: true, optional: true });
    if (ngControl) ngControl.valueAccessor = this;
  }

  toggle(): void {
    this.show.update((v) => !v);
  }

  /**
   * Move focus to the real `<input>`, which lives inside this component. Parents
   * need it after a failed submit (spec 095, FR-013) and cannot reach the element
   * themselves without hardcoding an `id` that a rename would silently break.
   */
  focus(): void {
    this.field().nativeElement.focus();
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }

  // ── ControlValueAccessor ───────────────────────────────────────────────────
  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
