const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Error de la API de Gmail con el motivo que manda Google en el cuerpo
 * (p. ej. 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT, SERVICE_DISABLED,
 * rateLimitExceeded). Sin él, un 403 no dice si hay que reconectar,
 * habilitar la API o esperar.
 */
export class ErrorGmail extends Error {
  constructor(
    public status: number,
    public motivo: string | null,
    contexto: string
  ) {
    super(`Gmail ${contexto} falló: ${status}${motivo ? ` (${motivo})` : ""}`);
  }

  /** El token no tiene el permiso de Gmail: solo se arregla reconectando. */
  get faltaPermiso(): boolean {
    return this.status === 403 && /SCOPE_INSUFFICIENT|insufficient.*scope/i.test(this.motivo ?? "");
  }
}

async function errorDeRespuesta(res: Response, contexto: string): Promise<ErrorGmail> {
  let motivo: string | null = null;
  try {
    const cuerpo: { error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } } =
      await res.json();
    const e = cuerpo.error;
    const razon = e?.details?.find((d) => d.reason)?.reason ?? e?.errors?.[0]?.reason ?? e?.status;
    motivo = [razon, e?.message].filter(Boolean).join(": ") || null;
  } catch {
    // cuerpo vacío o no-JSON: se queda solo con el status
  }
  return new ErrorGmail(res.status, motivo, contexto);
}

interface ParteGmail {
  mimeType?: string;
  body?: { data?: string };
  parts?: ParteGmail[];
}

export interface MensajeGmail {
  id: string;
  payload?: ParteGmail;
}

export async function listarIdsMensajes(accessToken: string, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${BASE}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw await errorDeRespuesta(res, "list");
    const data: { messages?: { id: string }[]; nextPageToken?: string } = await res.json();
    for (const m of data.messages ?? []) ids.push(m.id);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

export async function obtenerMensaje(accessToken: string, id: string): Promise<MensajeGmail> {
  const res = await fetch(`${BASE}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await errorDeRespuesta(res, "get");
  return res.json();
}
