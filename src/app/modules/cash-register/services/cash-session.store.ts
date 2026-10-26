import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { ActiveOrderSummary } from '../../dashboard/interfaces/shift-reports.interface';
import { PaymentMethodService } from '../../sales/services/payment-method.service';
import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import {
  CashMovement,
  CashRegister,
  CashShift,
  CatalogDenomination,
  DenominationIn,
  MovementKind,
  Page,
  Reconciliation,
  ShiftReport,
  ShiftSummary,
} from '../interfaces/cash.interface';
import {
  CashModal,
  CashScreen,
  CatalogoEstado,
  Denomination,
  DesgloseRow,
  Indicadores,
  MovementRow,
  MovementView,
  RegisterStatus,
  TagVariant,
  VentaPorMetodo,
} from '../interfaces/cash-session.interface';
import { CashService } from './cash.service';
import { TenantDatePipe } from '../../../shared/pipes/tenant-date.pipe';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { slugify } from '../../../shared/slug.util';

const REGISTER_STORAGE_KEY = 'cash.register';

/**
 * Fechas y horas del módulo de caja en formato de 12 horas (`05:49 PM`), siempre en la
 * zona horaria del negocio: `TenantDatePipe` aplica la del tenant (no la del navegador).
 */
const FORMATO_FECHA_HORA = 'dd/MM/yyyy hh:mm a';
const FORMATO_HORA = 'hh:mm a';

/**
 * Ventas del turno por método de pago, tal cual las manda el arqueo.
 *
 * El backend ya devuelve una fila por cada método activo del negocio —incluidos
 * los que no vendieron nada— y las ordena con el efectivo primero, así que aquí
 * solo se convierten los importes, que viajan como string.
 */
export function mapVentasPorMetodo(recon: Reconciliation | null): VentaPorMetodo[] {
  return (recon?.sales_by_method ?? [])
    // `type: 'mixed'` no es un método real que el cliente eligió -- es la
    // etiqueta de un pago con varias líneas (spec 112); una tarjeta propia
    // para él no aporta nada (siempre sale en $0, nadie "vende en mixto").
    .filter((m) => m.method_type !== 'mixed')
    .map((m) => ({
      id: m.method_id,
      name: m.method_name,
      type: m.method_type,
      total: Number(m.total) || 0,
      count: Number(m.count) || 0,
    }));
}

/**
 * Store del Módulo de Caja (rediseño SkeiloPOS) respaldado por el backend real
 * (`/api/v1/cash/*` vía {@link CashService}). Mantiene el estado de UI en señales
 * y orquesta las llamadas HTTP; los subcomponentes leen/accionan aquí.
 *
 * Se provee a nivel de `CashPageComponent` (no en root) para compartir instancia
 * entre subcomponentes y arrancar limpio en cada visita.
 */
@Injectable()
export class CashSessionStore {
  private readonly api = inject(CashService);
  private readonly auth = inject(AuthService);
  private readonly tenantDate = inject(TenantDatePipe);
  private readonly tenantInfo = inject(TenantInfoService);
  private readonly paymentMethodApi = inject(PaymentMethodService);

  /** Categorías sugeridas por tipo de movimiento manual. */
  readonly CATS: Record<MovementKind, string[]> = {
    ingreso: ['Cambio inicial', 'Préstamo de caja', 'Ajuste', 'Otro'],
    egreso: ['Gastos menores', 'Pago a domiciliario', 'Otro'],
    retiro: ['Consignación bancaria', 'Seguridad', 'Otro'],
  };

  private readonly LABELS: Record<MovementKind, string> = {
    ingreso: 'Ingreso',
    egreso: 'Egreso',
    retiro: 'Retiro',
  };

  private readonly TAG_VARIANT: Record<MovementKind, TagVariant> = {
    ingreso: 'accent',
    egreso: 'outline',
    retiro: 'outline',
  };

