import { describe, it, expect, vi } from "vitest";
import { extraerTextoPlano, parsearNotificacionLocal, parsearNotificacionConClaude } from "./parse";

function base64Url(texto: string): string {
  return Buffer.from(texto, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Correo real compartido por David (remitente alertasynotificaciones@bancolombia.com.co).
const TEXTO_NOTIFICACION =
  "Bancolombia informa pago Factura Programada CLARO SOLUCIONE Ref 14152207 por $172.860,00 desde TC*0459. 17/08/2026. Inquietudes 6045109095/018000931987.";

describe("extraerTextoPlano", () => {
  it("decodifica la parte text/plain", () => {
    const payload = { mimeType: "text/plain", body: { data: base64Url(TEXTO_NOTIFICACION) } };
    expect(extraerTextoPlano(payload)).toBe(TEXTO_NOTIFICACION);
  });

  it("en multipart, prefiere text/plain sobre text/html", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: base64Url("<p>otra cosa</p>") } },
        { mimeType: "text/plain", body: { data: base64Url(TEXTO_NOTIFICACION) } },
      ],
    };
    expect(extraerTextoPlano(payload)).toBe(TEXTO_NOTIFICACION);
  });

  it("si solo hay html, le quita las etiquetas y normaliza espacios", () => {
    const html = "<html><body><p>Bancolombia informa</p><p>Compra por $50.000,00 desde TC*1234.</p><p>17/08/2026.</p></body></html>";
    const payload = { mimeType: "text/html", body: { data: base64Url(html) } };
    expect(extraerTextoPlano(payload)).toContain("Bancolombia informa Compra por $50.000,00 desde TC*1234. 17/08/2026.");
  });

  it("sin payload devuelve cadena vacía", () => {
    expect(extraerTextoPlano(undefined)).toBe("");
  });
});

describe("parsearNotificacionLocal", () => {
  it("extrae monto, fecha y descripción del correo real de Bancolombia", () => {
    expect(parsearNotificacionLocal(TEXTO_NOTIFICACION)).toEqual({
      monto: 172860,
      fecha: "2026-08-17",
      nota: "pago Factura Programada CLARO SOLUCIONE",
      categoria: "otros",
    });
  });

  it("generaliza a otro monto/fecha/comercio con la misma estructura", () => {
    const texto =
      "Bancolombia informa Compra Programada NETFLIX Ref 998877 por $45.900,00 desde TC*0459. 05/01/2026. Inquietudes 6045109095/018000931987.";
    expect(parsearNotificacionLocal(texto)).toEqual({
      monto: 45900,
      fecha: "2026-01-05",
      nota: "Compra Programada NETFLIX",
      categoria: "otros",
    });
  });

  it("devuelve null si el texto no matchea el formato esperado", () => {
    expect(parsearNotificacionLocal("Un correo cualquiera sin el formato de Bancolombia")).toBeNull();
  });
});

describe("parsearNotificacionConClaude", () => {
  it("sin ANTHROPIC_API_KEY, devuelve null sin llamar a la API", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await parsearNotificacionConClaude("cualquier texto")).toBeNull();
    vi.unstubAllEnvs();
  });
});
