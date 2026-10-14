import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type CanActivateFn } from '@angular/router';
import { NavigationTransitionService } from './navigation-transition.service';

@Component({ selector: 'app-blank', standalone: true, template: '' })
class BlankComponent {}

/** Deferred controlable desde el test -- simula una navegación "fría" (el
 *  chunk perezoso aún descargando): `NavigationEnd` no llega hasta que el
 *  test decide resolverlo, pase el tiempo que pase en los temporizadores. */
function deferredGuard(): { guard: CanActivateFn; resolve: () => void } {
  let resolveFn!: () => void;
  const promise = new Promise<boolean>((resolve) => {
    resolveFn = () => resolve(true);
  });
  return { guard: () => promise, resolve: resolveFn };
}

const rejectingGuard: CanActivateFn = () => false;
const throwingGuard: CanActivateFn = () => {
  throw new Error('boom');
};

describe('NavigationTransitionService (spec 116, T060-T061, research.md R20/R21)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(extraRoutes: Parameters<typeof provideRouter>[0] = []) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: BlankComponent },
          { path: 'a', component: BlankComponent },
          { path: 'b', component: BlankComponent },
          ...extraRoutes,
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    const service = TestBed.inject(NavigationTransitionService);
    return { router, service };
  }

  it("sigue la secuencia idle → out → skeleton → in → idle", async () => {
    const { router, service } = setup();
    expect(service.phase()).toBe('idle');

    const nav = router.navigateByUrl('/a');
    expect(service.phase()).toBe('out');
    expect(service.barVisible()).toBe(true);
    expect(service.barProgress()).toBe(75);

    await vi.advanceTimersByTimeAsync(170);
    expect(service.phase()).toBe('skeleton');

    await nav; // NavigationEnd real ya llegó (navegación "caliente", sin guard)
    await vi.advanceTimersByTimeAsync(60); // completa los 230ms del cronómetro mínimo
    expect(service.phase()).toBe('in');
    expect(service.barProgress()).toBe(100);

    await vi.advanceTimersByTimeAsync(900);
    expect(service.phase()).toBe('idle');
    expect(service.barVisible()).toBe(false);
    expect(service.barProgress()).toBe(0);
  });

  it("'skeleton' no avanza a 'in' antes de NavigationEnd, aunque el cronómetro ya haya cumplido su mínimo", async () => {
    const { guard, resolve } = deferredGuard();
    const { router, service } = setup([{ path: 'cold', component: BlankComponent, canActivate: [guard] }]);

    const nav = router.navigateByUrl('/cold');
    await vi.advanceTimersByTimeAsync(300); // muy por encima de los 230ms del cronómetro
    expect(service.phase()).toBe('skeleton'); // sigue esperando el NavigationEnd real

    resolve();
    await nav;
    await Promise.resolve();
    expect(service.phase()).toBe('in');
  });

  it('un cambio de solo query string no dispara ninguna fase', async () => {
    const { router, service } = setup();
    // Primero se establece la ruta ('/' → '/a' sí es cambio de sección, pasa
    // por toda la coreografía) -- lo que se prueba es el SEGUNDO salto,
    // '/a?x=1' → '/a?x=2', mismo path.
    await router.navigateByUrl('/a?x=1');
    await vi.advanceTimersByTimeAsync(230);
    await vi.advanceTimersByTimeAsync(900);
    expect(service.phase()).toBe('idle');

    router.navigateByUrl('/a?x=2');
    expect(service.phase()).toBe('idle');
    expect(service.barVisible()).toBe(false);
  });

  it('NavigationCancel vuelve a idle sin dejar la barra a medio camino', async () => {
    const { router, service } = setup([
      { path: 'blocked', component: BlankComponent, canActivate: [rejectingGuard] },
    ]);

    await router.navigateByUrl('/blocked').catch(() => undefined);
    expect(service.phase()).toBe('idle');
    expect(service.barVisible()).toBe(false);
  });

  it('NavigationError vuelve a idle sin dejar la barra a medio camino', async () => {
    const { router, service } = setup([
      { path: 'broken', component: BlankComponent, canActivate: [throwingGuard] },
    ]);

    await router.navigateByUrl('/broken').catch(() => undefined);
    expect(service.phase()).toBe('idle');
    expect(service.barVisible()).toBe(false);
  });

  it('varios NavigationStart en rápida sucesión reinician el cronómetro; solo el último llega a in', async () => {
    const { router, service } = setup();

    const first = router.navigateByUrl('/a').catch(() => undefined);
    expect(service.phase()).toBe('out');
    await vi.advanceTimersByTimeAsync(100); // a medio camino del skeleton de la primera navegación

    // Clic rápido a otra sección antes de que termine la coreografía anterior:
    // la segunda navegación cancela la primera (comportamiento real del Router).
    const second = router.navigateByUrl('/b');
    expect(service.phase()).toBe('out'); // reiniciada, no 'skeleton' a medio camino

    await vi.advanceTimersByTimeAsync(170);
    expect(service.phase()).toBe('skeleton');

    await second;
    await first;
    await vi.advanceTimersByTimeAsync(60);
    expect(service.phase()).toBe('in');
    expect(router.url).toBe('/b');

    await vi.advanceTimersByTimeAsync(900);
    expect(service.phase()).toBe('idle');
  });
});
