"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "./AuthButton";

type PubConfig = { appName?: string; accentColor?: string; brandIcon?: string | null };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cfg, setCfg] = useState<PubConfig>({ appName: "GLPI Move", accentColor: "#0b5ed7", brandIcon: null });
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canOperate, setCanOperate] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/config", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (alive) setCfg({ appName: j.appName || "GLPI Move", accentColor: j.accentColor || "#0b5ed7", brandIcon: j.brandIcon || null }); })
        .catch(() => {});
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("brand-icon-changed", load as EventListener);
    return () => { alive = false; window.removeEventListener("focus", onFocus); window.removeEventListener("brand-icon-changed", load as EventListener); };
  }, []);

  useEffect(() => {
    const checkAdmin = () => {
      fetch("/api/admin/check", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setIsAdmin(!!j.admin))
        .catch(() => setIsAdmin(false));
    };
    const checkOperate = () => {
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setCanOperate(!!j.canOperate))
        .catch(() => setCanOperate(false));
    };
    checkAdmin();
    checkOperate();
    window.addEventListener("auth-changed", checkAdmin);
    window.addEventListener("auth-changed", checkOperate);
    window.addEventListener("focus", checkAdmin);
    window.addEventListener("focus", checkOperate);
    return () => {
      window.removeEventListener("auth-changed", checkAdmin);
      window.removeEventListener("auth-changed", checkOperate);
      window.removeEventListener("focus", checkAdmin);
      window.removeEventListener("focus", checkOperate);
    };
  }, []);

  useEffect(() => {
    const accent = cfg.accentColor || "#0b5ed7";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-600", accent);
    document.documentElement.style.setProperty("--accent-700", accent);
    document.documentElement.style.setProperty("--accent-soft", accent + "1a");
    document.title = cfg.appName || "GLPI Move";
    // favicon dinámico
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    if (cfg.brandIcon) link.href = "/api/brand/icon";
    else link.href = "/icon.png";
  }, [cfg]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const nav = [
    { href: "/", label: "Inicio" },
    { href: "/mapa", label: "Control" },
    { href: "/buscar", label: "Búsqueda" },
    { href: "/accesos", label: "Accesos" },
    { href: "/masivo", label: "Masivo" },
    { href: "/config", label: "Config" },
  ];

  const isLocked = (href: string) => {
    if (href === "/config") return !isAdmin;
    if (href === "/masivo" || href === "/accesos") return !canOperate;
    return false;
  };
  const lockTitle = (href: string) =>
    href === "/accesos"
      ? "Requiere sesión con perfil operador (sin lectura anónima)"
      : href === "/masivo"
        ? "Requiere sesión con perfil operador para movimientos masivos"
        : "Iniciá sesión con un perfil autorizado para ver Configuración";

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-b border-line">
        <div className="max-w-[1500px] mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {cfg.brandIcon ? (
              <img
                src="/api/brand/icon"
                alt=""
                className="h-9 w-9 shrink-0 rounded-xl object-contain bg-white"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; const fb = e.currentTarget.nextElementSibling as HTMLElement | null; if (fb) fb.style.display = "flex"; }}
              />
            ) : null}
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white font-bold"
              style={{ background: "var(--accent)", display: cfg.brandIcon ? "none" : "flex" }}
            >
              {(cfg.appName || "GLPI Move").slice(0, 1).toUpperCase()}
            </span>
            <div className="leading-tight min-w-0">
              <div className="font-bold text-ink truncate">{cfg.appName || "GLPI Move"}</div>
              <div className="text-[11px] text-muted truncate">Control de bienes GLPI</div>
            </div>
          </div>
          <nav className="hidden md:flex gap-1 ml-auto" aria-label="Navegación principal">
            {nav.map((n) => {
              const active = pathname === n.href || (n.href !== "/" && pathname?.startsWith(n.href));
              const locked = isLocked(n.href);
              if (locked) {
                const title = lockTitle(n.href);
                return (
                  <span
                    key={n.href}
                    aria-disabled="true"
                    title={title}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-muted/50 cursor-not-allowed select-none"
                  >
                    {n.label} 🔒
                  </span>
                );
              }
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition relative ${
                    active ? "text-white" : "text-muted hover:text-ink hover:bg-canvas"
                  }`}
                  style={active ? { background: "var(--accent)" } : undefined}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden md:block ml-3 shrink-0">
            <AuthButton />
          </div>
          <div className="md:hidden ml-auto flex items-center gap-2 shrink-0">
            <AuthButton compact />
            <button
              className="btn btn-secondary btn-icon"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <div className="md:hidden border-t border-line bg-white">
            <nav className="max-w-[1500px] mx-auto px-4 py-2 grid gap-1">
              {nav.map((n) => {
                const active = pathname === n.href || (n.href !== "/" && pathname?.startsWith(n.href));
                const locked = isLocked(n.href);
                if (locked) {
                  const title = lockTitle(n.href);
                  return (
                    <span
                      key={n.href}
                      aria-disabled="true"
                      title={title}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-muted/50 cursor-not-allowed select-none"
                    >
                      {n.label} 🔒
                    </span>
                  );
                }
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      active ? "text-white" : "text-muted hover:text-ink hover:bg-canvas"
                    }`}
                    style={active ? { background: "var(--accent)" } : undefined}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>
      <main className="max-w-[1500px] mx-auto p-4 w-full pt-20">{children}</main>
    </div>
  );
}
