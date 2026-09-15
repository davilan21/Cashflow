import { diasEntre, desplazarMes, diasEnMes, mesDe } from "@/lib/ciclo";
import type { AhorroInstrumento, AhorroMovimiento, AhorroValoracion, Moneda, Trm } from "@/lib/types";
import type { EstadoCdt, OrigenValor } from "./etiquetas";
import type { MesPlan } from "@/lib/plan/calculo";

export interface InfoCdt {
  diasAlVencimiento: number;
  estado: EstadoCdt;
}

export interface ResumenInstrumento {
  instrumento: AhorroInstrumento;
  /** En la moneda del instrumento. */
  aportado: number;
  valor: number;
  origenValor: OrigenValor;
  rendimiento: number;
  /** null si aportado <= 0: no hay base para un porcentaje. */
  rendimientoPct: number | null;
  /** En COP. null si es USD y no hay TRM — nunca 0. */
  aportadoCOP: number | null;
  valorCOP: number | null;
  rendimientoCOP: number | null;
  cdt: InfoCdt | null;
}

/** La TRM más reciente con fecha <= `fecha`. Una TRM futura no vale para hoy. */
export function trmVigente(trms: Trm[], fecha: string): Trm | null {
  return trms.filter((t) => t.fecha <= fecha).sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
}

/** Convierte a COP. COP pasa igual; USD multiplica por la TRM y redondea al peso; sin TRM → null. */
export function aCOP(monto: number, moneda: Moneda, trm: Trm | null): number | null {
  if (moneda === "COP") return monto;
  if (!trm) return null;
  return Math.round(monto * trm.valor);
}

const signo = (m: AhorroMovimiento) => (m.tipo === "aporte" ? m.monto : -m.monto);

/** Aportes − retiros de un instrumento hasta `hasta` inclusive. */
export function aportadoHasta(movimientos: AhorroMovimiento[], instrumentoId: string, hasta: string): number {
  return movimientos
    .filter((m) => m.instrumento_id === instrumentoId && m.fecha <= hasta)
    .reduce((s, m) => s + signo(m), 0);
}

/** La valoración más reciente de un instrumento con fecha <= `hasta`, o null. */
export function valoracionHasta(valoraciones: AhorroValoracion[], instrumentoId: string, hasta: string): AhorroValoracion | null {
  return (
    valoraciones
      .filter((v) => v.instrumento_id === instrumentoId && v.fecha <= hasta)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null
  );
}

function infoCdt(inst: AhorroInstrumento, hoy: string): InfoCdt | null {
  if (inst.tipo !== "cdt" || !inst.vencimiento) return null;
  const dias = diasEntre(hoy, inst.vencimiento);
  const estado: EstadoCdt = dias < 0 ? "vencido" : dias <= 30 ? "por_vencer" : "vigente";
  return { diasAlVencimiento: dias, estado };
}

export function resumenInstrumento(
  inst: AhorroInstrumento,
  movimientos: AhorroMovimiento[],
  valoraciones: AhorroValoracion[],
  trm: Trm | null,
  hoy: string
): ResumenInstrumento {
  const aportado = aportadoHasta(movimientos, inst.id, hoy);
  const ultima = valoracionHasta(valoraciones, inst.id, hoy);
  const valor = ultima ? ultima.valor : aportado;
  const origenValor: OrigenValor = ultima ? { tipo: "valoracion", fecha: ultima.fecha } : { tipo: "aportado" };
  const rendimiento = valor - aportado;
  const aportadoCOP = aCOP(aportado, inst.moneda, trm);
  const valorCOP = aCOP(valor, inst.moneda, trm);
  return {
    instrumento: inst,
    aportado,
    valor,
    origenValor,
    rendimiento,
    rendimientoPct: aportado > 0 ? (rendimiento / aportado) * 100 : null,
    aportadoCOP,
    valorCOP,
    rendimientoCOP: aportadoCOP === null || valorCOP === null ? null : valorCOP - aportadoCOP,
    cdt: infoCdt(inst, hoy),
  };
}

export interface Participacion {
  clave: string;
  valorCOP: number;
  pct: number;
}

export interface FiltroPortafolio {
  /** undefined = todos; null = del hogar; string = ese miembro. */
  titular?: string | null;
  soloActivos?: boolean;
}

export interface ResumenPortafolio {
  instrumentos: ResumenInstrumento[];
  totalAportadoCOP: number;
  totalValorCOP: number;
  rendimientoCOP: number;
  rendimientoPct: number | null;
  /** Σ valor (en USD) de los instrumentos USD que no se pudieron convertir por falta de TRM. */
  usdSinConvertir: number;
  trm: Trm | null;
  porTitular: Participacion[];
  porTipo: Participacion[];
}

function participaciones(items: ResumenInstrumento[], clave: (r: ResumenInstrumento) => string): Participacion[] {
  const acum = new Map<string, number>();
  for (const r of items) {
    if (r.valorCOP === null) continue;
    const k = clave(r);
    acum.set(k, (acum.get(k) ?? 0) + r.valorCOP);
  }
  const total = Array.from(acum.values()).reduce((s, v) => s + v, 0);
  return Array.from(acum.entries())
    .map(([k, v]) => ({ clave: k, valorCOP: v, pct: total > 0 ? (v / total) * 100 : 0 }))
    .sort((a, b) => b.valorCOP - a.valorCOP);
}

