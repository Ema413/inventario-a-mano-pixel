// Local copy of the inventory so search by code/name keeps working without internet.
import { get, set } from "idb-keyval";
import type { ItemDTO } from "./types";

const KEY = "inventario-a-mano:items:v1";

export async function saveItemsCache(items: ItemDTO[]): Promise<void> {
  try {
    await set(KEY, { items, savedAt: new Date().toISOString() });
  } catch {
    // Private mode or storage full: search still works online.
  }
}

export async function loadItemsCache(): Promise<{ items: ItemDTO[]; savedAt: string } | null> {
  try {
    return (await get(KEY)) ?? null;
  } catch {
    return null;
  }
}
