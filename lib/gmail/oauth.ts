const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"];

export function construirUrlAutorizacion(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent", // fuerza a que Google reemita refresh_token en cada reconexión
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokensGoogle {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function pedirToken(body: URLSearchParams, contexto: string): Promise<TokensGoogle> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google ${contexto} falló: ${res.status}`);
  return res.json();
}

export async function intercambiarCodigo(code: string, redirectUri: string): Promise<TokensGoogle> {
  return pedirToken(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    "token exchange"
  );
}

export async function refrescarToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  return pedirToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
    "token refresh"
  );
}

export async function obtenerEmailConectado(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google userinfo falló: ${res.status}`);
  const data = await res.json();
  return data.email as string;
}
