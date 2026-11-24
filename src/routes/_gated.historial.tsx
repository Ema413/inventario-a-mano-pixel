import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { listMovements } from "@/lib/inventory.functions";
import { useEffect, useState } from "react";
import { ArrowLeft, FilterX, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, Section } from "@/components/app/bits";
import { MovementList } from "@/components/app/MovementList";
import type { MovementFilters } from "@/lib/queries";
import { ALL_MOVEMENT_TYPES, MOVEMENT_LABELS } from "@/lib/inventory-rules";

export const Route = createFileRoute("/_gated/historial")({
  head: () => ({
    meta: [
      { title: "Historial · Inventario a Mano" },
      { name: "description", content: "Historial completo de entradas, salidas, ajustes y modificaciones, con filtros." },
      { property: "og:title", content: "Historial · Inventario a Mano" },
      { property: "og:description", content: "Historial completo de movimientos del inventario." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

const PAGE = 50;

function HistoryPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("todos");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

const filters: MovementFilters = {
  type,
  ...(from ? { from } : {}),
  ...(to ? { to } : {}),
  ...(q ? { q } : {}),
};  

const { data, isPending, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["movements", "history", filters],
    queryFn: ({ pageParam }) => listMovements({ data: { ...filters, limit: PAGE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((s, p) => s + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const rows = data?.pages.flatMap((p) => p.rows) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const hasFilters = !!(from || to || type !== "todos" || text);

  return (
    <div className="space-y-6">
      <Link to="/movimientos" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> Movimientos
      </Link>
      <PageHeader title="Historial" subtitle="Todos los movimientos del inventario, del más reciente al más antiguo." />

      <Section title="Filtros">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="h-q">Artículo o código</Label>
            <Input id="h-q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: 004213 o camilla" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {ALL_MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {MOVEMENT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-from">Desde</Label>
            <Input id="h-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-to">Hasta</Label>
            <Input id="h-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
          </div>
        </div>
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              setFrom("");
              setTo("");
              setType("todos");
              setText("");
            }}
          >
            <FilterX /> Quitar filtros
          </Button>
        ) : null}
      </Section>

      <Section title={data ? `${total} movimiento${total === 1 ? "" : "s"}` : "Movimientos"} action={isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length ? (
          <>
            <MovementList movements={rows} />
            {hasNextPage ? (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? <Loader2 className="animate-spin" /> : null} Cargar más ({rows.length} de {total})
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState icon={<History />} title="No hay movimientos con estos filtros" />
        )}
      </Section>
    </div>
  );
}
