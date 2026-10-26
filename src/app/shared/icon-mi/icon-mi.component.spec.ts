import { TestBed } from '@angular/core/testing';
import { IconMiComponent } from './icon-mi.component';

describe('IconMiComponent', () => {
  function crear(name: string, ariaLabel?: string, size?: number) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [IconMiComponent] });
    const fixture = TestBed.createComponent(IconMiComponent);
    fixture.componentRef.setInput('name', name);
    if (ariaLabel !== undefined) {
      fixture.componentRef.setInput('ariaLabel', ariaLabel);
    }
    if (size !== undefined) {
      fixture.componentRef.setInput('size', size);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renderiza la ligadura de Material Icons correspondiente a un nombre conocido del catálogo', () => {
    const el = crear('table_restaurant');
    expect(el.textContent?.trim()).toBe('table_restaurant');
    expect(el.querySelector('.material-icons-outlined')).toBeTruthy();
  });

  it('resuelve un nombre semántico heredado a su nueva ligadura (catálogo, no literal)', () => {
    const el = crear('products');
    expect(el.textContent?.trim()).toBe('shopping_bag');
  });

  it('es decorativo (aria-hidden) cuando no se provee ariaLabel', () => {
    const el = crear('close');
    const span = el.querySelector('.material-icons-outlined')!;
    expect(span.getAttribute('aria-hidden')).toBe('true');
    expect(span.getAttribute('role')).toBeFalsy();
  });

  it('expone role="img" y aria-label cuando se provee ariaLabel', () => {
    const el = crear('close', 'Cerrar');
    const span = el.querySelector('.material-icons-outlined')!;
    expect(span.getAttribute('role')).toBe('img');
    expect(span.getAttribute('aria-label')).toBe('Cerrar');
    expect(span.hasAttribute('aria-hidden')).toBe(false);
  });

  it('cae al ícono de reserva "help_outline" para un nombre desconocido, nunca queda vacío', () => {
    const el = crear('nombre-que-no-existe');
    expect(el.textContent?.trim()).toBe('help_outline');
  });

  it('spec 134 (FR-006): el span de la ligadura no es traducible (translate="no" + notranslate)', () => {
    // El texto de la ligadura ("shopping_cart", "delete"…) es lo que un traductor
    // convertiría en palabras y el ícono dejaría de verse como ícono.
    const span = crear('close').querySelector('.material-icons-outlined')!;
    expect(span.getAttribute('translate')).toBe('no');
    expect(span.classList.contains('notranslate')).toBe(true);
  });

  it('spec 134: translate="no" no altera aria-*, tamaño ni la ligadura', () => {
    const decorativo = crear('close', undefined, 16).querySelector('.material-icons-outlined')!;
    expect(decorativo.getAttribute('aria-hidden')).toBe('true');
    expect(decorativo.getAttribute('style')).toContain('font-size: 16px');
    expect(decorativo.textContent?.trim()).toBe('close');

    const conEtiqueta = crear('close', 'Cerrar').querySelector('.material-icons-outlined')!;
    expect(conEtiqueta.getAttribute('role')).toBe('img');
    expect(conEtiqueta.getAttribute('aria-label')).toBe('Cerrar');
    expect(conEtiqueta.hasAttribute('aria-hidden')).toBe(false);
    expect(conEtiqueta.getAttribute('translate')).toBe('no');
    expect(conEtiqueta.classList.contains('notranslate')).toBe(true);
  });

  it('usa 20px por defecto y traduce el input size a font-size en píxeles', () => {
    const porDefecto = crear('close');
    expect(porDefecto.querySelector('.material-icons-outlined')!.getAttribute('style')).toContain(
      'font-size: 20px',
    );
    const conTamano = crear('close', undefined, 16);
    expect(conTamano.querySelector('.material-icons-outlined')!.getAttribute('style')).toContain(
      'font-size: 16px',
    );
  });
});
