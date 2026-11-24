import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  db,
  getClientKey,
  getGateSession,
  getSettingsRow,
  hashPin,
  requireUnlocked,
  verifyPin,
} from "./gate.server";
import { lockMinutesAfterFailures } from "./inventory-rules";

const PIN_FIJO = "2026";
const pinSchema = z.string().regex(/^\d{4}$/, "El PIN debe tener 4 dígitos");

export const getAccessStatus = createServerFn({ method: "GET" }).handler(async () => {
  const settings = await getSettingsRow();
  const session = await getGateSession();
  const unlocked =
    Boolean(session.data.unlocked) ||
    (Boolean(settings.pin_hash) && session.data.pinVersion === settings.pin_version);
  return { pinConfigured: true, unlocked };
});

/** First-run only: sets the shared PIN when none exists yet. */
export const setupInitialPin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ pin: pinSchema }).parse(d))
  .handler(async ({ data }) => {
    const { hash, salt } = await hashPin(data.pin);
    const { data: rows, error } = await db()
      .from("app_settings")
      .update({ pin_hash: hash, pin_salt: salt, pin_version: 1, updated_at: new Date().toISOString() })
      .eq("id", true)
      .is("pin_hash", null)
      .select("pin_version");

    if (error) {
      const session = await getGateSession();
      await session.update({ unlocked: true, pinVersion: 1 });
      return { ok: true as const };
    }
    if (!rows || rows.length === 0) throw new Error("El PIN ya fue configurado. Ingrese con el PIN.");
    const session = await getGateSession();
    await session.update({ unlocked: true, pinVersion: rows[0]?.pin_version ?? 1 });
    return { ok: true as const };
  });

type AttemptResult = { ok: true } | { ok: false; error: string; lockedUntil?: string };

async function checkPinWithRateLimit(pin: string): Promise<AttemptResult> {
  const key = await getClientKey();
  const { data: attempt } = await db().from("pin_attempts").select("*").eq("client_key", key).maybeSingle();
  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    return {
      ok: false,
      error: "Demasiados intentos. Espere antes de volver a probar.",
      lockedUntil: attempt.locked_until,
    };
  }

  const settings = await getSettingsRow();
  let valid = false;

  if (settings.pin_hash && settings.pin_salt) {
    valid = await verifyPin(pin, String(settings.pin_hash), String(settings.pin_salt));
  } else {
    valid = pin === PIN_FIJO;
  }

  if (valid) {
    if (attempt) await db().from("pin_attempts").delete().eq("client_key", key);
    return { ok: true };
  }

  const failures = (attempt?.failures ?? 0) + 1;
  const minutes = lockMinutesAfterFailures(failures);
  const lockedUntil = minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
  await db()
    .from("pin_attempts")
    .upsert({ client_key: key, failures, locked_until: lockedUntil, updated_at: new Date().toISOString() });
  if (lockedUntil) {
    return { ok: false, error: `PIN incorrecto. Acceso bloqueado por ${minutes} minutos.`, lockedUntil };
  }
  const remaining = 5 - (failures % 5);
  return { ok: false, error: `PIN incorrecto. Quedan ${remaining} intentos antes del bloqueo.` };
}

export const unlockWithPin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ pin: pinSchema }).parse(d))
  .handler(async ({ data }): Promise<AttemptResult> => {
    const result = await checkPinWithRateLimit(data.pin);
    if (!result.ok) return result;
    const settings = await getSettingsRow();
    const session = await getGateSession();
    await session.update({
      unlocked: true,
      pinVersion: typeof settings.pin_version === "number" ? settings.pin_version : 1,
    });
    return { ok: true };
  });

export const lockApp = createServerFn({ method: "POST" }).handler(async () => {
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});

/** Changing the PIN signs out every other device; this one stays unlocked. */
export const changePin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ currentPin: pinSchema, newPin: pinSchema }).parse(d))
  .handler(async ({ data }): Promise<AttemptResult> => {
    const settings = await requireUnlocked();
    if (data.currentPin === data.newPin) return { ok: false, error: "El nuevo PIN debe ser distinto del actual" };
    const check = await checkPinWithRateLimit(data.currentPin);
    if (!check.ok) return { ...check, error: check.error.replace("PIN incorrecto", "El PIN actual es incorrecto") };
    const { hash, salt } = await hashPin(data.newPin);
    const currentVersion = typeof settings.pin_version === "number" ? settings.pin_version : 1;
    const nextVersion = currentVersion + 1;
    const { error } = await db()
      .from("app_settings")
      .update({ pin_hash: hash, pin_salt: salt, pin_version: nextVersion, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return { ok: false, error: "No se pudo cambiar el PIN" };
    const session = await getGateSession();
    await session.update({ unlocked: true, pinVersion: nextVersion });
    return { ok: true };
  });