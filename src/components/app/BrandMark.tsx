import { cn } from "@/lib/utils";

/** Logo: an open hand holding a box, drawn as simple geometry. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("bg-brand inline-flex items-center justify-center rounded-xl text-primary-foreground shadow-sm", className)}>
      <svg viewBox="0 0 32 32" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 8.5 16 5l7 3.5v7L16 19l-7-3.5z" />
        <path d="M9 8.5 16 12l7-3.5M16 12v7" />
        <path d="M4 22.5h5.5l3 1.8h5.2a1.8 1.8 0 0 1 0 3.6H11" />
        <path d="M17.7 24.3 24 21.5a1.9 1.9 0 0 1 2 3.1L19 28.5H4" />
      </svg>
    </span>
  );
}
