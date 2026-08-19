const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

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
    if (!res.ok) throw new Error(`Gmail list falló: ${res.status}`);
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
  if (!res.ok) throw new Error(`Gmail get falló: ${res.status}`);
  return res.json();
}
