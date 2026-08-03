"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavTabs() {
  const pathname = usePathname();
  const enHistorial = pathname.startsWith("/historial");

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex gap-1 bg-[#E4DFEC] p-[3px] rounded-xl flex-1">
        <Link
          href="/registro"
          className={`flex-1 text-center py-2 rounded-lg text-sm ${
            !enHistorial ? "bg-surface text-ink font-semibold shadow-sm" : "text-muted"
          }`}
        >
          Registro
        </Link>
        <Link
          href="/historial"
          className={`flex-1 text-center py-2 rounded-lg text-sm ${
            enHistorial ? "bg-surface text-ink font-semibold shadow-sm" : "text-muted"
          }`}
        >
          Historial
        </Link>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="w-9 h-9 rounded-lg border border-line bg-surface text-muted text-sm"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          ⏻
        </button>
      </form>
    </div>
  );
}
