import { describe, it, expect, vi, afterEach } from "vitest";
import { construirUrlAutorizacion, intercambiarCodigo, refrescarToken, obtenerEmailConectado } from "./oauth";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("construirUrlAutorizacion", () => {
  it("incluye client_id, redirect_uri, state y el scope de gmail.readonly", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-123");
    const url = new URL(construirUrlAutorizacion("https://app.test/callback", "estado-abc"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cliente-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/callback");
    expect(url.searchParams.get("state")).toBe("estado-abc");
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("intercambiarCodigo", () => {
  it("hace POST al token endpoint con grant_type=authorization_code", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-123");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secreto-456");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await intercambiarCodigo("codigo-xyz", "https://app.test/callback");

    expect(tokens).toEqual({ access_token: "acc", refresh_token: "ref", expires_in: 3600 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("code")).toBe("codigo-xyz");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe("https://app.test/callback");
  });

  it("lanza error si Google responde con fallo", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "y");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(intercambiarCodigo("bad", "https://app.test/callback")).rejects.toThrow();
  });
});

describe("refrescarToken", () => {
  it("hace POST con grant_type=refresh_token", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-123");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secreto-456");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "acc-nuevo", expires_in: 3600 }) });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refrescarToken("ref-existente");

    expect(tokens.access_token).toBe("acc-nuevo");
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("ref-existente");
  });

  it("lanza error si el refresh falla (token expirado/revocado)", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "y");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(refrescarToken("ref-vencido")).rejects.toThrow();
  });
});

describe("obtenerEmailConectado", () => {
  it("devuelve el email del endpoint de userinfo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: "david@gmail.com" }) }));
    expect(await obtenerEmailConectado("token-abc")).toBe("david@gmail.com");
  });
});
