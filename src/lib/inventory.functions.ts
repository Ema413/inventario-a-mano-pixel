import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { base64ToBytes, db, friendlyDbError, PHOTO_BUCKET, requireUnlocked } from "./gate.server";
import { isBackupDue, isLowStock, STOCK_MOVEMENT_TYPES } from "./inventory-rules";
import type { ItemDTO, MovementDTO, NamedEntity, VisualIndexEntry } from "./types";

const ITEM_COLUMNS =
  "id, code, name, category_id, description, quantity, unit, location_id, min_stock, notes, photo_path, embedding_model, created_at, updated_at, category:categories(name), location:locations(name)";

type ItemRow = {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  location_id: string | null;
  min_stock: number;
  notes: string | null;
  photo_path: string | null;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
  category: { name: string } | null;
  location: { name: string } | null;
};

type ItemPatch = {
  name: string;
  category_id: string | null;
  description: string | null;
  unit: string;
  location_id: string | null;
  min_stock: number;
  notes: string | null;
  photo_path?: string | null;
  photo_size?: number | null;
  embedding?: number[] | null;
  embedding_model?: string | null;
};

async function signPhotoUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const signedMap = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const { data, error } = await db().storage.from(PHOTO_BUCKET).createSignedUrls(chunk, 60 * 60 * 6);
    if (error) {
      console.error("sign photo urls", error);
      continue;
    }
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) {
        signedMap.set(entry.path, entry.signedUrl);
      }
    }
  }
  return signedMap;
}

function toItemDTO(row: ItemRow, urls: Map<string, string>): ItemDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category?.name ?? null,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    location_id: row.location_id,
    location_name: row.location?.name ?? null,
    min_stock: Number(row.min_stock),
    notes: row.notes,
    photo_url: row.photo_path ? (urls.get(row.photo_path) ?? null) : null,
    has_photo: !!row.photo_path,
    has_embedding: !!row.embedding_model,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toMovementDTO(row: Record<string, unknown>): MovementDTO {
  const r = row as MovementDTO;
  return {
    ...r,
    quantity: Number(r.quantity),
    quantity_before: r.quantity_before === null ? null : Number(r.quantity_before),
    quantity_after: r.quantity_after === null ? null : Number(r.quantity_after),
  };
}

async function fetchAllItemRows(): Promise<ItemRow[]> {
  const rows: ItemRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from("items")
      .select(ITEM_COLUMNS)
      .order("name")
      .range(from, from + 999);
    if (error) throw friendlyDbError(error, "No se pudo cargar el inventario");
    rows.push(...((data ?? []) as unknown as ItemRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

// ---------- Items ----------

export const listItems = createServerFn({ method: "GET" }).handler(async (): Promise<ItemDTO[]> => {
  await requireUnlocked();
  const rows = await fetchAllItemRows();
  const urls = await signPhotoUrls(rows.map((r) => r.photo_path));
  return rows.map((r) => toItemDTO(r, urls));
});

export const getItem = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ item: ItemDTO; movements: MovementDTO[] } | null> => {
    await requireUnlocked();
    const { data: row, error } = await db().from("items").select(ITEM_COLUMNS).eq("id", data.id).maybeSingle();
    if (error) throw friendlyDbError(error, "No se pudo cargar el artículo");
    if (!row) return null;
    const r = row as unknown as ItemRow;
    const urls = await signPhotoUrls([r.photo_path]);
    const { data: movs } = await db()
      .from("movements")
      .select("*")
      .eq("item_id", data.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { item: toItemDTO(r, urls), movements: (movs ?? []).map(toMovementDTO) };
  });

export const checkCode = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { data: row } = await db().from("items").select("id, name").eq("code", data.code).maybeSingle();
    return row ? { available: false as const, item: row } : { available: true as const, item: null };
  });

const photoSchema = z.object({
  base64: z.string().min(10).max(10_000_000),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const itemFieldsSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(160),
  categoryId: z.string().uuid().nullable(),
  newCategoryName: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  unit: z.string().trim().min(1).max(40),
  locationId: z.string().uuid().nullable(),
  newLocationName: z.string().trim().max(120).optional(),
  minStock: z.number().min(0).max(1e9),
  notes: z.string().trim().max(2000).optional(),
  photo: photoSchema.optional(),
  embedding: z.array(z.number()).max(4096).optional(),
  embeddingModel: z.string().max(60).optional(),
});

async function findOrCreate(table: "categories" | "locations", name: string): Promise<string> {
  const clean = name.trim();
  const { data: existing } = await db().from(table).select("id, name").ilike("name", clean);
  const match = (existing ?? []).find((e) => e.name.trim().toLowerCase() === clean.toLowerCase());
  if (match) return match.id;
  const { data, error } = await db().from(table).insert({ name: clean }).select("id").single();
  if (error || !data) throw friendlyDbError(error, "No se pudo crear el registro");
  return data.id;
}

