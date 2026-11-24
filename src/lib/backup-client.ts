// Browser-side backup tools: Excel export, full ZIP backup and integrity check.
import { MOVEMENT_LABELS, type MovementType } from "./inventory-rules";

type Row = Record<string, unknown>;

export type ExportData = {
  exportedAt: string;
  settings: { backup_reminder_days: number };
  categories: Row[];
  locations: Row[];
  items: Row[];
  movements: Row[];
  photos: { path: string; url: string }[];
};

const BACKUP_FORMAT = 1;
const APP_ID = "inventario-a-mano";

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function fmtDate(v: unknown) {
  if (!v) return "";
  return new Date(String(v)).toLocaleString("es-AR");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Excel ----------

export async function exportExcel(data: ExportData) {
  const XLSX = await import("xlsx");
  const catName = new Map<unknown, unknown>(data.categories.map((c) => [c["id"], c["name"]]));
  const locName = new Map<unknown, unknown>(data.locations.map((l) => [l["id"], l["name"]]));

  const inventory = data.items.map((i) => ({
    Código: String(i["code"] ?? ""),
    Nombre: i["name"] ?? "",
    Categoría: catName.get(i["category_id"]) ?? "",
    Descripción: i["description"] ?? "",
    Cantidad: Number(i["quantity"] ?? 0),
    Unidad: i["unit"] ?? "",
    Ubicación: locName.get(i["location_id"]) ?? "",
    "Stock mínimo": Number(i["min_stock"] ?? 0),
    Observaciones: i["notes"] ?? "",
    "Tiene foto": i["photo_path"] ? "Sí" : "No",
    "Fecha de registro": fmtDate(i["created_at"]),
    "Última modificación": fmtDate(i["updated_at"]),
  }));

  const movementRow = (m: Row) => ({
    "Fecha y hora": fmtDate(m["created_at"]),
    Código: String(m["item_code"] ?? ""),
    Artículo: m["item_name"] ?? "",
    Tipo: MOVEMENT_LABELS[m["type"] as MovementType] ?? m["type"] ?? "",
    Cantidad: Number(m["quantity"] ?? 0),
    Unidad: m["unit"] ?? "",
    "Stock anterior": m["quantity_before"] ?? "",
    "Stock posterior": m["quantity_after"] ?? "",
    Motivo: m["reason"] ?? "",
    Observaciones: m["notes"] ?? "",
    "Registrado por": m["actor"] ?? "",
  });

  const newestFirst = [...data.movements].sort((a, b) =>
    String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? "")),
  );

  const wb = XLSX.utils.book_new();
  const addSheet = (rows: Row[], name: string, empty: Record<string, string>) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [empty]);
    const keys = Object.keys(rows[0] ?? empty);
    ws["!cols"] = keys.map((k) => ({ wch: Math.max(12, Math.min(48, k.length + 6)) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet(inventory, "Inventario general", { Código: "", Nombre: "Sin artículos" });
  addSheet(
    newestFirst
      .filter((m) => m["type"] === "entrada" || m["type"] === "reposicion" || m["type"] === "alta")
      .map(movementRow),
    "Entradas",
    { "Fecha y hora": "", Artículo: "Sin entradas" },
  );
  addSheet(
    newestFirst.filter((m) => m["type"] === "salida").map(movementRow),
    "Salidas",
    { "Fecha y hora": "", Artículo: "Sin salidas" },
  );
  addSheet(newestFirst.map(movementRow), "Historial", { "Fecha y hora": "", Artículo: "Sin movimientos" });
  addSheet(
    data.categories.map((c) => ({
      Categoría: c["name"] ?? "",
      Artículos: data.items.filter((i) => i["category_id"] === c["id"]).length,
    })),
    "Categorías",
    { Categoría: "Sin categorías" },
  );
  addSheet(
    data.locations.map((l) => ({
      Ubicación: l["name"] ?? "",
      Artículos: data.items.filter((i) => i["location_id"] === l["id"]).length,
    })),
    "Ubicaciones",
    { Ubicación: "Sin ubicaciones" },
  );

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  download(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `inventario-respaldo_${stamp()}.xlsx`,
  );
}

// ---------- Full backup (.zip) ----------

type Manifest = {
  app: string;
  format: number;
  createdAt: string;
  counts: { items: number; movements: number; categories: number; locations: number; photos: number };
  dataSha256: string;
  photos: Record<string, string>;
  missingPhotos: string[];
};

export async function createBackupZip(data: ExportData, onProgress?: (done: number, total: number) => void) {
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  const photoHashes: Record<string, string> = {};
  const missing: string[] = [];
  let done = 0;

  for (const p of data.photos) {
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());
      files[`photos/${p.path}`] = bytes;
      photoHashes[p.path] = await sha256Hex(bytes);
    } catch {
      missing.push(p.path);
    }
    onProgress?.(++done, data.photos.length);
  }

  const payload = {
    categories: data.categories,
    locations: data.locations,
    items: data.items,
    movements: data.movements,
    settings: data.settings,
  };
  const dataBytes = strToU8(JSON.stringify(payload));
  const manifest: Manifest = {
    app: APP_ID,
    format: BACKUP_FORMAT,
    createdAt: data.exportedAt,
    counts: {
      items: data.items.length,
      movements: data.movements.length,
      categories: data.categories.length,
      locations: data.locations.length,
      photos: Object.keys(photoHashes).length,
    },
    dataSha256: await sha256Hex(dataBytes),
    photos: photoHashes,
    missingPhotos: missing,
  };

  files["data.json"] = dataBytes;
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["LEEME.txt"] = strToU8(
    [
      "Copia de seguridad completa de Inventario a Mano.",
      `Creada: ${new Date(data.exportedAt).toLocaleString("es-AR")}`,
      "",
      "- data.json: artículos, movimientos, historial, categorías y ubicaciones.",
      "- photos/: fotografías de los artículos.",
      "- manifest.json: huellas de verificación de integridad.",
      "",
      "Para recuperarla: Ajustes > Copias de seguridad > Restaurar copia.",
    ].join("\n"),
  );

  const zipped = zipSync(files, { level: 0 });
  download(new Blob([zipped as BlobPart], { type: "application/zip" }), `respaldo-inventario-a-mano_${stamp()}.zip`);
  return { photos: manifest.counts.photos, missing: missing.length };
}

