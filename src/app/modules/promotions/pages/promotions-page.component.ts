import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectionPositionPair,
  Overlay,
} from '@angular/cdk/overlay';
import { CategoryService } from '../../categories/services/category.service';
import { MenuService } from '../../../core/services/menu.service';
import { PresentationService } from '../../presentations/services/presentation.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { PaginationBarComponent } from '../../../shared/pagination/pagination-bar.component';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { formatMoney } from '../../../shared/money';
import { businessToday } from '../../../shared/date-format.util';
import {
  PROMOTION_TRANSITIONS,
  Promotion,
  PromotionForm,
  PromotionRuleForm,
  PromotionStatus,
  PromotionType,
} from '../interfaces/promotion.interface';
import { PromotionService } from '../services/promotion.service';
import { PromoDisplay, getPromoDisplay } from '../services/promotion-pricing.util';
import { setDescriptor } from '../services/promotion-condition.util';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/** Zona horaria de respaldo mientras `TenantInfoService.info()` aún no cargó
 *  (spec 127: misma constante y mismo patrón ya usados en
 *  `reports.service.ts`/`tenant-date.pipe.ts`). */
const DEFAULT_TIMEZONE = 'America/Bogota';

/**
 * spec 083 (US3): tres pantallas fieles a los prototipos
 * (`~/Escritorio/promociones/*.html`) — listado, creación mínima (nombre +
 * tipo) y configuración (vigencia + reglas de precio), sin pantalla de
 * revisión intermedia (research.md D9/D10: cero cambios en
 * `app/api/v1/promotions/`, mismo patrón `FormsModule`/`ngModel`).
 */
type Screen = 'list' | 'create' | 'configure';
type StatusTab = PromotionStatus | '';

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'draft', label: 'Borradores' },
  { value: 'active', label: 'Activas' },
  { value: 'paused', label: 'En pausa' },
  { value: 'finished', label: 'Finalizadas' },
];

const TYPE_OPTIONS: { value: PromotionType; label: string; badge: string; hint: string }[] = [
  {
    value: 'percent',
    label: 'Descuento %',
    badge: 'Porcentual',
    hint: 'Un porcentaje sobre las variantes o productos elegidos (ej. 20% OFF en conos dobles, Happy Hour de malteadas).',
  },
  {
    value: 'package_price',
    label: 'Precio de paquete',
    badge: 'Precio de paquete',
    hint: 'Llevando N unidades cualesquiera del conjunto, el cliente paga un precio fijo preferencial (ej. 2x$12.000, 3x$20.000).',
  },
];

/** Variante del catálogo, aplanada para el selector. */
interface CatalogVariant {
  id: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  /** Nombre de la variante = el de su presentación (spec 084, A-79). */
  variantName: string;
  /** Presentación del catálogo de la variante: con ella se empareja la regla (A-80). */
  presentationId: string;
  price: number;
}

/** Producto del catálogo con sus variantes, para las tarjetas del Paso 1. */
interface CatalogProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  minPrice: number;
  variants: CatalogVariant[];
}

/** spec 084 (A-81): una regla de precio por **presentación** — «8 onzas · 2 unidades × $12.000».
 *  No guarda variantes: al guardar se expande a una regla de backend por cada producto
 *  seleccionado que tenga esa presentación (una variante por regla, A-77), de modo que
 *  cambiar los productos del Paso 1 no obliga a rehacer las reglas. */
interface PresentationRule {
  presentationId: string;
  min_qty: number;
  value: number;
}

/** Filtro de ayuda para poblar el Paso 1 — nunca se guarda (FR-012). */
interface StepOneFilter {
  category: string;
  text: string;
}

