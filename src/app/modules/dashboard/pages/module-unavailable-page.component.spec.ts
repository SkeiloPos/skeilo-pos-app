import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ModuleUnavailablePageComponent } from './module-unavailable-page.component';
import { AuthService } from '../../../core/services/auth.service';

describe('ModuleUnavailablePageComponent', () => {
  function createComponent() {
    TestBed.configureTestingModule({
      imports: [ModuleUnavailablePageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout: vi.fn().mockResolvedValue(undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(ModuleUnavailablePageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('ofrece un link a "Mi cuenta" -- destino sin roleGuard/planModuleGuard, alcanzable por cualquier rol', () => {
    const fixture = createComponent();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/dashboard/mi-cuenta');
  });

  it('logout() llama AuthService.logout() y navega a /login', async () => {
    const fixture = createComponent();
    const authService = TestBed.inject(AuthService) as unknown as { logout: ReturnType<typeof vi.fn> };
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await fixture.componentInstance.logout();

    expect(authService.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });
});
