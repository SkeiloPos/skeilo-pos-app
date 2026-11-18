import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { LegalDocumentViewerComponent } from './legal-document-viewer.component';
import { DinerService } from '../services/diner.service';

describe('LegalDocumentViewerComponent (spec 162, FR-017)', () => {
  async function crear(
    id: string,
    getTenantLegalDocument: ReturnType<typeof vi.fn>,
  ): Promise<ComponentFixture<LegalDocumentViewerComponent>> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LegalDocumentViewerComponent],
      providers: [
        { provide: DinerService, useValue: { getTenantLegalDocument } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    });
    const fixture = TestBed.createComponent(LegalDocumentViewerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el contenido HTML del documento vigente', async () => {
    const getTenantLegalDocument = vi.fn(async () => ({
      id: 'doc-1',
      version: 1,
      contenido_html: '<p>Aviso de prueba</p>',
      published_at: '2026-01-01T00:00:00Z',
      content_hash: 'abc',
    }));
    const fixture = await crear('doc-1', getTenantLegalDocument);

    expect(getTenantLegalDocument).toHaveBeenCalledWith('doc-1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Aviso de prueba');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('muestra un mensaje de error si la carga falla', async () => {
    const getTenantLegalDocument = vi.fn(async () => {
      throw new Error('404');
    });
    const fixture = await crear('doc-inexistente', getTenantLegalDocument);

    expect(fixture.componentInstance.errorMessage()).toContain('No se pudo cargar');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No se pudo cargar');
  });
});
