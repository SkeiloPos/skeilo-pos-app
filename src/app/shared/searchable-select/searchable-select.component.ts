import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { normalizeText } from '../normalize-text';
import { IconMiComponent } from '../icon-mi/icon-mi.component';

export interface SearchableSelectOption {
  id: string;
  label: string;
  /** Visible en el listado pero no seleccionable (spec 053: mesas ocupadas). */
  disabled?: boolean;
}

/**
 * Select con buscador. Implementa `ControlValueAccessor` (igual que
 * `PasswordInputComponent`) para poder usarse como reemplazo directo de un
 * `<select>` vía `[ngModel]`/`(ngModelChange)`. `options` es un `@Input`
 * plano (no signal), por lo que el filtrado se hace en métodos leídos desde
 * el template en cada ciclo de `OnPush`, no en `computed()` (que sólo
 * trackea signals y no vería cambios del input).
 */
@Component({
  selector: 'app-searchable-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [IconMiComponent],
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle()"
        [disabled]="disabled()"
        class="w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm text-left bg-white
          focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
        [class.border-gray-200]="true"
      >
        <span class="truncate" [class.text-gray-400]="!value()">{{ selectedLabel() || placeholder }}</span>
        <app-mi-icon name="expand_more" [size]="16" class="text-gray-400 shrink-0" />
      </button>

      @if (open()) {
        <div class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <input #filterInput [value]="query()" (input)="onQueryInput($any($event.target).value)"
            (keydown)="onKeydown($event)" placeholder="Buscar…"
            class="w-full px-3 py-2 text-sm border-b border-gray-100 focus:outline-none" />
          <ul class="max-h-48 overflow-y-auto py-1">
            @if (loading()) {
              <li class="px-3 py-2 text-sm text-gray-400">Buscando…</li>
            } @else if (error()) {
              <li class="px-3 py-2 text-sm text-red-500 flex items-center justify-between gap-2">
                <span class="truncate">{{ error() }}</span>
                <button type="button" (click)="retry()" class="text-indigo-600 underline shrink-0">
                  Reintentar
                </button>
              </li>
            } @else {
              @for (o of filteredOptions(); track o.id; let i = $index) {
                <li (click)="selectOption(o)" (mouseenter)="highlightedIndex.set(i)"
                  class="px-3 py-1.5 text-sm"
                  [class]="o.disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : i === highlightedIndex() ? 'cursor-pointer bg-indigo-50 text-indigo-700' : 'cursor-pointer hover:bg-gray-50'">
                  {{ o.label }}
                </li>
              } @empty {
                <li class="px-3 py-2 text-sm text-gray-400">{{ emptyMessage() }}</li>
              }
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class SearchableSelectComponent implements ControlValueAccessor {
  @Input() options: SearchableSelectOption[] = [];
  @Input() placeholder = 'Seleccionar…';
  @Input() id?: string;
  /**
   * Modo remoto opt-in (spec 098): si se provee, un texto no vacío se busca en el
   * servidor (con debounce de 300ms) en vez de filtrarse sobre `options` — así
   * `filteredOptions()` no se queda limitado a lo que el consumidor ya cargó de
   * antemano. Ausente: comportamiento idéntico al de siempre (filtrado local).
   */
  @Input() search?: (query: string) => Promise<SearchableSelectOption[]>;

  /**
   * Emite la opción completa (spec 105) en el momento en que se elige, de `options` o de
   * un resultado de `search` — junto con, no en reemplazo de, el `onChange(opt.id)` del
   * `ControlValueAccessor`. Permite a un consumidor (p. ej. el formulario de producto)
   * fijar de inmediato el nombre de un valor recién elegido por búsqueda, sin depender de
   * un catálogo precargado para resolverlo (research.md, Decisión D1).
   */
  @Output() readonly optionPicked = new EventEmitter<SearchableSelectOption>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly query = signal('');
  readonly highlightedIndex = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly remoteResults = signal<SearchableSelectOption[]>([]);
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchSeq = 0;

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    const ngControl = inject(NgControl, { self: true, optional: true });
    if (ngControl) ngControl.valueAccessor = this;
  }

  selectedLabel(): string {
    return this.options.find((o) => o.id === this.value())?.label ?? '';
  }

  /**
   * Filtra con `normalizeText`, que además de minúsculas quita los acentos:
   * antes se comparaba con `toLowerCase()` y escribir "cafe" no encontraba
   * "Café" ni "limon" a "Limón" — media despensa lleva tilde y nadie la teclea.
   *
   * Con `search` provisto y texto no vacío (spec 098), el resultado viene del
   * servidor (`remoteResults`, actualizado por `onQueryInput()`/`retry()`) en vez
   * de filtrarse sobre `options` — que de todas formas sigue acotado (p. ej. a
   * 100 insumos) y es exactamente lo que no alcanza a cubrir una búsqueda remota.
   */
  filteredOptions(): SearchableSelectOption[] {
    const q = normalizeText(this.query());
    if (!q) return this.options;
    if (this.search) return this.remoteResults();
    return this.options.filter((o) => normalizeText(o.label).includes(q));
  }

  /**
   * Mensaje del listado vacío (spec 105, FR-006): con `search` provisto y sin texto
   * escrito, invita a buscar en vez del "Sin resultados" genérico — ese mensaje seguía
   * apareciendo incluso cuando `options` ya no trae ningún valor por defecto (sin
   * precarga), dando a entender que no hay nada que buscar. Con texto escrito y cero
   * coincidencias remotas, o en modo local (sin `search`), el texto no cambia.
   */
  emptyMessage(): string {
    if (this.search && !this.query().trim()) return 'Escribe para buscar…';
    return 'Sin resultados';
  }

  toggle(): void {
    if (this.disabled()) return;
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.query.set('');
    this.highlightedIndex.set(0);
    this.open.set(true);
    this.onTouched();
    setTimeout(() => this.filterInput()?.nativeElement.focus());
  }

  onQueryInput(v: string): void {
    this.query.set(v);
    this.highlightedIndex.set(0);
    if (!this.search) return;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const q = v.trim();
    if (!q) {
      // Texto vacío: vuelve al estado inicial (muestra `options`, sin pedir nada).
      this.remoteResults.set([]);
      this.loading.set(false);
      this.error.set(null);
      this.searchSeq++; // invalida cualquier búsqueda en vuelo
      return;
    }
    this.debounceTimer = setTimeout(() => this.runRemoteSearch(q), 300);
  }

  /** Reintenta la última búsqueda con el texto actual (botón "Reintentar" en error). */
  retry(): void {
    const q = this.query().trim();
    if (this.search && q) this.runRemoteSearch(q);
  }

  private runRemoteSearch(q: string): void {
    const seq = ++this.searchSeq;
    this.loading.set(true);
    this.error.set(null);
    this.search!(q).then(
      (results) => {
        if (seq !== this.searchSeq) return; // respuesta de una búsqueda ya superada
        this.remoteResults.set(results);
        this.loading.set(false);
      },
      (err: unknown) => {
        if (seq !== this.searchSeq) return;
        this.loading.set(false);
        this.error.set(err instanceof Error ? err.message : 'No se pudo buscar insumos.');
      },
    );
  }

  selectOption(opt: SearchableSelectOption): void {
    if (opt.disabled) return;
    this.value.set(opt.id);
    this.onChange(opt.id);
    this.optionPicked.emit(opt);
    this.open.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    const options = this.filteredOptions();
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.open.set(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex.update((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const opt = options[this.highlightedIndex()];
        if (opt) this.selectOption(opt);
        break;
      }
    }
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (this.open() && !this.elementRef.nativeElement.contains(target as Node | null)) {
      this.open.set(false);
    }
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
