import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TableService } from '../services/table.service';
import { buildTableQr } from '../services/table-qr.util';

interface TableQrCard {
  id: string;
  number: number;
  name: string | null;
  dataUrl: string;
  failed: boolean;
}

/**
 * Hoja imprimible con el QR de todas las mesas activas.
 *
 * Existe por una razón concreta: los QR antiguos codificaban el id de la mesa
 * en claro y el backend ya no los acepta, así que **todos los códigos pegados
 * en las mesas hay que reemplazarlos**. Ir mesa por mesa abriendo el modal es
 * inviable en un local con veinte mesas.
 */
@Component({
  selector: 'app-table-qr-sheet',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="force-light-surface max-w-5xl mx-auto">
      <!-- Cabecera: no se imprime -->
      <div class="print:hidden mb-6">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-xl font-bold text-gray-900">Códigos QR de las mesas</h1>
            <p class="text-sm text-gray-500 mt-1">
              Imprime esta hoja y pega el código de cada mesa en su sitio.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <a
              routerLink="/dashboard/mesas"
              class="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Volver
            </a>
            <button
              (click)="print()"
              [disabled]="loading()"
              class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              Imprimir
            </button>
          </div>
        </div>

        <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4">
          <p class="text-sm text-amber-800">
            <span class="font-semibold">Los códigos anteriores dejaron de funcionar.</span>
            Si un cliente escanea uno viejo verá un aviso para pedir el nuevo al personal.
          </p>
        </div>

        @if (error()) {
          <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 text-sm text-red-700">
            {{ error() }}
          </div>
        }
      </div>

      @if (loading()) {
        <div class="flex items-center justify-center py-20 print:hidden">
          <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
          @for (card of cards(); track card.id) {
            <div
              class="bg-white rounded-2xl border border-gray-200 p-4 text-center break-inside-avoid print:border-gray-400 print:rounded-none"
            >
              <p class="text-lg font-bold text-gray-900">Mesa {{ card.number }}</p>
              @if (card.name) {
                <p class="text-xs text-gray-500 mb-2">{{ card.name }}</p>
              }
              @if (card.failed) {
                <p class="text-xs text-red-600 py-8">No se pudo generar</p>
              } @else {
                <img [src]="card.dataUrl" [alt]="'QR mesa ' + card.number" class="w-full max-w-[180px] mx-auto" />
              }
              <p class="text-[10px] text-gray-400 mt-2">Escanea para ver el menú y pedir</p>
            </div>
          } @empty {
            <p class="col-span-full text-center text-sm text-gray-400 py-16">
              No hay mesas activas.
            </p>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      @media print {
        :host {
          display: block;
        }
        @page {
          margin: 10mm;
        }
      }
    `,
  ],
})
export class TableQrSheetComponent implements OnInit {
  private readonly tables = inject(TableService);

  readonly cards = signal<TableQrCard[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.tables.loadTables();
    const active = this.tables.tables().filter((t) => t.active);

    // Un token por mesa: son peticiones independientes, así que van en paralelo.
    // Una mesa que falle no debe dejar la hoja entera sin imprimir.
    const cards = await Promise.all(
      active.map(async (t): Promise<TableQrCard> => {
        try {
          const { dataUrl } = await buildTableQr(this.tables, t.id, 320);
          return { id: t.id, number: t.number, name: t.name, dataUrl, failed: false };
        } catch {
          return { id: t.id, number: t.number, name: t.name, dataUrl: '', failed: true };
        }
      }),
    );

    this.cards.set(cards.sort((a, b) => a.number - b.number));
    if (cards.some((c) => c.failed)) {
      this.error.set('Algunas mesas no pudieron generar su código. Vuelve a cargar la página.');
    }
    this.loading.set(false);
  }

  print(): void {
    window.print();
  }
}
