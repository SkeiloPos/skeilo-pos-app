import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

export type NavigationTransitionPhase = 'idle' | 'out' | 'skeleton' | 'in';

/** Replica el cronómetro ya aprobado de `Layout base.dc.html`
 *  (research.md R20; contracts/navigation-transition-contract.md §2):
 *  170ms tras `NavigationStart` para mostrar el skeleton, 230ms para entrar
 *  en `'in'` (siempre que `NavigationEnd` ya haya llegado -- ver
 *  `maybeEnterIn()`), y 900ms más para que la barra termine de desvanecerse. */
const SKELETON_DELAY_MS = 170;
const MIN_IN_DELAY_MS = 230;
const IDLE_DELAY_MS = 900;

/**
 * Coreografía de navegación (barra de carga + skeleton + aparición
 * escalonada) para el panel de tenant -- Historia 4, FR-019 a FR-022
 * (contracts/navigation-transition-contract.md). Acotada en el consumidor
 * (`DashboardLayoutComponent`) a `!isSuperAdmin()`, no aquí: este servicio no
 * sabe nada de roles, solo de fases de navegación (data-model.md §6.1).
 */
@Injectable({ providedIn: 'root' })
export class NavigationTransitionService {
  private readonly router = inject(Router);

  private readonly phaseSignal = signal<NavigationTransitionPhase>('idle');
  private readonly barVisibleSignal = signal(false);
  private readonly barProgressSignal = signal<0 | 75 | 100>(0);

  readonly phase = this.phaseSignal.asReadonly();
  readonly barVisible = this.barVisibleSignal.asReadonly();
  readonly barProgress = this.barProgressSignal.asReadonly();

  private skeletonTimer?: ReturnType<typeof setTimeout>;
  private minInTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;

  /** Los dos requisitos de "'skeleton' → 'in'" (contrato §2): el cronómetro
   *  fijo es un MÍNIMO, nunca un máximo -- una navegación fría (chunk aún
   *  descargando) espera a `NavigationEnd` real, sin importar cuánto tarde. */
  private minDelayElapsed = false;
  private navigationEnded = false;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.onNavigationStart(event);
      } else if (event instanceof NavigationEnd) {
        this.onNavigationEnded();
      } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.reset();
      }
    });
  }

  private pathOnly(url: string): string {
    return url.split('?')[0];
  }

  private onNavigationStart(event: NavigationStart): void {
    const previousPath = this.pathOnly(this.router.url);
    const nextPath = this.pathOnly(event.url);
    // Un cambio de solo query string (filtros, paginación) no es una
    // "transición de sección" -- no dispara ninguna fase (FR-019).
    if (previousPath === nextPath) return;

    // Varios `NavigationStart` en rápida sucesión reinician la coreografía
    // desde 'out' (Historia 4, Escenario 5) -- cancela los temporizadores
    // pendientes de la navegación anterior.
    this.clearTimers();
    this.minDelayElapsed = false;
    this.navigationEnded = false;

    this.phaseSignal.set('out');
    this.barVisibleSignal.set(true);
    this.barProgressSignal.set(75);

    this.skeletonTimer = setTimeout(() => {
      this.phaseSignal.set('skeleton');
    }, SKELETON_DELAY_MS);

    this.minInTimer = setTimeout(() => {
      this.minDelayElapsed = true;
      this.maybeEnterIn();
    }, MIN_IN_DELAY_MS);
  }

  private onNavigationEnded(): void {
    // La fase sigue en 'idle' cuando el NavigationEnd corresponde a un cambio
    // de solo query string (nunca entró en 'out') -- nada que resolver aquí.
    if (this.phaseSignal() === 'idle') return;
    this.navigationEnded = true;
    this.maybeEnterIn();
  }

  private maybeEnterIn(): void {
    if (!this.minDelayElapsed || !this.navigationEnded) return;
    if (this.phaseSignal() === 'in') return;

    this.phaseSignal.set('in');
    this.barProgressSignal.set(100);

    this.idleTimer = setTimeout(() => {
      this.phaseSignal.set('idle');
      this.barVisibleSignal.set(false);
      this.barProgressSignal.set(0);
    }, IDLE_DELAY_MS);
  }

  private clearTimers(): void {
    clearTimeout(this.skeletonTimer);
    clearTimeout(this.minInTimer);
    clearTimeout(this.idleTimer);
    this.skeletonTimer = undefined;
    this.minInTimer = undefined;
    this.idleTimer = undefined;
  }

  /** `NavigationCancel`/`NavigationError` cierran la coreografía igual que un
   *  `NavigationEnd` -- una navegación cancelada no debe dejar la barra o el
   *  skeleton congelados a medio camino (data-model.md §6.1). */
  private reset(): void {
    this.clearTimers();
    this.minDelayElapsed = false;
    this.navigationEnded = false;
    this.phaseSignal.set('idle');
    this.barVisibleSignal.set(false);
    this.barProgressSignal.set(0);
  }
}
