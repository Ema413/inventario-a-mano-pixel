import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { getAccessStatus, unlockWithPin } from "@/lib/auth.functions";
import { markGateConfirmed } from "@/lib/gate-cache";
import { errorMessage } from "@/lib/access-error";
import { BrandMark } from "@/components/app/BrandMark";

export const Route = createFileRoute("/acceso")({
  head: () => ({
    meta: [
      { title: "Ingresar · Inventario a Mano" },
      { name: "description", content: "Ingrese el PIN del centro para acceder al inventario compartido." },
      { property: "og:title", content: "Ingresar · Inventario a Mano" },
      { property: "og:description", content: "Acceso con PIN al inventario compartido del centro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const status = await getAccessStatus();
    if (status.unlocked) throw redirect({ to: "/" });
    return {};
  },
  component: AccessPage,
});

function PinField({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <InputOTP
        maxLength={4}
        value={value}
        onChange={(v) => onChange(v.replace(/\D/g, ""))}
        inputMode="numeric"
        pattern="^[0-9]*$"
        autoFocus={autoFocus}
        aria-label={label}
      >
        <InputOTPGroup className="gap-3">
          {[0, 1, 2, 3].map((i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className="font-code size-14 rounded-xl border text-2xl first:rounded-xl last:rounded-xl [-webkit-text-security:disc]"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

function AccessPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockWithPin);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enter() {
    markGateConfirmed();
    await router.invalidate();
    await router.navigate({ to: "/" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin.length !== 4) return setError("Ingrese los 4 dígitos del PIN");
    setBusy(true);
    try {
      const res = await unlock({ data: { pin } });
      if (res.ok) {
        await enter();
      } else {
        setError(res.error);
        setPin("");
      }
    } catch (err) {
      setError(errorMessage(err, "No se pudo verificar el PIN"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="surface w-full max-w-sm space-y-7 p-7 text-center animate-rise">
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="size-14" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Inventario a Mano</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ingrese el PIN del centro</p>
          </div>
        </div>

        <PinField value={pin} onChange={setPin} label="PIN de 4 dígitos" autoFocus />

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
          Ingresar
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Acceso compartido del centro. No registre datos personales de pacientes ni información clínica.
        </p>
      </form>
    </main>
  );
}