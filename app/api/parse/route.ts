import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { hoyISO } from "@/lib/ciclo";
import { parsearLocal } from "@/lib/parse-local";
import type { NuevoGasto } from "@/lib/types";

export const runtime = "nodejs";

const CATEGORIAS = [
  "mercado",
  "restaurantes",
  "transporte",
  "vivienda",
  "salud",
  "ocio",
  "compras",
  "suscripciones",
  "otros",
] as const;

const HERRAMIENTA: Anthropic.Tool = {
  name: "registrar_gastos",
  description: "Registra uno o más gastos extraídos del texto del usuario.",
  input_schema: {
    type: "object",
    properties: {
      gastos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            monto: { type: "number", description: "Monto en pesos colombianos, sin decimales" },
            categoria: { type: "string", enum: CATEGORIAS },
            nota: { type: "string", description: "Descripción corta, máximo 5 palabras, sin el monto" },
            fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
          },
          required: ["monto", "categoria", "nota", "fecha"],
        },
      },
    },
    required: ["gastos"],
  },
};

function limpiar(gastos: unknown[]): NuevoGasto[] {
  return gastos
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object" && Number((g as Record<string, unknown>).monto) > 0)
    .map((g) => ({
      monto: Math.round(Number(g.monto)),
      categoria: CATEGORIAS.includes(g.categoria as (typeof CATEGORIAS)[number])
        ? (g.categoria as string)
        : "otros",
      nota: String(g.nota ?? "").slice(0, 60),
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(g.fecha)) ? (g.fecha as string) : hoyISO(),
    }));
}

async function parsearConClaude(texto: string): Promise<NuevoGasto[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const anthropic = new Anthropic({ apiKey });
    const respuesta = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `Hoy es ${hoyISO()}. Extraes gastos de texto en español colombiano y siempre respondes llamando a la herramienta registrar_gastos.

Reglas:
- Montos en pesos colombianos. "200 mil", "200k" o "200" suelto (si es menor a 1000 asume miles) = 200000. "1 palo" o "1 millón" = 1000000.
- Si hay varios gastos en la frase, un objeto por cada uno.
- fecha en YYYY-MM-DD. "ayer" resta un día, "anteayer" dos, un día de la semana ("el lunes") es su ocurrencia pasada más reciente. Sin referencia temporal, usa hoy.
- categoria debe ser uno de los ids permitidos.
- nota: descripción corta y limpia, máximo 5 palabras, sin el monto.`,
      tools: [HERRAMIENTA],
      tool_choice: { type: "tool", name: "registrar_gastos" },
      messages: [{ role: "user", content: texto }],
    });

    const bloque = respuesta.content.find((b) => b.type === "tool_use");
    if (!bloque || bloque.type !== "tool_use") return null;

    const input = bloque.input as { gastos?: unknown[] };
    const gastos = limpiar(input.gastos ?? []);
    return gastos.length > 0 ? gastos : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let texto: unknown;
  try {
    ({ texto } = await request.json());
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json({ error: "Texto vacío" }, { status: 400 });
  }

  const deClaude = await parsearConClaude(texto);
  if (deClaude) {
    return NextResponse.json({ gastos: deClaude, fuente: "claude" });
  }

  const gastos = parsearLocal(texto);
  return NextResponse.json({ gastos, fuente: "local" });
}
