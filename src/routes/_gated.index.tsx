import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Camera,
  DatabaseBackup,
  History,
  Layers,
  PackagePlus,
  Search,
  Tags,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dashboardQuery, itemsQuery } from "@/lib/queries";
import { filterItems } from "@/lib/search";
import { formatQuantity, isLowStock, isValidCode } from "@/lib/inventory-rules";
import { CodeBadge, EmptyState, ItemThumb, PageHeader, Section } from "@/components/app/bits";
import { MovementList } from "@/components/app/MovementList";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_gated/")({
  head: () => ({
    meta: [
      { title: "Inventario general · Inventario a Mano" },
      { name: "description", content: "Resumen del inventario, stock bajo, últimos movimientos y listado de artículos." },
      { property: "og:title", content: "Inventario general · Inventario a Mano" },
      { property: "og:description", content: "Resumen del inventario compartido y listado de artículos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(itemsQuery());
    void context.queryClient.prefetchQuery(dashboardQuery());
  },
  component: InventoryPage,
});

function InventoryPage() {
  const items = useQuery(itemsQuery());
  const dash = useQuery(dashboardQuery());
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const all = items.data?.items ?? [];
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of all) if (i.category_name) m.set(i.category_name, (m.get(i.category_name) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const filtered = useMemo(() => {
    const base = category ? all.filter((i) => i.category_name === category) : all;
    return filterItems(base, q);
  }, [all, q, category]);
  const query = q.trim();
  const exactCodeMissing = isValidCode(query) && !all.some((i) => i.code === query);

  const stats = dash.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario general"
        subtitle={items.data?.fromCache ? `Sin conexión · mostrando la copia guardada el ${new Date(items.data.cachedAt ?? "").toLocaleString("es-AR")}` : "Todos los artículos registrados por el centro"}
        actions={
          <Button asChild size="lg">
          <Link to="/articulos/nuevo" search={{}}>
  <PackagePlus /> Nuevo artículo
</Link>
          </Button>
        }
      />

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por foto o código (ej.: 004213)"
            aria-label="Buscar por foto o código (ej.: 004213)"
            className="h-14 rounded-2xl bg-card pl-12 pr-10 text-base shadow-card"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Borrar búsqueda">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <Button asChild size="xl" variant="soft" className="w-14 px-0" aria-label="Buscar por foto">
          <Link to="/escanear">
            <Camera className="size-6!" />
          </Link>
        </Button>
      </div>

      {stats?.backup.due ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning-foreground">
          <DatabaseBackup className="size-5 shrink-0" />
          <p className="flex-1">
            {stats.backup.lastBackupAt
              ? `Pasaron más de ${stats.backup.reminderDays} días desde la última copia de seguridad.`
              : "Todavía no se descargó ninguna copia de seguridad."}
          </p>
          <Button asChild size="sm" variant="warning">
            <Link to="/ajustes" hash="copias">Hacer copia ahora</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Boxes />} label="Artículos" value={stats ? formatQuantity(stats.totalItems) : "—"} />
        <Stat icon={<Layers />} label="Unidades disponibles" value={stats ? formatQuantity(stats.totalUnits) : "—"} />
<Stat
  icon={<AlertTriangle />}
  label="Con stock bajo"
  value={stats ? formatQuantity(stats.lowStockCount) : "0"}
  {...(stats && stats.lowStockCount > 0 ? { tone: "warning" as const } : {})}
/>     
   <Stat icon={<Tags />} label="Categorías" value={stats ? formatQuantity(stats.categoryCount) : "—"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <QuickLink to="/articulos/nuevo" icon={<PackagePlus />} title="Registrar artículo" text="Con código de 6 dígitos" />
        <QuickLink to="/movimientos" icon={<ArrowLeftRight />} title="Registrar movimiento" text="Entradas, salidas, ajustes" />
        <QuickLink to="/escanear" icon={<Camera />} title="Buscar por foto" text="Cámara o galería" />
        <QuickLink to="/historial" icon={<History />} title="Historial" text="Todos los movimientos" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              {query ? `Resultados (${filtered.length})` : `Artículos (${all.length})`}
            </h2>
          </div>
          {categories.length ? (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <Chip active={!category} onClick={() => setCategory(null)}>Todas</Chip>
              {categories.map(([name, count]) => (
                <Chip key={name} active={category === name} onClick={() => setCategory(category === name ? null : name)}>
                  {name} <span className="opacity-60">{count}</span>
                </Chip>
              ))}
            </div>
          ) : null}

          {items.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="surface h-20 animate-pulse" />
              ))}
            </div>
          ) : items.isError ? (
            <EmptyState icon={<AlertTriangle />} title="No se pudo cargar el inventario">
              Revise la conexión e intente nuevamente.
            </EmptyState>
          ) : filtered.length === 0 ? (
            query ? (
              <EmptyState icon={<Search />} title="No se encontraron artículos">
                {exactCodeMissing ? (
                  <Button asChild className="mt-2">
                    <Link to="/articulos/nuevo" search={{ code: query }}>
                      <PackagePlus /> Registrar con código {query}
                    </Link>
                  </Button>
                ) : (
                  "Pruebe con otro nombre, un código o busque por foto."
                )}
              </EmptyState>
            ) : (
              <EmptyState icon={<Boxes />} title="El inventario está vacío">
                <p>Registre el primer artículo con su código de 6 dígitos.</p>
                <Button asChild className="mt-3">
                 <Link to="/articulos/nuevo" search={{}}>
  <PackagePlus /> Nuevo artículo
</Link>
                </Button>
              </EmptyState>
            )
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {filtered.slice(0, 300).map((it) => {
                const low = isLowStock(it.quantity, it.min_stock);
                return (
                  <li key={it.id}>
                    <Link
                      to="/articulos/$id"
                      params={{ id: it.id }}
                      className={cn(
                        "surface flex items-center gap-3 p-3 transition-colors hover:border-primary/40",
                        query && it.code === query && "border-primary ring-2 ring-primary/20",
                      )}
                    >
                      <ItemThumb url={it.photo_url} hasPhoto={it.has_photo} alt={it.name} className="size-16" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CodeBadge code={it.code} />
                          {low ? (
                            <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">Stock bajo</span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate font-semibold text-foreground">{it.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[it.category_name, it.location_name].filter(Boolean).join(" · ") || "Sin categoría ni ubicación"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-code text-xl font-semibold", low ? "text-warning-foreground" : "text-foreground")}>
                          {formatQuantity(it.quantity)}
                        </p>
                        <p className="text-xs text-muted-foreground">{it.unit}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > 300 ? (
            <p className="text-center text-sm text-muted-foreground">Mostrando 300 de {filtered.length}. Refine la búsqueda para ver más.</p>
          ) : null}
        </section>

        <aside className="space-y-4">
          <Section title="Stock bajo" description="Artículos en o por debajo de su mínimo">
            {stats?.lowStock.length ? (
              <ul className="space-y-2">
                {stats.lowStock.map((i) => (
                  <li key={i.id}>
                    <Link to="/articulos/$id" params={{ id: i.id }} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                      <span className="min-w-0">
                        <span className="font-code mr-2 text-xs text-muted-foreground">{i.code}</span>
                        <span className="truncate text-sm font-medium">{i.name}</span>
                      </span>
                      <span className="font-code shrink-0 text-sm font-semibold text-warning-foreground">
                        {formatQuantity(i.quantity)}/{formatQuantity(i.min_stock)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Ningún artículo con stock bajo.</p>
            )}
          </Section>
          <Section
            title="Últimos movimientos"
            action={
              <Link to="/historial" className="text-sm font-semibold text-primary hover:underline">
                Ver todo
              </Link>
            }
          >
            {stats?.recent.length ? (
              <MovementList movements={stats.recent} />
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "warning" }) {
  return (
    <div className={cn("surface p-4", tone === "warning" && "border-warning/40 bg-warning-soft")}>
      <div className={cn("mb-3 flex size-9 items-center justify-center rounded-lg [&_svg]:size-5", tone === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-primary-soft text-primary")}>
        {icon}
      </div>
      <p className="font-code text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function QuickLink({ to, icon, title, text }: { to: "/articulos/nuevo" | "/movimientos" | "/escanear" | "/historial"; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Button asChild variant="tile">
      {to === "/articulos/nuevo" ? (
        <Link to={to} search={{}}>
  <QuickInner icon={icon} title={title} text={text} />
</Link>
      ) : (
        <Link to={to}>
          <QuickInner icon={icon} title={title} text={text} />
        </Link>
      )}
    </Button>
  );
}

function QuickInner({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <>
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary [&_svg]:size-5!">{icon}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs font-normal text-muted-foreground">{text}</span>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}