  private readonly MODAL_TITLES: Record<Exclude<CashModal, null>, string> = {
    ingreso: 'Registrar ingreso',
    egreso: 'Registrar egreso',
    retiro: 'Registrar retiro de efectivo',
    arqueo: 'Arqueo de caja',
  };

  // ─── Estado ────────────────────────────────────────────────────────────────
  readonly screen = signal<CashScreen>('apertura');
  /** Cajas y turno abierto: señales compartidas con {@link CashService} (las lee ventas). */
  readonly registers = this.api.registers;
  readonly shift = this.api.shift;
  readonly selectedRegisterId = signal('');
  readonly newRegisterName = signal('');
  readonly openingAmount = signal(0);

  readonly reconciliation = signal<Reconciliation | null>(null);
  readonly movements = signal<CashMovement[]>([]);
  readonly report = signal<ShiftReport | null>(null);

  /** Vista de gestión (solo admin): estado de todas las cajas. */
  readonly overview = signal<RegisterStatus[]>([]);

  /** Histórico de cierres (solo admin). */
  readonly history = signal<Page<ShiftSummary> | null>(null);
  readonly historyRegisterFilter = signal('');
  /** Contexto del reporte visible: 'live' (recién cerrado) o 'history'. */
  readonly reportContext = signal<'live' | 'history'>('live');

  readonly vista = signal<MovementView>('tabla');
  readonly modal = signal<CashModal>(null);
  // Formulario de movimiento (ingreso/egreso/retiro)
  readonly formCategoria = signal('');
  readonly formMonto = signal('');
  readonly formNota = signal('');
  // spec 135 (US2/US3): método de pago del ingreso -- solo aplica a
  // `kind === 'ingreso'` (egreso/retiro siguen forzados a efectivo, sin
  // selector). `formSegundoMetodo`/`formSegundoMonto` son la 2da línea de un
  // ingreso mixto, habilitada con "Agregar otro método" (FR-004/FR-005).
  readonly paymentMethods = this.paymentMethodApi.checkoutOptions;
  readonly formPaymentMethodId = signal('');
  readonly formSegundaLinea = signal(false);
  readonly formSegundoMetodo = signal('');
  readonly formSegundoMonto = signal('');
  // Arqueo
  readonly denomCounts = signal<Record<number, string>>({});
  readonly arqueoObservacion = signal('');
  /**
   * spec 121 (FR-009/FR-013): catálogo de denominaciones del negocio, de mayor a
   * menor. Es la ÚNICA fuente de las filas del arqueo (ya no hay lista fija en el
   * cliente); se consulta cada vez que se abre el modal, sin caché entre aperturas.
   */
  readonly catalogo = signal<CatalogDenomination[]>([]);
  readonly catalogoEstado = signal<CatalogoEstado>('cargando');
  /** Descarta la respuesta de una consulta del catálogo superada por otra más reciente. */
  private catalogoSeq = 0;
  /** spec 119 (FR-007/FR-008): pedidos activos que bloquean el cierre, del
   * cuerpo del 409 de `POST /cash/shifts/{id}/close`. Vacío = sin bloqueo. */
  readonly activeOrdersBlocking = signal<ActiveOrderSummary[]>([]);

