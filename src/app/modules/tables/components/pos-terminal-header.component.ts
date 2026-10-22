import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { VisibleInterval, startVisibleInterval } from '../../../core/realtime/visible-interval';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

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
  imports: [IconLucideComponent],
  template: `
    <header
      class="flex items-center justify-between gap-4 flex-wrap px-5 py-3 border-b shrink-0"
      style="border-color:var(--terminal-color-border);background:var(--terminal-color-surface)"
    >
      <div class="flex items-center gap-5 flex-wrap min-w-0">
        <div class="flex items-center gap-1.5 text-[12px]" [style.color]="connectionColor()">
          <span class="w-2 h-2 rounded-full shrink-0" [style.background]="connectionColor()"></span>
          {{ connectionLabel() }}
        </div>
        <div class="flex items-center gap-2 text-[13px]" style="color:var(--terminal-color-text-secondary)">
          <app-lucide-icon name="users" [size]="16" />
          {{ shiftLabel() }}
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <div
          class="px-3.5 py-1.5 rounded-[8px] border font-semibold tabular-nums whitespace-nowrap"
          style="border-color:var(--terminal-color-border);background:var(--terminal-color-surface-soft);color:var(--terminal-color-text-primary)"
        >
          {{ clockLabel() }}
          <span style="color:var(--terminal-color-text-muted);font-weight:400"> · {{ dateLabel() }}</span>
        </div>

        @if (store.cashIsOpen()) {
          <div
            class="h-9 px-3 rounded-[8px] flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap"
            style="background:var(--terminal-color-success-soft);color:var(--terminal-color-success)"
            [title]="'Turno abierto' + (store.cashShift()?.user_name ? ' · ' + store.cashShift()?.user_name : '')"
          >
            <app-lucide-icon name="circle-check" [size]="16" />
            <span class="hidden sm:inline">Caja abierta</span>
          </div>
        } @else {
          <button
            (click)="goToCash()"
            title="Abrir turno de caja"
            class="h-9 px-3 rounded-[8px] border flex items-center gap-1.5 text-[12px] font-semibold transition-colors"
            style="border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-secondary)"
          >
            <app-lucide-icon name="credit-card" [size]="16" />
            <span class="hidden sm:inline">Turno caja</span>
          </button>
        }
        <button
          (click)="onLockTerminal()"
          title="Bloquear terminal"
          class="h-9 w-9 rounded-[8px] border flex items-center justify-center transition-colors"
          style="border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-secondary)"
        >
          <app-lucide-icon name="lock" [size]="16" />
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

  connectionColor(): string {
    return this.store.realtimeStatus() === 'open' ? 'var(--terminal-color-success)' : 'var(--terminal-color-warning)';
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
