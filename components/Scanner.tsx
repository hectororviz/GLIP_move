"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

type Status = "checking" | "ready" | "unsupported" | "denied" | "error";

export default function Scanner({ onResult }: { onResult: (v: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cbRef = useRef(onResult);
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const watchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);

  function releaseAll() {
    try { BrowserCodeReader.releaseAllStreams(); } catch {}
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null | undefined;
    stream?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
    if (video) video.srcObject = null;
  }

  useEffect(() => {
    cbRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let controls: IScannerControls | undefined;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      if (startingRef.current) return;
      startingRef.current = true;
      setStatus("checking");
      setDetail("");
      if (typeof window === "undefined") { startingRef.current = false; return; }
      const secure = window.isSecureContext;
      const hasApi = !!navigator.mediaDevices?.getUserMedia;
      if (!hasApi) {
        startingRef.current = false;
        if (!cancelled) {
          setStatus("unsupported");
          setDetail(
            secure
              ? "Este navegador no expone la cámara en esta conexión."
              : "Estás accediendo por HTTP. Los navegadores bloquean la cámara en conexiones no seguras."
          );
        }
        return;
      }
      try {
        if (!videoRef.current) throw new Error("No se pudo preparar el visor.");
        const v = videoRef.current;
        v.onloadedmetadata = () => {};
        v.onplaying = () => {};
        v.onpause = () => {};
        v.onerror = () => {};
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          v,
          (res) => {
            if (cancelled || done || !res) return;
            const text = res.getText().trim();
            if (!text) return;
            done = true;
            try { controls?.stop(); } catch {}
            cbRef.current(text);
          }
        );
        const stream = v.srcObject as MediaStream | null | undefined;
        const track = stream?.getVideoTracks()[0];
        if (track) {
          if (!track.enabled) track.enabled = true;
        }
        try { await v.play(); } catch {}
        startingRef.current = false;
        if (!cancelled) {
          setStatus("ready");
          if (watchRef.current) clearTimeout(watchRef.current);
          watchRef.current = setTimeout(() => {
            const vv = videoRef.current;
            if (!cancelled && vv && (vv.videoWidth === 0 || vv.paused)) {
              try { controls?.stop(); } catch {}
              setStatus("error");
              setDetail("La cámara no entrega imagen. Revisa que ninguna otra app la esté usando y reintenta.");
            }
          }, 10000);
        }
      } catch (ex) {
        startingRef.current = false;
        if (cancelled) return;
        const message = ex instanceof Error ? `${ex.name}: ${ex.message}` : String(ex);
        if (/NotAllowedError|Permission|denied|denegado/i.test(message)) {
          setStatus("denied");
          setDetail("Permiso de cámara denegado. Habilítalo en el navegador y reintenta.");
        } else {
          setStatus("error");
          setDetail(message.slice(0, 180));
        }
      }
    }

    const timer = setTimeout(start, 0);
    return () => {
      clearTimeout(timer);
      if (watchRef.current) clearTimeout(watchRef.current);
      cancelled = true;
      done = true;
      startingRef.current = false;
      try { controls?.stop(); } catch {}
      releaseAll();
    };
  }, [attempt]);

  const retry = () => {
    releaseAll();
    setAttempt((n) => n + 1);
  };

  return (
    <div className="card overflow-hidden">
      <div className={`relative bg-black ${status === "ready" ? "" : "hidden"}`}>
        <video ref={videoRef} className="w-full max-h-72 object-cover" muted playsInline autoPlay />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-24 w-56 rounded-lg border-2 border-white/80" />
        </div>
      </div>
      {status === "checking" && <p className="text-sm text-muted p-3">Preparando cámara…</p>}
      {status === "ready" && (
        <p className="text-xs text-muted p-2">Apunta al Code128 dentro del recuadro (10 dígitos o letra-serie, ej. A 0001-0537). También puedes usar lector Bluetooth o el input manual.</p>
      )}
      {(status === "unsupported" || status === "denied" || status === "error") && (
        <div className="p-4 grid gap-2 text-sm border-amber-200 bg-amber-50/60">
          <b className="text-ink">
            {status === "unsupported" ? "Cámara no disponible en esta conexión" : status === "denied" ? "Permiso de cámara denegado" : "No se pudo iniciar la cámara"}
          </b>
          {detail && <p className="text-muted text-xs">{detail}</p>}
          <p className="text-muted text-xs">
            Usa el campo manual o un lector Bluetooth. La cámara del teléfono funciona si la app se sirve por HTTPS.
          </p>
          <div>
            <button className="btn btn-secondary text-xs" onClick={retry}>Reintentar cámara</button>
          </div>
        </div>
      )}
    </div>
  );
}
