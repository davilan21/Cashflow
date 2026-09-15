"use client";

import { useEffect, useId, useRef } from "react";
import { IconoCerrar } from "@/components/plan/Iconos";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hoja que sube desde abajo. En móvil el teclado no la tapa, a diferencia del
 * Modal centrado. Cierra con tap afuera, Escape o el botón Cerrar.
 * Gestiona foco: lo mueve adentro al abrir, lo atrapa con Tab, y lo devuelve
 * al elemento que abrió la hoja al cerrarse.
 */
export function Sheet({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const tituloId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Gestión de foco: debe correr una sola vez por montaje (mover foco adentro,
  // atrapar Tab, restaurar al desmontar). onClose se lee vía onCloseRef para no
  // re-disparar el ciclo mount/unmount cuando el padre pasa un callback no
  // memoizado; por eso el array de deps queda vacío a propósito.
  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // No robar el foco si algo adentro (p.ej. un input con autoFocus) ya lo tiene.
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panel) {
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/45 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="sheet-entrar w-full max-w-xl bg-surface rounded-t-2xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-line mb-3" aria-hidden="true" />
        <div className="flex items-start justify-between gap-2">
          <h3 id={tituloId} className="flex-1 text-[17px] font-semibold text-ink">
            {titulo}
          </h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="-mr-2 -mt-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          >
            <IconoCerrar />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
