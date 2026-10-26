// Tipos de VISTA del Módulo de Caja (SkeiloPOS). Modelan lo que las pantallas
// necesitan para renderizar; los DTOs del backend viven en `cash.interface.ts`.

import { CashRegister, CashShift, DenominationKind, MovementKind } from './cash.interface';

/** Pantalla activa del módulo. `overview`/`history` = gestión (solo admin). */
export type CashScreen = 'overview' | 'history' | 'apertura' | 'dashboard' | 'report';

/** Modal abierto (o `null`). El arqueo parcial vive en el dashboard, no aquí. */
export type CashModal = MovementKind | 'arqueo' | null;

/** Estado de una caja para la vista de gestión del admin. */
export interface RegisterStatus {
  register: CashRegister;
  /** Turno abierto de la caja, o `null` si no tiene. */
  shift: CashShift | null;
  /** Efectivo esperado del turno abierto (de la reconciliación), o `null`. */
  expected: number | null;
}

/** Vista de la línea de tiempo de movimientos. */
export type MovementView = 'tabla' | 'timeline';

/** Estilo del tag según el tipo de movimiento. */
export type TagVariant = 'accent' | 'neutral' | 'outline';

/** Movimiento preparado para render (etiquetas, formato y estilo ya resueltos). */
export interface MovementRow {
  id: string;
  hora: string;
  label: string;
  tagVariant: TagVariant;
  montoFmt: string;
  usuario: string;
  nota: string;
  /** spec 135: método de pago de esta línea (p. ej. "Efectivo", "Nequi"). */
  metodoPago: string;
  /** spec 135 (FR-011): comparten `group_id` las 2 filas de un mismo ingreso
   * mixto -- `null`/`undefined` para toda fila que no sea parte de uno. */
  groupId: string | null;
}

/** Una denominación de efectivo del catálogo del negocio con su conteo actual, lista para render. */
export interface Denomination {
  value: number;
  label: string;
  /** spec 121 (D-4): tipo de la denominación según el catálogo. */
  kind: DenominationKind;
  /** «Billete» | «Moneda». */
  kindLabel: string;
  cantidad: number;
  subtotal: number;
  subtotalFmt: string;
}

/** Estado de la carga del catálogo de denominaciones al abrir el arqueo (spec 121, FR-013). */
export type CatalogoEstado = 'cargando' | 'listo' | 'error';

/** Fila de la tabla «Desglose del conteo» del reporte de cierre (spec 121, FR-020). */
export interface DesgloseRow {
  denominacionFmt: string;
  tipoLabel: string;
  cantidad: number;
  subtotalFmt: string;
}

/** Ventas del turno con un método de pago concreto del negocio. */
export interface VentaPorMetodo {
  id: string;
  name: string;
  type: 'cash' | 'card' | 'transfer' | 'other' | 'mixed';
  total: number;
  count: number;
}

/** Indicadores agregados del turno (derivados de la reconciliación del servidor). */
export interface Indicadores {
  /**
   * Una entrada por método de pago del negocio, aunque no haya vendido nada.
   *
   * Sustituye a los tres cubos fijos (efectivo/tarjeta/transferencia): un método
   * que no encajaba en ninguno —y todos los creados sin clasificar lo eran—
   * desaparecía del arqueo.
   */
  ventas: VentaPorMetodo[];
  /** Salió del cajón, así que se muestra aparte y en negativo. */
  cambioEntregado: number;
  ingresos: number;
  egresos: number;
  retiros: number;
  efectivoEsperado: number;
  countIngresos: number;
  countEgresos: number;
  countRetiros: number;
  /** spec 135 (FR-007/FR-008): ingresos registrados en un método distinto a
   * efectivo -- no suman a `ingresos` ni a `efectivoEsperado`, por eso se
   * muestran aparte en vez de confundirse con el ingreso en efectivo. */
  ingresosDigitales: number;
  countIngresosDigitales: number;
}
