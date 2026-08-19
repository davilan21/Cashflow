import Anthropic from "@anthropic-ai/sdk";
import { hoyISO } from "@/lib/ciclo";
import type { CategoryId } from "@/lib/types";

export interface GastoDetectado {
  monto: number;
  fecha: string; // YYYY-MM-DD
  nota: string;
  categoria: CategoryId;
}

interface ParteGmail {
  mimeType?: string;
  body?: { data?: string };
  parts?: ParteGmail[];
}

function decodificarBase64Url(data: string): string {
  const normal = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normal, "base64").toString("utf-8");
}

function quitarHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function buscarParte(p: ParteGmail, tipo: string): string | null {
  if (p.mimeType === tipo && p.body?.data) return decodificarBase64Url(p.body.data);
  for (const parte of p.parts ?? []) {
    const encontrado = buscarParte(parte, tipo);
    if (encontrado) return encontrado;
  }
  return null;
}

/** Texto plano de un mensaje de Gmail: prefiere text/plain, si no hay le quita las etiquetas al text/html. */
export function extraerTextoPlano(payload: ParteGmail | undefined): string {
  if (!payload) return "";
  const plano = buscarParte(payload, "text/plain");
  if (plano) return plano.replace(/\s+/g, " ").trim();
  const html = buscarParte(payload, "text/html");
  if (html) return quitarHtml(html);
  if (payload.body?.data) return decodificarBase64Url(payload.body.data).replace(/\s+/g, " ").trim();
  return "";
}

// Calibrado contra el único formato de notificación confirmado por David:
// "Bancolombia informa <descripción> por $<monto> desde TC*<4 dígitos>. <fecha>."
// Si Bancolombia usa una estructura distinta para otro tipo de movimiento
// (ej. "Compra" con el comercio después del monto), este regex no la
// reconocerá y esa notificación no producirá un pendiente — parsearNotificacionConClaude,
// el parser primario, es más tolerante a variaciones de formato.
const REGEX_NOTIFICACION = /Bancolombia informa (.+?) por \$([\d.,]+) desde TC\*\d{4}\.\s*(\d{2})\/(\d{2})\/(\d{4})/;

function limpiarMonto(texto: string): number {
  return Math.round(parseFloat(texto.replace(/\./g, "").replace(",", ".")));
}

function limpiarDescripcion(desc: string): string {
  return desc.replace(/\s*Ref\s+\d+\s*$/i, "").trim().slice(0, 60);
}

export function parsearNotificacionLocal(texto: string): GastoDetectado | null {
  const match = REGEX_NOTIFICACION.exec(texto);
  if (!match) return null;
  const [, descripcion, montoTexto, dd, mm, yyyy] = match;
  const monto = limpiarMonto(montoTexto);
  if (!(monto > 0)) return null;
  return { monto, fecha: `${yyyy}-${mm}-${dd}`, nota: limpiarDescripcion(descripcion), categoria: "otros" };
}

const CATEGORIAS_VALIDAS = [
  "mercado", "restaurantes", "transporte", "vivienda", "salud", "ocio", "compras", "suscripciones", "otros",
] as const;

const HERRAMIENTA: Anthropic.Tool = {
  name: "registrar_gasto_bancario",
  description: "Registra el gasto extraído de una notificación de Bancolombia, si de verdad es un gasto.",
  input_schema: {
    type: "object",
    properties: {
      es_gasto: {
        type: "boolean",
        description:
          "true solo si el correo es una compra o pago con tarjeta de crédito que reduce el saldo disponible. false para transferencias recibidas, consultas de saldo, alertas de acceso u otro tipo de notificación que no sea un gasto.",
      },
      monto: { type: "number", description: "Monto en pesos colombianos, sin decimales" },
      comercio: { type: "string", description: "Comercio o concepto del pago, corto y limpio, sin 'Ref' ni números de referencia" },
      fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
      categoria: { type: "string", enum: CATEGORIAS_VALIDAS as unknown as string[] },
    },
    required: ["es_gasto", "monto", "comercio", "fecha", "categoria"],
  },
};

export async function parsearNotificacionConClaude(texto: string): Promise<GastoDetectado | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = new Anthropic({ apiKey });
    const respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:
        "Extraes el gasto de una notificación de Bancolombia (compra, pago de factura, etc.) y siempre respondes llamando a la herramienta registrar_gasto_bancario. Primero decide es_gasto: false si el correo NO es una compra o pago con tarjeta (por ejemplo: transferencia recibida, consulta de saldo, alerta de acceso, notificación informativa sin monto debitado). fecha en YYYY-MM-DD. comercio: nombre corto y limpio del establecimiento o concepto. categoria debe ser uno de los ids permitidos; si no calza con ninguno, usa 'otros'.",
      tools: [HERRAMIENTA],
      tool_choice: { type: "tool", name: "registrar_gasto_bancario" },
      messages: [{ role: "user", content: texto }],
    });

    const bloque = respuesta.content.find((b) => b.type === "tool_use");
    if (!bloque || bloque.type !== "tool_use") return null;
    const input = bloque.input as {
      es_gasto?: boolean;
      monto?: number;
      comercio?: string;
      fecha?: string;
      categoria?: string;
    };
    if (!input.es_gasto) return null;
    if (!(Number(input.monto) > 0)) return null;

    return {
      monto: Math.round(Number(input.monto)),
      nota: String(input.comercio ?? "").slice(0, 60),
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(input.fecha)) ? String(input.fecha) : hoyISO(),
      categoria: (CATEGORIAS_VALIDAS as readonly string[]).includes(input.categoria ?? "")
        ? (input.categoria as CategoryId)
        : "otros",
    };
  } catch {
    return null;
  }
}
