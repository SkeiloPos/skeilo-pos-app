import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { SoldOutCartAlertComponent } from './sold-out-cart-alert.component';
import { DiningCartService } from '../../services/dining-cart.service';

class FakeDiningCartService {
  readonly affectedLines = signal<ReadonlyMap<string, string>>(new Map());
  readonly hasAffectedLines = () => this.affectedLines().size > 0;
}

describe('SoldOutCartAlertComponent', () => {
  let fixture: ComponentFixture<SoldOutCartAlertComponent>;
  let cart: FakeDiningCartService;
  let navigate: ReturnType<typeof vi.fn>;

  function create(): void {
    cart = new FakeDiningCartService();
    navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [SoldOutCartAlertComponent],
      providers: [
        { provide: DiningCartService, useValue: cart },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token: 'tok-1' }) } },
        },
      ],
    });
    fixture = TestBed.createComponent(SoldOutCartAlertComponent);
    fixture.detectChanges();
  }

  it('no muestra nada sin líneas afectadas', () => {
    create();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('muestra el mensaje de FR-024 y un botón "Volver al carrito"', () => {
    create();
    cart.affectedLines.set(new Map([['i1', 'Granizado de mora']]));
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Se agotó: Granizado de mora. Quítalo para continuar');

    const boton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    boton.click();

    expect(navigate).toHaveBeenCalledWith(['/menu/t', 'tok-1'], {
      queryParams: { carrito: 'abierto' },
    });
  });

  it('con varias líneas afectadas usa el texto plural', () => {
    create();
    cart.affectedLines.set(new Map([['i1', 'A'], ['i2', 'B']]));
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Se agotaron: A, B. Quítalos para continuar');
  });
});
