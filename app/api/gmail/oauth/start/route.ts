import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { construirUrlAutorizacion } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/gmail/oauth/callback", request.url).toString();
  const response = NextResponse.redirect(construirUrlAutorizacion(redirectUri, state));
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
