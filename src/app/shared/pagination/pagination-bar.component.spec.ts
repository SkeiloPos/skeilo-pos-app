import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PaginationBarComponent } from './pagination-bar.component';

function crear(partial: Partial<PaginationBarComponent> = {}) {
  TestBed.configureTestingModule({ imports: [PaginationBarComponent] });
  const fixture = TestBed.createComponent(PaginationBarComponent);
  fixture.componentRef.setInput('total', partial.total ?? 28);
  fixture.componentRef.setInput('page', partial.page ?? 1);
  fixture.componentRef.setInput('size', partial.size ?? 10);
  fixture.componentRef.setInput('totalPages', partial.totalPages ?? 3);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PaginationBarComponent — "Filas por página" + rango + flechas', () => {
  it('muestra "Filas por página", el rango y la página actual', () => {
    const { el } = crear({ page: 1, size: 10, total: 28, totalPages: 3 });
    expect(el.textContent).toContain('Filas por página');
    expect(el.textContent).toContain('1–10 de 28');
    expect(el.textContent).toContain('Página 1 de 3');
  });

  it('calcula el rango de la última página (puede ser menor que size)', () => {
    const { el } = crear({ page: 3, size: 10, total: 28, totalPages: 3 });
    expect(el.textContent).toContain('21–28 de 28');
  });

  it('el botón "Página anterior" está deshabilitado en la primera página', () => {
    const { el } = crear({ page: 1, totalPages: 3 });
    const prev = el.querySelector('[aria-label="Página anterior"]') as HTMLButtonElement;
    const next = el.querySelector('[aria-label="Página siguiente"]') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it('el botón "Página siguiente" está deshabilitado en la última página', () => {
    const { el } = crear({ page: 3, totalPages: 3 });
    const next = el.querySelector('[aria-label="Página siguiente"]') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('emite pageChange al hacer clic en "Página siguiente"', () => {
    const { fixture, el } = crear({ page: 1, totalPages: 3 });
    const spy = vi.fn();
    fixture.componentInstance.pageChange.subscribe(spy);
    (el.querySelector('[aria-label="Página siguiente"]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('no renderiza el pager cuando hay una sola página', () => {
    const { el } = crear({ page: 1, totalPages: 1, total: 5 });
    expect(el.querySelector('[aria-label="Página anterior"]')).toBeNull();
  });

  it('no renderiza nada cuando total es 0', () => {
    const { el } = crear({ total: 0, totalPages: 0 });
    expect(el.textContent?.trim()).toBe('');
  });
});
