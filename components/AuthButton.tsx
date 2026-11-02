"use client";
import { useCallback, useEffect, useState } from "react";
import AuthModal from "./AuthModal";

export type AuthInfo = { login: string; name: string; profiles: string[]; canOperate: boolean };

export function notifyAuthChanged() {
  window.dispatchEvent(new Event("auth-changed"));
}

/** Botón de sesión global para el header: nombre + rol + salir, o iniciar sesión. */
export default function AuthButton({ compact = false }: { compact?: boolean }) {
  const [user, setUser] = useState<AuthInfo | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.authenticated) setUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate });
        else setUser(null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("auth-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("auth-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    notifyAuthChanged();
  }

  return (
    <>
      {user ? (
        <span className={`flex items-center gap-2 ${compact ? "" : "min-w-0"}`}>
          <span className={`text-muted truncate ${compact ? "hidden sm:inline max-w-[110px]" : "max-w-[170px]"} text-xs`} title={`${user.name} (${user.canOperate ? "editor" : "lectura"})`}>
            {user.name} <span className="text-[11px]">({user.canOperate ? "editor" : "lectura"})</span>
          </span>
          <button className="btn btn-secondary text-xs !min-h-[32px] !py-1" onClick={logout}>Salir</button>
        </span>
      ) : (
        <button className="btn btn-primary text-xs !min-h-[32px] !py-1 whitespace-nowrap" onClick={() => setOpen(true)}>Iniciar sesión</button>
      )}
      {open && (
        <AuthModal
          open={open}
          onClose={() => setOpen(false)}
          onSuccess={() => { refresh(); notifyAuthChanged(); }}
        />
      )}
    </>
  );
}
