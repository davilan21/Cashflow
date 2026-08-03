import { aDate, diaDe, mesNum, cicloInicio, cicloPago, diasEnMes, hoyISO } from "./ciclo";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function etiquetaCiclo(ciclo: string): string {
  const inicio = cicloInicio(ciclo);
  return `16 ${CORTOS[mesNum(inicio) - 1]} – 15 ${CORTOS[mesNum(ciclo) - 1]}`;
}

export function etiquetaPago(ciclo: string): string {
  const pago = cicloPago(ciclo);
  return `${diaDe(pago)} de ${MESES[mesNum(ciclo) - 1]}`;
}

export function etiquetaCorta(ciclo: string): string {
  return `${CORTOS[mesNum(ciclo) - 1]} ${ciclo.slice(2, 4)}`;
}

export function etiquetaDia(fecha: string): string {
  if (fecha === hoyISO()) return "Hoy";
  const f = aDate(fecha);
  return `${DIAS_SEMANA[f.getUTCDay()]} ${diaDe(fecha)} ${CORTOS[f.getUTCMonth()]}`;
}

export function nombreMes(ym: string): string {
  return MESES[mesNum(ym) - 1];
}

export { MESES, CORTOS, DIAS_SEMANA, diasEnMes };