function emptyForm(): PromotionForm {
  return {
    name: '',
    starts_at: null,
    ends_at: null,
    days_of_week: [],
    start_time: null,
    end_time: null,
    type: 'package_price',
    rules: [],
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'p. m.' : 'a. m.';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

const DISMISS_KEY = 'promos-063-migration-banner-dismissed';

/** `detail` del 409 del backend cuando el nombre de la promoción ya existe. */
const NAME_TAKEN_MESSAGE = 'Ya existe una promoción con ese nombre';

@Component({
  selector: 'app-promotions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PaginationBarComponent,
    MoneyInputComponent,
    IconMiComponent,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
  ],
  template: `
    <div>
      @if (showMigrationBanner()) {
        <div
          class="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold">
                Algunas promociones se finalizaron con la última actualización
              </p>
              <p class="mt-1 text-amber-700">
                El modelo de promociones cambió a "conjunto de variantes". Estas quedaron en
                <strong>Finalizada</strong> — recréalas si siguen vigentes:
              </p>
              <ul class="mt-2 list-disc pl-5">
                @for (p of svc.closedByRefactor(); track p.id) {
                  <li>
                    {{ p.name }}
                    <span class="text-amber-500">({{ typeLabel(p.rules[0]?.type ?? '') }})</span>
                  </li>
                }
              </ul>
            </div>
            <button
              type="button"
              (click)="dismissBanner()"
              class="text-amber-500 hover:text-amber-700 text-xs font-semibold"
            >
              Descartar
            </button>
          </div>
        </div>
      }

      @switch (screen()) {
        @case ('list') {
          <div class="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div>
              <p class="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1">
                Catálogo
              </p>
              <h1 class="text-2xl font-bold text-gray-900 leading-none mb-1.5">Promociones</h1>
              <p class="text-[13px] text-gray-400">
                Descuento por porcentaje o precio de paquete sobre uno o varios conjuntos de
                variantes
              </p>
            </div>
            <button
              type="button"
              (click)="openNew()"
              class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <svg
                class="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nueva promoción
            </button>
          </div>

          <div class="flex items-center gap-3 flex-wrap mb-4">
            <div class="flex items-center gap-1.5">
              @for (tab of statusTabs; track tab.value) {
                <button
                  type="button"
                  (click)="selectTab(tab.value)"
                  class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  [class]="
                    svc.statusFilter() === tab.value
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  "
                >
                  {{ tab.label }}
                </button>
              }
            </div>
            <input
              [ngModel]="searchSignal()"
              (ngModelChange)="onSearchChange($event)"
              type="search"
              placeholder="Buscar por nombre..."
              class="flex-1 min-w-[200px] max-w-xs px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          @if (svc.error()) {
            <div
              class="mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
            >
              {{ svc.error() }}
            </div>
          }

          @if (svc.loading() && svc.promotions().length === 0) {
            <div class="flex justify-center py-16">
              <div
                class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"
              ></div>
            </div>
          } @else if (svc.promotions().length === 0) {
            <div class="bg-white rounded-2xl border border-gray-100 px-5 py-16 text-center">
              <h3 class="text-base font-semibold text-gray-900 mb-2">Sin promociones</h3>
              <p class="text-sm text-gray-500 max-w-md mx-auto mb-5">
                Crea un descuento por porcentaje o un precio de paquete sobre las variantes que
                elijas.
              </p>
              <button
                type="button"
                (click)="openNew()"
                class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
              >
                Crear la primera promoción
              </button>
            </div>
          } @else {
            <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-visible mb-4">
              <div class="overflow-x-auto">
                <table class="w-full min-w-[860px] text-left border-collapse">
                  <thead>
                    <tr
                      class="border-b border-gray-100 bg-gray-50 text-[11px] font-bold text-gray-400 uppercase tracking-wider"
                    >
                      <th class="py-3 px-5 w-[22%]">Promoción</th>
                      <th class="py-3 px-5 w-[33%]">Reglas</th>
                      <th class="py-3 px-5 w-[25%]">Vigencia</th>
                      <th class="py-3 px-5 w-[10%]">Estado</th>
                      <th class="py-3 px-5 text-right w-[10%]">
                        <span class="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50 text-xs">
                    @for (p of svc.promotions(); track p.id) {
                      <tr class="hover:bg-gray-50/50 transition align-top">
                        <td class="py-4 px-5 font-bold text-gray-900">{{ p.name }}</td>
                        <td class="py-4 px-5 text-gray-600">
                          <span
                            class="inline-block text-[10px] font-bold tracking-tight px-1.5 py-0.5 rounded uppercase bg-indigo-50 text-indigo-600"
                          >
                            {{ promotionTypeLabel(p) }}
                          </span>
                        </td>
                        <td class="py-4 px-5 text-gray-600 leading-relaxed">{{ vigencia(p) }}</td>
                        <td class="py-4 px-5">
                          <span
                            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                            [class]="displayClass(displayOf(p))"
                          >
                            {{ displayLabel(displayOf(p)) }}
                          </span>
                        </td>
                        <td class="py-4 px-5 text-right whitespace-nowrap relative">
                          <div class="relative inline-block text-left">
                            <button
                              #actionsOrigin="cdkOverlayOrigin"
                              cdkOverlayOrigin
                              type="button"
                              aria-haspopup="true"
                              aria-label="Opciones de promoción"
                              (click)="toggleActionsMenu(p.id, $event)"
                              class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                              <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                />
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                            </button>
                            <!-- spec 084 (FR-026 a FR-028, bug 5): CDK Overlay en vez del
                                 div absoluto anterior -- se renderiza en el contenedor
                                 overlay global, fuera del contenedor con scroll de la
                                 tabla (línea ~259), así que ya no se recorta ni fuerza
                                 una barra de scroll dentro de ella (research.md D5). -->
                            <ng-template
                              cdkConnectedOverlay
                              [cdkConnectedOverlayOrigin]="actionsOrigin"
                              [cdkConnectedOverlayOpen]="openActionsId() === p.id"
                              [cdkConnectedOverlayPositions]="actionsMenuPositions"
                              [cdkConnectedOverlayScrollStrategy]="actionsMenuScrollStrategy"
                              (detach)="closeActionsMenu()"
                            >
                              <div
                                (click)="$event.stopPropagation()"
                                class="w-44 bg-white rounded-lg border border-gray-100 shadow-lg py-1 text-left"
                              >
                                <button
                                  type="button"
                                  [disabled]="!canConfigure(p)"
                                  [title]="!canConfigure(p) ? 'Pausa la promoción para poder configurarla' : ''"
                                  (click)="openEdit(p); closeActionsMenu()"
                                  class="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-50/50"
                                >
                                  Configurar
                                </button>
                                <button
                                  type="button"
                                  (click)="startDuplicate(p); closeActionsMenu()"
                                  class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                                >
                                  Duplicar
                                </button>
                                @if (transitionsOf(p).length > 0 || canDelete(p)) {
                                  <div class="border-b border-gray-100 my-1"></div>
                                }
                                @for (to of transitionsOf(p); track to) {
                                  <button
                                    type="button"
                                    (click)="changeStatus(p, to); closeActionsMenu()"
                                    class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                                  >
                                    {{ statusVerb(to) }}
                                  </button>
                                }
                                @if (canDelete(p)) {
                                  <button
                                    type="button"
                                    (click)="removePromotion(p); closeActionsMenu()"
                                    class="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    Eliminar
                                  </button>
                                }
                              </div>
                            </ng-template>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-pagination-bar
                [page]="svc.page()"
                [size]="svc.size()"
                [pageSizes]="[20, 50, 100]"
                [totalPages]="svc.totalPages()"
                [total]="svc.total()"
                [loading]="svc.loading()"
                (pageChange)="svc.load($event)"
                (sizeChange)="svc.load(1, $event)"
              />
            </div>
          }
        }

        @case ('create') {
          <div class="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
            <div class="flex items-center gap-3">
              <button
                type="button"
                (click)="backToList()"
                class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <app-mi-icon name="arrow_back" [size]="16" />
                Volver
              </button>
              <span class="text-gray-200">|</span>
              <h1 class="text-lg font-bold text-gray-900">
                {{ editingId() ? 'Editar promoción' : 'Nueva promoción' }}
              </h1>
            </div>
            <button
              type="button"
              class="w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-600"
              title="Ayuda"
            >
              <app-mi-icon name="help_outline" ariaLabel="Ayuda" [size]="16" />
            </button>
          </div>

          <div class="max-w-6xl w-full space-y-6">
            <section class="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6">
              <h2 class="text-base font-semibold text-gray-800 mb-4">Información general</h2>
              <label class="block">
                <span class="block text-xs font-bold text-gray-500 tracking-wider uppercase mb-2"
                  >Nombre</span
                >
                <input
                  [ngModel]="createName()"
                  (ngModelChange)="createName.set($event)"
                  placeholder="Ej. Happy Hour Lunes a Jueves"
                  class="w-full h-11 px-3.5 text-sm bg-gray-50/50 border border-gray-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500 transition-all"
                />
              </label>
            </section>

            <section class="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6">
              <h2 class="text-base font-semibold text-gray-800">Tipo de promoción</h2>
              <p class="text-xs text-gray-500 mt-0.5 mb-4">
                Elige si esta promoción aplicará un porcentaje de descuento o un precio fijo de
                paquete para conjuntos de productos.
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                @for (t of typeOptions; track t.value) {
                  <label
                    class="relative flex flex-col p-5 rounded-xl border-2 cursor-pointer transition-all select-none"
                    [class]="
                      createType() === t.value
                        ? 'border-indigo-500 bg-indigo-50/30'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    "
                  >
                    <input
                      type="radio"
                      class="sr-only"
                      name="promo_type"
                      [checked]="createType() === t.value"
                      (change)="createType.set(t.value)"
                    />
                    <div class="flex items-start justify-between mb-3">
                      <div class="flex items-center gap-3">
                        <div
                          class="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
                          [class]="
                            createType() === t.value
                              ? 'bg-indigo-600 text-white'
                              : 'bg-indigo-50 text-indigo-600'
                          "
                        >
                          {{ t.value === 'percent' ? '%' : '📦' }}
                        </div>
                        <div>
                          <span class="text-sm font-bold text-gray-800 block">{{ t.label }}</span>
                          <span
                            class="inline-block text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md mt-0.5"
                            >{{ t.badge }}</span
                          >
                        </div>
                      </div>
                      <div
                        class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                        [class]="
                          createType() === t.value
                            ? 'border-indigo-600 bg-indigo-600'
                            : 'border-gray-300'
                        "
                      >
                        @if (createType() === t.value) {
                          <svg
                            class="w-3 h-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        }
                      </div>
                    </div>
                    <p class="text-xs text-gray-500 leading-relaxed">{{ t.hint }}</p>
                  </label>
                }
              </div>
            </section>

            @if (formError()) {
              <div
                class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
              >
                {{ formError() }}
              </div>
            }

            <div
              class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pb-8"
            >
              <button
                type="button"
                (click)="backToList()"
                class="inline-flex justify-center items-center px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                [disabled]="!createName().trim() || svc.isSubmitting()"
                (click)="continueToConfigure()"
                class="inline-flex justify-center items-center px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {{ svc.isSubmitting() ? 'Creando…' : 'Continuar' }}
              </button>
            </div>
          </div>
        }

        @case ('configure') {
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div class="flex items-center gap-3">
              <button
                type="button"
                (click)="backToList()"
                class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Volver
              </button>
              <span class="text-gray-200">|</span>
              <h1 class="text-lg font-bold text-gray-900">
                {{ editingId() ? 'Configurar precios de la promoción' : 'Configurar precios' }}
              </h1>
            </div>
          </div>

          @if (isReadOnly()) {
            <p class="text-sm text-amber-600 mb-4">
              Esta promoción está finalizada — solo lectura.
            </p>
          }

          <!-- Card informativa: tipo bloqueado (FR-018) -->
          <div
            class="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-5"
          >
            <div class="flex items-start gap-3">
              <div class="p-2 bg-indigo-600 text-white rounded-lg shadow-sm mt-0.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-bold text-indigo-950 uppercase tracking-wider"
                    >Tipo seleccionado: {{ typeLabel(form.type) }}</span
                  >
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-200/80 text-indigo-900"
                    >Fijado en creación</span
                  >
                </div>
                <p class="text-xs text-indigo-800 mt-0.5">
                  El tipo de regla no es modificable — aplica a todas las filas que agregues en esta
                  promoción.
                </p>
              </div>
            </div>
            <div
              class="text-xs bg-white border border-indigo-200 px-3.5 py-1.5 rounded-lg text-indigo-900 font-semibold whitespace-nowrap shadow-sm flex items-center gap-2"
            >
              <svg
                class="w-4 h-4 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span
                >Vigencia: <strong class="text-indigo-700">{{ vigenciaPreview() }}</strong></span
              >
            </div>
          </div>

          <!-- Información general (nombre, FR-018/FR-023: sin campo de descripción) -->
          <div class="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-5">
            <h2 class="text-base font-semibold text-gray-800 mb-4">Información general</h2>
            <label class="block">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                >Nombre</span
              >
              <input
                [(ngModel)]="form.name"
                [disabled]="isReadOnly()"
                class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </label>
          </div>

          <!-- Configuración de Vigencia y Horarios -->
          <div class="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-5">
            <div class="flex items-center gap-2.5 mb-4">
              <span
                class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
              <div>
                <h2 class="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Configuración de Vigencia y Horarios
                </h2>
                <p class="text-[11px] text-gray-500">
                  Define el periodo, días activos de la semana y franja horaria para el descuento en
                  el POS.
                </p>
              </div>
            </div>
            <div class="space-y-1.5 mb-4">
              <div class="flex items-center justify-between">
                <span class="block text-[11px] font-bold uppercase tracking-wider text-gray-600"
                  >Días de la semana aplicables</span
                >
                <span class="text-[11px] text-gray-400">Vacío = todos los días</span>
              </div>
              <div class="flex flex-wrap gap-2">
                @for (d of days; track d.idx) {
                  <button
                    type="button"
                    [disabled]="isReadOnly()"
                    (click)="toggleDay(d.idx)"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                    [class]="
                      form.days_of_week.includes(d.idx)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    "
                  >
                    @if (form.days_of_week.includes(d.idx)) {
                      ✓
                    }
                    {{ d.label }}
                  </button>
                }
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label class="block">
                <span
                  class="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                  >Fecha inicio</span
                >
                <div class="relative rounded-lg shadow-xs">
                  <div
                    class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <input
                    type="date"
                    [(ngModel)]="form.starts_at"
                    [disabled]="isReadOnly() || !isDraft()"
                    class="w-full pl-8 pr-2.5 py-2 border border-gray-300 rounded-lg text-xs font-medium"
                  />
                </div>
              </label>
              <label class="block">
                <span
                  class="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                  >Fecha fin</span
                >
                <div class="relative rounded-lg shadow-xs">
                  <div
                    class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <input
                    type="date"
                    [(ngModel)]="form.ends_at"
                    [disabled]="isReadOnly()"
                    class="w-full pl-8 pr-2.5 py-2 border border-gray-300 rounded-lg text-xs font-medium"
                  />
                </div>
              </label>
              <label class="block">
                <span
                  class="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                  >Hora desde</span
                >
                <div class="relative rounded-lg shadow-xs">
                  <div
                    class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="time"
                    [(ngModel)]="form.start_time"
                    [disabled]="isReadOnly()"
                    class="w-full pl-8 pr-2.5 py-2 border border-gray-300 rounded-lg text-xs font-medium"
                  />
                </div>
              </label>
              <label class="block">
                <span
                  class="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                  >Hora hasta</span
                >
                <div class="relative rounded-lg shadow-xs">
                  <div
                    class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="time"
                    [(ngModel)]="form.end_time"
                    [disabled]="isReadOnly()"
                    class="w-full pl-8 pr-2.5 py-2 border border-gray-300 rounded-lg text-xs font-medium"
                  />
                </div>
              </label>
            </div>
          </div>

          @if (canEditRuleSet()) {
            <!-- Paso 1: productos -->
            <div class="bg-gray-50/80 border border-gray-200/80 rounded-xl p-5 mb-5">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div class="flex items-center gap-2.5">
                  <span
                    class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0"
                    >1</span
                  >
                  <div>
                    <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      ¿Qué productos participan?
                    </h3>
                    <p class="text-[11px] text-gray-500">
                      Elige los sabores o productos base que combinan en esta promoción
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <select
                    [(ngModel)]="stepOneFilter.category"
                    class="text-xs border-gray-300 rounded-lg py-1.5 pl-2.5 pr-8 text-gray-700 bg-white"
                  >
                    <option value="">Todas las categorías</option>
                    @for (c of categoryFilterOptions(); track c.id) {
                      <option [value]="c.id">{{ c.name }}</option>
                    }
                  </select>
                  <input
                    [(ngModel)]="stepOneFilter.text"
                    type="search"
                    placeholder="Buscar producto o sabor..."
                    class="w-48 sm:w-56 text-xs border border-gray-300 rounded-lg py-1.5 px-2.5 text-gray-700"
                  />
                </div>
              </div>

              @if (stepOneResults().length > 0) {
                <div
                  class="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[320px] overflow-y-auto pr-1"
                >
                  @for (p of stepOneResults(); track p.id) {
                    <div
                      (click)="toggleProductCandidate(p.id)"
                      [title]="
                        blockedReason(p.id)
                          ? 'Ya hace parte de la promoción activa «' + blockedReason(p.id) + '»'
                          : ''
                      "
                      class="relative border-2 rounded-xl p-3.5 transition-all"
                      [class]="
                        blockedReason(p.id)
                          ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                          : isProductSelected(p.id)
                            ? 'border-indigo-500 bg-indigo-50/30 cursor-pointer'
                            : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                      "
                    >
                      @if (isProductSelected(p.id)) {
                        <span
                          class="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center"
                        >
                          <svg
                            class="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </span>
                      }
                      <div class="text-2xl mb-1">🍨</div>
                      <div class="font-bold text-xs text-gray-800 leading-tight">{{ p.name }}</div>
                      <div class="text-[10px] text-gray-500 mt-0.5">{{ p.categoryName }}</div>
                      <div
                        class="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400"
                      >
                        <span>Desde {{ money(p.minPrice) }}</span>
                        <span
                          [class]="
                            blockedReason(p.id)
                              ? 'font-medium text-gray-400'
                              : isProductSelected(p.id)
                                ? 'font-medium text-indigo-700'
                                : 'text-indigo-600'
                          "
                        >
                          {{
                            blockedReason(p.id)
                              ? 'Ya en otra promo'
                              : isProductSelected(p.id) ? 'Incluido' : '+ Seleccionar'
                          }}
                        </span>
                      </div>
                    </div>
                  }
                </div>
              } @else if (stepOneFilter.category || stepOneFilter.text) {
                <p class="text-xs text-gray-400">Sin productos que coincidan con el filtro.</p>
              } @else {
                <p class="text-xs text-gray-400">
                  Elige una categoría o busca un producto para empezar.
                </p>
              }

              <div class="flex items-center gap-2 pt-3 flex-wrap">
                <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Seleccionados ({{ selectedCandidateProducts().length }}):
                </span>
                <div class="flex flex-wrap gap-1.5">
                  @for (p of selectedCandidateProducts(); track p.id) {
                    <span
                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                    >
                      {{ p.name }}
                      <button
                        type="button"
                        (click)="toggleProductCandidate(p.id)"
                        class="text-indigo-400 hover:text-indigo-600 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  } @empty {
                    <span class="text-gray-400 text-[11px] italic"
                      >Sin productos seleccionados.</span
                    >
                  }
                </div>
              </div>
            </div>

            <!-- Paso 2: presentación y regla de precio -->
            <div class="bg-white border border-gray-200 rounded-xl p-5 mb-5">
              <div class="flex items-center gap-2.5 mb-4">
                <span
                  class="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0"
                  >2</span
                >
                <div>
                  <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Presentación y Regla de Precio
                  </h3>
                  <p class="text-[11px] text-gray-500">
                    Define el tamaño aplicable y las condiciones de cobro fijo en el POS
                  </p>
                </div>
              </div>

              <div
                class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end bg-gray-50/80 p-3.5 rounded-xl border border-gray-200/80"
              >
                <label class="block">
                  <span
                    class="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                    >Presentación / Tamaño</span
                  >
                  <select
                    [ngModel]="pickerPresentationId()"
                    (ngModelChange)="pickerPresentationId.set($event)"
                    class="w-full text-xs border-gray-300 rounded-lg py-2 pl-2.5 pr-8 text-gray-700 bg-white font-medium"
                  >
                    <option [ngValue]="null">Elige una presentación</option>
                    @for (p of availablePresentations(); track p.id) {
                      <option [ngValue]="p.id">{{ p.name }}</option>
                    }
                  </select>
                </label>
                <label class="block">
                  <span
                    class="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                    >Unidades</span
                  >
                  <input
                    type="number"
                    [attr.min]="minPickerQty()"
                    [ngModel]="pickerQty()"
                    (ngModelChange)="onPickerQtyChange($event)"
                    class="w-full rounded-lg border-gray-300 px-3 py-2 text-xs font-semibold text-gray-800"
                  />
                </label>
                <label class="block">
                  <span
                    class="block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"
                  >
                    {{ form.type === 'percent' ? 'Porcentaje (%)' : 'Precio promocional ($ COP)' }}
                  </span>
                  @if (form.type === 'percent') {
                    <input
                      type="number"
                      min="0"
                      max="100"
                      [ngModel]="pickerValue()"
                      (ngModelChange)="pickerValue.set($event)"
                      class="w-full rounded-lg border-gray-300 px-3 py-2 text-xs font-semibold text-gray-800"
                    />
                  } @else {
                    <app-money-input
                      [ngModel]="pickerValue()"
                      (ngModelChange)="pickerValue.set($event)"
                      class="block"
                    />
                  }
                </label>
                <button
                  type="button"
                  [disabled]="!canAddRuleRow()"
                  (click)="addRuleRow()"
                  class="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar a la lista
                </button>
              </div>

              @if (pickerError()) {
                <p class="mt-2 text-xs text-red-600">{{ pickerError() }}</p>
              }

              <!-- spec 084 (A-80): la presentación es independiente de los productos; este
                   aviso dice a cuántos de los ya seleccionados se aplicaría. -->
              @if (pickerMatchSummary(); as summary) {
                <p
                  class="mt-2 text-xs"
                  [class]="summary.matching > 0 ? 'text-gray-500' : 'text-amber-700'"
                >
                  @if (summary.selected === 0) {
                    Aún no hay productos seleccionados: la regla se aplicará a los que elijas en el Paso 1.
                  } @else if (summary.matching === 0) {
                    Ninguno de los {{ summary.selected }} productos seleccionados tiene esta presentación.
                  } @else {
                    Se aplicará a {{ summary.matching }} de {{ summary.selected }}
                    producto{{ summary.selected === 1 ? '' : 's' }} seleccionado{{
                      summary.selected === 1 ? '' : 's'
                    }}.
                  }
                </p>
              }

              @if (sharedVariantConflict(); as sc) {
                <div
                  class="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600"
                >
                  La variante <strong>{{ sc.variantLabel }}</strong> está repetida entre dos reglas
                  — cada variante solo puede pertenecer a una regla de esta promoción.
                </div>
              }

              <div class="mt-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-gray-600"
                    >Reglas de precio configuradas</span
                  >
                  <span
                    class="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/60"
                  >
                    {{ presentationRules().length }} regla{{
                      presentationRules().length === 1 ? '' : 's'
                    }}
                    configurada{{ presentationRules().length === 1 ? '' : 's' }}
                  </span>
                </div>
                <div class="overflow-hidden border border-gray-200 rounded-xl">
                  <table class="w-full text-left text-xs">
                    <thead
                      class="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      <tr>
                        <th class="p-3">Presentación</th>
                        <th class="p-3">Unidades mínimas</th>
                        <th class="p-3">Precio regular est.</th>
                        <th class="p-3">Precio especial / promo</th>
                        <th class="p-3">Ahorro en caja</th>
                        <th class="p-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 bg-white">
                      @for (rule of presentationRules(); track rule.presentationId) {
                        <tr class="hover:bg-gray-50/50 transition-colors">
                          <td class="p-3 font-bold text-gray-800">
                            <span
                              class="w-2 h-2 rounded-full bg-indigo-600 inline-block mr-1.5"
                            ></span
                            >{{ ruleProductsLabel(rule) }}
                          </td>
                          <td class="p-3 text-gray-600 font-medium">
                            {{ rule.min_qty }} unidad{{ rule.min_qty === 1 ? '' : 'es' }}
                          </td>
                          @if (previewSavings(rule); as pv) {
                            <td class="p-3 text-gray-400 line-through">{{ money(pv.regular) }}</td>
                            <td class="p-3 font-bold text-indigo-700">
                              {{
                                form.type === 'percent' ? rule.value + '% dto.' : money(rule.value)
                              }}
                            </td>
                            <td class="p-3">
                              @if (pv.amountOff > 0) {
                                <span
                                  class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                >
                                  Ahorro {{ money(pv.amountOff) }}
                                </span>
                              } @else {
                                <span class="text-gray-400">—</span>
                              }
                            </td>
                          } @else {
                            <td class="p-3 text-gray-400">—</td>
                            <td class="p-3 font-bold text-indigo-700">
                              {{
                                form.type === 'percent' ? rule.value + '% dto.' : money(rule.value)
                              }}
                            </td>
                            <td class="p-3 text-gray-400">—</td>
                          }
                          <td class="p-3 text-right">
                            <button
                              type="button"
                              (click)="removeRuleRow($index)"
                              title="Eliminar regla"
                              class="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                            >
                              <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="6" class="p-4 text-center text-gray-400">
                            Sin reglas configuradas todavía.
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (unresolvedRuleCount() > 0) {
                  <p class="text-xs text-amber-700">
                    {{ unresolvedRuleCount() }} regla{{ unresolvedRuleCount() === 1 ? '' : 's' }}
                    no se aplica{{ unresolvedRuleCount() === 1 ? '' : 'n' }} a ninguno de los productos
                    seleccionados y no se guardará{{ unresolvedRuleCount() === 1 ? '' : 'n' }}
                    mientras siga así.
                  </p>
                }
              </div>
            </div>
          } @else {
            <!-- Solo lectura: Activa o Finalizada (FR-018) -->
            <div class="bg-white border border-gray-200 rounded-xl p-5 mb-5">
              <h3 class="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
                Reglas configuradas
              </h3>
              <div class="overflow-hidden border border-gray-200 rounded-xl">
                <table class="w-full text-left text-xs">
                  <thead
                    class="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                  >
                    <tr>
                      <th class="p-3">Presentación</th>
                      <th class="p-3">Unidades mínimas</th>
                      <th class="p-3">Precio / descuento</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 bg-white">
                    @for (rule of presentationRules(); track rule.presentationId) {
                      <tr>
                        <td class="p-3 font-bold text-gray-800">{{ ruleProductsLabel(rule) }}</td>
                        <td class="p-3 text-gray-600 font-medium">
                          {{ rule.min_qty }} unidad{{ rule.min_qty === 1 ? '' : 'es' }}
                        </td>
                        <td class="p-3 font-bold text-indigo-700">
                          {{ form.type === 'percent' ? rule.value + '% dto.' : money(rule.value) }}
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="3" class="p-4 text-center text-gray-400">Sin reglas.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @if (formError()) {
            <div
              class="mb-5 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600"
            >
              {{ formError() }}
            </div>
          }
          @if (svc.overlapConflict(); as oc) {
            <div
              class="mb-5 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700"
            >
              <p class="font-semibold">{{ oc.error }}</p>
              <ul class="mt-1 list-disc pl-5">
                @for (c of oc.conflicts; track c.rule_id) {
                  <li>
                    {{ c.promotion_name }} — {{ c.variant_ids.length }} variante(s) compartida(s)
                  </li>
                }
              </ul>
            </div>
          }
          @if (svc.ruleVariantConflict(); as rc) {
            <div
              class="mb-5 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700"
            >
              <p class="font-semibold">{{ rc.error }}</p>
              <p class="mt-1">
                Regla {{ rc.rule_index_a + 1 }} y regla {{ rc.rule_index_b + 1 }} comparten
                {{ rc.variant_ids.length }} variante(s).
              </p>
            </div>
          }
          @if (svc.packageNotDiscount(); as pk) {
            <div
              class="mb-5 bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700"
            >
              <p class="font-semibold">{{ pk.error }}</p>
            </div>
          }

          <!-- El guardado vive al final del formulario y solo se habilita cuando hay un
               cambio respecto de lo cargado (o recién guardado). -->
          @if (!isReadOnly()) {
            <div
              class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 pb-8"
            >
              @if (!hasChanges() && !svc.isSubmitting()) {
                <span class="text-xs text-gray-400 sm:mr-2">No hay cambios por guardar.</span>
              }
              <button
                type="button"
                [disabled]="svc.isSubmitting() || !hasChanges() || !formValid()"
                (click)="saveConfigure()"
                class="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {{ svc.isSubmitting() ? 'Guardando…' : 'Guardar y sincronizar' }}
              </button>
            </div>
          }
        }
      }
    </div>

    @if (duplicating(); as src) {
      <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl p-5 w-full max-w-sm">
          <h3 class="text-base font-semibold text-gray-900 mb-2">Duplicar "{{ src.name }}"</h3>
          <p class="text-xs text-gray-500 mb-3">
            La copia nace en Borrador con las mismas reglas y la misma vigencia.
          </p>
          <input
            [ngModel]="duplicateName()"
            (ngModelChange)="onDuplicateNameChange($event)"
            placeholder="Nombre de la copia"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          @if (duplicateNameTaken()) {
            <div
              class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              Ya existe una promoción llamada «{{ duplicateName().trim() }}». Si continúas, se
              <strong>eliminará</strong> con todas sus reglas y la copia ocupará su lugar.
            </div>
          }
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              (click)="duplicating.set(null)"
              class="px-3 py-1.5 text-sm text-gray-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              [disabled]="svc.isSubmitting() || !duplicateName().trim()"
              (click)="confirmDuplicate()"
              class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {{ duplicateNameTaken() ? 'Reemplazar y duplicar' : 'Duplicar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PromotionsPageComponent implements OnInit {
  readonly svc = inject(PromotionService);
  private readonly categories = inject(CategoryService);
  private readonly menu = inject(MenuService);
  private readonly presentations = inject(PresentationService);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly overlay = inject(Overlay);

  /** spec 084 (FR-026 a FR-028, bug 5): el menú de acciones se conecta al
   *  botón que lo abre, alineado por su borde derecho y abriendo hacia abajo
   *  (mismo lugar visual que el `<div class="absolute right-0 mt-1">`
   *  anterior) -- con una posición de respaldo hacia arriba si no cabe abajo. */
  readonly actionsMenuPositions: ConnectionPositionPair[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
  ];
  /** Cierra el menú al hacer scroll de la tabla (o de cualquier ancestro con
   *  scroll) en vez de recalcular su posición -- FR-028. */
  readonly actionsMenuScrollStrategy = this.overlay.scrollStrategies.close();

  readonly screen = signal<Screen>('list');
  readonly editingId = signal<string | null>(null);
  readonly editingSource = signal<Promotion | null>(null);
  readonly searchSignal = signal('');
  readonly formError = signal<string | null>(null);
  readonly bannerDismissed = signal(this.readDismissed());

  readonly duplicating = signal<Promotion | null>(null);
  readonly duplicateName = signal('');
  /** El nombre elegido ya lo usa otra promoción (el backend respondió 409): el siguiente
   *  intento pide reemplazarla, con aviso visible en el diálogo (spec 084, A-83). */
  readonly duplicateNameTaken = signal(false);

  /** Pantalla 1: menú de acciones desplegable, una fila a la vez. */
  readonly openActionsId = signal<string | null>(null);

  /** Pantalla 2 (creación): nombre + tipo, antes de tener un `PromotionForm`. */
  readonly createName = signal('');
  readonly createType = signal<PromotionType>('package_price');

  form: PromotionForm = emptyForm();
  /** Foto normalizada del formulario al abrir la configuración: `hasChanges()` la compara con
   *  el estado actual para habilitar «Guardar y sincronizar» solo cuando algo cambió. */
  private formBaseline = '';

  /** Pantalla 3, Paso 1: productos candidatos elegidos (persisten entre altas
   *  de filas, FR-014 — solo se limpian al abrir/cerrar la pantalla). */
  readonly candidateProductIds = signal<Set<string>>(new Set());
  stepOneFilter: StepOneFilter = { category: '', text: '' };

  /** Pantalla 3, Paso 2: la fila en construcción, nunca se guarda directo —
   *  "Agregar a la lista" la empuja a `form.rules`. Signals (no campos
   *  planos) para que `packagePriceCheck`/`packagePriceExceedsRegularSum`
   *  (FR-026) se recalculen solos cada vez que cambian (spec 083, sesión
   *  2026-09-17). */
  /** Presentación del catálogo elegida en el Paso 2 (spec 084, A-80): id, no etiqueta. */
  readonly pickerPresentationId = signal<string | null>(null);
  readonly pickerQty = signal(1);
  readonly pickerValue = signal(0);

  /** spec 084 (A-81): reglas de precio por presentación de la promoción en edición. Fuente
   *  de verdad de la lista del Paso 2; `form.rules` (lo que se envía al backend) se deriva de
   *  aquí × los productos seleccionados con `rebuildRules()`. */
  readonly presentationRules = signal<PresentationRule[]>([]);
  /** Reglas guardadas de una promoción abierta antes de que el menú termine de cargar: no se
   *  pueden agrupar por presentación sin el catálogo, así que esperan a que llegue. */
  private pendingSourceRules: Promotion['rules'] | null = null;
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    effect(() => {
      const ready = this.catalogVariants().length > 0;
      if (ready && this.pendingSourceRules) {
        untracked(() => {
          if (this.hydrateFromRules(this.pendingSourceRules!)) this.cdr.markForCheck();
        });
      }
    });
  }
  readonly pickerError = signal<string | null>(null);

  readonly statusTabs = STATUS_TABS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly days = DAY_LABELS.map((label, idx) => ({ label, idx }));

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  readonly editingStatus = computed<PromotionStatus>(() => this.editingSource()?.status ?? 'draft');
  readonly isDraft = computed(() => this.editingStatus() === 'draft');
  readonly isPaused = computed(() => this.editingStatus() === 'paused');
  readonly isReadOnly = computed(() => this.editingStatus() === 'finished');

  readonly showMigrationBanner = computed(
    () => !this.bannerDismissed() && this.svc.closedByRefactor().length > 0,
  );

  readonly catalogVariants = computed<CatalogVariant[]>(() => {
    const out: CatalogVariant[] = [];
    for (const cat of this.menu.categories()) {
      for (const prod of cat.products) {
        for (const v of prod.variants) {
          out.push({
            id: v.id,
            productId: prod.id,
            productName: prod.name,
            categoryId: cat.id,
            categoryName: cat.name,
            variantName: v.name,
            presentationId: v.presentation_id ?? '',
            price: v.price,
          });
        }
      }
    }
    return out;
  });

  /** Productos del catálogo agrupados (Paso 1) — cada uno con sus variantes,
   *  para resolver la etiqueta de presentación del Paso 2 (FR-013). */
  readonly catalogProducts = computed<CatalogProduct[]>(() => {
    const map = new Map<string, CatalogProduct>();
    for (const v of this.catalogVariants()) {
      let p = map.get(v.productId);
      if (!p) {
        p = {
          id: v.productId,
          name: v.productName,
          categoryId: v.categoryId,
          categoryName: v.categoryName,
          minPrice: v.price,
          variants: [],
        };
        map.set(v.productId, p);
      }
      p.variants.push(v);
      if (v.price < p.minPrice) p.minPrice = v.price;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  /**
   * spec 084 (FR-021/FR-022, A-78): productos ya cubiertos por alguna variante
   * de OTRA promoción `active` -- `productId -> nombre de esa promoción`. Sin
   * endpoint nuevo: `PromotionService.activePromotions` ya trae, para el POS
   * (spec 063), las promociones `active` con sus reglas y variantes completas
   * (tope 100); acá solo se cruza contra `catalogVariants()` para resolver el
   * producto de cada variante. La promoción en edición (`editingId()`) se
   * excluye siempre -- FR-024, dentro de la misma promoción no hay bloqueo.
   */
  readonly blockedByPromotion = computed<Map<string, string>>(() => {
    const variantToProduct = new Map(this.catalogVariants().map((v) => [v.id, v.productId]));
    const blocked = new Map<string, string>();
    for (const p of this.svc.activePromotions()) {
      if (p.id === this.editingId()) continue;
      for (const rule of p.rules) {
        for (const rv of rule.variants) {
          const productId = variantToProduct.get(rv.product_variant_id);
          if (productId && !blocked.has(productId)) blocked.set(productId, p.name);
        }
      }
    }
    return blocked;
  });

  /** Nombre de la promoción activa que ya cubre `productId`, o `null` si está libre. */
  blockedReason(productId: string): string | null {
    return this.blockedByPromotion().get(productId) ?? null;
  }

  readonly categoryFilterOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const v of this.catalogVariants()) seen.set(v.categoryId, v.categoryName);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly selectedCandidateProducts = computed<CatalogProduct[]>(() => {
    const ids = this.candidateProductIds();
    return this.catalogProducts().filter((p) => ids.has(p.id));
  });

  /** Presentaciones disponibles para el Paso 2 (spec 084, A-80): todas las activas del
   *  catálogo, independientes de los productos del Paso 1 (antes, FR-013 de spec 083,
   *  eran la unión de las variantes de los productos seleccionados). */
  readonly availablePresentations = computed(() =>
    this.presentations
      .allPresentations()
      .filter((p) => p.active)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  /** Cuántos de los productos seleccionados tienen la presentación elegida, para avisar
   *  antes de "Agregar a la lista". `null` si aún no hay presentación elegida. */
  readonly pickerMatchSummary = computed<{ matching: number; selected: number } | null>(() => {
    const id = this.pickerPresentationId();
    if (!id) return null;
    return {
      matching: this.matchingProductsForPresentation(id).length,
      selected: this.candidateProductIds().size,
    };
  });

  /** Reglas por presentación que hoy no alcanzan ningún producto seleccionado: no generan
   *  reglas de backend, así que no se persisten hasta que un producto seleccionado las tenga. */
  readonly unresolvedRuleCount = computed(
    () =>
      this.presentationRules().filter(
        (r) => this.matchingProductsForPresentation(r.presentationId).length === 0,
      ).length,
  );

  /** spec 063 (revisión 2026-09-01, FR-001a): variante repetida entre dos reglas del
   *  formulario — validación de cliente, antes de enviar (el servidor la revalida siempre).
   *  Método y no `computed`: lee `form.rules`, un objeto plano que se reemplaza y muta sin
   *  notificar; como `computed` recordaba el conflicto de una promoción abierta antes y
   *  bloqueaba el guardado de la siguiente. */
  sharedVariantConflict(): { a: number; b: number; variantLabel: string } | null {
    const rules = this.form.rules;
    const byId = new Map(this.catalogVariants().map((v) => [v.id, v]));
    for (let i = 0; i < rules.length; i++) {
      const setI = new Set(rules[i].variantIds);
      for (let j = i + 1; j < rules.length; j++) {
        const shared = rules[j].variantIds.find((id) => setI.has(id));
        if (shared) {
          const v = byId.get(shared);
          return { a: i, b: j, variantLabel: v ? `${v.productName} - ${v.variantName}` : shared };
        }
      }
    }
    return null;
  }

  /** FR-025 (spec 083, sesión 2026-09-17): unidades mínimas de la fila en
   *  construcción — 2 para precio de paquete, 1 para porcentaje. Método (no
   *  `computed`): depende de `form.type`, un campo plano fijado al entrar a
   *  la pantalla de configuración (mismo criterio que `stepOneResults()`). */
  minPickerQty(): number {
    return this.form.type === 'package_price' ? 2 : 1;
  }

  /** FR-026: recálculo dinámico del guard de precio de paquete —
   *  `_guard_package_is_discount` espejado — que se actualiza solo cada vez
   *  que cambian producto, presentación o unidades (los signals de los que
   *  depende). `null` si todavía no hay suficiente información para calcularlo. */
  readonly packagePriceCheck = computed<{ regularSum: number } | null>(() => {
    if (this.form.type !== 'package_price') return null;
    const presentationId = this.pickerPresentationId();
    if (!presentationId) return null;
    const variantIds = this.resolvedVariantIdsForPresentation(presentationId);
    const cheapest = this.cheapestPrice(variantIds);
    if (cheapest === null) return null;
    return { regularSum: this.pickerQty() * cheapest };
  });

  /** FR-026: `true` cuando el precio promocional actual no representa un
   *  ahorro frente a la suma de precios regulares — se recalcula cada vez
   *  que cambia producto, presentación, unidades o precio. */
  readonly packagePriceExceedsRegularSum = computed<boolean>(() => {
    const check = this.packagePriceCheck();
    if (!check) return false;
    return this.pickerValue() >= check.regularSum;
  });

  ngOnInit(): void {
    this.svc.load(1);
    this.categories.loadAllCategories();
    void this.menu.loadMenu();
    this.presentations.loadAllPresentations();
    this.svc.loadClosedByRefactor();
    // spec 084 (FR-021, A-78): promociones `active` para resolver
    // `blockedByPromotion()` en el Paso 1 -- mismo dato que ya consume el POS.
    this.svc.loadActive();
  }

  @HostListener('document:click')
  @HostListener('window:resize')
  closeActionsMenu(): void {
    this.openActionsId.set(null);
  }

  toggleActionsMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openActionsId.set(this.openActionsId() === id ? null : id);
  }

  selectTab(status: StatusTab): void {
    this.svc.setStatusFilter(status);
  }

  onSearchChange(value: string): void {
    this.searchSignal.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.svc.setSearch(value.trim()), 300);
  }

  displayOf(p: Promotion): PromoDisplay {
    return getPromoDisplay(p, this.svc.ready() ? this.svc.now() : new Date());
  }

  transitionsOf(p: Promotion): PromotionStatus[] {
    return PROMOTION_TRANSITIONS[p.status] ?? [];
  }

  /** FR-021: habilitado salvo que la promoción esté `Activa` por estado real
   *  (sin importar lo que diga el badge de estado visual derivado). */
  canDelete(p: Promotion): boolean {
    return p.status !== 'active';
  }

  /** spec 084 (FR-008/FR-009, A-76): mismo criterio que `canDelete` -- estado real,
   *  no el badge visual. Solo `active` bloquea "Configurar"; `draft`/`paused`/
   *  `finished` siguen abriendo la pantalla con todos los campos editables. */
  canConfigure(p: Promotion): boolean {
    return p.status !== 'active';
  }

  async changeStatus(p: Promotion, to: PromotionStatus): Promise<void> {
    const ok = await this.confirm.ask({
      title: `${this.statusVerb(to)} "${p.name}"`,
      message: `¿Seguro que quieres ${this.statusVerb(to).toLowerCase()} esta promoción? Afecta a sus ${p.rules.length} regla(s) a la vez.`,
    });
    if (!ok) return;
    const res = await this.svc.changeStatus(p.id, to);
    if (res) {
      this.toast.success('Estado actualizado');
    } else if (this.svc.overlapConflict()) {
      this.toast.error('Otra promoción activa ya cubre esas variantes en un horario que se cruza.');
    } else if (this.svc.otherError()) {
      this.toast.error(this.svc.otherError()!);
    }
  }

  async removePromotion(p: Promotion): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Eliminar "${p.name}"`,
      message: 'Esta acción no se puede deshacer.',
    });
    if (!ok) return;
    const done = await this.svc.remove(p.id);
    if (done) {
      this.toast.success('Promoción eliminada');
      this.svc.load();
    } else {
      this.toast.error(this.svc.otherError() ?? 'No se pudo eliminar.');
    }
  }

  // ───────────────────────── Pantalla 2: creación ─────────────────────────

  openNew(): void {
    this.createName.set('');
    this.createType.set('package_price');
    this.screen.set('create');
  }

  /** spec 083 (FR-020, A-75): crea la promoción de inmediato en `Borrador`
   *  con una lista de reglas vacía — no espera a la primera regla agregada
   *  en la pantalla de configuración. */
  async continueToConfigure(): Promise<void> {
    const name = this.createName().trim();
    if (!name) return;
    this.formError.set(null);
    const form: PromotionForm = {
      ...emptyForm(),
      name,
      type: this.createType(),
      // spec 127: día calendario LOCAL del tenant, no el día UTC -- en
      // Bogotá (UTC-5), `new Date().toISOString()` ya cae en "mañana" desde
      // las 19:00 locales, dejando la promoción con `starts_at` del día
      // siguiente (el defecto reportado).
      starts_at: businessToday(this.tenantInfo.info()?.timezone ?? DEFAULT_TIMEZONE),
    };
    const res = await this.svc.create(form, 'draft');
    if (!res) {
      this.formError.set(this.svc.otherError() ?? 'No se pudo crear la promoción.');
      return;
    }
    this.editingId.set(res.id);
    this.editingSource.set(res);
    this.form = form;
    this.resetRuleBuilder();
    this.formBaseline = this.snapshotForm();
    this.screen.set('configure');
  }

  // ───────────────────────── Pantalla 3: configuración ────────────────────

  openEdit(p: Promotion): void {
    // spec 084 (FR-008, A-76): defensa en profundidad -- el botón del listado ya
    // queda deshabilitado, pero esto cubre cualquier otra vía de llegar aquí
    // (p. ej. navegación directa) mientras la promoción siga `active`.
    if (!this.canConfigure(p)) return;
    this.editingId.set(p.id);
    this.editingSource.set(p);
    this.formError.set(null);
    const legacyType = p.rules[0]?.type;
    const type: PromotionType =
      legacyType === 'percent' || legacyType === 'package_price' ? legacyType : 'package_price';
    this.form = {
      name: p.name,
      starts_at: p.starts_at ? p.starts_at.slice(0, 10) : null,
      ends_at: p.ends_at ? p.ends_at.slice(0, 10) : null,
      days_of_week: p.days_of_week ? p.days_of_week.split(',').map(Number) : [],
      start_time: p.start_time ? p.start_time.slice(0, 5) : null,
      end_time: p.end_time ? p.end_time.slice(0, 5) : null,
      type,
      rules: p.rules.map((r) => ({
        type: r.type === 'percent' || r.type === 'package_price' ? r.type : type,
        value: Number(r.value),
        min_qty: r.min_qty,
        variantIds: r.variants.map((v) => v.product_variant_id),
      })),
    };
    this.resetRuleBuilder();
    // Agrupa las reglas guardadas por presentación y recupera los productos que cubren; si el
    // menú aún no cargó, queda pendiente (el `effect` del constructor lo reintenta).
    if (!this.hydrateFromRules(p.rules)) this.pendingSourceRules = p.rules;
    this.formBaseline = this.snapshotForm();
    this.screen.set('configure');
  }

  backToList(): void {
    this.screen.set('list');
  }

  /** FR-018: en `active`, las reglas quedan de solo lectura; en `finished`,
   *  toda la pantalla es de solo lectura. `draft`/`paused` permiten agregar,
   *  quitar y volver a agregar filas (no hay edición in-situ, FR-014/016). */
  canEditRuleSet(): boolean {
    return !this.isReadOnly() && (this.isDraft() || this.isPaused());
  }

  toggleDay(idx: number): void {
    if (this.isReadOnly()) return;
    const i = this.form.days_of_week.indexOf(idx);
    if (i >= 0) this.form.days_of_week.splice(i, 1);
    else this.form.days_of_week.push(idx);
  }

  // ── Paso 1 ──

  private resetRuleBuilder(): void {
    this.candidateProductIds.set(new Set());
    this.presentationRules.set([]);
    this.pendingSourceRules = null;
    this.stepOneFilter = { category: '', text: '' };
    this.pickerPresentationId.set(null);
    this.pickerQty.set(this.minPickerQty());
    this.pickerValue.set(0);
    this.pickerError.set(null);
  }

  /** Igual que en el diseño anterior: sin categoría ni texto, no se lista el
   *  catálogo completo por defecto. Método (no `computed`): depende de
   *  `stepOneFilter`, un objeto plano mutado por `ngModel`. */
  stepOneResults(): CatalogProduct[] {
    const text = this.stepOneFilter.text.trim().toLowerCase();
    const cat = this.stepOneFilter.category;
    if (!cat && !text) return [];
    return this.catalogProducts().filter((p) => {
      if (cat && p.categoryId !== cat) return false;
      if (text && !p.name.toLowerCase().includes(text)) return false;
      return true;
    });
  }

  isProductSelected(id: string): boolean {
    return this.candidateProductIds().has(id);
  }

  toggleProductCandidate(id: string): void {
    const next = new Set(this.candidateProductIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      // spec 084 (FR-021/FR-022, A-78): no se puede seleccionar un producto
      // que ya hace parte de otra promoción activa -- defensa en profundidad
      // además del estado visual deshabilitado de la tarjeta.
      const reason = this.blockedReason(id);
      if (reason) {
        this.pickerError.set(`Ese producto ya hace parte de la promoción activa «${reason}».`);
        return;
      }
      next.add(id);
    }
    this.candidateProductIds.set(next);
    // Las reglas son por presentación (A-81): cambiar productos solo cambia a qué variantes
    // se expanden, no las obliga a rehacerse. La presentación del picker tampoco se reinicia.
    this.rebuildRules();
    this.pickerError.set(null);
  }

  // ── Paso 2 ──

  /** Nombre a mostrar de una variante: el de su presentación (spec 084, A-79/A-80).
   *  Antes (FR-013 de spec 083) un producto con una sola variante se etiquetaba siempre
   *  "Presentación única"; ya no: la presentación de cada variante es siempre real. */
  variantLabel(v: CatalogVariant): string {
    return v.variantName;
  }

  /**
   * spec 084 (FR-016 a FR-019, A-77, A-80): productos ya seleccionados en el Paso 1 que
   * tienen una variante de la presentación elegida, cada uno con SU PROPIA variante —
   * reemplaza el conjunto plano que `addRuleRow()` combinaba antes en una sola regla
   * compartida entre varios productos. Se empareja por `presentation_id`, no por texto.
   */
  private matchingProductsForPresentation(
    presentationId: string,
  ): { productId: string; productName: string; variantId: string }[] {
    const ids = this.candidateProductIds();
    const out: { productId: string; productName: string; variantId: string }[] = [];
    for (const p of this.catalogProducts()) {
      if (!ids.has(p.id)) continue;
      const match = p.variants.find((v) => v.presentationId === presentationId);
      if (match) out.push({ productId: p.id, productName: p.name, variantId: match.id });
    }
    return out;
  }

  resolvedVariantIdsForPresentation(presentationId: string): string[] {
    return this.matchingProductsForPresentation(presentationId).map((m) => m.variantId);
  }

  private cheapestPrice(variantIds: string[]): number | null {
    const set = new Set(variantIds);
    const prices = this.catalogVariants()
      .filter((v) => set.has(v.id))
      .map((v) => v.price);
    return prices.length ? Math.min(...prices) : null;
  }

  canAddRuleRow(): boolean {
    const minQty = this.minPickerQty();
    if (!this.pickerPresentationId() || this.pickerQty() < minQty || this.pickerValue() <= 0) {
      return false;
    }
    return !(this.form.type === 'package_price' && this.packagePriceExceedsRegularSum());
  }

  /** FR-016/FR-025/FR-026: validación local — feedback inmediato antes de
   *  enviar; la autoritativa sigue siendo el 409 del backend
   *  (`_guard_package_is_discount`/`PromotionRuleIn`).
   *
   *  spec 084 (A-81): agrega UNA regla por presentación a la lista, sin importar cuántos
   *  productos haya seleccionados (ni si ya hay alguno). Al guardar se expande a una regla
   *  de backend por producto seleccionado que tenga la presentación. Una presentación solo
   *  puede tener una regla por promoción: para cambiar su precio se quita y se vuelve a
   *  agregar. */
  addRuleRow(): void {
    this.pickerError.set(null);
    const presentationId = this.pickerPresentationId();
    if (!presentationId) {
      this.pickerError.set('Elige una presentación.');
      return;
    }
    if (this.presentationRules().some((r) => r.presentationId === presentationId)) {
      this.pickerError.set(
        'Ya hay una regla para esta presentación. Quítala de la lista para cambiar sus unidades o su precio.',
      );
      return;
    }
    const minQty = this.minPickerQty();
    if (this.pickerQty() < minQty) {
      this.pickerError.set(
        this.form.type === 'package_price'
          ? 'En promociones por paquete, el mínimo es de 2 unidades'
          : 'Las unidades deben ser al menos 1.',
      );
      return;
    }
    if (this.form.type === 'percent' && (this.pickerValue() <= 0 || this.pickerValue() > 100)) {
      this.pickerError.set('El porcentaje debe estar entre 1 y 100.');
      return;
    }
    if (this.form.type === 'package_price') {
      if (this.pickerValue() <= 0) {
        this.pickerError.set('El precio debe ser mayor a 0.');
        return;
      }
      if (this.packagePriceExceedsRegularSum()) {
        const regularSum = this.packagePriceCheck()?.regularSum ?? 0;
        this.pickerError.set(
          `El precio promocional (${this.money(this.pickerValue())}) debe ser menor a la suma ` +
            `del precio regular de los productos seleccionados (${this.money(regularSum)}).`,
        );
        return;
      }
    }

    this.presentationRules.update((rules) => [
      ...rules,
      { presentationId, min_qty: this.pickerQty(), value: this.pickerValue() },
    ]);
    this.rebuildRules();
    this.resetPicker();
  }

  /** `form.rules` (lo que recibe el backend) = por cada regla de presentación, una regla
   *  por cada producto seleccionado que tenga esa presentación, con SU PROPIA variante
   *  (spec 084 FR-017/FR-019, A-77 — nunca variantes de más de un producto en la misma
   *  regla). Una regla de presentación sin ningún producto que la tenga no genera nada. */
  private rebuildRules(): void {
    const rules: PromotionRuleForm[] = [];
    for (const pr of this.presentationRules()) {
      for (const m of this.matchingProductsForPresentation(pr.presentationId)) {
        rules.push({
          type: this.form.type,
          value: pr.value,
          min_qty: pr.min_qty,
          variantIds: [m.variantId],
        });
      }
    }
    this.form.rules = rules;
  }

  /** Reconstruye la lista por presentación y la selección de productos a partir de las reglas
   *  guardadas: cada variante aporta su presentación y su producto; las variantes con la
   *  misma presentación, tipo, valor y unidades forman una sola regla. `false` si el menú
   *  aún no cargó (se reintenta cuando llegue). Variantes que ya no están en el menú (p. ej.
   *  de un producto inactivo) no se pueden mostrar y se descartan al guardar. */
  private hydrateFromRules(rules: Promotion['rules']): boolean {
    const byId = new Map(this.catalogVariants().map((v) => [v.id, v]));
    if (rules.length > 0 && byId.size === 0) return false;

    const grouped = new Map<string, PresentationRule>();
    const products = new Set<string>();
    for (const r of rules) {
      for (const pv of r.variants) {
        const cv = byId.get(pv.product_variant_id);
        if (!cv) continue;
        products.add(cv.productId);
        const value = Number(r.value);
        const key = `${cv.presentationId}|${value}|${r.min_qty}`;
        if (!grouped.has(key)) {
          grouped.set(key, { presentationId: cv.presentationId, min_qty: r.min_qty, value });
        }
      }
    }
    this.candidateProductIds.set(products);
    this.presentationRules.set([...grouped.values()]);
    this.rebuildRules();
    this.pendingSourceRules = null;
    this.formBaseline = this.snapshotForm();
    return true;
  }

  private resetPicker(): void {
    this.pickerPresentationId.set(null);
    this.pickerQty.set(this.minPickerQty());
    this.pickerValue.set(0);
  }

  /** FR-025: clamp del input de unidades — nunca por debajo del mínimo del
   *  tipo de promoción actual. */
  onPickerQtyChange(value: number): void {
    const min = this.minPickerQty();
    if (value < min) {
      this.pickerError.set(
        this.form.type === 'package_price'
          ? 'En promociones por paquete, el mínimo es de 2 unidades'
          : 'Las unidades deben ser al menos 1.',
      );
    } else {
      this.pickerError.set(null);
    }
    this.pickerQty.set(Math.max(value, min));
  }

  removeRuleRow(index: number): void {
    if (!this.canEditRuleSet()) return;
    this.presentationRules.update((rules) => rules.filter((_, i) => i !== index));
    this.rebuildRules();
  }

  /** Nombre de una presentación del catálogo (activa o no), o `''` si no se conoce. */
  presentationName(presentationId: string): string {
    return (
      this.presentations.allPresentations().find((p) => p.id === presentationId)?.name ??
      this.catalogVariants().find((v) => v.presentationId === presentationId)?.variantName ??
      ''
    );
  }

  /** "Presentación" de una fila ya agregada (tabla del Paso 2): su nombre + los productos
   *  seleccionados a los que se aplica (FR-014, `setDescriptor` de spec 066 para el orden y
   *  el tope de nombres). */
  ruleProductsLabel(rule: PresentationRule): string {
    const label = this.presentationName(rule.presentationId) || 'Presentación';
    const names = this.matchingProductsForPresentation(rule.presentationId).map((m) => m.productName);
    if (names.length === 0) return `${label} · sin productos seleccionados con esta presentación`;
    const descriptor = setDescriptor(names);
    return descriptor ? `${label} · ${descriptor.text}` : label;
  }

  /** Vista previa de ahorro (FR-015): mirror local del precio regular
   *  estimado (unidades × precio más barato entre los productos a los que aplica) —
   *  el efectivo real lo resuelve siempre el backend en el preview de cobro. */
  previewSavings(rule: PresentationRule): { regular: number; amountOff: number } | null {
    const cheapest = this.cheapestPrice(this.resolvedVariantIdsForPresentation(rule.presentationId));
    if (cheapest === null) return null;
    const regular = rule.min_qty * cheapest;
    const special =
      this.form.type === 'package_price' ? rule.value : regular * (1 - rule.value / 100);
    return { regular, amountOff: Math.max(0, regular - special) };
  }

  // ── Guardado ──

  /** El formulario es un objeto plano mutado por `ngModel`, no un signal: se compara por
   *  valor, normalizando lo que no cambia el significado (orden de días y de variantes). */
  private snapshotForm(): string {
    const f = this.form;
    return JSON.stringify({
      name: f.name.trim(),
      starts_at: f.starts_at || null,
      ends_at: f.ends_at || null,
      days: [...f.days_of_week].sort((a, b) => a - b),
      start_time: f.start_time || null,
      end_time: f.end_time || null,
      type: f.type,
      rules: f.rules.map((r) => ({
        type: r.type,
        value: Number(r.value),
        min_qty: Number(r.min_qty),
        variantIds: [...r.variantIds].sort(),
      })),
      // spec 084 (A-81): la lista por presentación y los productos elegidos también cuentan.
      presentationRules: this.presentationRules()
        .map((r) => ({ p: r.presentationId, q: Number(r.min_qty), v: Number(r.value) }))
        .sort((a, b) => a.p.localeCompare(b.p)),
      products: [...this.candidateProductIds()].sort(),
    });
  }

  /** `true` si el formulario difiere de como se abrió la configuración. */
  hasChanges(): boolean {
    return this.snapshotForm() !== this.formBaseline;
  }

  formValid(): boolean {
    if (!this.form.name.trim()) return false;
    if (!this.form.starts_at) return false;
    if (this.form.rules.length === 0) return false;
    if (!!this.form.start_time !== !!this.form.end_time) return false;
    if (this.sharedVariantConflict()) return false;
    for (const rule of this.form.rules) {
      if (rule.variantIds.length === 0) return false;
      if (rule.type === 'percent' && (rule.value <= 0 || rule.value > 100)) return false;
      if (rule.type === 'package_price' && rule.value <= 0) return false;
      if (rule.min_qty < 1) return false;
    }
    return true;
  }

  async saveConfigure(): Promise<void> {
    this.formError.set(null);
    this.svc.overlapConflict.set(null);
    this.svc.packageNotDiscount.set(null);
    this.svc.ruleVariantConflict.set(null);
    if (!this.formValid()) {
      this.formError.set(
        'Revisa los campos: nombre, fecha de inicio, y al menos una regla con su presentación, unidades y precio.',
      );
      return;
    }

    // spec 083 (FR-020, A-75): al llegar a esta pantalla la promoción ya
    // existe en base de datos (creada en Borrador desde "Continuar", o
    // abierta para editar desde el listado) — `saveConfigure` nunca crea.
    const id = this.editingId()!;
    let res: Promotion | null;
    // spec 127 (FR-005): `starts_at` solo se reenvía mientras sigue en
    // `draft` -- el backend rechaza con 409 cualquier otro estado, igual que
    // el campo del formulario queda deshabilitado fuera de `draft`.
    if (this.isDraft() || this.isPaused()) {
      res = await this.svc.updateShape(id, this.form);
      if (res) res = await this.svc.update(id, this.form, this.isDraft());
    } else {
      res = await this.svc.update(id, this.form, this.isDraft());
    }

    if (res) {
      this.toast.success('Promoción actualizada');
      this.screen.set('list');
      this.svc.load();
    } else if (
      this.svc.overlapConflict() ||
      this.svc.packageNotDiscount() ||
      this.svc.ruleVariantConflict()
    ) {
      // Se muestran inline, debajo de las reglas.
    } else {
      this.formError.set(this.svc.otherError() ?? 'No se pudo guardar.');
    }
  }

  startDuplicate(p: Promotion): void {
    this.duplicating.set(p);
    this.duplicateName.set(`${p.name} (copia)`);
    this.duplicateNameTaken.set(false);
  }

  onDuplicateNameChange(value: string): void {
    this.duplicateName.set(value);
    this.duplicateNameTaken.set(false); // otro nombre: ya no hay nada que reemplazar
  }

  /** spec 084 (A-83): si el nombre ya lo usa otra promoción, el primer intento solo lo avisa
   *  en el diálogo; el siguiente ("Reemplazar y duplicar") la elimina y crea la copia. */
  async confirmDuplicate(): Promise<void> {
    const src = this.duplicating();
    if (!src) return;
    const replacing = this.duplicateNameTaken();
    const res = await this.svc.duplicate(src.id, this.duplicateName().trim(), replacing);
    if (res) {
      this.toast.success(
        replacing ? 'Copia creada; la promoción anterior se reemplazó' : 'Copia creada en Borrador',
      );
      this.duplicating.set(null);
      this.duplicateNameTaken.set(false);
      this.svc.load();
      this.openEdit(res);
    } else if (!replacing && this.svc.otherError() === NAME_TAKEN_MESSAGE) {
      this.svc.otherError.set(null); // se avisa en el diálogo, no como error de la lista
      this.duplicateNameTaken.set(true);
    } else {
      this.toast.error(this.svc.otherError() ?? 'No se pudo duplicar.');
    }
  }

  dismissBanner(): void {
    this.bannerDismissed.set(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  money(n: number): string {
    return formatMoney(n);
  }

  typeLabel(type: string): string {
    switch (type) {
      case 'percent':
        return 'Descuento %';
      case 'package_price':
        return 'Precio de paquete';
      case 'combo':
        return 'Combo (finalizada)';
      case 'qty_price':
      case 'qty_price_presentation':
        return 'Precio por cantidad (finalizada)';
      case 'fixed':
        return 'Monto fijo (finalizada)';
      default:
        return type;
    }
  }

  /** FR-017: la columna "Reglas" del listado muestra únicamente el tipo. */
  promotionTypeLabel(p: Promotion): string {
    if (p.rules.length === 0) return 'Sin reglas';
    const types = new Set(p.rules.map((r) => r.type));
    return types.size === 1 ? this.typeLabel(p.rules[0].type) : 'Tipos mixtos';
  }

  statusVerb(to: PromotionStatus): string {
    switch (to) {
      case 'active':
        return 'Activar';
      case 'paused':
        return 'Pausar';
      case 'finished':
        return 'Finalizar';
      default:
        return to;
    }
  }

  vigencia(p: Promotion): string {
    const parts: string[] = [];
    if (p.days_of_week) {
      parts.push(
        'los ' +
          p.days_of_week
            .split(',')
            .map((d) => DAY_FULL[Number(d)])
            .join(', '),
      );
    }
    if (p.start_time && p.end_time)
      parts.push(`de ${fmtTime(p.start_time)} a ${fmtTime(p.end_time)}`);
    if (p.ends_at) parts.push(`hasta el ${fmtDate(p.ends_at)}`);
    return parts.length ? parts.join(', ') : 'Todos los días';
  }

  vigenciaPreview(): string {
    const parts: string[] = [];
    if (this.form.days_of_week.length) {
      parts.push('los ' + this.form.days_of_week.map((i) => DAY_FULL[i]).join(', '));
    }
    if (this.form.start_time && this.form.end_time) {
      parts.push(`de ${fmtTime(this.form.start_time)} a ${fmtTime(this.form.end_time)}`);
    }
    if (this.form.ends_at) parts.push(`hasta el ${fmtDate(this.form.ends_at)}`);
    return parts.length ? parts.join(', ') : 'Todos los días, sin límite';
  }

  rawStatusLabel(status: PromotionStatus): string {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'active':
        return 'Activa';
      case 'paused':
        return 'En pausa';
      case 'finished':
        return 'Finalizada';
      default:
        return status;
    }
  }

  displayLabel(d: PromoDisplay): string {
    switch (d) {
      case 'draft':
        return 'Borrador';
      case 'live':
        return 'Vigente';
      case 'out_of_window':
        return 'Fuera de horario';
      case 'scheduled':
        return 'Programada';
      case 'expired':
        return 'Vencida';
      case 'paused':
        return 'En pausa';
      case 'finished':
        return 'Finalizada';
    }
  }

  displayClass(d: PromoDisplay): string {
    switch (d) {
      case 'live':
        return 'bg-green-100 text-green-700';
      case 'draft':
      case 'scheduled':
        return 'bg-gray-100 text-gray-600';
      case 'out_of_window':
        return 'bg-amber-100 text-amber-700';
      case 'expired':
      case 'finished':
        return 'bg-gray-100 text-gray-400';
      case 'paused':
        return 'bg-orange-100 text-orange-700';
    }
  }
}