async function uploadPhoto(photo: z.infer<typeof photoSchema>): Promise<{ path: string; size: number }> {
  const ext = photo.contentType === "image/png" ? "png" : photo.contentType === "image/webp" ? "webp" : "jpg";
  const path = `items/${crypto.randomUUID()}.${ext}`;
  const bytes = base64ToBytes(photo.base64);
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("No se pudo guardar la fotografía: imagen vacía o Base64 inválido");
  }
  const { error } = await db()
    .storage.from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: photo.contentType, upsert: false });
  if (error) {
    console.error("photo upload", {
      bucket: PHOTO_BUCKET,
      path,
      contentType: photo.contentType,
      size: bytes.byteLength,
      error,
    });
    throw new Error(`No se pudo guardar la fotografía: ${error.message}`);
  }
  return { path, size: bytes.byteLength };
}

function emptyToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

export const createItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    itemFieldsSchema
      .extend({
        code: z.string().regex(/^\d{6}$/, "El código debe tener exactamente 6 dígitos"),
        quantity: z.number().min(0, "La cantidad no puede ser negativa").max(1e9),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { data: dup } = await db().from("items").select("id").eq("code", data.code).maybeSingle();
    if (dup) throw new Error(`Ya existe un artículo con el código ${data.code}`);

    const categoryId = data.newCategoryName ? await findOrCreate("categories", data.newCategoryName) : data.categoryId;
    const locationId = data.newLocationName ? await findOrCreate("locations", data.newLocationName) : data.locationId;
    const photo = data.photo ? await uploadPhoto(data.photo) : null;

    const { data: item, error } = await db()
      .from("items")
      .insert({
        code: data.code,
        name: data.name,
        category_id: categoryId,
        description: emptyToNull(data.description),
        quantity: data.quantity,
        unit: data.unit,
        location_id: locationId,
        min_stock: data.minStock,
        notes: emptyToNull(data.notes),
        photo_path: photo?.path ?? null,
        photo_size: photo?.size ?? null,
        embedding: photo && data.embedding ? data.embedding : null,
        embedding_model: photo && data.embedding ? (data.embeddingModel ?? null) : null,
      })
      .select("id, code, name, quantity, unit")
      .single();
    if (error || !item) {
      if (photo) await db().storage.from(PHOTO_BUCKET).remove([photo.path]);
      if (error?.code === "23505") throw new Error(`Ya existe un artículo con el código ${data.code}`);
      throw friendlyDbError(error, "No se pudo guardar el artículo");
    }
    await db().from("movements").insert({
      item_id: item.id,
      item_code: item.code,
      item_name: item.name,
      type: "alta",
      quantity: item.quantity,
      quantity_before: 0,
      quantity_after: item.quantity,
      unit: item.unit,
      notes: "Registro inicial del artículo",
    });
    return { id: item.id };
  });

