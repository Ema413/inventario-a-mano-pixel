import { queryOptions } from "@tanstack/react-query";
import { getAccessStatus } from "./auth.functions";
import {
  getDashboard,
  getItem,
  getStorageStatus,
  getVisualIndex,
  listItems,
  listMovements,
  listNamed,
} from "./inventory.functions";
import { isAccessError } from "./access-error";
import { loadItemsCache, saveItemsCache } from "./offline-cache";

export const itemsQuery = () =>
  queryOptions({
    queryKey: ["items"],
    queryFn: async () => {
      try {
        const items = await listItems();
        if (typeof window !== "undefined") void saveItemsCache(items);
        return { items, fromCache: false, cachedAt: null as string | null };
      } catch (err) {
        if (typeof window !== "undefined" && !isAccessError(err)) {
          const cached = await loadItemsCache();
          if (cached) return { items: cached.items, fromCache: true, cachedAt: cached.savedAt };
        }
        throw err;
      }
    },
    refetchInterval: 30_000,
  });

export const itemQuery = (id: string) =>
  queryOptions({
    queryKey: ["item", id],
    queryFn: () => getItem({ data: { id } }),
  });

export const dashboardQuery = () =>
  queryOptions({ queryKey: ["dashboard"], queryFn: () => getDashboard(), refetchInterval: 30_000 });

export const namedQuery = (table: "categories" | "locations") =>
  queryOptions({ queryKey: [table], queryFn: () => listNamed({ data: { table } }) });

export type MovementFilters = { from?: string; to?: string; type?: string; q?: string; itemId?: string };

export const movementsQuery = (filters: MovementFilters, limit = 50) =>
  queryOptions({
    queryKey: ["movements", filters, limit],
    queryFn: () => listMovements({ data: { ...filters, limit, offset: 0 } }),
    refetchInterval: 30_000,
  });

export const storageQuery = () => queryOptions({ queryKey: ["storage"], queryFn: () => getStorageStatus() });

export const visualIndexQuery = () =>
  queryOptions({ queryKey: ["visual-index"], queryFn: () => getVisualIndex(), staleTime: 60_000 });

export const accessQuery = () => queryOptions({ queryKey: ["access"], queryFn: () => getAccessStatus() });

/** Keys to refresh after anything that changes stock or articles. */
export const INVENTORY_KEYS = [["items"], ["item"], ["dashboard"], ["movements"], ["visual-index"], ["storage"], ["categories"], ["locations"]];
