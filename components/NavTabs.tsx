"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/registro", label: "Registro" },
  { href: "/historial", label: "Historial" },
  { href: "/cuenta", label: "Cuenta" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex gap-1 bg-[#E4DFEC] p-[3px] rounded-xl flex-1">
        {TABS.map((t) => {
          const activo = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 text-center py-2 rounded-lg text-sm ${
                activo ? "bg-surface text-ink font-semibold shadow-sm" : "text-muted"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
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
