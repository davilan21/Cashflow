"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const MENSAJES: Record<string, string> = {
  invalid_credentials: "Correo o contraseña incorrectos.",
  email_not_confirmed: "Tu correo aún no está confirmado.",
  user_already_exists: "Ese correo ya está registrado. Inicia sesión.",
  weak_password: "La contraseña es muy débil; usa al menos 8 caracteres.",
  over_request_rate_limit: "Demasiados intentos. Espera un minuto.",
  over_email_send_rate_limit: "Demasiados intentos. Espera un minuto.",
  signup_disabled: "El registro está deshabilitado.",
  validation_failed: "Revisa el correo y la contraseña.",
};

function mensajeError(err: AuthError): string {
  if (err.code && MENSAJES[err.code]) return MENSAJES[err.code];
  if (err.status === 429) return "Demasiados intentos. Espera un minuto.";
  return "No pude completar la operación. Intenta de nuevo.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"login" | "signup">("login");
  const [estado, setEstado] = useState<"idle" | "enviando" | "confirmar" | "error">("idle");
  const [error, setError] = useState("");

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (estado === "enviando") return;
    const correo = email.trim().toLowerCase();
    if (!correo || !password) return;
    if (modo === "signup" && password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      setEstado("error");
      return;
    }

    setEstado("enviando");
    setError("");
    const supabase = createClient();

    if (modo === "login") {
      const { error: err } = await supabase.auth.signInWithPassword({ email: correo, password });
      if (err) {
        setError(mensajeError(err));
        setEstado("error");
        return;
      }
      router.replace("/registro");
      router.refresh();
      return;
    }

    const { data, error: err } = await supabase.auth.signUp({
      email: correo,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError(mensajeError(err));
      setEstado("error");
      return;
    }
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError("Ese correo ya está registrado. Inicia sesión.");
      setEstado("error");
      return;
    }
    if (!data.session) {
      setEstado("confirmar");
      return;
    }
    router.replace("/registro");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface border border-line rounded-2xl p-6">
        <h1 className="text-2xl font-display font-extrabold text-ink">Cashflow</h1>
        <p className="text-sm text-muted mt-1">Control de gasto de tarjeta de crédito.</p>

        {estado === "confirmar" ? (
          <p className="mt-6 text-sm text-ok leading-relaxed">
            Creamos tu cuenta. Revisa <span className="font-medium text-ink">{email}</span> para
            confirmarla.
          </p>
        ) : (
          <>
            <form method="post" onSubmit={enviar} className="mt-6 space-y-3">
              <label htmlFor="email" className="block text-xs uppercase tracking-wider text-muted font-semibold">
                Correo
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tú@correo.com"
                className="w-full border border-line rounded-lg px-3 py-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-[#6B4E9E]"
              />
              <label htmlFor="password" className="block text-xs uppercase tracking-wider text-muted font-semibold">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={modo === "signup" ? 8 : undefined}
                autoComplete={modo === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-[#6B4E9E]"
              />
              {error && <p className="text-alerta text-sm">{error}</p>}
              <button
                type="submit"
                disabled={estado === "enviando"}
                className="w-full bg-ink text-white rounded-lg py-3 font-medium disabled:opacity-40"
              >
                {estado === "enviando"
                  ? modo === "login"
                    ? "Entrando…"
                    : "Creando…"
                  : modo === "login"
                    ? "Entrar"
                    : "Crear cuenta"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setModo((m) => (m === "login" ? "signup" : "login"));
                setError("");
                setEstado("idle");
              }}
              className="mt-4 w-full text-center text-sm text-muted underline min-h-[44px]"
            >
              {modo === "login" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Entrar"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
