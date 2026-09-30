import { describe, it, expect, vi, afterEach } from "vitest";
import { ErrorGmail, listarIdsMensajes, obtenerMensaje } from "./gmailApi";

afterEach(() => vi.unstubAllGlobals());

describe("listarIdsMensajes", () => {
  it("junta ids a través de varias páginas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: "c" }] }) });
    vi.stubGlobal("fetch", fetchMock);

    const ids = await listarIdsMensajes("token", "from:bancolombia");

    expect(ids).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=p2");
  });

  it("devuelve lista vacía si no hay mensajes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await listarIdsMensajes("token", "q")).toEqual([]);
  });

  it("lanza error si Gmail responde con fallo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => { throw new Error("no json"); } }));
    await expect(listarIdsMensajes("token", "q")).rejects.toThrow("Gmail list falló: 401");
  });

  it("incluye el motivo de Google en un 403 y detecta falta de permiso", async () => {
    const cuerpo = {
      error: {
        code: 403,
        message: "Request had insufficient authentication scopes.",
        status: "PERMISSION_DENIED",
        details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => cuerpo }));

    const error = await listarIdsMensajes("token", "q").catch((e) => e);

    expect(error).toBeInstanceOf(ErrorGmail);
    expect(error.message).toContain("403 (ACCESS_TOKEN_SCOPE_INSUFFICIENT");
    expect(error.faltaPermiso).toBe(true);
  });

  it("un 403 de cuota no se trata como falta de permiso", async () => {
    const cuerpo = { error: { code: 403, message: "Rate limit exceeded", errors: [{ reason: "userRateLimitExceeded" }] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => cuerpo }));

    const error = await listarIdsMensajes("token", "q").catch((e) => e);

    expect(error.message).toContain("userRateLimitExceeded");
    expect(error.faltaPermiso).toBe(false);
  });
});

describe("obtenerMensaje", () => {
  it("pide el mensaje en formato full con Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "m1", payload: {} }) });
    vi.stubGlobal("fetch", fetchMock);

    const mensaje = await obtenerMensaje("token-xyz", "m1");

    expect(mensaje.id).toBe("m1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/messages/m1?format=full");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-xyz");
  });
});
