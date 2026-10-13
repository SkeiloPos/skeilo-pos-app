import { TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';

/** spec 116 (T004, research.md R2): un caso por cada @case nuevo de T003 —
 *  confirma que cada nombre nuevo resuelve a un <svg> con contenido real
 *  (no cae en el ícono por defecto, el círculo con un punto). */
describe('IconComponent — íconos nuevos del panel de tenant (spec 116)', () => {
  const NEW_ICON_NAMES = [
    'layout-dashboard',
    'shopping-cart',
    'layout-grid',
    'qr-code',
    'book-open',
    'tags',
    'cup-soda',
    'percent',
    'package',
    'truck',
    'banknote',
    'chart-column',
    'menu',
    'bell',
    'moon',
    'sun',
    'key-round',
    'badge-check',
    'log-out',
    'panel-left',
  ];

  function render(name: string): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [IconComponent] });
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it.each(NEW_ICON_NAMES)('renderiza un <svg> con contenido para "%s"', (name) => {
    const el = render(name);
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.children.length).toBeGreaterThan(0);
  });

  it('cada ícono nuevo difiere del ícono por defecto (no cae al @default)', () => {
    const defaultSvg = render('__unknown__').innerHTML;
    for (const name of NEW_ICON_NAMES) {
      expect(render(name).innerHTML).not.toEqual(defaultSvg);
    }
  });
});
