"use client";
import { useEffect, useRef } from "react";
import BatchScanner from "./BatchScanner";

export default function BatchScanModal({
  title,
  onScan,
  onClose,
  paused = false,
}: {
  title: string;
  onScan: (v: string) => void;
  onClose: () => void;
  paused?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className="relative card w-full max-w-[480px] max-h-[92dvh] overflow-auto grid gap-2 p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center justify-between gap-2">
          <b className="text-ink min-w-0 truncate">{title}</b>
          <button onClick={onClose} aria-label="Cerrar escáner" className="btn btn-secondary btn-icon tap-target shrink-0">
            ×
          </button>
        </div>
        <BatchScanner onScan={onScan} paused={paused} />
        <div className="flex gap-2 justify-end items-center">
          <span className="text-xs text-muted mr-auto">El destello verde confirma cada lectura sin cerrar.</span>
          <button onClick={onClose} className="btn btn-secondary text-sm tap-target">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
