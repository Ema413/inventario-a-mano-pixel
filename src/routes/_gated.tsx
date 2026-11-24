import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { getAccessStatus } from "@/lib/auth.functions";
import { gateRecentlyConfirmed, markGateConfirmed, resetGateCache } from "@/lib/gate-cache";
import { itemsQuery } from "@/lib/queries";
import { FloatingNav } from "@/components/app/FloatingNav";
import { BrandMark } from "@/components/app/BrandMark";

export const Route = createFileRoute("/_gated")({
  beforeLoad: async () => {
    if (gateRecentlyConfirmed()) {
      return;
    }
    try {
      const status = await getAccessStatus();
      if (!status.unlocked) {
        resetGateCache();
        throw redirect({ to: "/acceso" });
      }
      markGateConfirmed();
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) {
        throw err;
      }
      resetGateCache();
      throw redirect({ to: "/acceso" });
    }
  },
  component: GatedLayout,
});

function GatedLayout() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark className="size-9" />
          <span className="text-base font-extrabold tracking-tight text-foreground">Inventario a Mano</span>
        </Link>
        <SyncIndicator />
      </header>
      <main className="pb-nav mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <Outlet />
      </main>
      <FloatingNav />
    </div>
  );
}

function SyncIndicator() {
  const [online, setOnline] = useState(true);
  const items = useQuery(itemsQuery());
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const offline = !online || items.data?.fromCache;
  return (
    <span
      className={
        offline
          ? "inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning-foreground"
          : "inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success"
      }
      title={offline ? "Mostrando la última copia guardada en este dispositivo" : "Datos compartidos actualizados"}
    >
      {offline ? <CloudOff className="size-3.5" /> : <RefreshCw className={items.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />}
      {offline ? "Sin conexión" : "Sincronizado"}
    </span>
  );
}
