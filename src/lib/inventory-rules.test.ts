import { describe, expect, it } from "vitest";
import {
  computeStockChange,
  isBackupDue,
  isValidCode,
  isValidPin,
  lockMinutesAfterFailures,
  rankVisualMatches,
  sanitizeCodeInput,
} from "./inventory-rules";

describe("códigos de artículo", () => {
  it("acepta exactamente seis dígitos conservando ceros iniciales", () => {
    expect(isValidCode("004213")).toBe(true);
    expect(isValidCode("4213")).toBe(false);
    expect(isValidCode("0042130")).toBe(false);
    expect(isValidCode("00421a")).toBe(false);
  });

  it("no genera ni rellena códigos: solo filtra dígitos y corta en seis", () => {
    expect(sanitizeCodeInput("00-42 13x9")).toBe("004213");
    expect(sanitizeCodeInput("42")).toBe("42");
  });
});

describe("PIN", () => {
  it("es de cuatro dígitos", () => {
    expect(isValidPin("0123")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });

  it("se bloquea tras cinco intentos fallidos y duplica la espera hasta 60 minutos", () => {
    expect(lockMinutesAfterFailures(4)).toBe(0);
    expect(lockMinutesAfterFailures(5)).toBe(5);
    expect(lockMinutesAfterFailures(6)).toBe(0);
    expect(lockMinutesAfterFailures(10)).toBe(10);
    expect(lockMinutesAfterFailures(30)).toBe(60);
  });
});

describe("movimientos de stock", () => {
  it("una entrada aumenta el stock", () => {
    expect(computeStockChange("entrada", 10, 5)).toEqual({ ok: true, before: 10, after: 15, delta: 5 });
  });

  it("una reposición (otra tanda) aumenta el stock", () => {
    expect(computeStockChange("reposicion", 3, 12)).toMatchObject({ ok: true, after: 15 });
  });

  it("una salida disminuye el stock", () => {
    expect(computeStockChange("salida", 10, 4)).toMatchObject({ ok: true, after: 6 });
  });

  it("no permite salidas mayores al stock disponible", () => {
    expect(computeStockChange("salida", 3, 4).ok).toBe(false);
  });

  it("no permite cantidades cero o negativas", () => {
    expect(computeStockChange("entrada", 3, 0).ok).toBe(false);
    expect(computeStockChange("entrada", 3, -2).ok).toBe(false);
  });

  it("un ajuste exige motivo y fija la nueva cantidad total", () => {
    expect(computeStockChange("ajuste", 10, 8, "").ok).toBe(false);
    expect(computeStockChange("ajuste", 10, 8, "Conteo físico")).toEqual({
      ok: true,
      before: 10,
      after: 8,
      delta: -2,
    });
  });
});

describe("búsqueda por foto", () => {
  it("ordena por similitud y descarta coincidencias débiles", () => {
    const res = rankVisualMatches([1, 0, 0], [
      { id: "a", embedding: [0, 1, 0] },
      { id: "b", embedding: [0.9, 0.1, 0] },
      { id: "c", embedding: [0.7, 0.7, 0] },
    ]);
    expect(res.map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("recordatorio de copias", () => {
  it("avisa cuando nunca se hizo una copia o pasó el plazo", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(isBackupDue(null, 7, now)).toBe(true);
    expect(isBackupDue("2026-11-10T12:00:00Z", 7, now)).toBe(true);
    expect(isBackupDue("2026-11-18T12:00:00Z", 7, now)).toBe(false);
  });
});