  readonly loading = signal(false);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);

  /** Reloj para refrescar la duración del turno cada 30 s. */
  private readonly nowTick = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  // ─── Derivados ───────────────────────────────────────────────────────────────
  readonly cajero = computed(() => this.auth.currentUser()?.name ?? 'Cajero');
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === UserRole.ADMIN);

  readonly selectedRegister = computed(
    () => this.registers().find((r) => r.id === this.selectedRegisterId()) ?? null,
  );

  /** Nombre de la caja para la barra superior / reporte. */
  readonly cajaLabel = computed(() => {
    const s = this.shift();
    if (s) {
      return this.registers().find((r) => r.id === s.cash_register_id)?.name ?? 'Caja';
    }
    return this.selectedRegister()?.name ?? '—';
  });

  readonly indicadores = computed<Indicadores>(() => {
    const r = this.reconciliation();
    const movs = this.movements();
    const ingresosByMethod = r?.ingresos_by_method ?? [];
    return {
      ventas: mapVentasPorMetodo(r),
      cambioEntregado: this.num(r?.cambio_entregado),
      ingresos: this.num(r?.ingresos),
      egresos: this.num(r?.egresos),
      retiros: this.num(r?.retiros),
      efectivoEsperado: this.num(r?.expected),
      // `ingresos` (arriba) ya es solo-efectivo (FR-007) -- su contador debe
      // coincidir: total de líneas `ingreso` menos las que son digitales
      // (`countIngresosDigitales`), no todas las líneas `ingreso` sin filtrar.
      countIngresos:
        movs.filter((m) => m.kind === 'ingreso').length -
        ingresosByMethod.reduce((sum, m) => sum + (m.count || 0), 0),
      countEgresos: movs.filter((m) => m.kind === 'egreso').length,
      countRetiros: movs.filter((m) => m.kind === 'retiro').length,
      // spec 135 (FR-007/FR-008): no suman a `ingresos`/`efectivoEsperado` --
      // se muestran aparte para que un ingreso en Nequi no "desaparezca".
      ingresosDigitales: ingresosByMethod.reduce((sum, m) => sum + (this.num(m.total) || 0), 0),
      countIngresosDigitales: ingresosByMethod.reduce((sum, m) => sum + (m.count || 0), 0),
    };
  });

  readonly efectivoEsperado = computed(() => this.indicadores().efectivoEsperado);

  readonly movimientosView = computed<MovementRow[]>(() =>
    this.movements().map((m) => ({
      id: m.id,
      hora: this.fmtTime(m.occurred_at),
      label: this.LABELS[m.kind] ?? m.kind,
      tagVariant: this.TAG_VARIANT[m.kind] ?? 'neutral',
      montoFmt: (m.kind === 'egreso' || m.kind === 'retiro' ? '- ' : '+ ') + this.fmt(this.num(m.amount)),
      usuario: m.user_name ?? this.cajero(),
      nota: m.category
        ? m.category + (m.description && m.description !== m.category ? ' · ' + m.description : '')
        : m.description || '—',
      metodoPago: m.payment_method_name,
      groupId: m.group_id ?? null,
    })),
  );

  readonly sinMovimientos = computed(() => this.movements().length === 0);

  readonly modalTitulo = computed(() => {
    const m = this.modal();
    return m ? this.MODAL_TITLES[m] : '';
  });

  readonly categoriasModal = computed<string[]>(() => {
    const m = this.modal();
    return m && m !== 'arqueo' ? this.CATS[m] : [];
  });

  /** spec 135: el selector de método solo aplica a un ingreso -- egreso/
   * retiro siguen forzados a efectivo en el backend, sin que el cajero elija. */
  readonly esIngreso = computed(() => this.modal() === 'ingreso');

  /** FR-013: "Agregar otro método" no tiene sentido (ni se muestra) si el
   * tenant no tiene al menos 2 métodos activos. */
  readonly puedeAgregarSegundoMetodo = computed(
    () => this.esIngreso() && !this.formSegundaLinea() && this.paymentMethods().length >= 2,
  );

  /** Métodos disponibles para la línea 1: excluye el ya elegido en la línea 2
   * (mismo patrón que `payment-input.component.ts`, spec 135/A-146). */
  readonly metodosLinea1 = computed(() => this.metodosDisponiblesPara(this.formSegundoMetodo()));

  /** Métodos disponibles para la línea 2: excluye el ya elegido en la línea 1. */
  readonly metodosLinea2 = computed(() => this.metodosDisponiblesPara(this.formPaymentMethodId()));

  private metodosDisponiblesPara(excluirId: string): PaymentMethodCheckoutOption[] {
    return this.paymentMethods().filter((m) => m.id !== excluirId);
  }

  readonly movimientoDisabled = computed(() => {
    if (!this.formMonto() || Number(this.formMonto()) <= 0) return true;
    if (!this.esIngreso()) return false;
    if (!this.formPaymentMethodId()) return true;
    if (
      this.formSegundaLinea() &&
      (!this.formSegundoMetodo() || !this.formSegundoMonto() || Number(this.formSegundoMonto()) <= 0)
    ) {
      return true;
    }
    return false;
  });

  /** El catálogo no se pudo cargar, o cargó vacío: no se puede contar (FR-013). */
  readonly catalogoError = computed(
    () =>
      this.catalogoEstado() === 'error' ||
      (this.catalogoEstado() === 'listo' && this.catalogo().length === 0),
  );

  readonly denominaciones = computed<Denomination[]>(() =>
    this.catalogo().map((c) => {
      const value = Number(c.denomination);
      const cantidad = Number(this.denomCounts()[value]) || 0;
      const subtotal = value * cantidad;
      return {
        value,
        label: value >= 1000 ? this.fmt(value) : '$ ' + value,
        kind: c.kind,
        kindLabel: c.kind === 'billete' ? 'Billete' : 'Moneda',
        cantidad,
        subtotal,
        subtotalFmt: this.fmt(subtotal),
      };
    }),
  );

  /** Estimación local; el valor oficial lo calcula el servidor al cerrar (D-1). */
  readonly totalContado = computed(() =>
    this.catalogo().reduce(
      (sum, c) => sum + Number(c.denomination) * (Number(this.denomCounts()[Number(c.denomination)]) || 0),
      0,
    ),
  );

  readonly contadoIngresado = computed(() =>
    this.catalogo().some((c) => (Number(this.denomCounts()[Number(c.denomination)]) || 0) > 0),
  );

  readonly diferenciaLive = computed(() =>
    this.contadoIngresado() ? this.totalContado() - this.efectivoEsperado() : 0,
  );

  readonly requiereObservacion = computed(
    () => this.contadoIngresado() && this.diferenciaLive() !== 0,
  );

  readonly arqueoDisabled = computed(
    () =>
      this.isSubmitting() ||
      this.catalogoEstado() !== 'listo' ||
      this.catalogo().length === 0 ||
      !this.contadoIngresado() ||
      (this.diferenciaLive() !== 0 && !this.arqueoObservacion().trim()),
  );

  // ─── Desglose del conteo en el reporte de cierre (spec 121, FR-020/FR-021) ──────
  readonly desgloseView = computed<DesgloseRow[]>(() =>
    (this.report()?.denominations ?? []).map((l) => ({
      denominacionFmt: this.fmt(this.num(l.denomination)),
      tipoLabel: l.kind === 'billete' ? 'Billete' : 'Moneda',
      cantidad: l.quantity,
      subtotalFmt: this.fmt(this.num(l.subtotal)),
    })),
  );

  /** Σ de los subtotales de las líneas (no de `counted_amount`): así FR-021 se ve a simple vista. */
  readonly desgloseTotal = computed(() =>
    (this.report()?.denominations ?? []).reduce((sum, l) => sum + this.num(l.subtotal), 0),
  );

  readonly sinDesglose = computed(() => (this.report()?.denominations ?? []).length === 0);

  /** Quien confirmó el conteo; `null` en turnos cerrados antes de la spec 121 (no se infiere). */
  readonly contadoPor = computed(() => this.shift()?.closed_by_user_name || null);

  readonly aperturaDisabled = computed(
    () => this.isSubmitting() || !this.selectedRegisterId() || this.openingAmount() <= 0,
  );

  readonly turnoDuracion = computed(() => {
    this.nowTick();
    return this.fmtDuration(this.shift()?.opened_at ?? null);
  });

  readonly aperturaFmt = computed(() => this.fmtDate(this.shift()?.opened_at ?? null));
  readonly cierreFmt = computed(() => this.fmtDate(this.shift()?.closed_at ?? null));

  // ─── Ciclo de vida ───────────────────────────────────────────────────────────
  async init(): Promise<void> {
    this.timer ??= setInterval(() => this.nowTick.set(Date.now()), 30000);
    this.loading.set(true);
    this.error.set(null);
    try {
      const regs = await this.api.listRegisters();
      this.registers.set(regs);

      if (this.isAdmin()) {
        // Admin: aterriza en la gestión de todas las cajas. Se restaura el turno
        // compartido en segundo plano para no romper el contexto del POS.
        void this.api.discoverOpenShift();
        await this.loadOverview(regs);
        this.screen.set('overview');
        return;
      }

      // Cajero: flujo directo a su turno (restaurado de la última caja usada).
      const storedId = localStorage.getItem(REGISTER_STORAGE_KEY);
      const target = regs.find((r) => r.id === storedId) ?? null;
      if (target) {
        this.selectedRegisterId.set(target.id);
        try {
          const shift = await this.api.getCurrentShift(target.id);
          await this.loadShiftData(shift);
          this.screen.set('dashboard');
        } catch {
          // 404 = la caja no tiene turno abierto → quedarse en apertura.
          this.screen.set('apertura');
        }
      } else if (regs.length === 1) {
        this.selectedRegisterId.set(regs[0].id);
      }
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudieron cargar las cajas.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Carga el estado (turno abierto + efectivo esperado) de cada caja. */
  async loadOverview(regs: CashRegister[] = this.registers()): Promise<void> {
    const rows = await Promise.all(
      regs.map(async (register): Promise<RegisterStatus> => {
        let shift: CashShift | null = null;
        let expected: number | null = null;
        try {
          shift = await this.api.getCurrentShift(register.id);
          const recon = await this.api.getReconciliation(shift.id);
          expected = this.num(recon.expected);
        } catch {
          shift = null; // 404 = sin turno abierto
        }
        return { register, shift, expected };
      }),
    );
    this.overview.set(rows);
  }

  /** Abre una caja abierta para operarla (dashboard). */
  async operateRegister(registerId: string): Promise<void> {
    this.selectedRegisterId.set(registerId);
    this.loading.set(true);
    this.error.set(null);
    try {
      const shift = await this.api.getCurrentShift(registerId);
      localStorage.setItem(REGISTER_STORAGE_KEY, registerId);
      await this.loadShiftData(shift);
      this.screen.set('dashboard');
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo abrir la caja.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Inicia el flujo de apertura para una caja concreta desde la gestión. */
  abrirCajaDesdeOverview(registerId: string): void {
    this.selectedRegisterId.set(registerId);
    this.openingAmount.set(0);
    this.error.set(null);
    this.screen.set('apertura');
  }

  /** Vuelve a la gestión de cajas (admin), refrescando el estado. */
  async backToOverview(): Promise<void> {
    this.reconciliation.set(null);
    this.movements.set([]);
    this.report.set(null);
    this.modal.set(null);
    this.error.set(null);
    this.screen.set('overview');
    this.loading.set(true);
    await this.loadOverview();
    this.loading.set(false);
  }

  // ─── Histórico de cierres (solo admin) ────────────────────────────────────────
  async openHistory(): Promise<void> {
    this.error.set(null);
    this.screen.set('history');
    await this.loadHistory(1);
  }

  async loadHistory(page: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.api.listShifts({
        status: 'closed',
        cashRegisterId: this.historyRegisterFilter() || undefined,
        page,
        size: 20,
      });
      this.history.set(data);
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo cargar el historial.'));
    } finally {
      this.loading.set(false);
    }
  }

  setHistoryFilter(registerId: string): void {
    this.historyRegisterFilter.set(registerId);
    void this.loadHistory(1);
  }

  backToHistory(): void {
    this.report.set(null);
    this.reportContext.set('live');
    this.screen.set('history');
  }

  /** Abre el reporte de un turno del histórico (solo lectura). */
  async viewShiftReport(shiftId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const report = await this.api.getReport(shiftId);
      this.report.set(report);
      this.shift.set(report.shift);
      this.reconciliation.set(report.reconciliation);
      this.movements.set(report.movements);
      this.reportContext.set('history');
      this.screen.set('report');
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo cargar el reporte.'));
    } finally {
      this.loading.set(false);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async loadShiftData(shift: CashShift): Promise<void> {
    this.shift.set(shift);
    const [recon, movs] = await Promise.all([
      this.api.getReconciliation(shift.id),
      this.api.listMovements(shift.id),
    ]);
    this.reconciliation.set(recon);
    this.movements.set(movs);
  }

  private async refreshShift(): Promise<void> {
    const shift = this.shift();
    if (!shift) return;
    const [recon, movs] = await Promise.all([
      this.api.getReconciliation(shift.id),
      this.api.listMovements(shift.id),
    ]);
    this.reconciliation.set(recon);
    this.movements.set(movs);
  }

  // ─── Acciones ────────────────────────────────────────────────────────────────
  async createRegister(): Promise<void> {
    if (!this.isAdmin()) return;
    const name = this.newRegisterName().trim();
    if (!name) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const reg = await this.api.createRegister(name);
      this.registers.set(await this.api.listRegisters());
      this.selectedRegisterId.set(reg.id);
      this.newRegisterName.set('');
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo crear la caja.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async abrirCaja(): Promise<void> {
    const regId = this.selectedRegisterId();
    if (!regId) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const shift = await this.api.openShift(regId, Number(this.openingAmount()) || 0);
      localStorage.setItem(REGISTER_STORAGE_KEY, regId);
      await this.loadShiftData(shift);
      this.screen.set('dashboard');
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo abrir el turno.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openMovimiento(kind: MovementKind): void {
    this.error.set(null);
    this.formCategoria.set(this.CATS[kind][0]);
    this.formMonto.set('');
    this.formNota.set('');
    this.formPaymentMethodId.set('');
    this.formSegundaLinea.set(false);
    this.formSegundoMetodo.set('');
    this.formSegundoMonto.set('');
    this.modal.set(kind);
    if (kind === 'ingreso') {
      // Carga explícita al abrir el formulario de ingreso (no un efecto
      // reactivo) -- mismo catálogo que el panel de cobro (FR-004).
      void this.paymentMethodApi.loadAvailableForCheckout();
    }
  }

  /** FR-004/FR-005: convierte un segundo método en línea de un ingreso mixto. */
  agregarSegundoMetodo(): void {
    this.formSegundaLinea.set(true);
  }

  quitarSegundoMetodo(): void {
    this.formSegundaLinea.set(false);
    this.formSegundoMetodo.set('');
    this.formSegundoMonto.set('');
  }

  async confirmarMovimiento(): Promise<void> {
    const kind = this.modal();
    const shift = this.shift();
    if (!kind || kind === 'arqueo' || !shift) return;
    const monto = Number(this.formMonto());
    if (!monto || monto <= 0) return;
    if (this.movimientoDisabled()) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      if (kind === 'ingreso') {
        const lines = [{ payment_method_id: this.formPaymentMethodId(), amount: monto }];
        if (this.formSegundaLinea()) {
          lines.push({
            payment_method_id: this.formSegundoMetodo(),
            amount: Number(this.formSegundoMonto()),
          });
        }
        await this.api.addMovement(shift.id, {
          kind,
          lines,
          category: this.formCategoria(),
          description: this.formNota().trim() || null,
        });
      } else {
        await this.api.addMovement(shift.id, {
          kind,
          amount: monto,
          category: this.formCategoria(),
          description: this.formNota().trim() || null,
        });
      }
      await this.refreshShift();
      this.modal.set(null);
    } catch (err) {
      this.error.set(this.api.extractError(err, 'No se pudo registrar el movimiento.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  openArqueo(): void {
    this.error.set(null);
    this.denomCounts.set({});
    this.arqueoObservacion.set('');
    this.activeOrdersBlocking.set([]);
    this.modal.set('arqueo');
    void this.cargarCatalogo();
  }

  /**
   * spec 121 (FR-013): consulta el catálogo de denominaciones del negocio. Sin lista de
   * respaldo: si falla (o llega vacío) el arqueo queda bloqueado con «Reintentar» y no se
   * envía ninguna petición de cierre.
   */
  async cargarCatalogo(): Promise<void> {
    const seq = ++this.catalogoSeq;
    this.catalogoEstado.set('cargando');
    try {
      const catalogo = await this.api.getDenominations();
      if (seq !== this.catalogoSeq) return;
      this.catalogo.set(catalogo);
      this.catalogoEstado.set('listo');
    } catch {
      if (seq !== this.catalogoSeq) return;
      this.catalogo.set([]);
      this.catalogoEstado.set('error');
    }
  }

  reintentarCatalogo(): Promise<void> {
    return this.cargarCatalogo();
  }

  setDenom(value: number, cantidad: string): void {
    this.denomCounts.update((c) => ({ ...c, [value]: cantidad }));
  }

  stepDenom(value: number, delta: number): void {
    this.denomCounts.update((c) => ({
      ...c,
      [value]: String(Math.max(0, (Number(c[value]) || 0) + delta)),
    }));
  }

  async confirmarArqueoYCerrar(): Promise<void> {
    const shift = this.shift();
    if (!shift || this.arqueoDisabled()) return;
    // Solo cantidad > 0 (FR-015); tipo, subtotales y total los calcula el servidor.
    const denominations: DenominationIn[] = this.catalogo()
      .map((c) => ({
        denomination: Number(c.denomination),
        quantity: Number(this.denomCounts()[Number(c.denomination)]) || 0,
      }))
      .filter((d) => d.quantity > 0);
    this.isSubmitting.set(true);
    this.error.set(null);
    this.activeOrdersBlocking.set([]);
    try {
      await this.api.closeShift(shift.id, {
        denominations,
        close_note: this.arqueoObservacion().trim() || null,
      });
      const report = await this.api.getReport(shift.id);
      this.report.set(report);
      this.shift.set(report.shift);
      this.reconciliation.set(report.reconciliation);
      this.movements.set(report.movements);
      this.reportContext.set('live');
      this.modal.set(null);
      this.screen.set('report');
    } catch (err) {
      // spec 119 (FR-007/FR-008, contracts/active-orders-close-gate-api.md):
      // el 409 de pedidos activos trae `active_orders` plano en el cuerpo
      // (no envuelto en otro "detail") -- se muestra la lista bloqueante en
      // vez del mensaje genérico de error.
      const activeOrders = this.extractActiveOrdersBlocking(err);
      if (activeOrders) {
        this.activeOrdersBlocking.set(activeOrders);
        this.error.set(this.api.extractError(err, 'No se puede cerrar el turno.'));
      } else {
        this.error.set(this.api.extractError(err, 'No se pudo cerrar el turno.'));
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** `null` si `err` no es el 409 de pedidos activos de `close_shift`. */
  private extractActiveOrdersBlocking(err: unknown): ActiveOrderSummary[] | null {
    if (!(err instanceof HttpErrorResponse) || err.status !== 409) return null;
    const body = err.error as { active_orders?: unknown } | null;
    return Array.isArray(body?.active_orders) ? (body.active_orders as ActiveOrderSummary[]) : null;
  }

  /**
   * spec 087 (FR-003, A-87): el diálogo de impresión sugiere
   * `<slug-del-negocio>-<DD-MM-YYYY>.pdf` en vez del título genérico de la
   * pestaña -- vía `document.title`, que es lo único que un navegador deja
   * controlar para ese nombre sugerido (no hay API de descarga directa desde
   * `window.print()`). La fecha es la de **cierre del turno**
   * (`shift().closed_at`), no la del momento de imprimir/reimprimir.
   *
   * `printing-cash-report` en `<body>` (retirada en `afterprint`) es lo que
   * `dashboard-layout.component.ts` usa para ocultar el sidebar/header solo
   * durante esta impresión (T036) -- `cash-report.component.ts` ya oculta sus
   * propios controles vía `print:hidden`, pero no controla el shell.
   */
  imprimirReporte(): void {
    const originalTitle = document.title;
    const fecha = this.tenantDate.transform(this.shift()?.closed_at ?? new Date(), 'dd-MM-yyyy');
    // Fallback si el nombre del negocio no deja ningún carácter válido (p. ej.
    // solo símbolos): evita un archivo llamado "-28-09-2026.pdf" (spec 087, FR-003).
    const negocio = slugify(this.tenantInfo.businessName()) || 'cierre-turno';
    document.title = `${negocio}-${fecha}`;
    document.body.classList.add('printing-cash-report');
    const restaurar = () => {
      document.title = originalTitle;
      document.body.classList.remove('printing-cash-report');
      window.removeEventListener('afterprint', restaurar);
    };
    window.addEventListener('afterprint', restaurar);
    window.print();
  }

  nuevoTurno(): void {
    this.shift.set(null);
    this.reconciliation.set(null);
    this.movements.set([]);
    this.report.set(null);
    this.modal.set(null);
    this.denomCounts.set({});
    this.arqueoObservacion.set('');
    this.openingAmount.set(0);
    this.formMonto.set('');
    this.formNota.set('');
    this.error.set(null);
    if (this.isAdmin()) {
      void this.backToOverview();
    } else {
      this.screen.set('apertura');
    }
  }

  closeModal(): void {
    this.modal.set(null);
    this.activeOrdersBlocking.set([]);
    this.formPaymentMethodId.set('');
    this.formSegundaLinea.set(false);
    this.formSegundoMetodo.set('');
    this.formSegundoMonto.set('');
  }

  setVista(v: MovementView): void {
    this.vista.set(v);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  fmt(n: number): string {
    return (n < 0 ? '-' : '') + '$ ' + Math.round(Math.abs(n)).toLocaleString('es-CO');
  }

  diffLabel(d: number): string {
    return d === 0 ? 'Cuadre perfecto' : d > 0 ? 'Sobrante' : 'Faltante';
  }

  /** Clase Tailwind de color para la diferencia del arqueo. */
  diffClass(d: number): string {
    if (d === 0) return 'text-gray-900';
    return d > 0 ? 'text-green-600' : 'text-red-600';
  }

  /** Clases Tailwind del tag de un movimiento según su variante. */
  tagClass(variant: TagVariant): string {
    switch (variant) {
      case 'accent':
        return 'bg-indigo-50 text-indigo-700';
      case 'outline':
        return 'border border-indigo-600 text-indigo-600';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  /** Convierte un decimal-string (o null) del backend a número. */
  num(v: string | null | undefined): number {
    return v == null ? 0 : Number(v) || 0;
  }

  /** Fecha/hora legible en 12 horas y hora del negocio (historial de cierres y gestión de cajas). */
  formatDate(iso: string | null | undefined): string {
    return this.fmtDate(iso ?? null);
  }

  private fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return this.tenantDate.transform(iso, FORMATO_HORA) ?? '—';
  }

  private fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return this.tenantDate.transform(iso, FORMATO_FECHA_HORA) ?? '—';
  }

  private fmtDuration(iso: string | null): string {
    if (!iso) return '';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}min en turno` : `${m}min en turno`;
  }
}
