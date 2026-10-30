"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

type Status = "checking" | "ready" | "unsupported" | "denied" | "error";
type Tech = {
  origin: string;
  secure: boolean;
  api: boolean;
  devices: { label: string; id: string }[];
  chosenId: string | null;
  track: Record<string, any> | null;
  video: Record<string, any> | null;
  events: string[];
  lastError: string | null;
};

const emptyTech = (): Tech => ({
  origin: typeof window === "undefined" ? "" : window.location.origin,
  secure: false, api: false, devices: [], chosenId: null, track: null, video: null, events: [], lastError: null,
});

export default function Scanner({ onResult }: { onResult: (v: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cbRef = useRef(onResult);
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [diag, setDiag] = useState({ secure: false, api: false });
  const [tech, setTech] = useState<Tech>(emptyTech);
  const [sent, setSent] = useState("");
  const watchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cbRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let controls: IScannerControls | undefined;
    const reader = new BrowserMultiFormatReader();
    const t: Tech = emptyTech();
    const pushEvent = (e: string) => { t.events.push(`${new Date().toISOString().slice(11, 19)} ${e}`); };
    const snapVideo = () => {
      const v = videoRef.current;
      t.video = v ? { w: v.videoWidth, h: v.videoHeight, paused: v.paused, readyState: v.readyState, src: !!v.srcObject } : null;
    };

    async function start() {
      setStatus("checking");
      setDetail("");
      setSent("");
      if (typeof window === "undefined") return;
      t.secure = window.isSecureContext;
      t.api = !!navigator.mediaDevices?.getUserMedia;
      if (!cancelled) { setDiag({ secure: t.secure, api: t.api }); setTech({ ...t }); }
      if (!t.api) {
        if (!cancelled) {
          setStatus("unsupported");
          setDetail(
            t.secure
              ? "Este navegador no expone la cámara en esta conexión."
              : "Estás accediendo por HTTP. Los navegadores bloquean la cámara en conexiones no seguras."
          );
          setTech({ ...t });
        }
        return;
      }
      try {
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          t.devices = devices.map((d) => ({ label: d.label || "(sin etiqueta)", id: d.deviceId }));
          if (!devices.length) throw new Error("No se encontraron cámaras.");
          const back =
            devices.find((d) => /back|rear|environment|trasera/i.test(d.label || "")) ||
            devices[devices.length - 1];
          t.chosenId = back?.deviceId || null;
        } catch (e) {
          t.chosenId = null;
          pushEvent("lista-devices-fallo: " + (e instanceof Error ? e.message : String(e)).slice(0, 100));
        }
        setTech({ ...t });
        if (!videoRef.current) throw new Error("No se pudo preparar el visor.");
        const v = videoRef.current;
        v.onloadedmetadata = () => { pushEvent("loadedmetadata"); snapVideo(); setTech({ ...t }); };
        v.onplaying = () => { pushEvent("playing"); snapVideo(); setTech({ ...t }); };
        v.onpause = () => { pushEvent("pause"); snapVideo(); setTech({ ...t }); };
        v.onerror = () => { pushEvent("video-error"); snapVideo(); setTech({ ...t }); };
        controls = await reader.decodeFromVideoDevice(t.chosenId || undefined, v, (res) => {
          if (cancelled || done || !res) return;
          const text = res.getText().trim();
          if (!text) return;
          done = true;
          try { controls?.stop(); } catch {}
          cbRef.current(text);
        });
        const stream = v.srcObject as MediaStream | null | undefined;
        const track = stream?.getVideoTracks()[0];
        if (track) {
          t.track = {
            label: track.label,
            readyState: track.readyState,
            muted: track.muted,
            enabled: track.enabled,
            settings: (() => { try { return track.getSettings(); } catch { return null; } })(),
          };
        } else {
          t.track = null;
          pushEvent("sin-pista-de-video");
        }
        snapVideo();
        setTech({ ...t });
        try { await v.play(); snapVideo(); setTech({ ...t }); } catch (e) {
          pushEvent("play-fallo: " + (e instanceof Error ? e.message : String(e)).slice(0, 100));
          setTech({ ...t });
        }
        if (!cancelled) {
          setStatus("ready");
          if (watchRef.current) clearTimeout(watchRef.current);
          watchRef.current = setTimeout(() => {
            const vv = videoRef.current;
            snapVideo();
            if (!cancelled && vv && (vv.videoWidth === 0 || vv.paused)) {
              try { controls?.stop(); } catch {}
              t.lastError = `watchdog: w=${vv.videoWidth} paused=${vv.paused}`;
              setStatus("error");
              setDetail("La cámara no entrega imagen. Revisa que ninguna otra app la esté usando y reintenta.");
              setTech({ ...t });
            }
          }, 10000);
        }
      } catch (ex) {
        if (cancelled) return;
        const message = ex instanceof Error ? `${ex.name}: ${ex.message}` : String(ex);
        t.lastError = message.slice(0, 200);
        setTech({ ...t });
        if (/NotAllowedError|Permission|denied|denegado/i.test(message)) {
          setStatus("denied");
          setDetail("Permiso de cámara denegado. Habilítalo en el navegador y reintenta.");
        } else {
          setStatus("error");
          setDetail(message.slice(0, 180));
        }
      }
    }

    // El <video> se renderiza siempre (oculto hasta "ready") para que la ref exista al iniciar.
    const timer = setTimeout(start, 0);
    return () => {
      clearTimeout(timer);
      if (watchRef.current) clearTimeout(watchRef.current);
      cancelled = true;
      done = true;
      try { controls?.stop(); } catch {}
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null | undefined;
      stream?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
      if (video) video.srcObject = null;
    };
  }, [attempt]);

  async function sendLog() {
    setSent("Enviando...");
    try {
      const r = await fetch("/api/client-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: tech.origin, status, detail, tech }),
      });
      setSent(r.ok ? "Registro enviado al servidor." : "No se pudo enviar.");
    } catch {
      setSent("No se pudo enviar.");
    }
  }

  const retry = () => {
    try { BrowserCodeReader.releaseAllStreams(); } catch {}
    setAttempt((n) => n + 1);
  };

  const diagLine = `Diagnóstico · contexto seguro: ${diag.secure ? "sí" : "no"} · API cámara: ${diag.api ? "sí" : "no"}`;

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
      <div className="px-3 py-1 border-t border-line grid gap-1">
        <p className="text-[11px] text-muted">{diagLine}</p>
        <details className="text-[11px] text-muted">
          <summary className="cursor-pointer underline">Detalles técnicos</summary>
          <pre className="whitespace-pre-wrap break-all bg-canvas rounded p-2 mt-1 max-h-40 overflow-auto">{JSON.stringify(tech, null, 1)}</pre>
          <button className="btn btn-secondary text-xs mt-1" onClick={sendLog}>Enviar registro al servidor</button>
          {sent && <span className="ml-2">{sent}</span>}
        </details>
      </div>
    </div>
  );
}
