import { describe, it, expect, vi, afterEach } from "vitest";
import { listarIdsMensajes, obtenerMensaje } from "./gmailApi";

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(listarIdsMensajes("token", "q")).rejects.toThrow();
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
