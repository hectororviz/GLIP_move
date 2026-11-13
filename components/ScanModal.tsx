"use client";
import { useEffect, useRef } from "react";
import Scanner from "./Scanner";

export default function ScanModal({ title, onResult, onClose }: {
  title: string;
  onResult: (v: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className="relative card w-full max-w-[480px] max-h-[92dvh] overflow-auto grid gap-2 p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center justify-between gap-2">
          <b className="text-ink">{title}</b>
          <button onClick={onClose} aria-label="Cerrar escáner" className="btn btn-secondary btn-icon tap-target">×</button>
        </div>
        <Scanner onResult={onResult} />
      </div>
    </div>
  );
}
