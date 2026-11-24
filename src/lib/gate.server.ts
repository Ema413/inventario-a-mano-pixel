// Server-only helpers: shared-PIN session, PIN hashing and the privileged DB client.
// Never import this from routes or components; only from *.functions.ts handlers.
import { getRequestHeader, getRequestIP, useSession } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ACCESS_ERROR = "ACCESO_BLOQUEADO";
export const PHOTO_BUCKET = "item-photos";

export type GateSession = { unlocked?: boolean; pinVersion?: number };

export function getSessionConfig() {
  const password =
    process.env["SESSION_SECRET"]?.trim() || "local-dev-session-secret-key-1234567890";
  const isProd = process.env["NODE_ENV"] === "production";
  return {
    password,
    name: "inventario-a-mano",
    maxAge: 60 * 60 * 24 * 30,
    cookie: {
      httpOnly: true,
      path: "/",
      secure: isProd,
      sameSite: "lax" as const,
    },
  };
}

export function db() {
  return supabaseAdmin;
}

export async function getSettingsRow() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error || !data) {
    return {
      id: true,
    } as Record<string, unknown>;
  }

  return data;
}

export async function getGateSession() {
  return useSession<GateSession>(getSessionConfig());
}

function normalizeVersion(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
  if (typeof val === "string") {
    const parsed = Number(val.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

/** Throws unless this browser unlocked the app with the current PIN version. */
export async function requireUnlocked() {
  if (import.meta.env.DEV) {
    return await getSettingsRow();
  }
  const session = await getGateSession();
  if (!session.data?.unlocked) {
    throw new Error(ACCESS_ERROR);
  }
  const settings = await getSettingsRow();
  const expectedVersion = normalizeVersion(settings.pin_version);
  const sessionVersion = normalizeVersion(session.data.pinVersion);
  if (sessionVersion !== expectedVersion) {
    await session.clear();
    throw new Error(ACCESS_ERROR);
  }
  return settings;
}

// ---------- PIN hashing (PBKDF2 via Web Crypto, works on Workers and Node) ----------

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function normalizeBase64(input: string): string {
  const withoutPrefix = input.includes(",")
    ? input.slice(input.indexOf(",") + 1)
    : input;
  const cleaned = withoutPrefix
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const mod = cleaned.length % 4;
  return mod === 0 ? cleaned : cleaned + "=".repeat(4 - mod);
}

function fromB64(b64: string): Uint8Array {
  const normalized = normalizeBase64(b64);
  if (!normalized) {
    throw new Error("Cadena Base64 vacía o inválida");
  }
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100000 },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt);
  return { hash: toB64(hash), salt: toB64(salt) };
}

export async function verifyPin(pin: string, hashB64: string, saltB64: string): Promise<boolean> {
  const computed = await pbkdf2(pin, fromB64(saltB64));
  const expected = fromB64(hashB64);
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= (computed[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}

/** Hashed client IP, used only to rate-limit PIN attempts. */
export async function getClientKey(): Promise<string> {
  const ip =
    getRequestHeader("cf-connecting-ip") ?? getRequestIP({ xForwardedFor: true }) ?? "desconocido";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`iam:${ip}`));
  return toB64(new Uint8Array(digest));
}

export function base64ToBytes(b64: string): Uint8Array {
  const bytes = fromB64(b64);
  if (bytes.byteLength === 0) {
    throw new Error("No se pudieron decodificar bytes desde Base64");
  }
  return bytes;
}

/** Maps database errors to clear Spanish messages. */
export function friendlyDbError(error: { code?: string; message?: string } | null, fallback: string): Error {
  if (!error) return new Error(fallback);
  if (error.code === "P0001" && error.message) return new Error(error.message);
  if (error.code === "23505") return new Error("Ya existe un registro con ese valor");
  if (error.code === "23514") return new Error("Algún dato no cumple las condiciones requeridas");
  console.error(fallback, error);
  return new Error(fallback);
}
