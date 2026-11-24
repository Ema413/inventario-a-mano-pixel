import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  FileSpreadsheet,
  Hash,
  Loader2,
  LockKeyhole,
  LogOut,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { exportExcel, type ExportData } from "@/lib/backup-client";
import { getStorageStatus, listItems, listMovements, listNamed } from "@/lib/inventory.functions";

const APP_NOMBRE = "Inventario a Mano";
const APP_DESCRIPCION = "Inventario compartido con acceso por PIN para todo el equipo.";
const CLAVE_ACCESO_PIN = "inventario_pin_autorizado";

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Ocurrió un error inesperado.";
}

async function obtenerTodosLosMovimientos() {
  const maxMovements = 5000;
  const pageSize = 200;
  const first = await listMovements({ data: { limit: pageSize, offset: 0 } });
  const rows = [...(first?.rows ?? [])];
  const total = Number(first?.total ?? rows.length);
  const target = Math.min(total, maxMovements);

  for (let offset = pageSize; offset < target; offset += pageSize) {
    const page = await listMovements({ data: { limit: pageSize, offset } });
    rows.push(...(page?.rows ?? []));
  }

  return rows;
}

export const Route = createFileRoute("/_gated/ajustes")({
  head: () => ({
    meta: [
      { title: `Ajustes · ${APP_NOMBRE}` },
      { name: "description", content: "Acceso con PIN compartido, dispositivos y reglas del inventario." },
      { property: "og:title", content: `Ajustes · ${APP_NOMBRE}` },
      { property: "og:description", content: "Acceso con PIN compartido, dispositivos y reglas del inventario." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AjustesPage,
});

function AjustesPage() {
  const navigate = useNavigate();
  const [exportandoExcel, setExportandoExcel] = useState(false);

  const handleExportarExcel = async () => {
    setExportandoExcel(true);
    try {
      const [itemsRes, categoriesRes, locationsRes, movementsRes, storageRes] = await Promise.allSettled([
        listItems(),
        listNamed({ data: { table: "categories" } }),
        listNamed({ data: { table: "locations" } }),
        obtenerTodosLosMovimientos(),
        getStorageStatus(),
      ]);

      const items = itemsRes.status === "fulfilled" ? (itemsRes.value ?? []) : [];
      const categories = categoriesRes.status === "fulfilled" ? (categoriesRes.value ?? []) : [];
      const locations = locationsRes.status === "fulfilled" ? (locationsRes.value ?? []) : [];
      const allMovements = movementsRes.status === "fulfilled" ? (movementsRes.value ?? []) : [];
      const storage = storageRes.status === "fulfilled" ? storageRes.value : null;

      const errores = [itemsRes, categoriesRes, locationsRes, movementsRes, storageRes]
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

      if (
        items.length === 0 &&
        categories.length === 0 &&
        locations.length === 0 &&
        allMovements.length === 0 &&
        errores.length > 0
      ) {
        throw new Error(errores[0]);
      }

      const data: ExportData = {
        exportedAt: new Date().toISOString(),
        settings: { backup_reminder_days: Number(storage?.reminderDays ?? 0) },
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
        })),
        locations: locations.map((l) => ({
          id: l.id,
          name: l.name,
        })),
        items: items.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          category_id: i.category_id,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          location_id: i.location_id,
          min_stock: i.min_stock,
          notes: i.notes,
          photo_path: i.has_photo ? i.code : null,
          created_at: i.created_at,
          updated_at: i.updated_at,
        })),
        movements: allMovements.map((m) => ({
          created_at: m.created_at,
          item_code: m.item_code,
          item_name: m.item_name,
          type: m.type,
          quantity: m.quantity,
          unit: m.unit,
          quantity_before: m.quantity_before,
          quantity_after: m.quantity_after,
          reason: m.reason,
          notes: m.notes,
          actor: m.actor,
        })),
        photos: [],
      };

      await exportExcel(data);

      if (errores.length > 0) {
        toast.warning("Excel generado con datos parciales", {
          description: errores.join(" · "),
        });
      } else {
        toast.success("Planilla de Excel generada con los datos del inventario");
      }
    } catch (err) {
      toast.error("No se pudo exportar a Excel", { description: mensajeError(err) });
    } finally {
      setExportandoExcel(false);
    }
  };

  const salir = async () => {
    window.localStorage.removeItem(CLAVE_ACCESO_PIN);
    await supabase.auth.signOut().catch(() => {});
    navigate({ to: "/auth" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="animate-rise">
        <p className="font-codigo text-xs uppercase text-muted-foreground">Configuración</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Ajustes</h1>
      </div>

      <Bloque icono={FileSpreadsheet} titulo="Copia de seguridad en Excel">
        <p className="text-sm text-muted-foreground">
          Exportá el inventario general, entradas, salidas, historial, categorías y ubicaciones en un archivo Excel
          (`.xlsx`) antes de vaciar o limpiar los datos para la entrega.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={handleExportarExcel}
          disabled={exportandoExcel}
          className="mt-4"
        >
          {exportandoExcel ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {exportandoExcel ? "Generando Excel..." : "Descargar copia en Excel"}
        </Button>
      </Bloque>

      <Bloque icono={LockKeyhole} titulo="Acceso con PIN compartido">
        <p className="text-sm text-muted-foreground">
          Todo el equipo entra con el mismo enlace y el mismo PIN de cuatro números, sin cuentas individuales. No hay
          límite de personas ni de dispositivos conectados, y todos ven los cambios al instante.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Por seguridad, después de varios PIN incorrectos el ingreso se frena unos minutos. Quien ya está adentro no se ve
          afectado.
        </p>
        <Button
          type="button"
          variant="ghost"
          onClick={salir}
          className="mt-4 text-destructive hover:text-destructive"
        >
          <LogOut />
          Salir en este dispositivo
        </Button>
      </Bloque>

      <Bloque icono={Hash} titulo="Códigos de identificación">
        <p className="text-sm text-muted-foreground">
          Cada artículo lleva el código de seis números que ingresás al registrarlo (por ejemplo, 000125). No se repite
          entre artículos y no cambia al editar los demás datos. La foto queda asociada a ese código.
        </p>
      </Bloque>

      <Bloque icono={Shapes} titulo="Categorías y registro">
        <p className="text-sm text-muted-foreground">
          Organizá los artículos por categoría y ubicación al crear o editar un registro para mantener ordenado el
          stock.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/">Ir al inventario</Link>
          </Button>
        </div>
      </Bloque>

      <section className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="font-display text-lg font-bold">{APP_NOMBRE}</span>
        <p className="max-w-sm text-xs text-muted-foreground">{APP_DESCRIPCION}</p>
      </section>
    </div>
  );
}

function Bloque({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <section className="animate-rise rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icono className="size-[18px]" />
        </span>
        <h2 className="text-lg font-semibold">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}