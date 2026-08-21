/**
 * Escala del eje de la curva de saldo.
 *
 * Dejar que Recharts derive los ticks de un dominio arbitrario produce cortes
 * feos y —peor— desiguales: [$11,4M, $5,8M, $2,3M, −$1,2M] son saltos de 5,6 /
 * 3,5 / 3,5 millones dibujados a distinta altura, y eso hace ilegible la
 * pendiente de la curva. Acá el dominio se redondea a un paso "bonito" y los
 * ticks salen equiespaciados por construcción.
 */

// Pasos que se leen bien en pesos colombianos: medios, enteros y quintos de millón.
const PASOS = [
  50_000, 100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000,
  20_000_000, 25_000_000, 50_000_000, 100_000_000,
];

export interface Escala {
  dominio: [number, number];
  ticks: number[];
}

/**
 * El dominio redondeado hacia afuera y sus ticks, apuntando a `objetivo`
 * divisiones. Siempre incluye el cero cuando el rango lo cruza, porque quedarse
 * sin fondo es la lectura más importante de la curva.
 */
export function escalaSaldo(min: number, max: number, objetivo = 5): Escala {
  const piso = Math.min(min, 0 <= max && 0 >= min ? 0 : min);
  const techo = Math.max(max, piso);
  const rango = Math.max(techo - piso, 1);

  const paso = PASOS.find((p) => rango / p <= objetivo) ?? PASOS[PASOS.length - 1];
  const desde = Math.floor(piso / paso) * paso;
  // Un margen de un paso arriba deja aire para la etiqueta del colchón.
  const hasta = Math.ceil(techo / paso) * paso + (techo % paso === 0 ? paso : 0);

  const ticks: number[] = [];
  for (let v = desde; v <= hasta + paso / 2; v += paso) ticks.push(Math.round(v));

  return { dominio: [desde, hasta], ticks };
}

/** Índices equiespaciados dentro de una serie, incluyendo siempre el primero y el último. */
export function indicesEquiespaciados(largo: number, cuantos: number): number[] {
  if (largo <= 0) return [];
  if (largo <= cuantos) return Array.from({ length: largo }, (_, i) => i);
  const paso = (largo - 1) / (cuantos - 1);
  return Array.from({ length: cuantos }, (_, i) => Math.round(i * paso));
}
