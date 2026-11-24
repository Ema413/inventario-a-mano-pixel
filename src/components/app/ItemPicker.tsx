import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { itemsQuery } from "@/lib/queries";
import { filterItems } from "@/lib/search";
import type { ItemDTO } from "@/lib/types";
import { formatQuantity } from "@/lib/inventory-rules";
import { CodeBadge, ItemThumb } from "./bits";

export function ItemPicker({ value, onChange }: { value: ItemDTO | null; onChange: (item: ItemDTO | null) => void }) {
  const { data } = useQuery(itemsQuery());
  const [q, setQ] = useState("");
  const results = useMemo(() => (q.trim() ? filterItems(data?.items ?? [], q).slice(0, 8) : []), [data, q]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-3">
        <ItemThumb url={value.photo_url} hasPhoto={value.has_photo} alt={value.name} className="size-14" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CodeBadge code={value.code} />
          </div>
          <p className="truncate font-semibold">{value.name}</p>
          <p className="text-sm text-muted-foreground">
            Stock actual: <span className="font-code font-semibold text-foreground">{formatQuantity(value.quantity)}</span>{" "}
            {value.unit}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Cambiar artículo" onClick={() => onChange(null)}>
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar artículo por nombre o código"
          className="h-11 pl-9"
          aria-label="Buscar artículo"
        />
      </div>
      {q.trim() ? (
        results.length ? (
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {results.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(it);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-primary-soft/50"
                >
                  <ItemThumb url={it.photo_url} hasPhoto={it.has_photo} alt="" className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-code">{it.code}</span> · {formatQuantity(it.quantity)} {it.unit}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">No se encontraron artículos.</p>
        )
      ) : null}
    </div>
  );
}
