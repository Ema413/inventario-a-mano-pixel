import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { checkCode, createItem, updateItem } from "@/lib/inventory.functions";
import { INVENTORY_KEYS, itemsQuery, namedQuery } from "@/lib/queries";
import { formatQuantity, isValidCode, sanitizeCodeInput } from "@/lib/inventory-rules";
import { preparePhoto, type PreparedPhoto } from "@/lib/image";
import { computeEmbedding, EMBEDDING_MODEL } from "@/lib/visual-search";
import { takePendingPhoto } from "@/lib/pending-photo";
import { errorMessage } from "@/lib/access-error";
import type { ItemDTO } from "@/lib/types";
import { CodeBadge, ItemThumb, Section } from "./bits";
import { PhotoPicker } from "./PhotoPicker";

const NONE = "__none__";
const NEW = "__new__";
const UNITS = ["unidades", "cajas", "paquetes", "pares", "frascos", "litros", "mililitros", "kilogramos", "gramos", "metros", "rollos", "juegos"];

type Props = { mode: "create"; initialCode?: string } | { mode: "edit"; item: ItemDTO };

export function ItemForm(props: Props) {
  const editing = props.mode === "edit" ? props.item : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery(namedQuery("categories"));
  const { data: locations = [] } = useQuery(namedQuery("locations"));
  const { data: cached } = useQuery(itemsQuery());

  const [code, setCode] = useState(editing?.code ?? (props.mode === "create" ? sanitizeCodeInput(props.initialCode ?? "") : ""));
  const [name, setName] = useState(editing?.name ?? "");
  const [categoryChoice, setCategoryChoice] = useState(editing?.category_id ?? NONE);
  const [newCategory, setNewCategory] = useState("");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : "");
  const [unit, setUnit] = useState(editing?.unit ?? "unidades");
  const [locationChoice, setLocationChoice] = useState(editing?.location_id ?? NONE);
  const [newLocation, setNewLocation] = useState("");
  const [minStock, setMinStock] = useState(editing ? String(editing.min_stock) : "0");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [embeddingState, setEmbeddingState] = useState<"idle" | "working" | "ready" | "failed">("idle");
  const embeddingRef = useRef<Promise<number[] | null> | null>(null);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [showErrors, setShowErrors] = useState(false);

  // Photo handed over from the scan screen ("register new article").
  useEffect(() => {
    if (props.mode !== "create") return;
    const pending = takePendingPhoto();
    if (pending) {
      setPhoto(pending.photo);
      if (pending.embedding) {
        embeddingRef.current = Promise.resolve(pending.embedding);
        setEmbeddingState("ready");
      } else startEmbedding(pending.photo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEmbedding(p: PreparedPhoto) {
    setEmbeddingState("working");
    const promise = computeEmbedding(p.canvas)
      .then((e) => {
        setEmbeddingState("ready");
        return e;
      })
      .catch((err) => {
        console.error(err);
        setEmbeddingState("failed");
        return null;
      });
    embeddingRef.current = promise;
  }

  async function handleFile(file: File) {
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setRemovePhoto(false);
      startEmbedding(prepared);
    } catch (err) {
      toast.error(errorMessage(err, "No se pudo leer la imagen"));
    }
  }

  // Duplicate check: instant against the local copy, then confirmed by the server.
  const codeComplete = isValidCode(code);
  const localDuplicate = useMemo(
    () => (props.mode === "create" && codeComplete ? (cached?.items.find((i) => i.code === code) ?? null) : null),
    [cached, code, codeComplete, props.mode],
  );
  const check = useServerFn(checkCode);
  const serverCheck = useQuery({
    queryKey: ["check-code", code],
    queryFn: () => check({ data: { code } }),
    enabled: props.mode === "create" && codeComplete,
    staleTime: 5_000,
  });
  const duplicate = localDuplicate ?? (serverCheck.data && !serverCheck.data.available ? serverCheck.data.item : null);

  const qtyNum = Number(quantity.replace(",", "."));
  const minNum = Number(minStock.replace(",", ".") || "0");
  const categoryLabel =
    categoryChoice === NEW ? newCategory.trim() : (categories.find((c) => c.id === categoryChoice)?.name ?? "Sin categoría");
  const locationLabel =
    locationChoice === NEW ? newLocation.trim() : (locations.find((l) => l.id === locationChoice)?.name ?? "Sin ubicación");

  const errors: string[] = [];
  if (props.mode === "create") {
    if (!codeComplete) errors.push("El código debe tener exactamente 6 dígitos");
    else if (duplicate) errors.push(`El código ${code} ya pertenece a «${duplicate.name}»`);
    if (quantity.trim() === "" || !Number.isFinite(qtyNum) || qtyNum < 0) errors.push("Indique una cantidad inicial válida (0 o más)");
  }
  if (!name.trim()) errors.push("Escriba el nombre del artículo");
  if (!unit.trim()) errors.push("Indique la unidad de medida");
  if (!Number.isFinite(minNum) || minNum < 0) errors.push("El stock mínimo no puede ser negativo");
  if (categoryChoice === NEW && !newCategory.trim()) errors.push("Escriba el nombre de la nueva categoría");
  if (locationChoice === NEW && !newLocation.trim()) errors.push("Escriba el nombre de la nueva ubicación");

  const create = useServerFn(createItem);
  const update = useServerFn(updateItem);
  const save = useMutation({
    mutationFn: async () => {
      const embedding = photo && embeddingRef.current ? await embeddingRef.current : null;
      const common = {
        name: name.trim(),
        categoryId: categoryChoice === NONE || categoryChoice === NEW ? null : categoryChoice,
        newCategoryName: categoryChoice === NEW ? newCategory.trim() : undefined,
        description: description.trim() || undefined,
        unit: unit.trim(),
        locationId: locationChoice === NONE || locationChoice === NEW ? null : locationChoice,
        newLocationName: locationChoice === NEW ? newLocation.trim() : undefined,
        minStock: minNum,
        notes: notes.trim() || undefined,
        photo: photo ? { base64: photo.base64, contentType: photo.contentType } : undefined,
        embedding: embedding ?? undefined,
        embeddingModel: embedding ? EMBEDDING_MODEL : undefined,
      };
      if (editing) {
        await update({ data: { ...common, id: editing.id, removePhoto } });
        return editing.id;
      }
      const res = await create({ data: { ...common, code, quantity: qtyNum } });
      return res.id;
    },
    onSuccess: async (id) => {
      toast.success(editing ? "Cambios guardados" : "Artículo registrado");
      await Promise.all(INVENTORY_KEYS.map((k) => qc.invalidateQueries({ queryKey: k })));
      navigate({ to: "/articulos/$id", params: { id } });
    },
    onError: (err) => {
      toast.error(errorMessage(err, "No se pudo guardar"));
      setStep("form");
    },
  });

  function goPreview(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setStep("preview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const photoUrl = photo?.dataUrl ?? (removePhoto ? null : (editing?.photo_url ?? null));

  if (step === "preview") {
    return (
      <div className="space-y-4 animate-rise">
        <Section title="Vista previa" description="Revise los datos antes de guardar.">
          <div className="flex flex-col gap-5 sm:flex-row">
            <ItemThumb url={photoUrl} alt={name} className="w-full max-w-56 self-center sm:self-start" />
            <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <PreviewRow label="Código"><CodeBadge code={code} className="text-sm" /></PreviewRow>
              <PreviewRow label="Nombre"><span className="font-semibold">{name.trim()}</span></PreviewRow>
              <PreviewRow label="Categoría">{categoryLabel || "Sin categoría"}{categoryChoice === NEW ? " (nueva)" : ""}</PreviewRow>
              <PreviewRow label="Ubicación">{locationLabel || "Sin ubicación"}{locationChoice === NEW ? " (nueva)" : ""}</PreviewRow>
              <PreviewRow label={editing ? "Cantidad actual" : "Cantidad inicial"}>
                <span className="font-code font-semibold">{formatQuantity(editing ? editing.quantity : qtyNum)}</span> {unit}
              </PreviewRow>
              <PreviewRow label="Stock mínimo">{minNum > 0 ? `${formatQuantity(minNum)} ${unit}` : "Sin aviso"}</PreviewRow>
              <PreviewRow label="Descripción" wide>{description.trim() || "—"}</PreviewRow>
              <PreviewRow label="Observaciones" wide>{notes.trim() || "—"}</PreviewRow>
              <PreviewRow label="Fotografía" wide>
                {photo ? (
                  embeddingState === "failed" ? (
                    "Se guardará la foto, pero no podrá usarse para buscar por foto"
                  ) : (
                    "Nueva foto, también se usará para buscar por foto"
                  )
                ) : removePhoto ? "Se quitará la foto actual" : photoUrl ? "Sin cambios" : "Sin foto"}
              </PreviewRow>
            </dl>
          </div>
        </Section>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="lg" onClick={() => setStep("form")} disabled={save.isPending}>
            <ArrowLeft /> Volver a editar
          </Button>
          <Button type="button" size="lg" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {save.isPending && embeddingState === "working" ? "Preparando foto…" : "Confirmar y guardar"}
          </Button>
        </div>
      </div>
    );
  }

  const invalid = (cond: boolean) => (showErrors && cond ? true : undefined);

  return (
    <form onSubmit={goPreview} className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Section title="Identificación">
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="code">Código (6 dígitos)</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(sanitizeCodeInput(e.target.value))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="004213"
                disabled={!!editing}
                className="font-code h-11 text-lg tracking-[0.25em]"
                aria-invalid={invalid(!codeComplete || !!duplicate)}
              />
              {editing ? (
                <p className="text-xs text-muted-foreground">El código no se puede cambiar.</p>
              ) : codeComplete ? (
                duplicate ? (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3.5" /> Ya existe: {duplicate.name}
                  </p>
                ) : serverCheck.isFetching ? (
                  <p className="text-xs text-muted-foreground">Verificando…</p>
                ) : serverCheck.data?.available ? (
                  <p className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="size-3.5" /> Código disponible
                  </p>
                ) : null
              ) : (
                <p className="text-xs text-muted-foreground">{code.length}/6 dígitos · se respetan los ceros iniciales</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del artículo</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" maxLength={160} aria-invalid={invalid(!name.trim())} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NamedSelect
              label="Categoría"
              value={categoryChoice}
              onChange={setCategoryChoice}
              options={categories}
              noneLabel="Sin categoría"
              newLabel="+ Nueva categoría"
              newValue={newCategory}
              onNewValue={setNewCategory}
            />
            <NamedSelect
              label="Ubicación física"
              value={locationChoice}
              onChange={setLocationChoice}
              options={locations}
              noneLabel="Sin ubicación"
              newLabel="+ Nueva ubicación"
              newValue={newLocation}
              onNewValue={setNewLocation}
            />
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="desc">Descripción</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
          </div>
        </Section>

        <Section title="Cantidades">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="qty">{editing ? "Cantidad disponible" : "Cantidad inicial"}</Label>
              <Input
                id="qty"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                disabled={!!editing}
                className="font-code h-11 text-lg"
                aria-invalid={invalid(!editing && (quantity.trim() === "" || !Number.isFinite(qtyNum)))}
              />
              {editing ? <p className="text-xs text-muted-foreground">Para cambiarla, registre un movimiento.</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unidad de medida</Label>
              <Input id="unit" list="unit-options" value={unit} onChange={(e) => setUnit(e.target.value)} className="h-11" maxLength={40} />
              <datalist id="unit-options">
                {UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="min">Avisar con stock bajo en</Label>
              <Input
                id="min"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                className="font-code h-11"
              />
              <p className="text-xs text-muted-foreground">0 = sin aviso</p>
            </div>
          </div>
        </Section>

        <Section title="Observaciones">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} aria-label="Observaciones" />
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Fotografía" description="Sirve para reconocer el artículo al buscar por foto.">
          <div className="space-y-3">
            <ItemThumb url={photoUrl} alt="Foto del artículo" className="w-full" />
            {photo ? (
              <p className="text-xs text-muted-foreground">
                {embeddingState === "working"
                  ? "Preparando la foto para la búsqueda visual…"
                  : embeddingState === "failed"
                    ? "No se pudo preparar la búsqueda por foto (se guardará igual)."
                    : "Lista para la búsqueda por foto."}
              </p>
            ) : null}
            <PhotoPicker onFile={handleFile} size="default" />
            {photoUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-destructive"
                onClick={() => {
                  setPhoto(null);
                  embeddingRef.current = null;
                  setEmbeddingState("idle");
                  if (editing?.has_photo) setRemovePhoto(true);
                }}
              >
                <Trash2 /> Quitar foto
              </Button>
            ) : null}
          </div>
        </Section>
        <div className="surface sticky top-4 space-y-2 p-4">
          {showErrors && errors.length ? (
            <ul className="space-y-1 text-sm text-destructive">
              {errors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          ) : null}
          <Button type="submit" size="lg" className="w-full">
            <Eye /> Ver vista previa
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => window.history.back()}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  );
}

function PreviewRow({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

function NamedSelect({
  label,
  value,
  onChange,
  options,
  noneLabel,
  newLabel,
  newValue,
  onNewValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  noneLabel: string;
  newLabel: string;
  newValue: string;
  onNewValue: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{noneLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW}>{newLabel}</SelectItem>
        </SelectContent>
      </Select>
      {value === NEW ? (
        <Input value={newValue} onChange={(e) => onNewValue(e.target.value)} placeholder="Nombre" className="h-11" autoFocus maxLength={120} />
      ) : null}
    </div>
  );
}
