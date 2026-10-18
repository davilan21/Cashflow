// Carga el CSV del banco de la tarjeta de respaldo (7095) como gastos.
//
//   npx vite-node scripts/importar-tarjeta.ts -- <saldos.csv> [--desde 2026-10-15] [--cuenta <uuid> --autor <uuid>]
//
// Sin --cuenta/--autor solo muestra la vista previa. Con ambos, además
// imprime en stdout el SQL idempotente para correr con permisos de servicio.
import { readFileSync } from "node:fs";
import { parsearCsvTarjeta, categoriaDeComercio, sqlCargaRespaldo } from "../lib/tarjeta-csv";

const args = process.argv.slice(2).filter((a) => a !== "--");
const opt = (nombre: string) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const archivo = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!archivo) {
  console.error("Falta la ruta del CSV");
  process.exit(1);
}

const desde = opt("desde") ?? "2026-10-15";
const filas = parsearCsvTarjeta(readFileSync(archivo, "utf8"), { desde });
const total = filas.reduce((s, f) => s + f.monto, 0);

console.error(`Desde ${desde}: ${filas.length} movimientos, $${total.toLocaleString("es-CO")}`);
for (const f of filas) {
  console.error(`  ${f.fecha}  ${String(f.monto).padStart(9)}  ${categoriaDeComercio(f.descripcion).padEnd(13)} ${f.descripcion}`);
}

const cuentaId = opt("cuenta");
const createdBy = opt("autor");
if (cuentaId && createdBy) console.log(sqlCargaRespaldo(filas, { cuentaId, createdBy }));
