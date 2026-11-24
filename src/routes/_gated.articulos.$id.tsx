import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Loader2, PackagePlus, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteItem } from "@/lib/inventory.functions";
import { INVENTORY_KEYS, itemQuery } from "@/lib/queries";
import { formatQuantity, isLowStock, MOVEMENT_LABELS, type StockMovementType } from "@/lib/inventory-rules";
import { errorMessage } from "@/lib/access-error";
import { CodeBadge, EmptyState, formatDateTime, ItemThumb, Section } from "@/components/app/bits";
import { MovementList } from "@/components/app/MovementList";
import { MovementForm } from "@/components/app/MovementForm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_gated/articulos/$id")({
  head: () => ({
    meta: [
      { title: "Artículo · Inventario a Mano" },
      { name: "description", content: "Datos, stock y movimientos de un artículo del inventario." },
      { property: "og:title", content: "Artículo · Inventario a Mano" },
      { property: "og:description", content: "Datos, stock y movimientos de un artículo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(itemQuery(params.id));
  },
  component: ItemPage,
});

function ItemPage() {
  const { id } = Route.useParams();
  const { data, isPending } = useQuery(itemQuery(id));
  const [movementType, setMovementType] = useState<StockMovementType | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (isPending) return <Loader2 className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;
  if (!data)
    return (
      <EmptyState icon={<ArrowLeft />} title="El artículo no existe o fue eliminado">
        <Link to="/" className="font-semibold text-primary">Volver al inventario</Link>
      </EmptyState>
    );

  const { item, movements } = data;
  const low = isLowStock(item.quantity, item.min_stock);

  return (
    <div className="space-y-5 animate-rise">
      <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> Inventario
      </Link>

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          <ItemThumb url={item.photo_url} hasPhoto={item.has_photo} alt={item.name} className="w-full" />
          {item.photo_url && !item.has_embedding ? (
            <p className="text-xs text-muted-foreground">Esta foto todavía no está preparada para la búsqueda visual. Vuelva a cargarla desde "Modificar datos".</p>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CodeBadge code={item.code} className="text-sm" />
                <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{item.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[item.category_name ?? "Sin categoría", item.location_name ?? "Sin ubicación"].join(" · ")}
                </p>
              </div>
              <div className={cn("rounded-xl px-4 py-3 text-right", low ? "bg-warning-soft" : "bg-primary-soft")}>
                <p className={cn("font-code text-3xl font-semibold", low ? "text-warning-foreground" : "text-primary")}>
                  {formatQuantity(item.quantity)}
                </p>
                <p className="text-sm text-muted-foreground">{item.unit} disponibles</p>
                {low ? <p className="text-xs font-semibold text-warning-foreground">Stock bajo (mín. {formatQuantity(item.min_stock)})</p> : null}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button variant="success" size="lg" onClick={() => setMovementType("reposicion")}>
                <PackagePlus /> Otra tanda
              </Button>
              <Button variant="soft" size="lg" onClick={() => setMovementType("entrada")}>
                <ArrowDownToLine /> Entrada
              </Button>
              <Button variant="soft" size="lg" onClick={() => setMovementType("salida")}>
                <ArrowUpFromLine /> Salida
              </Button>
              <Button variant="soft" size="lg" onClick={() => setMovementType("ajuste")}>
                <SlidersHorizontal /> Ajuste
              </Button>
            </div>
          </div>

          <Section
            title="Datos del artículo"
            action={
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/editar/$id" params={{ id: item.id }}>
                    <Pencil /> Modificar datos
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(true)}>
                  <Trash2 /> Eliminar
                </Button>
              </div>
            }
          >
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Descripción" wide>{item.description || "—"}</Field>
              <Field label="Observaciones" wide>{item.notes || "—"}</Field>
              <Field label="Stock mínimo">{item.min_stock > 0 ? `${formatQuantity(item.min_stock)} ${item.unit}` : "Sin aviso"}</Field>
              <Field label="Unidad de medida">{item.unit}</Field>
              <Field label="Fecha de registro">{formatDateTime(item.created_at)}</Field>
              <Field label="Última modificación">{formatDateTime(item.updated_at)}</Field>
            </dl>
          </Section>

          <Section title="Movimientos de este artículo" description="Se conservan aunque se modifiquen sus datos.">
            {movements.length ? <MovementList movements={movements} showItem={false} /> : <p className="text-sm text-muted-foreground">Sin movimientos.</p>}
          </Section>
        </div>
      </div>

      <Dialog open={!!movementType} onOpenChange={(o) => !o && setMovementType(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{movementType === "reposicion" ? "Agregar otra tanda" : `Registrar ${movementType ? MOVEMENT_LABELS[movementType].toLowerCase() : ""}`}</DialogTitle>
            <DialogDescription>
              <span className="font-code">{item.code}</span> · {item.name} — se mantiene el mismo código.
            </DialogDescription>
          </DialogHeader>
          {movementType ? (
            <MovementForm key={`${movementType}-${item.quantity}`} item={item} fixedItem defaultType={movementType} onDone={() => setMovementType(null)} />
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteDialog open={deleting} onOpenChange={setDeleting} id={item.id} code={item.code} name={item.name} />
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{children}</dd>
    </div>
  );
}

function DeleteDialog({ open, onOpenChange, id, code, name }: { open: boolean; onOpenChange: (v: boolean) => void; id: string; code: string; name: string }) {
  const [typed, setTyped] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const remove = useServerFn(deleteItem);
  const mutation = useMutation({
    mutationFn: remove,
    onSuccess: async () => {
      toast.success("Artículo eliminado", { description: "Su historial de movimientos se conserva." });
      await Promise.all(INVENTORY_KEYS.map((k) => qc.invalidateQueries({ queryKey: k })));
      navigate({ to: "/" });
    },
    onError: (err) => toast.error(errorMessage(err, "No se pudo eliminar")),
  });
  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTyped(""); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar «{name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quitará del inventario junto con su foto. Los movimientos anteriores quedan en el historial. Para confirmar, escriba el código{" "}
            <span className="font-code font-semibold text-foreground">{code}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder={code} className="font-code h-11 text-lg tracking-[0.25em]" aria-label="Código de confirmación" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={typed !== code || mutation.isPending} onClick={() => mutation.mutate({ data: { id, confirmCode: typed } })}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar definitivamente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