export type VerifiedBackup = {
  ok: boolean;
  problems: string[];
  createdAt: string | null;
  counts: Manifest["counts"] | null;
  data: {
    categories: Row[];
    locations: Row[];
    items: Row[];
    movements: Row[];
  } | null;
  photos: { path: string; bytes: Uint8Array; contentType: "image/jpeg" | "image/png" | "image/webp" }[];
};

export async function verifyBackupZip(file: File): Promise<VerifiedBackup> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const fail = (msg: string): VerifiedBackup => ({
    ok: false,
    problems: [msg],
    createdAt: null,
    counts: null,
    data: null,
    photos: [],
  });

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return fail("El archivo no es una copia válida (no se pudo abrir el .zip).");
  }

  if (!entries["manifest.json"] || !entries["data.json"]) {
    return fail("Faltan archivos esenciales de la copia (manifest.json o data.json).");
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  } catch {
    return fail("El índice de la copia está dañado.");
  }

  if (manifest.app !== APP_ID) return fail("Este archivo no es una copia de Inventario a Mano.");
  if (manifest.format > BACKUP_FORMAT) return fail("La copia fue creada con una versión más nueva de la aplicación.");

  const problems: string[] = [];
  if ((await sha256Hex(entries["data.json"])) !== manifest.dataSha256) {
    return fail("Los datos de la copia fueron modificados o están dañados (la verificación no coincide).");
  }

  let data: NonNullable<VerifiedBackup["data"]>;
  try {
    data = JSON.parse(strFromU8(entries["data.json"]));
  } catch {
    return fail("Los datos de la copia no se pueden leer.");
  }

  if (data.items.length !== manifest.counts.items || data.movements.length !== manifest.counts.movements) {
    return fail("La cantidad de registros no coincide con el índice de la copia.");
  }

  const codes = new Set<string>();
  for (const it of data.items) {
    const code = String(it["code"] ?? "");
    if (!/^\d{6}$/.test(code)) return fail(`Código no válido en la copia: «${code}».`);
    if (codes.has(code)) return fail(`Código duplicado en la copia: ${code}.`);
    codes.add(code);
  }

  const photos: VerifiedBackup["photos"] = [];
  for (const [path, hash] of Object.entries(manifest.photos)) {
    const bytes = entries[`photos/${path}`];
    if (!bytes) {
      problems.push(`Falta la foto ${path}`);
      continue;
    }
    if ((await sha256Hex(bytes)) !== hash) {
      problems.push(`La foto ${path} está dañada`);
      continue;
    }
    const ext = path.split(".").pop();
    photos.push({
      path,
      bytes,
      contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
    });
  }

  if (manifest.missingPhotos?.length) {
    problems.push(`${manifest.missingPhotos.length} foto(s) no se pudieron incluir cuando se creó la copia`);
  }

  // Articles whose photo cannot be restored keep their data but lose the photo reference.
  const restorable = new Set(photos.map((p) => p.path));
  for (const it of data.items) {
    if (it["photo_path"] && !restorable.has(String(it["photo_path"]))) {
      it["photo_path"] = null;
      it["photo_size"] = null;
      it["embedding"] = null;
      it["embedding_model"] = null;
    }
  }

  return { ok: true, problems, createdAt: manifest.createdAt, counts: manifest.counts, data, photos };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}