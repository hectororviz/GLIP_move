"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "./AuthButton";
import { IconLock } from "./icons";

type PubConfig = { appName?: string; accentColor?: string; brandIcon?: string | null };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cfg, setCfg] = useState<PubConfig>({ appName: "GLPI Move", accentColor: "#0b5ed7", brandIcon: null });
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canOperate, setCanOperate] = useState(false);
  const [canView, setCanView] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
        .then((j) => {
          setCanOperate(!!j.canOperate);
          setCanView(j.access ? j.access !== "none" : !!j.canOperate);
        })
        .catch(() => { setCanOperate(false); setCanView(false); });
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
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    if (cfg.brandIcon) link.href = "/api/brand/icon";
    else link.href = "/icon.png";
  }, [cfg]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Cerrar drawer con Escape + foco inicial + bloqueo scroll
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open ]);

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
    if (href === "/masivo") return !canOperate;
    if (href === "/accesos") return !canView;
    return false;
  };
  const lockTitle = (href: string) =>
    href === "/accesos"
      ? "Requiere sesión con perfil operador (sin lectura anónima)"
      : href === "/masivo"
        ? "Requiere sesión con perfil operador para movimientos masivos"
        : "Iniciá sesión con un perfil autorizado para ver Configuración";

  const shortName = (cfg.appName || "GLPI Move").replace("GLPI Move", "CTIC · IDi").slice(0, 22);

  return (
    <div className="min-h-screen no-hscroll">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-[80] focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold">
        Saltar al contenido
      </a>
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-b border-line" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="max-w-[1500px] mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <Link href="/" className="flex items-center gap-2 min-w-0 flex-1 md:flex-none" aria-label="CTIC Agencia IDi — Inicio">
            {cfg.brandIcon ? (
              <img
                src="/api/brand/icon"
                alt=""
                className="h-9 w-9 shrink-0 rounded-xl object-contain bg-white border border-line"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; const fb = e.currentTarget.nextElementSibling as HTMLElement | null; if (fb) fb.style.display = "flex"; }}
              />
            ) : null}
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white font-bold text-sm"
              style={{ background: "var(--accent)", display: cfg.brandIcon ? "none" : "flex" }}
              aria-hidden="true"
            >
              {(cfg.appName || "C").slice(0, 1).toUpperCase()}
            </span>
            <span className="leading-tight min-w-0">
              <span className="block font-bold text-ink text-[0.95rem] truncate">{shortName}</span>
              <span className="hidden min-[400px]:block text-[11px] text-muted truncate">Control de bienes GLPI</span>
            </span>
          </Link>
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
                    className="px-3 py-2 rounded-lg text-sm font-medium text-muted/50 cursor-not-allowed select-none inline-flex items-center gap-1"
                  >
                    {n.label} <span className="inline-flex" aria-hidden="true"><IconLock size={12} /></span>
                  </span>
                );
              }
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition min-h-[40px] inline-flex items-center relative focus-visible:outline-2 ${
                    active ? "text-white" : "text-muted hover:text-ink hover:bg-canvas"
                  }`}
                  style={active ? { background: "var(--accent)" } : undefined}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden md:block ml-2 shrink-0">
            <AuthButton />
          </div>
          <div className="md:hidden ml-auto flex items-center gap-2 shrink-0">
            <AuthButton compact />
            <button
              className="btn btn-secondary btn-icon tap-target"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={open}
              aria-controls="nav-movil"
              onClick={() => setOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {open ? (<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>) : (<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>)}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {open && (
        <>
          <div className="navdrawer-backdrop md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div ref={menuRef} id="nav-movil" className="navdrawer md:hidden" role="dialog" aria-modal="true" aria-label="Menú de navegación">
            <div className="flex items-center justify-between px-4 h-14 border-b border-line shrink-0">
              <span className="font-bold text-ink truncate">{shortName}</span>
              <button ref={closeRef} className="btn btn-secondary btn-icon tap-target" onClick={() => setOpen(false)} aria-label="Cerrar menú">
                <span aria-hidden="true" className="text-lg leading-none">✕</span>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3 grid gap-1 content-start" aria-label="Navegación móvil">
              {nav.map((n) => {
                const active = pathname === n.href || (n.href !== "/" && pathname?.startsWith(n.href));
                const locked = isLocked(n.href);
                if (locked) {
                  return (
                    <span
                      key={n.href}
                      aria-disabled="true"
                      title={lockTitle(n.href)}
                      className="navlink px-3 py-3 rounded-xl text-[0.95rem] font-medium text-muted/50 cursor-not-allowed select-none inline-flex items-center gap-2"
                    >
                      {n.label} <span className="inline-flex" aria-hidden="true"><IconLock size={12} /></span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`px-3 py-3 rounded-xl text-[0.95rem] font-medium inline-flex items-center transition ${
                      active ? "text-white" : "text-ink hover:bg-canvas"
                    }`}
                    style={active ? { background: "var(--accent)" } : undefined}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-line px-4 py-3 text-xs text-muted shrink-0">
              CTIC · Agencia IDi — Control de bienes GLPI
            </div>
          </div>
        </>
      )}

      <main id="contenido" className="max-w-[1500px] mx-auto px-3 sm:px-4 w-full pt-[4.5rem] pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">{children}</main>
    </div>
  );
}
