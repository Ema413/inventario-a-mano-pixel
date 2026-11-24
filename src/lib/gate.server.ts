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
