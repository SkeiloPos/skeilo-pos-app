import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Output,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface Celda {
  day: number | null;
  iso: string;
  isToday: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isInRange: boolean;
  isFuture: boolean;
}

export interface DateRange {
  from: string;
  to: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

function addDays(iso: string, delta: number): string {
  const { y, m, d } = parseIso(iso);
  const date = new Date(y, m, d + delta);
  return toIso(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Selector de rango de fechas para la lista de Órdenes (spec 120, FR-005,
 * extendido para permitir un rango en vez de un solo día): botón con la
 * fecha (o el rango) elegido + atajos "Hoy"/"Ayer"/"Últimos 7 días"/"Este
 * mes" + calendario mes a mes, sin permitir fechas futuras.
 *
 * Selección de rango con dos clics: el primer clic fija el inicio (el
 * diálogo permanece abierto, con la pista de "Elige la fecha final"); un
 * segundo clic en un día posterior fija el fin y cierra el diálogo. Un
 * segundo clic en el mismo día selecciona un solo día (`from === to`). Un
 * clic en un día anterior al inicio reinicia la selección desde ese día.
 *
 * El "hoy" se calcula en la zona horaria del tenant (igual que el resto del
 * panel, `TenantDatePipe`/spec 030), no en la del navegador, y luego toda la
 * aritmética de calendario (mes siguiente/anterior, "ayer") es aritmética de
 * fecha pura sobre ese valor — no vuelve a tocar zona horaria.
 */
@Component({
  selector: 'app-order-date-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconMiComponent],
  providers: [TenantDatePipe],
  template: `
    <div class="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        (click)="toggle($event)"
        class="w-full justify-center flex items-center gap-2 h-11 px-3.5 border border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <app-mi-icon name="calendar_month" [size]="16" />
        {{ label() }}
        <app-mi-icon name="expand_more" [size]="14" />
      </button>

      @if (open()) {
        <div
          role="dialog"
          aria-label="Elegir rango de fechas"
          (click)="$event.stopPropagation()"
          class="absolute right-0 top-12 z-20 w-72 bg-white border border-gray-200 rounded-2xl shadow-lg p-4 flex flex-col gap-3"
        >
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              (click)="pickQuick(today(), today())"
              class="h-9 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >Hoy</button>
            <button
              type="button"
              (click)="pickQuick(yesterday(), yesterday())"
              class="h-9 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >Ayer</button>
            <button
              type="button"
              (click)="pickQuick(addDays(today(), -6), today())"
              class="h-9 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >Últimos 7 días</button>
            <button
              type="button"
              (click)="pickQuick(startOfMonth(today()), today())"
              class="h-9 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >Este mes</button>
          </div>

          @if (pendingFrom()) {
            <p class="text-xs text-indigo-600 font-medium text-center">
              Desde {{ shortLabel(pendingFrom()!) }} — elige la fecha final (o el mismo día)
            </p>
          }

          <div class="flex items-center justify-between">
            <button
              type="button"
              aria-label="Mes anterior"
              (click)="prevMonth()"
              class="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-600"
            ><app-mi-icon name="chevron_left" [size]="18" /></button>
            <b class="text-sm text-gray-900">{{ monthLabel() }}</b>
            <button
              type="button"
              aria-label="Mes siguiente"
              [disabled]="nextMonthDisabled()"
              (click)="nextMonth()"
              class="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
            ><app-mi-icon name="chevron_right" [size]="18" /></button>
          </div>

          <div class="grid grid-cols-7 gap-1 text-center">
            @for (w of weekDays; track w) {
              <div class="text-[11px] font-semibold text-gray-400 py-1">{{ w }}</div>
            }
            @for (c of cells(); track $index) {
              @if (c.day === null) {
                <div></div>
              } @else {
                <button
                  type="button"
                  [disabled]="c.isFuture"
                  [attr.aria-pressed]="c.isRangeStart || c.isRangeEnd"
                  (click)="pick(c.iso)"
                  class="h-9 rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  [class.bg-indigo-600]="c.isRangeStart || c.isRangeEnd"
                  [class.text-white]="c.isRangeStart || c.isRangeEnd"
                  [class.bg-indigo-50]="c.isInRange && !c.isRangeStart && !c.isRangeEnd"
                  [class.font-bold]="c.isRangeStart || c.isRangeEnd || c.isToday"
                  [class.hover:bg-gray-100]="!c.isRangeStart && !c.isRangeEnd && !c.isInRange && !c.isFuture"
                  [class.text-gray-700]="!c.isRangeStart && !c.isRangeEnd"
                >{{ c.day }}</button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderDateFilterComponent {
  private readonly tenantDate = inject(TenantDatePipe);

  /** Rango elegido, ISO `yyyy-MM-dd`. Vacío se interpreta como "hoy". Signals
   *  de entrada (no `@Input()` corriente): `label`/`cells` son `computed()` y
   *  solo se reevalúan cuando leen un cambio de una signal real — con un
   *  `@Input()` normal se quedaban congelados en su primer valor (spec 121,
   *  research.md §2). */
  readonly from = input('');
  readonly to = input('');
  @Output() readonly rangeChange = new EventEmitter<DateRange>();

  readonly open = signal(false);
  readonly pendingFrom = signal<string | null>(null);
  private readonly viewIso = signal(this.today());
  readonly weekDays = DIAS_SEMANA;

  constructor() {
    effect(() => {
      const value = this.from();
      if (value) this.viewIso.set(value);
    });
  }

  today(): string {
    return this.tenantDate.transform(new Date(), 'yyyy-MM-dd') ?? toIso(1970, 0, 1);
  }

  yesterday(): string {
    return addDays(this.today(), -1);
  }

  addDays = addDays;

  startOfMonth(iso: string): string {
    const { y, m } = parseIso(iso);
    return toIso(y, m, 1);
  }

  shortLabel(iso: string): string {
    const { y, m, d } = parseIso(iso);
    return `${d} ${MESES[m].slice(0, 3)} ${y}`;
  }

  readonly label = computed(() => {
    const from = this.from() || this.today();
    const to = this.to() || from;
    if (from === to) {
      if (from === this.today()) return 'Hoy';
      if (from === this.yesterday()) return 'Ayer';
      return this.shortLabel(from);
    }
    return `${this.shortLabel(from)} – ${this.shortLabel(to)}`;
  });

  readonly monthLabel = computed(() => {
    const { y, m } = parseIso(this.viewIso());
    return `${MESES[m][0].toUpperCase()}${MESES[m].slice(1)} ${y}`;
  });

  readonly nextMonthDisabled = computed(() => {
    const { y: vy, m: vm } = parseIso(this.viewIso());
    const { y: ty, m: tm } = parseIso(this.today());
    return vy > ty || (vy === ty && vm >= tm);
  });

  readonly cells = computed<Celda[]>(() => {
    const { y, m } = parseIso(this.viewIso());
    const from = this.pendingFrom() ?? this.from() ?? this.today();
    const to = this.pendingFrom() ? this.pendingFrom()! : (this.to() || from);
    const [rangeStart, rangeEnd] = from <= to ? [from, to] : [to, from];
    const todayIso = this.today();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: Celda[] = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push({ day: null, iso: '', isToday: false, isRangeStart: false, isRangeEnd: false, isInRange: false, isFuture: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toIso(y, m, d);
      cells.push({
        day: d,
        iso,
        isToday: iso === todayIso,
        isRangeStart: iso === rangeStart,
        isRangeEnd: iso === rangeEnd,
        isInRange: iso >= rangeStart && iso <= rangeEnd,
        isFuture: iso > todayIso,
      });
    }
    return cells;
  });

  toggle(event: Event): void {
    event.stopPropagation();
    if (!this.open()) {
      this.viewIso.set(this.from() || this.today());
      this.pendingFrom.set(null);
    }
    this.open.set(!this.open());
  }

  @HostListener('document:click')
  close(): void {
    this.open.set(false);
    this.pendingFrom.set(null);
  }

  prevMonth(): void {
    const { y, m } = parseIso(this.viewIso());
    this.viewIso.set(toIso(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1));
  }

  nextMonth(): void {
    if (this.nextMonthDisabled()) return;
    const { y, m } = parseIso(this.viewIso());
    this.viewIso.set(toIso(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1));
  }

  /** Atajos (Hoy/Ayer/Últimos 7 días/Este mes): emiten el rango completo de una vez. */
  pickQuick(from: string, to: string): void {
    this.pendingFrom.set(null);
    this.rangeChange.emit({ from, to });
    this.open.set(false);
  }

  /** Clic en una celda del calendario: primer clic fija el inicio y deja el
   *  diálogo abierto; el segundo clic cierra el rango (o selecciona un solo
   *  día si se repite la misma celda). */
  pick(iso: string): void {
    if (iso > this.today()) return;

    const pending = this.pendingFrom();
    if (!pending) {
      this.pendingFrom.set(iso);
      return;
    }

    const [from, to] = pending <= iso ? [pending, iso] : [iso, pending];
    this.pendingFrom.set(null);
    this.rangeChange.emit({ from, to });
    this.open.set(false);
  }
}
