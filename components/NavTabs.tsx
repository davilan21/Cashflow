"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoEngranaje } from "@/components/ui/Iconos";

const TABS = [
  { href: "/registro", label: "Registro" },
  { href: "/pendientes", label: "Pendientes" },
  { href: "/pagos", label: "Pagos" },
  { href: "/historial", label: "Historial" },
  { href: "/plan", label: "Plan" },
  { href: "/ahorros", label: "Ahorros" },
  // Cuenta va al final: en móvil se oculta del segmentado y aparece como ícono.
  { href: "/cuenta", label: "Cuenta", soloEscritorio: true },
] as const;

export function NavTabs({ pendientesCount = 0, pagosCount = 0 }: { pendientesCount?: number; pagosCount?: number }) {
  const pathname = usePathname();
  const enCuenta = pathname.startsWith("/cuenta");

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="flex gap-1 bg-[#E4DFEC] p-[3px] rounded-xl flex-1 min-w-0">
        {TABS.map((t) => {
          const activo = pathname.startsWith(t.href);
          // La etiqueta se trunca; el contador es hermano que no encoge, así no se corta a 375px.
          const display = "soloEscritorio" in t && t.soloEscritorio ? "hidden lg:flex" : "flex";
          const contador = t.href === "/pendientes" ? pendientesCount : t.href === "/pagos" ? pagosCount : 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`${display} flex-1 min-w-0 items-center justify-center py-2 rounded-lg text-[13px] lg:text-sm ${
                activo ? "bg-surface text-ink font-semibold shadow-sm" : "text-muted"
              }`}
            >
              <span className="truncate min-w-0">{t.label}</span>
              {contador > 0 && (
                <span className="ml-1 shrink-0 bg-alerta text-white text-[10px] rounded-full px-1.5 leading-4">
                  {contador}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <Link
        href="/cuenta"
        aria-label="Cuenta"
        title="Cuenta"
        className={`lg:hidden w-9 h-9 rounded-lg border flex items-center justify-center ${
          enCuenta ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"
        }`}
      >
        <IconoEngranaje />
      </Link>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="w-9 h-9 rounded-lg border border-line bg-surface text-muted text-sm cursor-pointer"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          ⏻
        </button>
      </form>
    </div>
  );
}
