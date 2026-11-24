import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ItemForm } from "@/components/app/ItemForm";
import { EmptyState, PageHeader } from "@/components/app/bits";
import { itemQuery, namedQuery } from "@/lib/queries";

export const Route = createFileRoute("/_gated/editar/$id")({
  head: () => ({
    meta: [
      { title: "Modificar artículo · Inventario a Mano" },
      { name: "description", content: "Modificar los datos de un artículo del inventario." },
      { property: "og:title", content: "Modificar artículo · Inventario a Mano" },
      { property: "og:description", content: "Modificar los datos de un artículo del inventario." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(itemQuery(params.id));
    void context.queryClient.prefetchQuery(namedQuery("categories"));
    void context.queryClient.prefetchQuery(namedQuery("locations"));
  },
  component: EditItemPage,
});

function EditItemPage() {
  const { id } = Route.useParams();
  const { data, isPending } = useQuery(itemQuery(id));
  if (isPending) return <Loader2 className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  if (!data) return <EmptyState icon={<ArrowLeft />} title="El artículo no existe o fue eliminado" />;
  return (
    <div>
      <Link to="/articulos/$id" params={{ id }} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> Volver al artículo
      </Link>
      <PageHeader title="Modificar artículo" subtitle={data.item.name} />
      <ItemForm key={data.item.updated_at} mode="edit" item={data.item} />
    </div>
  );
}
