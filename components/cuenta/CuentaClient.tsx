"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generarCodigo, unirseACuenta, setApodo } from "@/lib/supabase/queries";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Toast } from "@/components/ui/Toast";
import type { Cuenta, Miembro } from "@/lib/types";

function vigente(cuenta: Cuenta | null): boolean {
  return Boolean(cuenta?.join_code && cuenta.join_expira && new Date(cuenta.join_expira) > new Date());
}

export function CuentaClient({
  userId,
  miembros,
  cuenta,
  lecturaFallida,
}: {
  userId: string;
  miembros: Miembro[];
  cuenta: Cuenta | null;
  lecturaFallida: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mensaje, mostrar } = useToast();

  const miApodo = miembros.find((m) => m.user_id === userId)?.apodo ?? "";
  const [apodo, setApodoInput] = useState(miApodo);
  const [guardandoApodo, setGuardandoApodo] = useState(false);

  const [codigo, setCodigo] = useState<string | null>(vigente(cuenta) ? cuenta!.join_code : null);
  const [generando, setGenerando] = useState(false);

  const [codigoInput, setCodigoInput] = useState("");
  const [uniendo, setUniendo] = useState(false);
  const [errorUnir, setErrorUnir] = useState("");

  const guardarApodo = async () => {
    const n = apodo.trim();
    if (guardandoApodo) return;
    setGuardandoApodo(true);
    const { error } = await setApodo(supabase, n);
    setGuardandoApodo(false);
    if (error) {
      mostrar("No se pudo guardar tu nombre");
      return;
    }
    mostrar("Nombre guardado");
    router.refresh();
  };

  const generar = async () => {
    if (generando) return;
    setGenerando(true);
    const { data, error } = await generarCodigo(supabase);
    setGenerando(false);
    if (error || !data) {
      mostrar("No se pudo generar el código");
      return;
    }
    setCodigo(data);
  };

  const copiar = async () => {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      mostrar("Código copiado");
    } catch {
      mostrar("Copia el código manualmente");
    }
  };

  const unirme = async () => {
    const c = codigoInput.trim().toUpperCase();
    if (!c || uniendo) return;
    setUniendo(true);
    setErrorUnir("");
    const { error } = await unirseACuenta(supabase, c);
    setUniendo(false);
    if (error) {
      setErrorUnir(error.message || "No pude unirte a esa cuenta");
      return;
    }
    setCodigoInput("");
    setCodigo(null); // el código de la cuenta anterior ya no aplica
    mostrar("Te uniste a la cuenta");
    router.refresh();
  };

  const nombreDe = (m: Miembro) =>
    (m.apodo?.trim() || (m.user_id === userId ? "Tú (sin nombre)" : "Sin nombre")) +
    (m.user_id === userId && m.apodo?.trim() ? " (tú)" : "");

  if (lecturaFallida) {
    return (
      <Banner accion={{ etiqueta: "Reintentar", onClick: () => router.refresh() }}>
        No pude leer la información de tu cuenta. Intenta de nuevo.
      </Banner>
    );
  }

  return (
    <>
      <div className="mb-4">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold">Cuenta</div>
        <h1 className="text-2xl font-extrabold text-ink">Compartir</h1>
        <p className="text-xs text-muted mt-0.5">
          Comparte una misma bolsa de gastos: quien entre puede ver y aportar por igual.
        </p>
      </div>

      {/* Tu nombre */}
      <section className="bg-surface border border-line rounded-2xl px-4 py-4 mb-3">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-2">Tu nombre</div>
        <p className="text-[13px] text-muted mb-2.5 leading-relaxed">
          Aparece junto a los gastos que registres, para saber quién puso qué.
        </p>
        <div className="flex gap-2">
          <input
            value={apodo}
            onChange={(e) => setApodoInput(e.target.value)}
            placeholder="Ej. David"
            maxLength={40}
            className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2.5 text-base text-ink focus:outline-none focus:ring-2 focus:ring-[#6B4E9E]"
          />
          <Button
            variant="primary"
            className="!flex-none px-4"
            onClick={guardarApodo}
            disabled={guardandoApodo || apodo.trim() === miApodo.trim()}
          >
            {guardandoApodo ? "…" : "Guardar"}
          </Button>
        </div>
      </section>

      {/* Miembros */}
      <section className="bg-surface border border-line rounded-2xl px-4 py-4 mb-3">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-2">
          Miembros · {miembros.length}
        </div>
        <ul className="flex flex-col gap-1.5">
          {miembros.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 text-sm text-ink">
              <span className="w-6 h-6 rounded-full bg-[#E4DFEC] text-[#6B4E9E] text-xs flex items-center justify-center font-semibold shrink-0">
                {(m.apodo?.trim()?.[0] ?? "?").toUpperCase()}
              </span>
              <span>{nombreDe(m)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Invitar */}
      <section className="bg-surface border border-line rounded-2xl px-4 py-4 mb-3">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-2">Invitar a alguien</div>
        <p className="text-[13px] text-muted mb-2.5 leading-relaxed">
          Genera un código y pásaselo (por WhatsApp, por ejemplo). La otra persona lo escribe abajo, ya con su
          sesión iniciada. Vence en 24 horas y sirve una sola vez.
        </p>
        {codigo ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center text-2xl font-extrabold tracking-[0.3em] text-ink bg-bg border border-line rounded-lg py-3 num">
              {codigo}
            </div>
            <Button className="!flex-none px-4" onClick={copiar}>
              Copiar
            </Button>
          </div>
        ) : null}
        <div className="flex gap-2 mt-2.5">
          <Button variant={codigo ? "default" : "primary"} onClick={generar} disabled={generando}>
            {generando ? "Generando…" : codigo ? "Generar otro" : "Generar código"}
          </Button>
        </div>
      </section>

      {/* Unirse */}
      <section className="bg-surface border border-line rounded-2xl px-4 py-4">
        <div className="text-[11px] tracking-wider uppercase text-muted font-semibold mb-2">Unirte a otra cuenta</div>
        <p className="text-[13px] text-muted mb-2.5 leading-relaxed">
          Si te compartieron un código, escríbelo aquí. Pasarás a ver y aportar en esa cuenta y usarás sus topes.
          Solo funciona si tu cuenta actual todavía no tiene gastos (tus topes propios se descartan al unirte).
        </p>
        <div className="flex gap-2">
          <input
            value={codigoInput}
            onChange={(e) => setCodigoInput(e.target.value.toUpperCase())}
            placeholder="Código"
            maxLength={6}
            autoCapitalize="characters"
            className="flex-1 min-w-0 border border-line rounded-lg px-3 py-2.5 text-base text-ink tracking-[0.2em] uppercase focus:outline-none focus:ring-2 focus:ring-[#6B4E9E]"
          />
          <Button
            variant="primary"
            className="!flex-none px-4"
            onClick={unirme}
            disabled={uniendo || !codigoInput.trim()}
          >
            {uniendo ? "…" : "Unirme"}
          </Button>
        </div>
        {errorUnir && <p className="text-alerta text-sm mt-2">{errorUnir}</p>}
      </section>

      <Toast mensaje={mensaje} />
    </>
  );
}
