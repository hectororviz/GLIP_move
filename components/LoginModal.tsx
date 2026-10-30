"use client";
import { useState } from "react";

export default function LoginModal({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: (u: { login: string; name: string; profiles: string[]; canOperate: boolean }) => void;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Error"); return; }
      onSuccess(j.user ? { ...j.user, canOperate: j.canOperate } : { login, name: login, profiles: [], canOperate: true });
      setLogin(""); setPassword("");
      onClose();
    } catch (e: any) {
      setMsg(e.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card p-5 w-full max-w-sm grid gap-3">
        <h2 className="font-bold text-lg">Iniciar sesión GLPI</h2>
        <p className="text-sm text-muted">Usa tu usuario y clave de GLPI para editar.</p>
        <input className="input" placeholder="Usuario" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
        <input type="password" className="input" placeholder="Clave" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {msg && <p className="text-sm text-danger">{msg}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-secondary text-xs">Cancelar</button>
          <button onClick={submit} disabled={busy} className="btn btn-primary text-xs">{busy ? "Entrando..." : "Entrar"}</button>
        </div>
      </div>
    </div>
  );
}
