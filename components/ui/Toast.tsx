"use client";

import type { AccionToast } from "@/hooks/useToast";

export function Toast({ mensaje, accion }: { mensaje: string; accion?: AccionToast | null }) {
  if (!mensaje) return null;
  return (
    <div className="fixed left-1/2 bottom-6 -translate-x-1/2 bg-ink text-white pl-4 pr-1.5 py-0.5 rounded-xl text-sm z-[60] flex items-center gap-3 min-h-[44px]">
      <span className={accion ? "" : "pr-2"}>{mensaje}</span>
      {accion && (
        <button type="button" onClick={accion.onClick} className="min-h-[44px] px-3 rounded-lg font-semibold underline underline-offset-2 cursor-pointer">
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
