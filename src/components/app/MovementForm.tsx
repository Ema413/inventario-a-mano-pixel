import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, PackagePlus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { registerMovement } from "@/lib/inventory.functions";
import { computeStockChange, formatQuantity, MOVEMENT_LABELS, type StockMovementType } from "@/lib/inventory-rules";
import { INVENTORY_KEYS } from "@/lib/queries";
import { errorMessage } from "@/lib/access-error";
import type { ItemDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ItemPicker } from "./ItemPicker";

const TYPES: { type: StockMovementType; icon: typeof ArrowDownToLine; hint: string }[] = [
  { type: "entrada", icon: ArrowDownToLine, hint: "Ingreso de unidades" },
  { type: "salida", icon: ArrowUpFromLine, hint: "Retiro o entrega" },
  { type: "reposicion", icon: PackagePlus, hint: "Otra tanda del mismo artículo" },
  { type: "ajuste", icon: SlidersHorizontal, hint: "Corregir la cantidad total" },
];

type Props = {
  item?: ItemDTO | null;
  fixedItem?: boolean;
  defaultType?: StockMovementType;
  onDone?: () => void;
};

export function MovementForm({ item: initialItem = null, fixedItem = false, defaultType = "entrada", onDone }: Props) {
  const qc = useQueryClient();
  const [item, setItem] = useState<ItemDTO | null>(initialItem);
  const [type, setType] = useState<StockMovementType>(defaultType);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const register = useServerFn(registerMovement);
  const mutation = useMutation({
    mutationFn: register,
    onSuccess: async (mov) => {
      toast.success(`${MOVEMENT_LABELS[mov.type]} registrada`, {
        description: `${mov.item_name}: stock ${formatQuantity(mov.quantity_before ?? 0)} → ${formatQuantity(mov.quantity_after ?? 0)}`,
      });
      await Promise.all(INVENTORY_KEYS.map((k) => qc.invalidateQueries({ queryKey: k })));
      setQuantity("");
      setReason("");
      setNotes("");
      setShowErrors(false);
      if (!fixedItem) setItem(null);
      onDone?.();
    },
    onError: (err) => toast.error(errorMessage(err, "No se pudo registrar el movimiento")),
  });

  const qty = quantity.trim() === "" ? NaN : Number(quantity.replace(",", "."));
  const change = item && Number.isFinite(qty) ? computeStockChange(type, item.quantity, qty, reason) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!item) return toast.error("Elija un artículo");
    if (!change) return toast.error("Indique la cantidad");
    if (!change.ok) return toast.error(change.error);
    setConfirming(true);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {!fixedItem ? (
        <div className="space-y-2">
          <Label>Artículo</Label>
          <ItemPicker value={item} onChange={setItem} />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Tipo de movimiento</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map(({ type: t, icon: Icon, hint }) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                type === t
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/40",
              )}
            >
              <Icon className="size-5" />
              <span className="text-sm font-semibold">{MOVEMENT_LABELS[t]}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mov-qty">{type === "ajuste" ? "Nueva cantidad total" : "Cantidad"}</Label>
          <Input
            id="mov-qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0"
            className="font-code h-11 text-lg"
          />
          {item ? (
            <p className="text-xs text-muted-foreground">
              Stock actual: <span className="font-code">{formatQuantity(item.quantity)}</span> {item.unit}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="mov-reason">
            Motivo {type === "ajuste" ? <span className="text-destructive">(obligatorio)</span> : "(opcional)"}
          </Label>
          <Input
            id="mov-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={type === "ajuste" ? "Ej.: conteo físico, rotura, vencimiento" : "Ej.: compra, donación, préstamo"}
            className="h-11"
            aria-invalid={showErrors && type === "ajuste" && !reason.trim()}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mov-notes">Observaciones (opcional)</Label>
        <Textarea id="mov-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      {item && change ? (
        <div
          className={cn(
            "rounded-xl border p-3 text-sm",
            change.ok ? "border-primary/30 bg-primary-soft/40" : "border-destructive/30 bg-destructive-soft text-destructive",
          )}
        >
          {change.ok ? (
            <p>
              Stock de <strong>{item.name}</strong>:{" "}
              <span className="font-code font-semibold">{formatQuantity(change.before)}</span> →{" "}
              <span className="font-code font-semibold">{formatQuantity(change.after)}</span> {item.unit}
            </p>
          ) : (
            <p>{change.error}</p>
          )}
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
        Registrar {MOVEMENT_LABELS[type].toLowerCase()}
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar {MOVEMENT_LABELS[type].toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>{item?.name}</strong> (código <span className="font-code">{item?.code}</span>)
                </p>
                {change?.ok ? (
                  <p>
                    {type === "ajuste" ? "Nueva cantidad" : "Cantidad"}:{" "}
                    <span className="font-code">{formatQuantity(qty)}</span> {item?.unit} · Stock{" "}
                    <span className="font-code">{formatQuantity(change.before)}</span> →{" "}
                    <span className="font-code">{formatQuantity(change.after)}</span>
                  </p>
                ) : null}
                {reason.trim() ? <p>Motivo: {reason.trim()}</p> : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                item &&
                mutation.mutate({
                  data: {
                    itemId: item.id,
                    type,
                    quantity: qty,
                    reason: reason.trim() || undefined,
                    notes: notes.trim() || undefined,
                  },
                })
              }
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
