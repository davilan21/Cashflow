"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "error">("idle");
  const [error, setError] = useState("");

  const enviarEnlace = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || estado === "enviando") return;
    setEstado("enviando");
    setError("");

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (err) {
      setError("No pude enviar el enlace. Intenta de nuevo en un momento.");
      setEstado("error");
      return;
    }
    setEstado("enviado");
  };

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface border border-line rounded-2xl p-6">
        <h1 className="text-2xl font-display font-extrabold text-ink">Cashflow</h1>
        <p className="text-sm text-muted mt-1">Control de gasto de tarjeta de crédito.</p>

        {estado === "enviado" ? (
          <p className="mt-6 text-sm text-ok leading-relaxed">
            Te enviamos un enlace a <span className="font-medium text-ink">{email}</span>. Ábrelo
            desde este mismo dispositivo para entrar.
          </p>
        ) : (
          <form onSubmit={enviarEnlace} className="mt-6 space-y-3">
            <label htmlFor="email" className="block text-xs uppercase tracking-wider text-muted font-semibold">
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tú@correo.com"
              className="w-full border border-line rounded-lg px-3 py-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-[#6B4E9E]"
            />
            {error && <p className="text-alerta text-sm">{error}</p>}
            <button
              type="submit"
              disabled={estado === "enviando"}
              className="w-full bg-ink text-white rounded-lg py-3 font-medium disabled:opacity-40"
            >
              {estado === "enviando" ? "Enviando…" : "Enviar enlace de acceso"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
