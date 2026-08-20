import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarGmail } from "@/lib/gmail/sync";
import { sinTipar } from "@/lib/supabase/queries";
import type { GmailConexion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  // Si CRON_SECRET no está configurado, la comparación contra
  // `Bearer undefined` dejaría pasar a cualquiera que mande ese literal:
  // se falla cerrado cuando falta el secreto.
  const secreto = process.env.CRON_SECRET;
  if (!secreto || auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  // sinTipar: la inferencia genérica de .select() colapsa a `never` con este
  // Database multi-tabla (mismo problema documentado en lib/supabase/queries.ts
  // para .insert()/.update()); se castea la fila al tipo conocido en su lugar.
  const { data } = await sinTipar(admin).from("gmail_conexiones").select("user_id").eq("estado", "activo");
  const conexiones = data as Pick<GmailConexion, "user_id">[] | null;

  const resultados = await Promise.all((conexiones ?? []).map((c) => sincronizarGmail(admin, c.user_id)));
  return NextResponse.json({ procesadas: resultados.length });
}
