/** US$1.234,56 — es-CO usa punto de miles y coma decimal. Negativos con − (U+2212) delante. */
export function dolares(n: number): string {
  const abs = Math.abs(n).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}US$${abs}`;
}

/**
 * Separa parte entera y decimal de lo que el usuario va escribiendo: la última
 * coma es el separador decimal; si no hay coma, el último punto lo es (para
 * quien teclea "1234.5"). Todo lo que no sea dígito se ignora.
 */
function partes(texto: string): { entera: string; decimal: string | null } {
  const limpio = texto.replace(/[^\d.,]/g, "");
  const iComa = limpio.lastIndexOf(",");
  const iPunto = limpio.lastIndexOf(".");
  // Con coma, los puntos son de miles. Sin coma, un punto seguido de ≤2 dígitos al final es decimal.
  let sep = -1;
  if (iComa >= 0) sep = iComa;
  else if (iPunto >= 0 && limpio.length - iPunto - 1 <= 2 && !/\.\d*\./.test(limpio)) sep = iPunto;
  const entera = (sep >= 0 ? limpio.slice(0, sep) : limpio).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimal = sep >= 0 ? limpio.slice(sep + 1).replace(/\D/g, "").slice(0, 2) : null;
  return { entera, decimal };
}

/** '1234,567' → '1.234,56'; '12,' → '12,' (coma final se conserva mientras se escribe). */
export function formatearDecimal(texto: string): string {
  const { entera, decimal } = partes(texto);
  if (!entera && decimal === null) return "";
  const enteraFmt = (entera || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal === null ? enteraFmt : `${enteraFmt},${decimal}`;
}

/** '1.234,56' → 1234.56. null si no hay dígitos. */
export function parsearDecimal(texto: string): number | null {
  const { entera, decimal } = partes(texto);
  if (!entera && !decimal) return null;
  return Number(`${entera || "0"}.${decimal || "0"}`);
}
