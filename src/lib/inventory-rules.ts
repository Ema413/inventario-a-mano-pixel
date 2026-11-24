// Pure business rules shared by the browser and the server. Keep free of I/O.

export const CODE_LENGTH = 6;
const CODE_REGEX = /^\d{6}$/;
const PIN_REGEX = /^\d{4}$/;

/** A code is exactly six digits; leading zeros are significant ("004213"). */
export function isValidCode(code: string): boolean {
  return CODE_REGEX.test(code);
}

/** Keeps only digits and truncates to six, never pads or reformats. */
export function sanitizeCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export type StockMovementType = "entrada" | "salida" | "reposicion" | "ajuste";
export type MovementType = StockMovementType | "alta" | "modificacion" | "baja";

export const STOCK_MOVEMENT_TYPES: StockMovementType[] = ["entrada", "salida", "reposicion", "ajuste"];
export const ALL_MOVEMENT_TYPES: MovementType[] = [
  "alta",
  "entrada",
  "reposicion",
  "salida",
  "ajuste",
  "modificacion",
  "baja",
];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  alta: "Alta de artículo",
  entrada: "Entrada",
  salida: "Salida",
  reposicion: "Reposición",
  ajuste: "Ajuste",
  modificacion: "Modificación",
  baja: "Baja de artículo",
};

export type StockChange =
  | { ok: true; before: number; after: number; delta: number }
  | { ok: false; error: string };

/**
 * Mirrors the database function apply_movement. For "ajuste", `quantity` is the
 * new total and a reason is mandatory; for the others it is the amount moved.
 */
export function computeStockChange(
  type: StockMovementType,
  current: number,
  quantity: number,
  reason?: string | null,
): StockChange {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: "La cantidad no puede ser negativa" };
  }
  if (type !== "ajuste" && quantity === 0) {
    return { ok: false, error: "La cantidad debe ser mayor que cero" };
  }
  switch (type) {
    case "entrada":
    case "reposicion":
      return { ok: true, before: current, after: round3(current + quantity), delta: quantity };
    case "salida":
      if (quantity > current) {
        return { ok: false, error: `No hay suficiente stock: disponible ${formatQuantity(current)}` };
      }
      return { ok: true, before: current, after: round3(current - quantity), delta: quantity };
    case "ajuste":
      if (!reason || reason.trim().length === 0) {
        return { ok: false, error: "El ajuste requiere un motivo" };
      }
      if (quantity === current) {
        return { ok: false, error: "La nueva cantidad es igual a la actual" };
      }
      return { ok: true, before: current, after: quantity, delta: round3(quantity - current) };
  }
}

export function isLowStock(quantity: number, minStock: number): boolean {
  return minStock > 0 && quantity <= minStock;
}

/** After every fifth consecutive failure the PIN screen locks, doubling up to 60 minutes. */
export function lockMinutesAfterFailures(failures: number): number {
  if (failures < 5 || failures % 5 !== 0) return 0;
  return Math.min(60, 5 * 2 ** (failures / 5 - 1));
}

export function isBackupDue(lastBackupAt: string | null, reminderDays: number, now = new Date()): boolean {
  if (!lastBackupAt) return true;
  const elapsed = now.getTime() - new Date(lastBackupAt).getTime();
  return elapsed >= reminderDays * 24 * 60 * 60 * 1000;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function formatQuantity(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);
}

// ---------- Visual search ----------

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type VisualCandidate<T> = T & { embedding: number[] };
export type VisualMatch<T> = T & { score: number; level: "alta" | "media" | "baja" };

export const VISUAL_MIN_SCORE = 0.5;

/**
 * Ranks candidates by similarity. Never auto-selects: the caller always shows
 * the list so the person confirms which article it is.
 */
export function rankVisualMatches<T>(
  query: number[],
  candidates: VisualCandidate<T>[],
  options: { minScore?: number; limit?: number } = {},
): VisualMatch<Omit<VisualCandidate<T>, "embedding">>[] {
  const minScore = options.minScore ?? VISUAL_MIN_SCORE;
  const limit = options.limit ?? 6;
  return candidates
    .map(({ embedding, ...rest }) => {
      const score = cosineSimilarity(query, embedding);
      return { ...rest, score, level: similarityLevel(score) };
    })
    .filter((m) => m.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit) as VisualMatch<Omit<VisualCandidate<T>, "embedding">>[];
}

export function similarityLevel(score: number): "alta" | "media" | "baja" {
  if (score >= 0.82) return "alta";
  if (score >= 0.68) return "media";
  return "baja";
}
