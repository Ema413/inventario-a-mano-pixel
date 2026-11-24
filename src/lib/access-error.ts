export const ACCESS_ERROR_MESSAGE = "ACCESO_BLOQUEADO";

export function isAccessError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(ACCESS_ERROR_MESSAGE);
}

export function errorMessage(err: unknown, fallback = "Ocurrió un error inesperado"): string {
  if (err instanceof Error && err.message && !isAccessError(err)) {
    // Zod errors arrive as JSON arrays; show the first message.
    if (err.message.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(err.message) as { message?: string }[];
        if (parsed[0]?.message) return parsed[0].message;
      } catch {
        /* ignore */
      }
    }
    return err.message;
  }
  return fallback;
}
