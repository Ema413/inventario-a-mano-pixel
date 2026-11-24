import type { ItemDTO } from "./types";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Local search by code (prefix) or name/category/location (accent-insensitive). Works offline. */
export function filterItems(items: ItemDTO[], query: string): ItemDTO[] {
  const q = normalize(query.trim());
  if (!q) return items;
  const digits = /^\d+$/.test(q);
  const scored: { item: ItemDTO; score: number }[] = [];
  for (const item of items) {
    let score = 0;
    if (item.code === q) score = 100;
    else if (digits && item.code.startsWith(q)) score = 80;
    else if (item.code.includes(q)) score = 50;
    const name = normalize(item.name);
    if (name.startsWith(q)) score = Math.max(score, 70);
    else if (name.includes(q)) score = Math.max(score, 60);
    else if (
      normalize(item.category_name ?? "").includes(q) ||
      normalize(item.location_name ?? "").includes(q) ||
      normalize(item.description ?? "").includes(q)
    )
      score = Math.max(score, 30);
    if (score > 0) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).map((s) => s.item);
}
