import { TestBed } from '@angular/core/testing';
import { IconLucideComponent } from './icon-lucide.component';

describe('IconLucideComponent', () => {
  function crear(name: string, ariaLabel?: string, size?: number) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [IconLucideComponent] });
    const fixture = TestBed.createComponent(IconLucideComponent);
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

  it('renderiza un <svg> con el contenido del ícono conocido del catálogo', () => {
    const el = crear('plus');
    const svg = el.querySelector('svg')!;
    expect(svg).toBeTruthy();
    expect(svg.querySelectorAll('path').length).toBe(2);
  });

  it('es decorativo (aria-hidden) cuando no se provee ariaLabel', () => {
    const el = crear('x');
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeFalsy();
  });

  it('expone role="img" y aria-label cuando se provee ariaLabel', () => {
    const el = crear('x', 'Cerrar');
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Cerrar');
    expect(svg.hasAttribute('aria-hidden')).toBe(false);
  });

  it('cae al ícono de reserva "info" para un nombre desconocido, nunca queda vacío', () => {
    const el = crear('nombre-que-no-existe');
    const svg = el.querySelector('svg')!;
    expect(svg.querySelector('circle')).toBeTruthy();
  });

  it('usa 20px por defecto y traduce el input size a width/height', () => {
    const porDefecto = crear('plus');
    const svgDefault = porDefecto.querySelector('svg')!;
    expect(svgDefault.getAttribute('width')).toBe('20');
    expect(svgDefault.getAttribute('height')).toBe('20');

    const conTamano = crear('plus', undefined, 16);
    const svgSized = conTamano.querySelector('svg')!;
    expect(svgSized.getAttribute('width')).toBe('16');
    expect(svgSized.getAttribute('height')).toBe('16');
  });
});
