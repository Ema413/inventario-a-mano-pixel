import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  takeLabel?: string;
  pickLabel?: string;
  size?: "default" | "lg" | "xl";
};

/**
 * "Take photo" uses the phone camera directly; on computers it opens the webcam,
 * falling back to the file picker when no camera is available.
 */
export function PhotoPicker({ onFile, disabled, takeLabel = "Tomar foto", pickLabel = "Elegir foto", size = "lg" }: Props) {
  const captureRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);

  function handleTake() {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse && navigator.mediaDevices?.getUserMedia) setWebcamOpen(true);
    else captureRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size={size} onClick={handleTake} disabled={disabled}>
          <Camera /> {takeLabel}
        </Button>
        <Button type="button" size={size} variant="outline" onClick={() => pickRef.current?.click()} disabled={disabled}>
          <ImageUp /> {pickLabel}
        </Button>
      </div>
      <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />
      <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      <WebcamDialog
        open={webcamOpen}
        onOpenChange={setWebcamOpen}
        onCapture={(file) => {
          setWebcamOpen(false);
          onFile(file);
        }}
        onUnavailable={() => {
          setWebcamOpen(false);
          pickRef.current?.click();
        }}
      />
    </>
  );
}

function WebcamDialog({
  open,
  onOpenChange,
  onCapture,
  onUnavailable,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCapture: (file: File) => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        active = s;
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError("No se pudo acceder a la cámara. Puede elegir una foto desde el dispositivo."));
    return () => {
      cancelled = true;
      active?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [open]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Tomar foto</DialogTitle>
          <DialogDescription>Encuadre el objeto en el centro, con buena luz.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" onClick={onUnavailable}>
              <ImageUp /> Elegir foto del dispositivo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl bg-muted">
              <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
              {!stream ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" />
                </div>
              ) : null}
            </div>
            <Button type="button" size="lg" className="w-full" onClick={capture} disabled={!stream}>
              <Camera /> Capturar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
