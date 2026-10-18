import type { CategoryId } from "./types";

/** Una compra leída del CSV del banco, lista para insertarse como gasto de la tarjeta de respaldo. */
export interface FilaTarjeta {
  fecha: string; // 'YYYY-MM-DD'
  monto: number; // pesos, positivo
  descripcion: string;
  /** Huella estable entre exports acumulados: evita duplicar al recargar el mismo movimiento. */
  ref: string;
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
};

/** "24-sept-2026" → "2026-09-24". Lanza si no la entiende: una fecha inventada es peor que un error. */
export function fechaBanco(texto: string): string {
  const m = /^(\d{1,2})-([a-z]+)\.?-(\d{4})$/i.exec(texto.trim());
  const mes = m ? MESES[m[2].toLowerCase()] : undefined;
  if (!m || !mes) throw new Error(`Fecha del banco no reconocida: "${texto}"`);
  const dia = Number(m[1]);
  const anio = Number(m[3]);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) throw new Error(`Fecha inexistente: "${texto}"`);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Lee el export "saldos.csv" del banco: un bloque de cuenta y, desde la línea
 * "Tipo de transacción,...", los movimientos. Solo devuelve los Debito con
 * fecha >= `desde`; los Credito son pagos a la tarjeta, no gastos.
 */
export function parsearCsvTarjeta(texto: string, { desde }: { desde: string }): FilaTarjeta[] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const inicio = lineas.findIndex((l) => /^tipo de transacci[oó]n\s*,/i.test(l.trim()));
  if (inicio < 0) throw new Error('No encontré el encabezado "Tipo de transacción,Fecha,Descripción,Valor"');

  const vistas = new Map<string, number>();
  const filas: FilaTarjeta[] = [];

  for (const linea of lineas.slice(inicio + 1)) {
    if (!linea.trim()) continue;
    const partes = linea.split(",");
    if (partes.length < 4) throw new Error(`Línea con menos de 4 columnas: "${linea}"`);
    const tipo = partes[0].trim().toLowerCase();
    const fecha = fechaBanco(partes[1]);
    const valorTexto = partes[partes.length - 1].trim();
    const descripcion = partes.slice(2, -1).join(",").replace(/\s+/g, " ").trim();
    const valor = Number(valorTexto);
    if (valorTexto === "" || !Number.isFinite(valor)) throw new Error(`Valor no numérico en: "${linea}"`);

    if (tipo !== "debito" && tipo !== "débito") continue;
    if (fecha < desde) continue;
    const monto = Math.round(Math.abs(valor));
    if (monto === 0) continue;

    const base = `${fecha}|${descripcion}|${valorTexto}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    filas.push({ fecha, monto, descripcion, ref: `csv:${base}|${n}` });
  }
  return filas;
}

const REGLAS: [RegExp, CategoryId][] = [
  [/PRICESMART|EXITO|CARULLA|JUMBO|OLIMPICA|\bD1\b|\bARA\b|OXXO|7 ELEVEN|MERCADO/, "mercado"],
  [/FARMATODO|DROGUER|CRUZ VERDE|FARMACIA|CLINICA|MEDIC/, "salud"],
  [/TEXACO|TERPEL|PRIMAX|BIOMAX|\bEDS\b|UBER|DIDI|CABIFY|PEAJE|PARQUEADERO/, "transporte"],
  [/NETFLIX|SPOTIFY|DISNEY|HBO|APPLE\.COM|GOOGLE|YOUTUBE/, "suscripciones"],
  [/\bMASA\b|OSAKI|\bREST|\bCAFE|CREPES|WOK|COM RAP|KERICO|PIZZ|BURGER|SUSHI/, "restaurantes"],
];

/** Categoría propuesta para un comercio; el usuario la confirma en la vista previa antes de cargar. */
export function categoriaDeComercio(descripcion: string): CategoryId {
  const d = descripcion.toUpperCase();
  return REGLAS.find(([re]) => re.test(d))?.[1] ?? "otros";
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * SQL para cargar las filas como gastos de la tarjeta de respaldo. Idempotente:
 * una huella ya cargada choca contra el índice único y se salta. Se corre con
 * permisos de servicio, por eso cuenta y autor van explícitos.
 */
export function sqlCargaRespaldo(
  filas: FilaTarjeta[],
  { cuentaId, createdBy }: { cuentaId: string; createdBy: string }
): string {
  for (const id of [cuentaId, createdBy]) {
    if (!/^[\w-]+$/.test(id)) throw new Error(`Id inválido: ${id}`);
  }
  if (filas.length === 0) return "";
  const valores = filas
    .map((f) =>
      `  (${lit(cuentaId)}, ${lit(createdBy)}, ${lit(f.fecha)}, ${f.monto}, ${lit(categoriaDeComercio(f.descripcion))}, ${lit(f.descripcion)}, 'respaldo', ${lit(f.ref)})`
    )
    .join(",\n");
  return `insert into expenses (cuenta_id, created_by, fecha, monto, categoria, nota, tarjeta, ref_import) values
${valores}
on conflict (cuenta_id, ref_import) where ref_import is not null do nothing
returning fecha, monto, categoria, nota;`;
}
