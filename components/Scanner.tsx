"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

type Status = "checking" | "ready" | "unsupported" | "denied" | "error";

export default function Scanner({ onResult }: { onResult: (v: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cbRef = useRef(onResult);
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    cbRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let controls: IScannerControls | undefined;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      setStatus("checking");
      setDetail("");
      if (typeof window === "undefined") return;
      if (!window.isSecureContext) {
        if (!cancelled) {
          setStatus("unsupported");
          setDetail("Estás accediendo por HTTP. Los navegadores bloquean la cámara en conexiones no seguras.");
        }
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setStatus("unsupported");
          setDetail("Este navegador no expone la cámara en esta conexión.");
        }
        return;
      }
      try {
        let deviceId: string | undefined;
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          if (!devices.length) throw new Error("No se encontraron cámaras.");
          const back =
            devices.find((d) => /back|rear|environment|trasera/i.test(d.label || "")) ||
            devices[devices.length - 1];
          deviceId = back?.deviceId;
        } catch {
          deviceId = undefined;
        }
        if (!videoRef.current) throw new Error("No se pudo preparar el visor.");
        controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current, (res) => {
          if (cancelled || done || !res) return;
          const text = res.getText().trim();
          if (!text) return;
          done = true;
          try { controls?.stop(); } catch {}
          cbRef.current(text);
        });
        if (!cancelled) setStatus("ready");
      } catch (ex) {
        if (cancelled) return;
        const message = ex instanceof Error ? ex.message : String(ex);
        if (/NotAllowedError|Permission|denied|denegado/i.test(message)) {
          setStatus("denied");
          setDetail("Permiso de cámara denegado. Habilítalo en el navegador y reintenta.");
        } else {
          setStatus("error");
          setDetail(message.slice(0, 180));
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      done = true;
      try { controls?.stop(); } catch {}
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null | undefined;
      stream?.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      if (video) video.srcObject = null;
    };
  }, [attempt]);

  if (status === "checking") {
    return <div className="card p-3 text-sm text-muted">Preparando cámara…</div>;
  }

  if (status === "ready") {
    return (
      <div className="card overflow-hidden">
        <div className="relative bg-black">
          <video ref={videoRef} className="w-full max-h-72 object-cover" muted playsInline autoPlay />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-24 w-56 rounded-lg border-2 border-white/80" />
          </div>
        </div>
        <p className="text-xs text-muted p-2">Apunta al Code128 dentro del recuadro. También puedes usar lector Bluetooth o el input manual.</p>
      </div>
    );
  }

  return (
    <div className="card p-4 grid gap-2 text-sm border-amber-200 bg-amber-50/60">
      <b className="text-ink">
        {status === "unsupported" ? "Cámara no disponible en esta conexión" : status === "denied" ? "Permiso de cámara denegado" : "No se pudo iniciar la cámara"}
      </b>
      {detail && <p className="text-muted text-xs">{detail}</p>}
      <p className="text-muted text-xs">
        Usa el campo manual o un lector Bluetooth. La cámara del teléfono funciona si la app se sirve por HTTPS.
      </p>
      <div>
        <button className="btn btn-secondary text-xs" onClick={() => setAttempt((n) => n + 1)}>Reintentar cámara</button>
      </div>
    </div>
  );
}
