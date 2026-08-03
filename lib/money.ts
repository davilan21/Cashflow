/** Formatea pesos colombianos sin decimales: 1250000 -> '$1.250.000'. */
export function pesos(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

/** Versión corta para etiquetas: 1250000 -> '$1.3M', 250000 -> '$250k'. */
export function pesosCorto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const millones = n / 1_000_000;
    const decimales = n % 1_000_000 === 0 ? 0 : 1;
    return "$" + millones.toFixed(decimales) + "M";
  }
  if (abs >= 1000) return "$" + Math.round(n / 1000) + "k";
  return pesos(n);
}
