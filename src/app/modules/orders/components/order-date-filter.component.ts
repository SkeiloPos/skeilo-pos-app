import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  computed,
  inject,
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
  isSelected: boolean;
  isFuture: boolean;
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
 * Selector de fecha de un solo día para la lista de Órdenes (spec 120, FR-005;
 * research.md §5): botón con la fecha elegida + atajos "Hoy"/"Ayer" + calendario
 * mes a mes, sin permitir fechas futuras.
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
          aria-label="Elegir fecha"
          (click)="$event.stopPropagation()"
          class="absolute right-0 top-12 z-20 w-72 bg-white border border-gray-200 rounded-2xl shadow-lg p-4 flex flex-col gap-3"
        >
          <div class="flex gap-2">
            <button
              type="button"
              (click)="pick(today())"
              class="flex-1 h-9 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >Hoy</button>
            <button
              type="button"
              (click)="pick(yesterday())"
              class="flex-1 h-9 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >Ayer</button>
          </div>

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
                  [attr.aria-pressed]="c.isSelected"
                  (click)="pick(c.iso)"
                  class="h-9 rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  [class.bg-indigo-600]="c.isSelected"
                  [class.text-white]="c.isSelected"
                  [class.font-bold]="c.isSelected || c.isToday"
                  [class.hover:bg-gray-100]="!c.isSelected && !c.isFuture"
                  [class.text-gray-700]="!c.isSelected"
                >{{ c.day }}</button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderDateFilterComponent implements OnChanges {
  private readonly tenantDate = inject(TenantDatePipe);

  /** Fecha elegida, ISO `yyyy-MM-dd`. Vacío se interpreta como "hoy". */
  @Input() value = '';
  @Output() readonly valueChange = new EventEmitter<string>();

  readonly open = signal(false);
  private readonly viewIso = signal(this.today());
  readonly weekDays = DIAS_SEMANA;

  ngOnChanges(): void {
    if (this.value) this.viewIso.set(this.value);
  }

  today(): string {
    return this.tenantDate.transform(new Date(), 'yyyy-MM-dd') ?? toIso(1970, 0, 1);
  }

  yesterday(): string {
    return addDays(this.today(), -1);
  }

  readonly label = computed(() => {
    const value = this.value || this.today();
    if (value === this.today()) return 'Hoy';
    if (value === this.yesterday()) return 'Ayer';
    const { y, m, d } = parseIso(value);
    return `${d} ${MESES[m].slice(0, 3)} ${y}`;
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
    const selected = this.value || this.today();
    const todayIso = this.today();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: Celda[] = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push({ day: null, iso: '', isToday: false, isSelected: false, isFuture: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toIso(y, m, d);
      cells.push({
        day: d,
        iso,
        isToday: iso === todayIso,
        isSelected: iso === selected,
        isFuture: iso > todayIso,
      });
    }
    return cells;
  });

  toggle(event: Event): void {
    event.stopPropagation();
    if (!this.open()) this.viewIso.set(this.value || this.today());
    this.open.set(!this.open());
  }

  @HostListener('document:click')
  close(): void {
    this.open.set(false);
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

  pick(iso: string): void {
    if (iso > this.today()) return;
    this.valueChange.emit(iso);
    this.open.set(false);
  }
}
