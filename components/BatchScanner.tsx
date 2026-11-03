"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

type Status = "checking" | "ready" | "unsupported" | "denied" | "error";

/**
 * Escáner continuo para movimientos masivos: la cámara queda abierta y
 * emite onScan por cada código distinto. Muestra un destello verde en
 * cada lectura + beep + vibración corta. No se cierra tras el primer código.
 */
export default function BatchScanner({
  onScan,
  cooldownMs = 1500,
  paused = false,
}: {
  onScan: (v: string) => void;
  cooldownMs?: number;
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cbRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [flash, setFlash] = useState<0 | 1 | 2>(0); // 1=ok verde, 2=dup amarillo
  const [count, setCount] = useState(0);
  const watchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function releaseAll() {
    try {
      BrowserCodeReader.releaseAllStreams();
    } catch {}
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null | undefined;
    stream?.getTracks().forEach((tr) => {
      try {
        tr.stop();
      } catch {}
    });
    if (video) video.srcObject = null;
  }

  useEffect(() => {
    cbRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  function beep(ok: boolean) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = ok ? 880 : 440;
      o.type = "sine";
      g.gain.value = 0.08;
      o.start();
      setTimeout(() => {
        try {
          o.stop();
          ctx.close();
        } catch {}
      }, 120);
    } catch {}
    try {
      navigator.vibrate?.(ok ? 60 : [60, 60, 60]);
    } catch {}
  }

  function doFlash(kind: 1 | 2) {
    setFlash(kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(0), 350);
  }

  useEffect(() => {
    let cancelled = false;
    let controls: IScannerControls | undefined;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      if (startingRef.current) return;
      startingRef.current = true;
      setStatus("checking");
      setDetail("");
      if (typeof window === "undefined") {
        startingRef.current = false;
        return;
      }
      const hasApi = !!navigator.mediaDevices?.getUserMedia;
      if (!hasApi) {
        startingRef.current = false;
        if (!cancelled) {
          setStatus("unsupported");
          setDetail(
            window.isSecureContext
              ? "Este navegador no expone la cámara en esta conexión."
              : "Estás accediendo por HTTP. Los navegadores bloquean la cámara en conexiones no seguras."
          );
        }
        return;
      }
      try {
        if (!videoRef.current) throw new Error("No se pudo preparar el visor.");
        const v = videoRef.current;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          v,
          (res) => {
            if (cancelled || !res) return;
            if (pausedRef.current) return;
            const text = res.getText().trim();
            if (!text) return;
            const now = Date.now();
            // Cooldown global + mismo código: evita doble lectura del mismo frame.
            if (text === lastRef.current.text && now - lastRef.current.at < cooldownMs) return;
            if (now - lastRef.current.at < 400) return;
            lastRef.current = { text, at: now };
            setCount((c) => c + 1);
            doFlash(1);
            beep(true);
            cbRef.current(text);
          }
        );
        try {
          await v.play();
        } catch {}
        startingRef.current = false;
        if (!cancelled) {
          setStatus("ready");
          if (watchRef.current) clearTimeout(watchRef.current);
          watchRef.current = setTimeout(() => {
            const vv = videoRef.current;
            if (!cancelled && vv && (vv.videoWidth === 0 || vv.paused)) {
              try {
                controls?.stop();
              } catch {}
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
      startingRef.current = false;
      try {
        controls?.stop();
      } catch {}
      releaseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Expone aviso visual de duplicado (el padre lo invoca vía evento).
  useEffect(() => {
    const onDup = () => {
      doFlash(2);
      beep(false);
    };
    window.addEventListener("batch-scan-dup", onDup);
    return () => window.removeEventListener("batch-scan-dup", onDup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {/* Destello de confirmación sin cerrar la cámara */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: flash ? 0.45 : 0,
            background: flash === 2 ? "#eab308" : "#22c55e",
          }}
        />
        {count > 0 && (
          <div className="absolute top-2 right-2 rounded-full bg-black/70 text-white text-xs font-bold px-2.5 py-1 tabular-nums">
            {count} leído(s)
          </div>
        )}
      </div>
      {status === "checking" && <p className="text-sm text-muted p-3">Preparando cámara…</p>}
      {status === "ready" && (
        <p className="text-xs text-muted p-2">
          Cámara continua: apunta cada etiqueta, espera el destello verde y pasa a la siguiente sin cerrar. Manual abajo o lector Bluetooth
          también sirven.
        </p>
      )}
      {(status === "unsupported" || status === "denied" || status === "error") && (
        <div className="p-4 grid gap-2 text-sm border-amber-200 bg-amber-50/60">
          <b className="text-ink">
            {status === "unsupported"
              ? "Cámara no disponible en esta conexión"
              : status === "denied"
                ? "Permiso de cámara denegado"
                : "No se pudo iniciar la cámara"}
          </b>
          {detail && <p className="text-muted text-xs">{detail}</p>}
          <p className="text-muted text-xs">
            Usa el campo manual o un lector Bluetooth. La cámara del teléfono funciona si la app se sirve por HTTPS.
          </p>
          <div>
            <button className="btn btn-secondary text-xs" onClick={retry}>
              Reintentar cámara
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
