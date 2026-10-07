import { createCachedLoader } from './cached-loader.util';

/** Crea una `Promise` que el test controla manualmente, sin encadenar `then`
 * dentro del propio `run()` (spec 101, research.md Decisión 6). */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createCachedLoader (spec 101)', () => {
  it('Caso 1 — cache-hit: no invoca run si hasData ya es true', async () => {
    const run = vi.fn(() => Promise.resolve());
    const loader = createCachedLoader(() => true, run);

    await loader.load();

    expect(run).not.toHaveBeenCalled();
  });

  it('Caso 2 — dos llamadas concurrentes con hasData en false se unen a la misma petición', async () => {
    const d = deferred<void>();
    const run = vi.fn(() => d.promise);
    const loader = createCachedLoader(() => false, run);

    const first = loader.load();
    const second = loader.load();

    expect(run).toHaveBeenCalledTimes(1);

    d.resolve();
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('Caso 3 — force: true invoca run sin importar hasData', async () => {
    const run = vi.fn(() => Promise.resolve());
    const loader = createCachedLoader(() => true, run);

    await loader.load({ force: true });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('Caso 4 — un force que llega durante una petición normal en curso dispara una segunda run independiente, y la petición vieja al terminar después no borra la referencia de la nueva', async () => {
    const oldRequest = deferred<void>();
    const newRequest = deferred<void>();
    const run = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const loader = createCachedLoader(() => false, run);

    const first = loader.load();
    const second = loader.load({ force: true });

    expect(run).toHaveBeenCalledTimes(2);

    // La petición nueva termina primero; luego la vieja. Si "pending" se
    // limpiara sin comparar referencia, la vieja borraría el estado de la
    // nueva al terminar después — por eso lo resolvemos en este orden.
    newRequest.resolve();
    await second;

    oldRequest.resolve();
    await first;

    // Tras ambas resolver, una tercera llamada sin forzar y con hasData aún
    // en false debe disparar una petición real nueva (no quedó "pending"
    // atascado apuntando a ninguna de las dos anteriores).
    const third = deferred<void>();
    run.mockReturnValueOnce(third.promise);
    const thirdCall = loader.load();
    expect(run).toHaveBeenCalledTimes(3);
    third.resolve();
    await thirdCall;
  });
});
