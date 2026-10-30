"use client";
import { useState } from "react";

export default function AdminLoginModal({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/config/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });
      if (!r.ok) { setMsg("Clave incorrecta"); return; }
      setPass("");
      onSuccess();
      onClose();
    } catch (e: any) {
      setMsg(e.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative card p-5 w-full max-w-sm grid gap-3">
        <h2 className="font-bold text-lg">Acceso administrador</h2>
        <p className="text-sm text-muted">Ingresa la clave local (ADMIN_PASSWORD) para calibrar.</p>
        <input type="password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
        {msg && <p className="text-sm text-danger">{msg}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-secondary text-xs">Cancelar</button>
          <button onClick={submit} disabled={busy} className="btn btn-primary text-xs">{busy ? "Entrando..." : "Entrar"}</button>
        </div>
      </div>
    </div>
  );
}
