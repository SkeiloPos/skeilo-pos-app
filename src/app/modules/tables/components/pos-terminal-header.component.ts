import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { VisibleInterval, startVisibleInterval } from '../../../core/realtime/visible-interval';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Cabecera de terminal compartida entre `table-sessions.component.ts` y
 * `manual-order-page.component.ts` (rediseño de `create-order/code.html`):
 * turno, reloj/fecha, estado de conexión, turno de caja y bloqueo de
 * terminal. Sin `@Input`/`@Output` -- resuelve `PosTerminalStore` por DI
 * jerárquica, ya que ambas páginas host la proveen (`providers:
 * [PosTerminalStore]`), así que este componente, declarado en su template,
 * recibe la misma instancia sin que nadie se la pase explícitamente.
 */
@Component({
  selector: 'app-pos-terminal-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconMiComponent],
  template: `
    <header class="h-14 bg-white border-b border-gray-200 px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <div class="flex flex-col min-w-0">
          <span class="text-[11px] font-bold uppercase tracking-wider text-gray-900 truncate">Terminal de mesas</span>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="w-2 h-2 rounded-[6px] shrink-0" [class]="connectionDotClass()"></span>
            <span class="text-[11px] font-semibold text-gray-600 whitespace-nowrap">{{ connectionLabel() }}</span>
          </div>
        </div>
        <div class="hidden sm:block h-6 w-px bg-gray-200 mx-1"></div>
        <div class="hidden sm:flex items-center gap-2 text-gray-600">
          <app-mi-icon name="group" [size]="18" class="text-gray-500 shrink-0" />
          <span class="text-[12px] font-medium text-gray-600 whitespace-nowrap">{{ shiftLabel() }}</span>
        </div>
      </div>

      <div class="hidden md:flex items-center gap-2 px-3 py-1 bg-gray-50 border border-gray-200 rounded-[6px] shrink-0">
        <span class="text-[12px] font-semibold text-gray-900 tabular-nums tracking-[-0.01em]">{{ clockLabel() }}</span>
        <span class="text-gray-500 text-[11px]">·</span>
        <span class="text-[11px] text-gray-500 tabular-nums">{{ dateLabel() }}</span>
      </div>

      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span class="hidden sm:flex h-9 px-3 rounded-[6px] bg-gray-100 text-gray-900 font-semibold text-[12px] items-center">POS</span>
        <div class="hidden sm:block h-6 w-px bg-gray-200"></div>
        @if (store.cashIsOpen()) {
          <div
            class="h-9 px-2.5 sm:px-3 rounded-[6px] bg-gray-100 flex items-center gap-1.5 text-[12px] font-medium text-green-700"
            [title]="'Turno abierto' + (store.cashShift()?.user_name ? ' · ' + store.cashShift()?.user_name : '')"
          >
            <span class="w-2 h-2 rounded-[6px] bg-green-700 shrink-0"></span>
            <span class="hidden sm:inline whitespace-nowrap">Caja abierta</span>
          </div>
        } @else {
          <button
            (click)="goToCash()"
            title="Abrir turno de caja"
            class="h-9 px-2.5 sm:px-3 rounded-[6px] border border-gray-200 bg-transparent hover:bg-gray-100 flex items-center gap-1.5 text-[12px] font-medium text-gray-600 transition-colors"
          >
            <app-mi-icon name="credit_card" [size]="18" class="shrink-0" />
            <span class="hidden sm:inline">Turno caja</span>
          </button>
        }
        <button
          (click)="onLockTerminal()"
          title="Bloquear terminal"
          class="h-9 w-9 rounded-[6px] border border-gray-200 bg-transparent hover:bg-gray-100 flex items-center justify-center text-gray-600 transition-colors"
        >
          <app-mi-icon name="lock" [size]="18" />
        </button>
      </div>
    </header>
  `,
})
export class PosTerminalHeaderComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** Reloj/fecha/turno de la barra superior -- un tick por minuto (no hace
   *  falta más precisión), pausado en segundo plano. */
  readonly clockLabel = signal(this.formatClock(new Date()));
  readonly dateLabel = signal(this.formatDate(new Date()));
  readonly shiftLabel = signal(this.formatShift(new Date()));
  private clockTimer?: VisibleInterval;

  ngOnInit(): void {
    this.clockTimer = startVisibleInterval(() => {
      const now = new Date();
      this.clockLabel.set(this.formatClock(now));
      this.dateLabel.set(this.formatDate(now));
      this.shiftLabel.set(this.formatShift(now));
    }, 30_000);
  }

  ngOnDestroy(): void {
    this.clockTimer?.stop();
  }

  private formatClock(d: Date): string {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private formatDate(d: Date): string {
    return d.toLocaleDateString('es-CO');
  }

  /** "Turno {Mañana/Tarde/Noche}: {usuario}" -- mismo dato que ya muestra el
   *  header global del dashboard (AuthService.currentUser()). */
  private formatShift(d: Date): string {
    const h = d.getHours();
    const periodo = h < 12 ? 'Mañana' : h < 19 ? 'Tarde' : 'Noche';
    const nombre = this.authService.currentUser()?.name;
    return nombre ? `Turno ${periodo}: ${nombre}` : `Turno ${periodo}`;
  }

  connectionDotClass(): string {
    return this.store.realtimeStatus() === 'open' ? 'bg-emerald-500' : 'bg-amber-500';
  }

  connectionLabel(): string {
    return this.store.realtimeStatus() === 'open' ? 'En línea · Sincronizado' : 'Sincronizando…';
  }

  /** Botón/insignia de turno de caja del header: la apertura en sí vive en la
   *  página de caja (ese flujo ya existe ahí) -- aquí solo se navega, sin
   *  duplicar ese estado dentro de la terminal. */
  goToCash(): void {
    this.router.navigate(['/dashboard/caja']);
  }

  /** "Bloquear Terminal" del mockup: no existe ningún mecanismo de bloqueo de
   *  sesión/PIN en el backend todavía -- se deja el botón (fidelidad visual)
   *  pero avisa en vez de fingir una función que no está implementada. */
  onLockTerminal(): void {
    this.toast.info('El bloqueo de terminal todavía no está disponible.');
  }
}
