import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import {
  CashMovement,
  CashRegister,
  CashShift,
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
  Denomination,
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
 * Ventas del turno por método de pago, tal cual las manda el arqueo.
 *
 * El backend ya devuelve una fila por cada método activo del negocio —incluidos
 * los que no vendieron nada— y las ordena con el efectivo primero, así que aquí
 * solo se convierten los importes, que viajan como string.
 */
export function mapVentasPorMetodo(recon: Reconciliation | null): VentaPorMetodo[] {
  return (recon?.sales_by_method ?? []).map((m) => ({
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

  /** Denominaciones de efectivo en COP, de mayor a menor. */
  readonly DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

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
  // Arqueo
  readonly denomCounts = signal<Record<number, string>>({});
  readonly arqueoObservacion = signal('');

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
    return {
      ventas: mapVentasPorMetodo(r),
      cambioEntregado: this.num(r?.cambio_entregado),
      ingresos: this.num(r?.ingresos),
      egresos: this.num(r?.egresos),
      retiros: this.num(r?.retiros),
      efectivoEsperado: this.num(r?.expected),
      countIngresos: movs.filter((m) => m.kind === 'ingreso').length,
      countEgresos: movs.filter((m) => m.kind === 'egreso').length,
      countRetiros: movs.filter((m) => m.kind === 'retiro').length,
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

  readonly movimientoDisabled = computed(() => !this.formMonto() || Number(this.formMonto()) <= 0);

  readonly denominaciones = computed<Denomination[]>(() =>
    this.DENOMS.map((value) => {
      const cantidad = Number(this.denomCounts()[value]) || 0;
      const subtotal = value * cantidad;
      return {
        value,
        label: value >= 1000 ? this.fmt(value) : '$ ' + value,
        cantidad,
        subtotal,
        subtotalFmt: this.fmt(subtotal),
      };
    }),
  );

  readonly totalContado = computed(() =>
    this.DENOMS.reduce((sum, d) => sum + d * (Number(this.denomCounts()[d]) || 0), 0),
  );

  readonly contadoIngresado = computed(() =>
    Object.values(this.denomCounts()).some((v) => Number(v) > 0),
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
      !this.contadoIngresado() ||
      (this.diferenciaLive() !== 0 && !this.arqueoObservacion().trim()),
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
    this.modal.set(kind);
  }

  async confirmarMovimiento(): Promise<void> {
    const kind = this.modal();
    const shift = this.shift();
    if (!kind || kind === 'arqueo' || !shift) return;
    const monto = Number(this.formMonto());
    if (!monto || monto <= 0) return;
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await this.api.addMovement(shift.id, {
        kind,
        amount: monto,
        category: this.formCategoria(),
        description: this.formNota().trim() || null,
      });
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
    this.modal.set('arqueo');
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
    const denominations: DenominationIn[] = this.DENOMS.map((d) => ({
      denomination: d,
      quantity: Number(this.denomCounts()[d]) || 0,
    })).filter((d) => d.quantity > 0);
    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      await this.api.closeShift(shift.id, {
        counted_amount: this.totalContado(),
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
      this.error.set(this.api.extractError(err, 'No se pudo cerrar el turno.'));
    } finally {
      this.isSubmitting.set(false);
    }
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

  /** Fecha/hora legible (para la vista de gestión). */
  formatDate(iso: string | null | undefined): string {
    return this.fmtDate(iso ?? null);
  }

  private fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return this.tenantDate.transform(iso, 'HH:mm') ?? '—';
  }

  private fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return this.tenantDate.transform(iso, 'dd/MM/yyyy HH:mm') ?? '—';
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
