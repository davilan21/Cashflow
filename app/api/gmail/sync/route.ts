import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarGmail } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const resultado = await sincronizarGmail(createAdminClient(), user.id);
  if ("error" in resultado) return NextResponse.json(resultado, { status: 400 });
  return NextResponse.json(resultado);
}
