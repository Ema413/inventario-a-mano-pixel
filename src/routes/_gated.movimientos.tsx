import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/app/bits";
import { MovementForm } from "@/components/app/MovementForm";
import { MovementList } from "@/components/app/MovementList";
import { itemsQuery, movementsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_gated/movimientos")({
  head: () => ({
    meta: [
      { title: "Movimientos · Inventario a Mano" },
      { name: "description", content: "Registrar entradas, salidas, reposiciones y ajustes de stock." },
      { property: "og:title", content: "Movimientos · Inventario a Mano" },
      { property: "og:description", content: "Registrar entradas, salidas, reposiciones y ajustes de stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(itemsQuery());
    void context.queryClient.prefetchQuery(movementsQuery({}, 10));
  },
  component: MovementsPage,
});

function MovementsPage() {
  const recent = useQuery(movementsQuery({}, 10));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimientos"
        subtitle="Cada movimiento actualiza el stock automáticamente y queda en el historial."
        actions={
          <Button asChild variant="outline" size="lg">
            <Link to="/historial">
              <History /> Ver historial completo
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Section title="Registrar movimiento">
          <MovementForm />
        </Section>
        <Section
          title="Recientes"
          action={
            <Link to="/historial" className="text-sm font-semibold text-primary hover:underline">
              Ver todo
            </Link>
          }
        >
          {recent.data?.rows.length ? (
            <MovementList movements={recent.data.rows} />
          ) : (
            <p className="text-sm text-muted-foreground">{recent.isPending ? "Cargando…" : "Todavía no hay movimientos."}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
