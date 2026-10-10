import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CashSessionStore } from '../services/cash-session.store';

/**
 * Dashboard del turno en curso: acciones, banner de efectivo esperado, KPIs y la
 * línea de tiempo de movimientos (tabla / timeline).
 *
 * Las tarjetas de ventas salen **una por método de pago del negocio**, tal cual
 * los devuelve el arqueo. Antes eran tres cubos fijos (efectivo/tarjeta/
 * transferencia) y cualquier método que no encajara en ellos no se veía.
 */
@Component({
  selector: 'app-cash-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 w-full max-w-[1240px] mx-auto p-6">
      @if (store.error() && !store.modal()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{{ store.error() }}</div>
      }
      <!-- Cabecera + acciones -->
      <div class="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Turno en curso</p>
          <h2 class="text-2xl font-bold text-gray-900">Resumen de caja</h2>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button (click)="store.openMovimiento('ingreso')" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">+ Ingreso</button>
          <button (click)="store.openMovimiento('egreso')" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">− Egreso</button>
          <button (click)="store.openMovimiento('retiro')" class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">↓ Retiro</button>
          <button (click)="store.openArqueo()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">Cerrar turno</button>
        </div>
      </div>

      <!-- Banner efectivo esperado -->
      <div class="bg-indigo-600 text-white rounded-2xl p-6 mb-4 flex items-center justify-between gap-4">
        <div>
          <div class="text-[11px] uppercase tracking-wider opacity-85">Efectivo esperado en caja</div>
          <div class="text-4xl font-extrabold leading-tight mt-1">{{ store.fmt(store.efectivoEsperado()) }}</div>
        </div>
        <div class="text-right text-xs opacity-90 max-w-[280px]">
          Fondo inicial + ventas en efectivo + ingresos − egresos − retiros
        </div>
      </div>

      <!-- KPIs -->
      @let ind = store.indicadores();
      <div class="grid gap-3 mb-6" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Fondo inicial</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(store.num(store.shift()?.opening_amount)) }}</div>
        </div>
        @for (v of ind.ventas; track v.id) {
          <div class="bg-white rounded-xl border border-gray-100 p-4">
            <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold truncate" [title]="v.name">
              Ventas {{ v.name }}
            </div>
            <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(v.total) }}</div>
            <div class="text-[11px] text-gray-400 mt-1">{{ v.count }} venta(s)</div>
          </div>
        }
        @if (ind.cambioEntregado > 0) {
          <!-- Salió del cajón: sin esta tarjeta el efectivo esperado no cuadra a la vista. -->
          <div class="bg-white rounded-xl border border-gray-100 p-4">
            <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Cambio entregado</div>
            <div class="text-lg font-bold text-gray-900 mt-1">− {{ store.fmt(ind.cambioEntregado) }}</div>
            <div class="text-[11px] text-gray-400 mt-1">vuelto a clientes</div>
          </div>
        }
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Ingresos</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(ind.ingresos) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ ind.countIngresos }} movimiento(s)</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Egresos</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(ind.egresos) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ ind.countEgresos }} movimiento(s)</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">Retiros</div>
          <div class="text-lg font-bold text-gray-900 mt-1">{{ store.fmt(ind.retiros) }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ ind.countRetiros }} movimiento(s)</div>
        </div>
      </div>

      <div class="border-t border-gray-100"></div>

      <!-- Línea de tiempo -->
      <div class="flex items-center justify-between my-4">
        <h3 class="text-lg font-bold text-gray-900">Línea de tiempo de movimientos</h3>
        <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            (click)="store.setVista('tabla')"
            class="px-3 py-1.5 transition-colors"
            [class]="store.vista() === 'tabla' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
          >Tabla</button>
          <button
            (click)="store.setVista('timeline')"
            class="px-3 py-1.5 border-l border-gray-200 transition-colors"
            [class]="store.vista() === 'timeline' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
          >Línea de tiempo</button>
        </div>
      </div>

      @if (store.sinMovimientos()) {
        <p class="text-sm text-gray-400 py-4">Aún no hay movimientos en este turno.</p>
      } @else if (store.vista() === 'tabla') {
        <table class="w-full text-sm border-collapse">
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
              <tr class="hover:bg-gray-50/60">
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
      } @else {
        <div class="flex flex-col">
          @for (m of store.movimientosView(); track m.id) {
            <div class="flex gap-3 py-2 pl-4 ml-1.5 border-l-2 border-gray-100 relative">
              <div class="absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
              <div class="w-[70px] text-xs text-gray-400 flex-none">{{ m.hora }}</div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-md" [class]="store.tagClass(m.tagVariant)">{{ m.label }}</span>
                  <span class="font-semibold text-sm">{{ m.montoFmt }}</span>
                </div>
                <div class="text-xs text-gray-400 mt-0.5">{{ m.usuario }} · {{ m.nota }}</div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CashDashboardComponent {
  readonly store = inject(CashSessionStore);
}
