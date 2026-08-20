import { describe, it, expect, vi, beforeEach } from "vitest";
import { extraerTextoPlano, parsearNotificacionLocal, parsearNotificacionConClaude } from "./parse";

// vi.mock se iza sobre los imports, así que el mock compartido se crea con
// vi.hoisted para poder configurarlo desde cada test.
const { crearMensaje } = vi.hoisted(() => ({ crearMensaje: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: crearMensaje };
  },
}));

/** Respuesta de la API con una llamada a registrar_gasto_bancario. */
function respuestaHerramienta(input: Record<string, unknown>) {
  return { content: [{ type: "tool_use", name: "registrar_gasto_bancario", input }] };
}

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

  // Correos reales del remitente alertasynotificaciones@an.notificacionesbancolombia.com
  // (compras normales, distinto del remitente de pagos programados de arriba).
  it("compra con 'con tu T.Cred' antes de la coma y la fecha", () => {
    const texto =
      "¡Listo! Todo salió bien con tus movimientos Bancolombia: Compraste COP31.050,00 en CITY PARKING PLAZA U con tu T.Cred *0459, el 20/08/2026 a las 15:16. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987.";
    expect(parsearNotificacionLocal(texto)).toEqual({
      monto: 31050,
      fecha: "2026-08-20",
      nota: "CITY PARKING PLAZA U",
      categoria: "otros",
    });
  });

  it("compra sin tarjeta antes de la coma — el T.Cred aparece después, en otra frase", () => {
    const texto =
      "¡Listo! Todo salió bien con tus movimientos Bancolombia: Compraste COP16.100,00 en GOPASS, el 15/08/2026 a las 19:16. Esta compra esta asociada a T.Cred *0459. Si tienes dudas, encuentranos aqui: 01800931987.";
    expect(parsearNotificacionLocal(texto)).toEqual({
      monto: 16100,
      fecha: "2026-08-15",
      nota: "GOPASS",
      categoria: "otros",
    });
  });

  it("un recordatorio de factura por pagar (no un gasto todavía) no matchea ningún patrón", () => {
    const texto =
      "¡Te interesa! Tenemos novedades. Buenas noticias: La factura que inscribiste CLARO MOVIL COM con referencia 5456442922 está lista para que la pagues. Vence el 26/08/2026. Si activaste el pago automático, lo haremos en la fecha programada.";
    expect(parsearNotificacionLocal(texto)).toBeNull();
  });
});

describe("parsearNotificacionConClaude", () => {
  beforeEach(() => {
    crearMensaje.mockReset();
  });

  it("sin ANTHROPIC_API_KEY, devuelve null sin llamar a la API", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await parsearNotificacionConClaude("cualquier texto")).toBeNull();
    expect(crearMensaje).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("si Claude marca es_gasto = false, devuelve null (no es una compra)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    crearMensaje.mockResolvedValue(
      respuestaHerramienta({
        es_gasto: false,
        monto: 250000,
        comercio: "Transferencia recibida",
        fecha: "2026-08-17",
        categoria: "otros",
      })
    );
    // Aunque el monto sea válido, un correo que no es gasto no debe producir
    // un pendiente: evita ensuciar la bandeja de revisión.
    expect(await parsearNotificacionConClaude("Recibiste una transferencia por $250.000")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("si Claude marca es_gasto = true, devuelve el gasto detectado", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    crearMensaje.mockResolvedValue(
      respuestaHerramienta({
        es_gasto: true,
        monto: 172860,
        comercio: "CLARO SOLUCIONES",
        fecha: "2026-08-17",
        categoria: "suscripciones",
      })
    );
    expect(await parsearNotificacionConClaude(TEXTO_NOTIFICACION)).toEqual({
      monto: 172860,
      fecha: "2026-08-17",
      nota: "CLARO SOLUCIONES",
      categoria: "suscripciones",
    });
    vi.unstubAllEnvs();
  });
});
