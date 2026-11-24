import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ItemForm } from "@/components/app/ItemForm";
import { PageHeader } from "@/components/app/bits";
import { itemsQuery, namedQuery } from "@/lib/queries";

export const Route = createFileRoute("/_gated/articulos/nuevo")({
  validateSearch: (search: Record<string, unknown>): { code?: string | undefined } => ({
  code:
    typeof search["code"] === "string"
      ? search["code"].replace(/\D/g, "").slice(0, 6) || undefined
      : undefined,

}),
  head: () => ({
    meta: [
      { title: "Nuevo artículo · Inventario a Mano" },
      { name: "description", content: "Registrar un artículo nuevo con código de seis dígitos, foto y ubicación." },
      { property: "og:title", content: "Nuevo artículo · Inventario a Mano" },
      { property: "og:description", content: "Registrar un artículo nuevo en el inventario compartido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(namedQuery("categories"));
    void context.queryClient.prefetchQuery(namedQuery("locations"));
    void context.queryClient.prefetchQuery(itemsQuery());
  },
  component: NewItemPage,
});

function NewItemPage() {
  const { code } = Route.useSearch();
  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> Inventario
      </Link>
      <PageHeader title="Nuevo artículo" subtitle="Ingrese el código de 6 dígitos que identifica al artículo." />
<ItemForm mode="create" {...(code ? { initialCode: code } : {})} />    </div>
  );
}
