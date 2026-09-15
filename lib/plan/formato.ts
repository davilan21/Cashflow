/** Solo los dígitos de un texto, sin ceros a la izquierda ('0' se conserva). */
function soloDigitos(texto: string): string {
  const d = texto.replace(/\D/g, "");
  const sinCeros = d.replace(/^0+(?=\d)/, "");
  return sinCeros;
}

/** '4500000' | '$4.500.000' → '4.500.000'. Para formatear el input mientras se escribe. */
export function formatearMiles(texto: string): string {
  const d = soloDigitos(texto);
  if (!d) return "";
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** '4.500.000' → 4500000. null si no hay ningún dígito. */
export function parsearMonto(texto: string): number | null {
  const d = soloDigitos(texto);
  if (!d) return null;
  return parseInt(d, 10);
}
