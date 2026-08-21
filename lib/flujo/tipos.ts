/**
 * Tipos del módulo de flujo de caja.
 *
 * Viven aparte de `lib/types.ts` a propósito: el módulo de tarjeta de crédito
 * no se toca, y estos tipos no tienen por qué mezclarse con los suyos. Los
 * montos son enteros de pesos (bigint en Postgres), y todas las fechas son
 * strings 'YYYY-MM-DD' — misma convención que `lib/ciclo.ts`, para que la
 * aritmética no dependa nunca de la zona horaria del proceso.
 */

export type MedioPago = "tc" | "debito" | "efectivo";

export type TipoRegla = "ingreso" | "gasto_fijo" | "aporte_inversion";

export type Frecuencia = "quincenal" | "mensual" | "bimestral" | "anual" | "unica";

export interface Regla {
  id: string;
  tipo: TipoRegla;
  nombre: string;
  monto: number;
  /** 'estimado' se dibuja punteado en la curva; el valor real lo reemplaza. */
  monto_tipo: "fijo" | "estimado";
  frecuencia: Frecuencia;
  dia_1: number;
  dia_2: number | null;
  /** Solo para frecuencia 'anual': prima = 6 y 12, cesantías = 2. */
  mes: number | null;
  /** Solo aplica a gasto_fijo. */
  medio_pago: MedioPago | null;
  instrumento_id: string | null;
  categoria: string | null;
  desde: string;
  hasta: string | null;
  activa: boolean;
}

export type TipoDeuda = "credito" | "libranza" | "hipoteca" | "vehiculo" | "otro";

export interface Deuda {
  id: string;
  nombre: string;
  tipo: TipoDeuda;
  saldo_actual: number;
  saldo_a_fecha: string;
  /** Efectiva mensual en decimal: 0.0175 = 1.75% EM. */
  tasa_mensual: number;
  /** Null = calcular por amortización francesa. */
  cuota: number | null;
  n_cuotas: number;
  cuotas_pagadas: number;
  dia_pago: number;
  medio_pago: MedioPago;
  instrumento_id: string | null;
  activa: boolean;
}

/** Una cuota de la tabla de amortización. */
export interface CuotaProyectada {
  numero: number;
  fecha: string;
  cuota: number;
  interes: number;
  abono: number;
  saldoDespues: number;
}

export type TipoMovimiento =
  | "ingreso"
  | "gasto"
  | "pago_tc"
  | "cuota_deuda"
  | "aporte"
  | "transferencia"
  | "otro";

/** Un movimiento real del libro de caja. `monto` va CON SIGNO. */
export interface Movimiento {
  id: string;
  fecha: string;
  monto: number;
  tipo: TipoMovimiento;
  etiqueta: string;
  /** Para 'pago_tc': qué ciclo se pagó. */
  ref_ciclo: string | null;
  /** Qué regla o deuda lo originó, y de qué ocurrencia se trata. */
  ref_id: string | null;
  ref_periodo: string | null;
}

/** Un gasto de tarjeta leído de `expenses` (solo lectura). */
export interface GastoTarjeta {
  id: string;
  fecha: string;
  monto: number;
  /** La regla con la que se emparejó, si es un fijo ya cobrado. */
  regla_id: string | null;
}

export type TipoEvento =
  | "ingreso"
  | "gasto_fijo"
  | "gasto"
  | "pago_tc"
  | "cuota_deuda"
  | "aporte"
  | "otro";

/**
 * `real` ya ocurrió y está confirmado; `proyectado` sale de una regla o
 * amortización de monto conocido; `estimado` sale de una regla cuyo monto es
 * una aproximación (o del run-rate de la tarjeta), y se dibuja distinto.
 */
export type OrigenEvento = "real" | "proyectado" | "estimado";

export interface EventoCaja {
  fecha: string;
  /** CON SIGNO: positivo entra, negativo sale. */
  monto: number;
  tipo: TipoEvento;
  etiqueta: string;
  origen: OrigenEvento;
  /** Regla, deuda o ciclo que lo originó. */
  refId?: string;
  /** La ocurrencia concreta: fecha programada en ISO, o el ciclo. */
  refPeriodo?: string;
}

export interface PuntoSaldo {
  fecha: string;
  saldo: number;
}

export interface Ancla {
  fecha: string;
  monto: number;
}

export interface EntradaProyeccion {
  hoy: string;
  horizonteDias: number;
  colchon: number;
  /** El último snapshot de saldo. Sin ancla no hay nada que proyectar. */
  ancla: Ancla | null;
  movimientos: Movimiento[];
  reglas: Regla[];
  deudas: Deuda[];
  /** Gastos de `expenses`, para armar el pago de cada ciclo. */
  gastosTarjeta: GastoTarjeta[];
}

export interface Proyeccion {
  saldoHoy: number;
  eventos: EventoCaja[];
  serie: PuntoSaldo[];
  minimo: PuntoSaldo;
  /** Primer día en que el saldo cruza por debajo del colchón. */
  bajoColchon: PuntoSaldo | null;
  /**
   * Ciclos ya cerrados cuya fecha de pago pasó sin que se registre el pago.
   * No hay débito automático: olvidarse es un caso real.
   */
  ciclosSinPagar: string[];
}