export const updateItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    itemFieldsSchema.extend({ id: z.string().uuid(), removePhoto: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { data: current, error: curErr } = await db()
      .from("items")
      .select("*, category:categories(name), location:locations(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (curErr) throw friendlyDbError(curErr, "No se pudo cargar el artículo");
    if (!current) throw new Error("El artículo ya no existe");

    const categoryId = data.newCategoryName ? await findOrCreate("categories", data.newCategoryName) : data.categoryId;
    const locationId = data.newLocationName ? await findOrCreate("locations", data.newLocationName) : data.locationId;

    const patch: ItemPatch = {
      name: data.name,
      category_id: categoryId,
      description: emptyToNull(data.description),
      unit: data.unit,
      location_id: locationId,
      min_stock: data.minStock,
      notes: emptyToNull(data.notes),
    };
    let newPhoto: { path: string; size: number } | null = null;
    if (data.photo) {
      newPhoto = await uploadPhoto(data.photo);
      patch.photo_path = newPhoto.path;
      patch.photo_size = newPhoto.size;
      patch.embedding = data.embedding ?? null;
      patch.embedding_model = data.embedding ? (data.embeddingModel ?? null) : null;
    } else if (data.removePhoto) {
      patch.photo_path = null;
      patch.photo_size = null;
      patch.embedding = null;
      patch.embedding_model = null;
    }

    const { error } = await db()
      .from("items")
      .update(patch as unknown as Record<string, never>)
      .eq("id", data.id);
    if (error) {
      if (newPhoto) await db().storage.from(PHOTO_BUCKET).remove([newPhoto.path]);
      throw friendlyDbError(error, "No se pudieron guardar los cambios");
    }
    if ((newPhoto || data.removePhoto) && current.photo_path) {
      await db().storage.from(PHOTO_BUCKET).remove([current.photo_path]);
    }

    const changes: string[] = [];
    if (current.name !== data.name) changes.push(`nombre: «${current.name}» → «${data.name}»`);
    if (current.category_id !== categoryId) changes.push("categoría");
    if ((current.description ?? null) !== emptyToNull(data.description)) changes.push("descripción");
    if (current.unit !== data.unit) changes.push(`unidad: ${current.unit} → ${data.unit}`);
    if (current.location_id !== locationId) changes.push("ubicación");
    if (Number(current.min_stock) !== data.minStock) changes.push(`stock mínimo: ${current.min_stock} → ${data.minStock}`);
    if ((current.notes ?? null) !== emptyToNull(data.notes)) changes.push("observaciones");
    if (newPhoto) changes.push("fotografía actualizada");
    if (data.removePhoto && !newPhoto) changes.push("fotografía eliminada");

    if (changes.length > 0) {
      await db().from("movements").insert({
        item_id: data.id,
        item_code: current.code,
        item_name: data.name,
        type: "modificacion",
        quantity: 0,
        quantity_before: current.quantity,
        quantity_after: current.quantity,
        unit: data.unit,
        notes: `Cambios: ${changes.join("; ")}`,
      });
    }
    return { ok: true as const };
  });

export const deleteItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), confirmCode: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { data: item } = await db().from("items").select("*").eq("id", data.id).maybeSingle();
    if (!item) throw new Error("El artículo ya no existe");
    if (item.code !== data.confirmCode) throw new Error("El código de confirmación no coincide");
    await db().from("movements").insert({
      item_id: item.id,
      item_code: item.code,
      item_name: item.name,
      type: "baja",
      quantity: item.quantity,
      quantity_before: item.quantity,
      quantity_after: 0,
      unit: item.unit,
      notes: "Artículo eliminado del inventario",
    });
    const { error } = await db().from("items").delete().eq("id", data.id);
    if (error) throw friendlyDbError(error, "No se pudo eliminar el artículo");
    if (item.photo_path) await db().storage.from(PHOTO_BUCKET).remove([item.photo_path]);
    return { ok: true as const };
  });

// ---------- Visual search index ----------

export const getVisualIndex = createServerFn({ method: "GET" }).handler(async (): Promise<VisualIndexEntry[]> => {
  await requireUnlocked();
  const rows: Array<{
    id: string;
    code: string;
    name: string;
    quantity: number;
    unit: string;
    photo_path: string | null;
    embedding: unknown;
    embedding_model: string | null;
    location: { name: string } | null;
  }> = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db()
      .from("items")
      .select("id, code, name, quantity, unit, photo_path, embedding, embedding_model, location:locations(name)")
      .not("embedding", "is", null)
      .range(from, from + 499);
    if (error) throw friendlyDbError(error, "No se pudo cargar el índice de fotos");
    rows.push(...((data ?? []) as unknown as typeof rows));
    if (!data || data.length < 500) break;
  }
  const urls = await signPhotoUrls(rows.map((r) => r.photo_path));
  return rows
    .filter((r) => Array.isArray(r.embedding))
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      quantity: Number(r.quantity),
      unit: r.unit,
      location_name: r.location?.name ?? null,
      photo_url: r.photo_path ? (urls.get(r.photo_path) ?? null) : null,
      embedding: r.embedding as number[],
    }));
});

// ---------- Movements ----------

export const registerMovement = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        itemId: z.string().uuid(),
        type: z.enum(STOCK_MOVEMENT_TYPES as [string, ...string[]]),
        quantity: z.number().min(0).max(1e9),
        reason: z.string().trim().max(500).optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { data: mov, error } = await db().rpc("apply_movement", {
      p_item_id: data.itemId,
      p_type: data.type,
      p_quantity: data.quantity,
      p_reason: data.reason ?? "",
      p_notes: data.notes ?? "",
    });
    if (error) throw friendlyDbError(error, "No se pudo registrar el movimiento");
    return toMovementDTO(mov as unknown as Record<string, unknown>);
  });

export const listMovements = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        type: z.string().optional(),
        q: z.string().max(100).optional(),
        itemId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    let query = db()
      .from("movements")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.from) query = query.gte("created_at", new Date(`${data.from}T00:00:00-03:00`).toISOString());
    if (data.to) query = query.lte("created_at", new Date(`${data.to}T23:59:59.999-03:00`).toISOString());
    if (data.type && data.type !== "todos") query = query.eq("type", data.type);
    if (data.itemId) query = query.eq("item_id", data.itemId);
    const q = (data.q ?? "").replace(/[,()%*\\]/g, " ").trim();
    if (q) query = query.or(`item_code.ilike.${q}%,item_name.ilike.%${q}%`);
    const { data: rows, error, count } = await query;
    if (error) throw friendlyDbError(error, "No se pudo cargar el historial");
    return { rows: (rows ?? []).map(toMovementDTO), total: count ?? 0 };
  });

