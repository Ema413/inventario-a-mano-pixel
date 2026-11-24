import { Link } from "@tanstack/react-router";
import type { MovementDTO } from "@/lib/types";
import { formatQuantity } from "@/lib/inventory-rules";
import { CodeBadge, MovementTypeBadge, formatDateTime, signedDelta } from "./bits";
import { cn } from "@/lib/utils";

export function MovementList({ movements, showItem = true }: { movements: MovementDTO[]; showItem?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {movements.map((m) => {
        const delta = signedDelta(m.type, m.quantity);
        const positive = delta.startsWith("+");
        const negative = delta.startsWith("−");
        return (
          <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <MovementTypeBadge type={m.type} />
                {showItem ? (
                  <>
                    <CodeBadge code={m.item_code} />
                    {m.item_id ? (
                      <Link
                        to="/articulos/$id"
                        params={{ id: m.item_id }}
                        className="truncate font-semibold text-foreground hover:text-primary"
                      >
                        {m.item_name}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold text-muted-foreground">{m.item_name}</span>
                    )}
                  </>
                ) : null}
              </div>
              {m.reason ? (
                <p className="mt-1 text-sm text-foreground">
                  <span className="font-medium">Motivo:</span> {m.reason}
                </p>
              ) : null}
              {m.notes ? <p className="mt-1 text-sm text-muted-foreground">{m.notes}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(m.created_at)} · {m.actor}
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "font-code text-base font-semibold",
                  positive && "text-success",
                  negative && "text-destructive",
                  !positive && !negative && "text-muted-foreground",
                )}
              >
                {delta} <span className="font-sans text-xs font-medium">{m.unit ?? ""}</span>
              </p>
              {m.quantity_before !== null && m.quantity_after !== null && m.type !== "modificacion" ? (
                <p className="font-code text-xs text-muted-foreground">
                  {formatQuantity(m.quantity_before)} → {formatQuantity(m.quantity_after)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
