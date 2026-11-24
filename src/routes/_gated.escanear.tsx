import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Camera, Hash, Loader2, PackagePlus, Pencil, RotateCcw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CodeBadge, EmptyState, ItemThumb, PageHeader, Section } from "@/components/app/bits";
import { PhotoPicker } from "@/components/app/PhotoPicker";
import { MovementForm } from "@/components/app/MovementForm";
import { itemsQuery, visualIndexQuery } from "@/lib/queries";
import { preparePhoto, type PreparedPhoto } from "@/lib/image";
import { computeEmbedding } from "@/lib/visual-search";
import { formatQuantity, isValidCode, rankVisualMatches, sanitizeCodeInput, type VisualMatch } from "@/lib/inventory-rules";
import { setPendingPhoto } from "@/lib/pending-photo";
import { errorMessage } from "@/lib/access-error";
import type { ItemDTO, VisualIndexEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_gated/escanear")({
  head: () => ({
    meta: [
      { title: "Escanear · Inventario a Mano" },
      { name: "description", content: "Buscar artículos por fotografía o por código de seis dígitos." },
      { property: "og:title", content: "Escanear · Inventario a Mano" },
      { property: "og:description", content: "Buscar artículos por fotografía o por código." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(visualIndexQuery());
    void context.queryClient.prefetchQuery(itemsQuery());
  },
  component: ScanPage,
});

type Match = VisualMatch<Omit<VisualIndexEntry, "embedding">>;
type Phase = "idle" | "analyzing" | "results";

const LEVEL_LABEL = { alta: "Muy parecido", media: "Parecido", baja: "Poco parecido" } as const;
const LEVEL_STYLE = {
  alta: "bg-success-soft text-success",
  media: "bg-info-soft text-info",
  baja: "bg-muted text-muted-foreground",
} as const;

function ScanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const items = useQuery(itemsQuery());
  const [phase, setPhase] = useState<Phase>("idle");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState("");
  const [code, setCode] = useState("");
  const [restockItem, setRestockItem] = useState<ItemDTO | null>(null);

  async function analyze(file: File) {
    setPhase("analyzing");
    setMatches([]);
    setEmbedding(null);
    try {
      setStatus("Preparando la foto…");
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setStatus("Comparando con las fotos del inventario… (la primera vez puede tardar unos segundos)");
      const [vec, index] = await Promise.all([computeEmbedding(prepared.canvas), qc.fetchQuery(visualIndexQuery())]);
      setEmbedding(vec);
      setMatches(rankVisualMatches(vec, index));
      setPhase("results");
    } catch (err) {
      console.error(err);
      toast.error(errorMessage(err, "No se pudo analizar la foto. Revise la conexión e intente de nuevo."));
      setPhase(photo ? "results" : "idle");
    }
  }

  function registerNew() {
    if (photo) setPendingPhoto({ photo, embedding });
    navigate({ to: "/articulos/nuevo", search: { code: undefined } });
  }

  function reset() {
    setPhase("idle");
    setPhoto(null);
    setMatches([]);
    setEmbedding(null);
  }

  function goToCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidCode(code)) return toast.error("El código debe tener 6 dígitos");
    const found = items.data?.items.find((i) => i.code === code);
    if (found) navigate({ to: "/articulos/$id", params: { id: found.id } });
    else navigate({ to: "/articulos/nuevo", search: { code } });
  }

  const fullItem = (id: string) => items.data?.items.find((i) => i.id === id) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Escanear" subtitle="Busque un artículo con una foto o con su código." />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Section title="Buscar por foto" description="La foto se compara con las de los artículos registrados, en este mismo dispositivo.">
          {phase === "idle" ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/50 px-6 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Camera className="size-7" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Fotografíe el objeto de frente, bien iluminado y ocupando la mayor parte de la imagen.
                </p>
              </div>
              <PhotoPicker onFile={analyze} size="xl" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                {photo ? <img src={photo.dataUrl} alt="Foto buscada" className="size-28 rounded-xl border border-border object-cover" /> : null}
                <div className="flex-1 space-y-2">
                  {phase === "analyzing" ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> {status}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {matches.length
                        ? `Se encontraron ${matches.length} posible${matches.length === 1 ? "" : "s"} coincidencia${matches.length === 1 ? "" : "s"}. Elija el artículo correcto.`
                        : "No se encontraron artículos parecidos."}
                    </p>
                  )}
                  <Button variant="outline" size="sm" onClick={reset} disabled={phase === "analyzing"}>
                    <RotateCcw /> Otra foto
                  </Button>
                </div>
              </div>

              {phase === "results" ? (
                matches.length ? (
                  <ul className="space-y-2">
                    {matches.map((m) => {
                      const full = fullItem(m.id);
                      return (
                        <li key={m.id} className="surface flex flex-wrap items-center gap-3 p-3">
                          <ItemThumb url={m.photo_url} hasPhoto alt={m.name} className="size-16" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <CodeBadge code={m.code} />
                              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", LEVEL_STYLE[m.level])}>
                                {LEVEL_LABEL[m.level]} · {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <p className="mt-1 truncate font-semibold">{m.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatQuantity(m.quantity)} {m.unit}
                              {m.location_name ? ` · ${m.location_name}` : ""}
                            </p>
                          </div>
                          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                            <Button asChild size="sm" variant="outline">
                              <Link to="/articulos/$id" params={{ id: m.id }}>
                                Ver <ArrowRight />
                              </Link>
                            </Button>
                            <Button asChild size="sm" variant="ghost">
                              <Link to="/editar/$id" params={{ id: m.id }}>
                                <Pencil /> Modificar
                              </Link>
                            </Button>
                            <Button size="sm" variant="success" disabled={!full} onClick={() => full && setRestockItem(full)}>
                              <PackagePlus /> Otra tanda
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState icon={<SearchX />} title="Sin coincidencias">
                    Si el artículo no está registrado, puede darlo de alta con esta foto.
                  </EmptyState>
                )
              ) : null}

              {phase === "results" ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <p className="flex-1 text-sm text-muted-foreground">{matches.length ? "¿Ninguno es el correcto?" : ""}</p>
                  <Button onClick={registerNew}>
                    <PackagePlus /> Registrar artículo nuevo con esta foto
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="Buscar por código" description="Si el artículo tiene etiqueta, escriba sus 6 dígitos.">
          <form onSubmit={goToCode} className="space-y-3">
            <div className="relative">
              <Hash className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={code}
                onChange={(e) => setCode(sanitizeCodeInput(e.target.value))}
                inputMode="numeric"
                placeholder="004213"
                className="font-code h-12 pl-9 text-lg tracking-[0.25em]"
                aria-label="Código de 6 dígitos"
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={code.length !== 6}>
              Buscar código
            </Button>
          </form>
        </Section>
      </div>

      <Dialog open={!!restockItem} onOpenChange={(o) => !o && setRestockItem(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar otra tanda</DialogTitle>
            <DialogDescription>
              <span className="font-code">{restockItem?.code}</span> · {restockItem?.name} — se mantiene el mismo código.
            </DialogDescription>
          </DialogHeader>
          {restockItem ? (
            <MovementForm item={restockItem} fixedItem defaultType="reposicion" onDone={() => setRestockItem(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
