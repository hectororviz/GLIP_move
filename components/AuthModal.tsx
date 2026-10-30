"use client";
import { useState } from "react";

export default function AuthModal({ open, onClose, onSuccess }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [local, setLocal] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const url = local ? "/api/config/login" : "/api/auth/login";
      const body = local ? { password } : { login, password };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error || "Credenciales inválidas"); return; }
      setLogin(""); setPassword("");
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card p-5 w-full max-w-sm grid gap-3">
        <h2 className="font-bold text-lg">Iniciar sesión</h2>
        <p className="text-sm text-muted">
          {local ? "Clave admin local (failover sin GLPI)." : "Tu usuario y clave de GLPI."}
        </p>
        <input className="input" placeholder="Usuario" value={login} onChange={(e) => setLogin(e.target.value)} disabled={local} autoFocus={!local} />
        <input type="password" className="input" placeholder={local ? "Clave admin local" : "Clave"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus={local} />
        {msg && <p className="text-sm text-danger">{msg}</p>}
        <label className="flex items-center gap-2 text-xs text-muted select-none">
          <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} />
          login local
        </label>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-secondary text-xs">Cancelar</button>
          <button onClick={submit} disabled={busy} className="btn btn-primary text-xs">{busy ? "Entrando..." : "Entrar"}</button>
        </div>
      </div>
    </div>
  );
}
