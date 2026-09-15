"use client";

import { useEffect, useId } from "react";

/**
 * Hoja que sube desde abajo. En móvil el teclado no la tapa, a diferencia del
 * Modal centrado. Cierra con tap afuera o Escape.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/45 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="sheet-entrar w-full max-w-xl bg-surface rounded-t-2xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-line mb-3" aria-hidden="true" />
        <h3 id={tituloId} className="text-[17px] font-semibold text-ink">
          {titulo}
        </h3>
        {children}
      </div>
    </div>
  );
}