// ---------- Dashboard ----------

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const settings = await requireUnlocked();
  const items: Array<{ id: string; code: string; name: string; quantity: number; unit: string; min_stock: number }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db()
      .from("items")
      .select("id, code, name, quantity, unit, min_stock")
      .range(from, from + 999);
    items.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const lowStock = items
    .filter((i) => isLowStock(Number(i.quantity), Number(i.min_stock)))
    .map((i) => ({ ...i, quantity: Number(i.quantity), min_stock: Number(i.min_stock) }))
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 8);
  const { data: recent } = await db()
    .from("movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(6);
  const { count: categoryCount } = await db().from("categories").select("id", { count: "exact", head: true });
  const lastBackupAt = (settings["last_backup_at"] as string | null | undefined) ?? null;
  const reminderDays = Number(settings["backup_reminder_days"] ?? 0);
  return {
    totalItems: items.length,
    totalUnits: items.reduce((s, i) => s + Number(i.quantity), 0),
    lowStockCount: items.filter((i) => isLowStock(Number(i.quantity), Number(i.min_stock))).length,
    lowStock,
    categoryCount: categoryCount ?? 0,
    recent: (recent ?? []).map(toMovementDTO),
    backup: {
      lastBackupAt,
      reminderDays,
      due: isBackupDue(lastBackupAt, reminderDays),
    },
  };
});

// ---------- Categories & locations ----------

const tableSchema = z.enum(["categories", "locations"]);

export const listNamed = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ table: tableSchema }).parse(d))
  .handler(async ({ data }): Promise<NamedEntity[]> => {
    await requireUnlocked();
    const { data: rows, error } = await db().from(data.table).select("id, name").order("name");
    if (error) throw friendlyDbError(error, "No se pudo cargar la lista");
    const fk = data.table === "categories" ? "category_id" : "location_id";
    const counts = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data: refs } = await db().from("items").select(fk).not(fk, "is", null).range(from, from + 999);
      for (const r of (refs ?? []) as Record<string, string>[]) {
        const refId = r[fk];
        if (refId) counts.set(refId, (counts.get(refId) ?? 0) + 1);
      }
      if (!refs || refs.length < 1000) break;
    }
    return (rows ?? []).map((r) => ({ ...r, item_count: counts.get(r.id) ?? 0 }));
  });

export const createNamed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ table: tableSchema, name: z.string().trim().min(1, "Escriba un nombre").max(120) }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { data: row, error } = await db().from(data.table).insert({ name: data.name }).select("id").single();
    if (error?.code === "23505") throw new Error(`«${data.name}» ya existe`);
    if (error || !row) throw friendlyDbError(error, "No se pudo crear");
    return row;
  });

export const renameNamed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ table: tableSchema, id: z.string().uuid(), name: z.string().trim().min(1, "Escriba un nombre").max(120) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { error } = await db().from(data.table).update({ name: data.name }).eq("id", data.id);
    if (error?.code === "23505") throw new Error(`«${data.name}» ya existe`);
    if (error) throw friendlyDbError(error, "No se pudo renombrar");
    return { ok: true as const };
  });

export const deleteNamed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ table: tableSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { error } = await db().from(data.table).delete().eq("id", data.id);
    if (error) throw friendlyDbError(error, "No se pudo eliminar");
    return { ok: true as const };
  });

// ---------- Storage status ----------

export const getStorageStatus = createServerFn({ method: "GET" }).handler(async () => {
  const settings = await requireUnlocked();
  let photoBytes = 0;
  let photoCount = 0;
  let itemCount = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await db().from("items").select("photo_size").range(from, from + 999);
    for (const r of data ?? []) {
      itemCount++;
      if (r.photo_size) {
        photoCount++;
        photoBytes += r.photo_size;
      }
    }
    if (!data || data.length < 1000) break;
  }
  const { count: movementCount } = await db().from("movements").select("id", { count: "exact", head: true });
  const { count: categoryCount } = await db().from("categories").select("id", { count: "exact", head: true });
  const { count: locationCount } = await db().from("locations").select("id", { count: "exact", head: true });
  return {
    itemCount,
    photoCount,
    photoBytes,
    movementCount: movementCount ?? 0,
    categoryCount: categoryCount ?? 0,
    locationCount: locationCount ?? 0,
    // Rough estimate: ~4 KB per article (incl. photo index) and ~0.5 KB per movement.
    estimatedDataBytes: itemCount * 4096 + (movementCount ?? 0) * 512,
    lastBackupAt: (settings["last_backup_at"] as string | null | undefined) ?? null,
    reminderDays: Number(settings["backup_reminder_days"] ?? 0),
    serverTime: new Date().toISOString(),
  };
});