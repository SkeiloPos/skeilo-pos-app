import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CashSessionStore } from '../services/cash-session.store';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/** Reporte de cierre del turno: resumen financiero, arqueo y movimientos. */
@Component({
  selector: 'app-cash-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconMiComponent],
  template: `
    <div class="flex-1 w-full max-w-[900px] mx-auto p-6">
      <div class="flex items-center gap-2 mb-2 text-gray-500">
        <app-mi-icon name="lock" [size]="18" />
        <span class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Turno cerrado</span>
      </div>
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Reporte de cierre — {{ store.cajaLabel() }}</h2>
      <p class="text-sm text-gray-500 mb-4">
        Cajero: {{ store.cajero() }} · Apertura: {{ store.aperturaFmt() }} · Cierre: {{ store.cierreFmt() }}
      </p>

      <div class="border-t border-gray-100 mb-4"></div>

      <!-- Resumen financiero -->
      @let ind = store.indicadores();
      <h4 class="text-base font-bold text-gray-900 mb-2">Resumen financiero</h4>
      <table class="w-full text-sm border-collapse mb-4">
        <tbody>
          <tr><td class="py-2 border-b border-gray-100">Fondo inicial</td><td class="py-2 border-b border-gray-100 text-right font-semibold">{{ store.fmt(fondoInicial()) }}</td></tr>
          @for (v of ind.ventas; track v.id) {
            <tr><td class="py-2 border-b border-gray-100">Ventas {{ v.name }}</td><td class="py-2 border-b border-gray-100 text-right font-semibold">{{ store.fmt(v.total) }}</td></tr>
          }
          <tr><td class="py-2 border-b border-gray-100">Ingresos</td><td class="py-2 border-b border-gray-100 text-right font-semibold">{{ store.fmt(ind.ingresos) }}</td></tr>
          <tr><td class="py-2 border-b border-gray-100">Egresos</td><td class="py-2 border-b border-gray-100 text-right font-semibold">{{ store.fmt(ind.egresos) }}</td></tr>
          <tr><td class="py-2 border-b border-gray-100">Retiros</td><td class="py-2 border-b border-gray-100 text-right font-semibold">{{ store.fmt(ind.retiros) }}</td></tr>
          <tr><td class="py-2 border-b border-gray-100 font-bold">Efectivo esperado</td><td class="py-2 border-b border-gray-100 text-right font-bold">{{ store.fmt(store.efectivoEsperado()) }}</td></tr>
        </tbody>
      </table>
      @if (ind.cambioEntregado > 0) {
        <!-- Dato informativo, no un término de la fórmula de arriba (spec 108) -->
        <p class="text-sm text-gray-500 mb-4">Cambio entregado (informativo): {{ store.fmt(ind.cambioEntregado) }}</p>
      }

      <!-- Arqueo -->
      <h4 class="text-base font-bold text-gray-900 mb-2">Arqueo de caja</h4>
      <div class="bg-white rounded-xl border border-gray-100 p-4 flex justify-between items-center mb-4">
        <div>
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Efectivo contado</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(contado()) }}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Diferencia</div>
          <div class="text-lg font-bold mt-1" [class]="store.diffClass(diferencia())">
            {{ store.fmt(diferencia()) }} · {{ store.diffLabel(diferencia()) }}
          </div>
        </div>
      </div>
      @if (observacion()) {
        <p class="text-sm text-gray-600 mb-2"><strong>Observación:</strong> {{ observacion() }}</p>
      }

      <div class="border-t border-gray-100 my-4"></div>

      <!-- Movimientos -->
      <h4 class="text-base font-bold text-gray-900 mb-2">Movimientos del turno ({{ store.movimientosView().length }})</h4>
      @if (store.sinMovimientos()) {
        <p class="text-sm text-gray-400 py-2 mb-4">No se registraron movimientos en este turno.</p>
      } @else {
        <table class="w-full text-sm border-collapse mb-6">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <th class="py-2 border-b-2 border-gray-100 font-medium">Hora</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Tipo</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Valor</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Usuario</th>
              <th class="py-2 border-b-2 border-gray-100 font-medium">Observación</th>
            </tr>
          </thead>
          <tbody>
            @for (m of store.movimientosView(); track m.id) {
              <tr>
                <td class="py-2 border-b border-gray-100">{{ m.hora }}</td>
                <td class="py-2 border-b border-gray-100">
                  <span class="inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-md" [class]="store.tagClass(m.tagVariant)">{{ m.label }}</span>
                </td>
                <td class="py-2 border-b border-gray-100 font-semibold">{{ m.montoFmt }}</td>
                <td class="py-2 border-b border-gray-100">{{ m.usuario }}</td>
                <td class="py-2 border-b border-gray-100 text-gray-500">{{ m.nota }}</td>
              </tr>
            }
          </tbody>
        </table>
      }

      <div class="flex gap-2 print:hidden">
        <button (click)="store.imprimirReporte()" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors">
          Imprimir / Exportar reporte
        </button>
        @if (store.reportContext() === 'history') {
          <button (click)="store.backToHistory()" class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            ← Volver al historial
          </button>
        } @else {
          <button (click)="store.nuevoTurno()" class="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Iniciar nuevo turno
          </button>
        }
      </div>
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
export class CashReportComponent {
  readonly store = inject(CashSessionStore);

  readonly fondoInicial = computed(() => this.store.num(this.store.shift()?.opening_amount));
  readonly contado = computed(() => this.store.num(this.store.shift()?.counted_amount));
  readonly diferencia = computed(() => this.store.num(this.store.reconciliation()?.difference));
  readonly observacion = computed(
    () => this.store.shift()?.close_note ?? this.store.report()?.close_note ?? '',
  );
}
