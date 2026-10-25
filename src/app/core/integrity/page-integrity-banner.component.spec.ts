import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CANARY_TEXT } from './integrity-signals';
import { PageIntegrityBannerComponent } from './page-integrity-banner.component';
import { PageIntegrityService } from './page-integrity.service';

/** Doble del servicio: solo lo que usa el banner. */
class FakeIntegrity {
  readonly altered = signal(false);
  readonly blockedNotice = signal<string | null>(null);
  readonly registerCanary = vi.fn();
  readonly reload = vi.fn(async () => undefined);
}

describe('PageIntegrityBannerComponent (spec 134, contracts/page-integrity.md)', () => {
  let fixture: ComponentFixture<PageIntegrityBannerComponent>;
  let integrity: FakeIntegrity;
  let el: HTMLElement;

  async function renderizar(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    integrity = new FakeIntegrity();
    await TestBed.configureTestingModule({
      imports: [PageIntegrityBannerComponent],
      providers: [{ provide: PageIntegrityService, useValue: integrity }],
    }).compileComponents();
    fixture = TestBed.createComponent(PageIntegrityBannerComponent);
    el = fixture.nativeElement as HTMLElement;
  });

  const alerta = (): HTMLElement | null => el.querySelector('[role="alert"]');
  const botonRecargar = (): HTMLButtonElement | null =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Recargar') ?? null;

  describe('visibilidad', () => {
    it('con la página íntegra no muestra aviso ni botón', async () => {
      await renderizar();

      expect(alerta()).toBeNull();
      expect(botonRecargar()).toBeNull();
    });

    it('con la página alterada muestra el aviso con role="alert" y el texto principal', async () => {
      integrity.altered.set(true);
      await renderizar();

      const a = alerta()!;
      expect(a).toBeTruthy();
      expect(a.getAttribute('aria-live')).toBe('assertive');
      expect(a.textContent).toContain('La página fue alterada por el navegador');
      expect(a.textContent).toContain('enviar el pedido y pagar están bloqueados');
      expect(a.textContent).toContain('lo que ya enviaste no se pierde');
    });

    it('desaparece cuando la página vuelve a estar íntegra', async () => {
      integrity.altered.set(true);
      await renderizar();
      expect(alerta()).toBeTruthy();

      integrity.altered.set(false);
      await renderizar();

      expect(alerta()).toBeNull();
    });

    it('queda por encima de los modales y no se imprime', async () => {
      integrity.altered.set(true);
      await renderizar();

      const clases = alerta()!.className;
      expect(clases).toContain('fixed');
      expect(clases).toContain('top-0');
      expect(clases).toContain('z-[100]');
      expect(clases).toContain('print:hidden');
    });
  });

  describe('no es descartable (FR-009)', () => {
    it('no tiene botón de cerrar: el único control es "Recargar"', async () => {
      integrity.altered.set(true);
      await renderizar();

      const botones = Array.from(el.querySelectorAll('button'));
      expect(botones.map((b) => b.textContent?.trim())).toEqual(['Recargar']);
    });

    it('no se descarta con Escape ni con un clic fuera', async () => {
      integrity.altered.set(true);
      await renderizar();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await renderizar();

      expect(alerta()).toBeTruthy();
    });
  });

  describe('Recargar', () => {
    it('invoca reload() del servicio', async () => {
      integrity.altered.set(true);
      await renderizar();

      botonRecargar()!.click();

      expect(integrity.reload).toHaveBeenCalledTimes(1);
    });

    it('recibe el foco al aparecer', async () => {
      document.body.appendChild(el); // el foco solo existe en un elemento conectado
      try {
        integrity.altered.set(true);
        await renderizar();

        expect(document.activeElement).toBe(botonRecargar());
      } finally {
        el.remove();
      }
    });
  });

  describe('línea de acción bloqueada', () => {
    it('no aparece mientras no se haya rechazado ninguna acción', async () => {
      integrity.altered.set(true);
      await renderizar();

      expect(alerta()!.textContent).not.toContain('No se pudo');
    });

    it('aparece con la etiqueta de la acción rechazada', async () => {
      integrity.altered.set(true);
      integrity.blockedNotice.set('enviar el pedido');
      await renderizar();

      expect(alerta()!.textContent).toContain(
        'No se pudo enviar el pedido: la página está alterada. Recarga para continuar.',
      );
    });

    it('sigue la última acción rechazada aunque el texto anterior ya estuviera pintado', async () => {
      integrity.altered.set(true);
      integrity.blockedNotice.set('enviar el pedido');
      await renderizar();

      integrity.blockedNotice.set('pagar el pedido');
      await renderizar();

      const texto = alerta()!.textContent!;
      expect(texto).toContain('No se pudo pagar el pedido');
      expect(texto).not.toContain('No se pudo enviar el pedido');
    });
  });

  describe('canario', () => {
    const canario = (): HTMLElement | null => el.querySelector('[data-integrity-canary]');

    it('está siempre presente, también con la página íntegra, y oculto a la vista y a los lectores', async () => {
      await renderizar();

      const c = canario()!;
      expect(c).toBeTruthy();
      expect(c.textContent).toBe(CANARY_TEXT);
      expect(c.getAttribute('aria-hidden')).toBe('true');
      expect(c.classList.contains('sr-only')).toBe(true);
    });

    it('vive fuera del aviso: no desaparece cuando el aviso se oculta', async () => {
      integrity.altered.set(true);
      await renderizar();
      const antes = canario();

      integrity.altered.set(false);
      await renderizar();

      expect(canario()).toBe(antes);
    });

    it('se registra en el servicio una vez montado', async () => {
      await renderizar();

      expect(integrity.registerCanary).toHaveBeenCalledTimes(1);
      expect(integrity.registerCanary).toHaveBeenCalledWith(canario());
    });
  });
});
