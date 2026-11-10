import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { cicloDe } from "./ciclo";

// ciclo_de (SQL) tiene que seguir la misma regla que cicloDe (TS). Nada los ata
// si alguien cambia uno y se olvida del otro, así que este test los compara:
// el día del mes en que cada uno pasa al ciclo siguiente.

/** Primer día del mes en que cicloDe deja de ser el ciclo del día 1. */
function umbralTS(): number {
  const base = cicloDe("2026-01-01");
  for (let d = 2; d <= 31; d++) {
    if (cicloDe(`2026-01-${String(d).padStart(2, "0")}`) !== base) return d;
  }
  throw new Error("cicloDe no cambia de ciclo en ningún día del mes");
}

/** La migración más reciente que define ciclo_de. */
function migracionVigente(): string {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const archivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().reverse();
  const texto = archivos.map((f) => readFileSync(path.join(dir, f), "utf8")).find((t) => /function\s+ciclo_de\s*\(/i.test(t));
  if (!texto) throw new Error("ninguna migración define ciclo_de");
  return texto;
}

describe("ciclo_de (SQL) y cicloDe (TS)", () => {
  it("cambian de ciclo el mismo día del mes", () => {
    const m = /extract\(day from fecha\)\s*(<=|<)\s*(\d+)/i.exec(migracionVigente());
    expect(m).not.toBeNull();
    const [, operador, n] = m as RegExpExecArray;
    // "día < 15" cambia en el 15; "día <= 15" cambia en el 16.
    const cambiaEn = operador === "<" ? Number(n) : Number(n) + 1;
    expect(cambiaEn).toBe(umbralTS());
  });
});
