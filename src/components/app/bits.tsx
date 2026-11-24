import type { ReactNode } from "react";
import { ImageOff, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOVEMENT_LABELS, formatQuantity, type MovementType } from "@/lib/inventory-rules";

export function CodeBadge({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "font-code inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      {code}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function ItemThumb({
  url,
  hasPhoto,
  alt,
  className,
}: {
  url: string | null;
  hasPhoto?: boolean;
  alt: string;
  className?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className={cn("aspect-square shrink-0 rounded-lg border border-border bg-muted object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex aspect-square shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {hasPhoto ? <ImageOff className="size-5" /> : <Package className="size-5" />}
    </div>
  );
}

const TYPE_STYLES: Record<MovementType, string> = {
  alta: "bg-info-soft text-info",
  entrada: "bg-success-soft text-success",
  reposicion: "bg-success-soft text-success",
  salida: "bg-destructive-soft text-destructive",
  ajuste: "bg-warning-soft text-warning-foreground",
  modificacion: "bg-secondary text-secondary-foreground",
  baja: "bg-destructive-soft text-destructive",
};

export function MovementTypeBadge({ type }: { type: MovementType }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", TYPE_STYLES[type])}>
      {MOVEMENT_LABELS[type] ?? type}
    </span>
  );
}

export function signedDelta(type: MovementType, quantity: number): string {
  if (type === "entrada" || type === "reposicion" || type === "alta") return `+${formatQuantity(quantity)}`;
  if (type === "salida" || type === "baja") return `−${formatQuantity(quantity)}`;
  if (type === "ajuste") return quantity >= 0 ? `+${formatQuantity(quantity)}` : `−${formatQuantity(Math.abs(quantity))}`;
  return "—";
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>
      <p className="font-semibold text-foreground">{title}</p>
      {children ? <div className="max-w-sm text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("surface p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
