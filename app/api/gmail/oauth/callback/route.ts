import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sinTipar } from "@/lib/supabase/queries";
import { intercambiarCodigo, obtenerEmailConectado } from "@/lib/gmail/oauth";
import { sincronizarGmail } from "@/lib/gmail/sync";

export const runtime = "nodejs";
export const maxDuration = 120;

function irACuenta(request: Request, estado: string) {
  const destino = new URL("/cuenta", request.url);
  destino.searchParams.set("gmail", estado);
  const respuesta = NextResponse.redirect(destino);
  respuesta.cookies.delete("gmail_oauth_state");
  return respuesta;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", request.url));

    const cookieStore = await cookies();
    const cookieGuardado = cookieStore.get("gmail_oauth_state")?.value;

    if (!code || !state || !cookieGuardado || state !== cookieGuardado) return irACuenta(request, "error");

    const redirectUri = new URL("/api/gmail/oauth/callback", request.url).toString();
    const tokens = await intercambiarCodigo(code, redirectUri);
    if (!tokens.refresh_token) return irACuenta(request, "error");

    const email = await obtenerEmailConectado(tokens.access_token);
    const admin = createAdminClient();
    await sinTipar(admin)
      .from("gmail_conexiones")
      .upsert(
        { user_id: user.id, email_conectado: email, refresh_token: tokens.refresh_token, estado: "activo", ultimo_error: null },
        { onConflict: "user_id" }
      );

    await sincronizarGmail(admin, user.id);
    return irACuenta(request, "conectado");
  } catch {
    return irACuenta(request, "error");
  }
}
