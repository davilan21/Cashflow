import { hoyISO, sumarDias, diaSemana } from "./ciclo";
import type { CategoryId, NuevoGasto } from "./types";

/**
 * Parser determinístico de respaldo: si la llamada a Claude falla, esto
 * evita perder el registro. No es tan bueno interpretando lenguaje natural,
 * pero cubre los casos comunes: montos, categoría por palabras clave y
 * referencias de fecha simples.
 */

const PALABRAS_CATEGORIA: Record<CategoryId, string[]> = {
  mercado: ["mercado", "supermercado", "exito", "éxito", "d1", "ara", "jumbo", "olimpica", "olímpica", "carulla", "plaza", "verduras", "fruta"],
  restaurantes: ["comida", "almuerzo", "desayuno", "cena", "restaurante", "domicilio", "rappi", "pizza", "hamburguesa", "café", "cafe", "tinto", "corrientazo", "bar", "cerveza", "trago"],
  transporte: ["transporte", "uber", "didi", "taxi", "bus", "transmilenio", "gasolina", "peaje", "parqueadero", "sitp", "moto"],
  vivienda: ["arriendo", "administracion", "administración", "luz", "agua", "gas", "internet", "servicios", "recibo", "aseo"],
  salud: ["salud", "eps", "medico", "médico", "droga", "farmacia", "gimnasio", "gym", "odontologo", "odontólogo", "examenes", "exámenes"],
  ocio: ["cine", "viaje", "paseo", "concierto", "fiesta", "hotel", "salida", "libro", "juego"],
  compras: ["ropa", "zapatos", "compra", "regalo", "tecnologia", "tecnología", "celular", "mercadolibre", "amazon"],
  suscripciones: ["netflix", "spotify", "suscripcion", "suscripción", "plan", "icloud", "chatgpt", "claude", "youtube"],
  otros: [],
};

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function detectarMonto(texto: string): number {
  const regex = /(\d+(?:[.,]\d+)?)\s*(millones|millon|millón|palos|palo|k|mil|m)?/g;
  let match: RegExpExecArray | null;
  let monto = 0;
  while ((match = regex.exec(texto)) !== null) {
    let valor = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
    const suf = match[2];
    if (suf === "k" || suf === "mil") valor *= 1000;
    else if (suf && ["millones", "millon", "millón", "palos", "palo", "m"].includes(suf)) valor *= 1_000_000;
    else if (valor < 1000) valor *= 1000;
    if (valor > monto) monto = valor;
  }
  return monto;
}

/** Palabras completas del texto, en minúsculas — evita falsos positivos por subcadena ("para" no es "ara"). */
function tokenizar(texto: string): Set<string> {
  return new Set(texto.match(/[a-záéíóúñ]+/gi)?.map((w) => w.toLowerCase()) ?? []);
}

function detectarCategoria(palabras: Set<string>): CategoryId {
  for (const [id, lista] of Object.entries(PALABRAS_CATEGORIA)) {
    if (lista.some((p) => palabras.has(p))) return id as CategoryId;
  }
  return "otros";
}

function detectarFecha(palabras: Set<string>): string {
  const hoy = hoyISO();
  if (palabras.has("anteayer")) return sumarDias(hoy, -2);
  if (palabras.has("ayer")) return sumarDias(hoy, -1);
  if (palabras.has("hoy")) return hoy;

  for (let i = 0; i < DIAS_SEMANA.length; i++) {
    if (palabras.has(DIAS_SEMANA[i])) {
      // el día nombrado más reciente que no sea futuro (incluye hoy si coincide)
      const offset = (diaSemana(hoy) - i + 7) % 7;
      return sumarDias(hoy, -offset);
    }
  }

  return hoy;
}

export function parsearLocal(texto: string): NuevoGasto[] {
  const t = texto.toLowerCase();
  const monto = detectarMonto(t);
  if (monto <= 0) return [];

  const palabras = tokenizar(t);

  return [
    {
      monto,
      categoria: detectarCategoria(palabras),
      nota: texto.trim().replace(/\s+/g, " ").slice(0, 60),
      fecha: detectarFecha(palabras),
    },
  ];
}
