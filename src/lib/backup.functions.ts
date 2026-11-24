import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { base64ToBytes, db, friendlyDbError, PHOTO_BUCKET, requireUnlocked } from "./gate.server";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type BackupRow = Record<string, JsonValue>;

async function fetchAll(table: "items" | "movements" | "categories" | "locations"): Promise<BackupRow[]> {
  const rows: BackupRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from(table)
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw friendlyDbError(error, "No se pudieron leer los datos para la copia");
    rows.push(...((data ?? []) as unknown as BackupRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Full raw export used for Excel and the complete backup file. */
export const exportAllData = createServerFn({ method: "GET" }).handler(async () => {
  const settings = await requireUnlocked();
  const [categories, locations, items, movements] = await Promise.all([
    fetchAll("categories"),
    fetchAll("locations"),
    fetchAll("items"),
    fetchAll("movements"),
  ]);
  const paths = items
    .map((i) => (i["photo_path"] as string | null | undefined) ?? null)
    .filter((p): p is string => !!p);
  const photos: { path: string; url: string }[] = [];
  for (let i = 0; i < paths.length; i += 500) {
    const { data } = await db().storage.from(PHOTO_BUCKET).createSignedUrls(paths.slice(i, i + 500), 60 * 60);
    for (const e of data ?? []) if (e.path && e.signedUrl) photos.push({ path: e.path, url: e.signedUrl });
  }
  const reminderDays = Number(settings["backup_reminder_days"] ?? 0);
  return {
    exportedAt: new Date().toISOString(),
    settings: { backup_reminder_days: reminderDays },
    categories,
    locations,
    items,
    movements,
    photos,
  };
});

export const markBackupDone = createServerFn({ method: "POST" }).handler(async () => {
  await requireUnlocked();
  const now = new Date().toISOString();
  await db().from("app_settings").update({ last_backup_at: now }).eq("id", true);
  return { lastBackupAt: now };
});

export const setBackupReminder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365) }).parse(d))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { error } = await db().from("app_settings").update({ backup_reminder_days: data.days }).eq("id", true);
    if (error) throw friendlyDbError(error, "No se pudo guardar el recordatorio");
    return { ok: true as const };
  });

const photoPath = z.string().regex(/^items\/[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/);

/** Uploads one photo from a verified backup (before restoreBackup swaps the data). */
export const uploadBackupPhoto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        path: photoPath,
        base64: z.string().min(4).max(10_000_000),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const bytes = base64ToBytes(data.base64);
    if (!bytes || bytes.byteLength === 0) {
      throw new Error(`No se pudo restaurar la foto ${data.path}: Base64 inválido o vacío`);
    }
    const { error } = await db()
      .storage.from(PHOTO_BUCKET)
      .upload(data.path, bytes, { contentType: data.contentType, upsert: true });
    if (error) throw new Error(`No se pudo restaurar la foto ${data.path}: ${error.message}`);
    return { ok: true as const };
  });

const row = z.record(z.string(), z.unknown());

export const restoreBackup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        categories: z.array(row),
        locations: z.array(row),
        items: z.array(row),
        movements: z.array(row),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    for (const item of data.items) {
      const code = item["code"];
      if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        throw new Error("La copia contiene un código de artículo no válido");
      }
    }
    const { error } = await db().rpc("restore_backup", { p_data: data as never });
    if (error) throw friendlyDbError(error, "No se pudo restaurar la copia. No se modificó nada.");

    // Remove photos that are no longer referenced by any article.
    const keep = new Set(
      data.items.map((i) => i["photo_path"]).filter((p): p is string => typeof p === "string" && p.length > 0),
    );
    const orphans: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: files } = await db().storage.from(PHOTO_BUCKET).list("items", { limit: 1000, offset });
      for (const f of files ?? []) {
        const p = `items/${f.name}`;
        if (!keep.has(p)) orphans.push(p);
      }
      if (!files || files.length < 1000) break;
    }
    for (let i = 0; i < orphans.length; i += 100) {
      await db().storage.from(PHOTO_BUCKET).remove(orphans.slice(i, i + 100));
    }
    return {
      ok: true as const,
      counts: { items: data.items.length, movements: data.movements.length },
    };
  });