export function resumenPortafolio(opts: {
  instrumentos: AhorroInstrumento[];
  movimientos: AhorroMovimiento[];
  valoraciones: AhorroValoracion[];
  trms: Trm[];
  hoy: string;
  filtro?: FiltroPortafolio;
}): ResumenPortafolio {
  const { movimientos, valoraciones, trms, hoy, filtro = {} } = opts;
  const trm = trmVigente(trms, hoy);

  const seleccion = opts.instrumentos.filter((i) => {
    if (filtro.soloActivos && !i.activo) return false;
    if (filtro.titular !== undefined && i.titular !== filtro.titular) return false;
    return true;
  });

  const instrumentos = seleccion
    .map((i) => resumenInstrumento(i, movimientos, valoraciones, trm, hoy))
    // Los que tienen COP primero, de mayor a menor; los sin TRM al final.
    .sort((a, b) => (b.valorCOP ?? -Infinity) - (a.valorCOP ?? -Infinity));

  const conCOP = instrumentos.filter((r) => r.valorCOP !== null && r.aportadoCOP !== null);
  const totalAportadoCOP = conCOP.reduce((s, r) => s + (r.aportadoCOP as number), 0);
  const totalValorCOP = conCOP.reduce((s, r) => s + (r.valorCOP as number), 0);
  const rendimientoCOP = totalValorCOP - totalAportadoCOP;

  return {
    instrumentos,
    totalAportadoCOP,
    totalValorCOP,
    rendimientoCOP,
    rendimientoPct: totalAportadoCOP > 0 ? (rendimientoCOP / totalAportadoCOP) * 100 : null,
    usdSinConvertir: instrumentos.filter((r) => r.valorCOP === null).reduce((s, r) => s + r.valor, 0),
    trm,
    porTitular: participaciones(instrumentos, (r) => r.instrumento.titular ?? "hogar"),
    porTipo: participaciones(instrumentos, (r) => r.instrumento.tipo),
  };
}

export interface PuntoSerie {
  mes: string;
  aportadoCOP: number;
  valorCOP: number;
  /** true si algún USD se convirtió con una TRM anterior a la primera conocida. */
  trmAproximada: boolean;
  metaPlan: number | null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const finDeMes = (mes: string) => `${mes}-${pad2(diasEnMes(mes))}`;

/** TRM para un mes: la vigente al fin de mes; si no hay, la primera conocida (aproximada). */
function trmDeMes(trms: Trm[], mes: string): { trm: Trm | null; aproximada: boolean } {
  const vigente = trmVigente(trms, finDeMes(mes));
  if (vigente) return { trm: vigente, aproximada: false };
  const primera = [...trms].sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null;
  return { trm: primera, aproximada: primera !== null };
}

export function serieMensual(opts: {
  instrumentos: AhorroInstrumento[];
  movimientos: AhorroMovimiento[];
  valoraciones: AhorroValoracion[];
  trms: Trm[];
  hoy: string;
  plan: MesPlan[];
}): PuntoSerie[] {
  const { instrumentos, movimientos, valoraciones, trms, hoy, plan } = opts;
  if (movimientos.length === 0) return [];
  const primerMes = mesDe(movimientos.map((m) => m.fecha).sort()[0]);
  const mesHoy = mesDe(hoy);
  const salida: PuntoSerie[] = [];

  for (let mes = primerMes; mes <= mesHoy; mes = desplazarMes(mes, 1)) {
    const corte = finDeMes(mes);
    const { trm, aproximada } = trmDeMes(trms, mes);
    let aportadoCOP = 0;
    let valorCOP = 0;
    let usoAproximada = false;
    for (const inst of instrumentos) {
      const aportado = aportadoHasta(movimientos, inst.id, corte);
      const ultima = valoracionHasta(valoraciones, inst.id, corte);
      let valor = aportado;
      if (ultima) {
        // Valoracion covers aportes until valorization date; add aportes after that.
        const aportadoUntilValorizacion = aportadoHasta(movimientos, inst.id, ultima.fecha);
        valor = ultima.valor + Math.max(0, aportado - aportadoUntilValorizacion);
      }
      const a = aCOP(aportado, inst.moneda, trm);
      const v = aCOP(valor, inst.moneda, trm);
      if (a === null || v === null) continue; // USD sin ninguna TRM: fuera, como en el portafolio
      if (inst.moneda === "USD" && aproximada && (aportado !== 0 || valor !== 0)) usoAproximada = true;
      aportadoCOP += a;
      valorCOP += v;
    }
    salida.push({
      mes,
      aportadoCOP,
      valorCOP,
      trmAproximada: usoAproximada,
      metaPlan: plan.find((p) => p.mes === mes)?.ahorro ?? null,
    });
  }
  return salida;
}

export interface AporteVsMeta {
  mes: string;
  meta: number | null;
  aportadoCOP: number;
  pct: number | null;
  faltante: number | null;
}

export function aporteVsMeta(opts: {
  instrumentos: AhorroInstrumento[];
  movimientos: AhorroMovimiento[];
  trms: Trm[];
  hoy: string;
  plan: MesPlan[];
}): AporteVsMeta {
  const { instrumentos, movimientos, trms, hoy, plan } = opts;
  const mes = mesDe(hoy);
  const trm = trmVigente(trms, hoy);
  const monedaDe = new Map(instrumentos.map((i) => [i.id, i.moneda] as const));

  const aportadoCOP = movimientos
    .filter((m) => mesDe(m.fecha) === mes && m.fecha <= hoy)
    .reduce((s, m) => {
      const cop = aCOP(signo(m), monedaDe.get(m.instrumento_id) ?? "COP", trm);
      return s + (cop ?? 0); // USD sin TRM no suma: no hay cómo convertirlo
    }, 0);

  const meta = plan.find((p) => p.mes === mes)?.ahorro ?? null;
  return {
    mes,
    meta,
    aportadoCOP,
    pct: meta !== null && meta > 0 ? (aportadoCOP / meta) * 100 : null,
    faltante: meta === null ? null : Math.max(0, meta - aportadoCOP),
  };
}
