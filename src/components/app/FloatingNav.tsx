import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeftRight, Camera, Package, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  {
    to: "/",
    label: "Inventario",
    icon: Package,
    match: (p: string) => p === "/" || p.startsWith("/articulos") || p.startsWith("/editar"),
  },
  {
    to: "/movimientos",
    label: "Movimientos",
    icon: ArrowLeftRight,
    match: (p: string) => p.startsWith("/movimientos") || p.startsWith("/historial"),
  },
  { to: "/escanear", label: "Escanear", icon: Camera, match: (p: string) => p.startsWith("/escanear") },
  { to: "/ajustes", label: "Ajustes", icon: Settings, match: (p: string) => p.startsWith("/ajustes") },
] as const;

/** Global floating pill navigation, rendered once by the gated layout. */
export function FloatingNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Navegación principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]"
    >
      <ul className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-nav p-1.5 shadow-float backdrop-blur-md">
        {NAV.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={to}>
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-[4.6rem] flex-col items-center gap-0.5 rounded-full px-2 py-2 text-[11px] font-semibold transition-all sm:w-auto sm:flex-row sm:gap-2 sm:px-5 sm:py-2.5 sm:text-sm",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-nav-foreground hover:bg-primary-soft hover:text-primary",
                )}
              >
                <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 2} aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
