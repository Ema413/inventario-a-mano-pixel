import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const APP_NOMBRE = "Inventario a Mano";
const PIN_FIJO = "2026";
const CLAVE_ACCESO_PIN = "inventario_pin_autorizado";

function esPinValido(valor: string) {
  return /^\d{4}$/.test(valor);
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Ingresar con PIN · ${APP_NOMBRE}` },
      { name: "description", content: `Ingresá al inventario de ${APP_NOMBRE} con el PIN de acceso.` },
      { property: "og:title", content: `Ingresar con PIN · ${APP_NOMBRE}` },
      { property: "og:description", content: `Ingresá al inventario de ${APP_NOMBRE} con el PIN de acceso.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(CLAVE_ACCESO_PIN) === "true") {
      navigate({ to: "/" });
    }
  }, [navigate]);

  const enviar = async (valor: string, e?: FormEvent) => {
    e?.preventDefault();
    if (cargando) return;
    if (!esPinValido(valor)) {
      setError("Ingresá los cuatro números del PIN.");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      if (valor !== PIN_FIJO) {
        setPin("");
        setError("PIN incorrecto. Revisá los cuatro números e intentá de nuevo.");
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CLAVE_ACCESO_PIN, "true");
      }
      navigate({ to: "/" });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-gradient-to-br from-zinc-950 via-neutral-900 to-zinc-950 text-zinc-100 lg:grid-cols-2">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(44,82,117,0.28),transparent_55%)]"
        aria-hidden
      />

      <aside className="relative hidden overflow-hidden border-r border-white/10 bg-zinc-950/70 text-zinc-100 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="relative">
          <span className="inline-flex items-center gap-2 font-display text-lg font-bold">
            {APP_NOMBRE}
          </span>
        </div>

        <div className="relative space-y-6">
          <div className="flex flex-wrap gap-3">
            {["000417", "002026", "004206"].map((c, i) => (
              <span
                key={c}
                className="rounded-md border border-white/15 bg-[#2c5275] px-3 py-1.5 font-codigo text-lg font-semibold text-white shadow-lg"
                style={{ transform: `rotate(${[-3, 2, -1][i]}deg)` }}
              >
                {c}
              </span>
            ))}
          </div>
          <p className="max-w-md font-display text-4xl font-bold leading-tight">
            Cada artículo con su código, su foto.
          </p>
          <p className="max-w-sm text-zinc-300/80">
            Ingresá con el PIN del equipo para ver y registrar cambios desde la computadora o el celular.
          </p>
        </div>

        <p className="relative text-xs text-zinc-400">Inventario compartido para todo el equipo</p>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-rise space-y-8 rounded-2xl border border-white/10 bg-card/95 p-6 text-card-foreground shadow-2xl backdrop-blur-sm sm:p-8">
          <span className="inline-flex items-center gap-2 font-display text-lg font-bold lg:hidden">
            {APP_NOMBRE}
          </span>
          <div>
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <LockKeyhole className="size-6" />
            </div>
            <h1 className="text-3xl font-bold">Ingresá con el PIN</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Escribí el PIN de cuatro números para entrar.
            </p>
          </div>

          <form onSubmit={(e) => enviar(pin, e)} className="space-y-5">
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={(v) => {
                const limpio = v.replace(/\D/g, "");
                setPin(limpio);
                setError(null);
              }}
              inputMode="numeric"
              pattern="^[0-9]*$"
              autoFocus
              disabled={cargando}
              aria-label="PIN de cuatro números"
              containerClassName="justify-center"
            >
              <InputOTPGroup className="gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-14 rounded-xl border border-input bg-background font-codigo text-2xl shadow-card first:rounded-xl last:rounded-xl"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && (
              <p role="alert" className="text-center text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={cargando || pin.length !== 4}>
              {cargando && <Loader2 className="animate-spin" />}
              Ingresar
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            ¿No sabés el PIN? Pedíselo a la persona responsable del inventario.
          </p>
        </div>
      </main>
    </div>
  );
}