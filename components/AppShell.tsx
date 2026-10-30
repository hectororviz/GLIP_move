"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type PubConfig = { appName?: string; accentColor?: string };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cfg, setCfg] = useState<PubConfig>({ appName: "GLPI Move", accentColor: "#0b5ed7" });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((j) => setCfg({ appName: j.appName || "GLPI Move", accentColor: j.accentColor || "#0b5ed7" }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const accent = cfg.accentColor || "#0b5ed7";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-600", accent);
    document.documentElement.style.setProperty("--accent-700", accent);
    document.documentElement.style.setProperty("--accent-soft", accent + "1a");
    document.title = cfg.appName || "GLPI Move";
  }, [cfg]);

  const nav = [
    { href: "/", label: "Inicio" },
    { href: "/mapa", label: "Control" },
    { href: "/buscar", label: "Búsqueda" },
    { href: "/config", label: "Config" },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-line">
        <div className="max-w-[1500px] mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white font-bold" style={{ background: "var(--accent)" }}>
              {(cfg.appName || "GLPI Move").slice(0, 1).toUpperCase()}
            </span>
            <div className="leading-tight">
              <div className="font-bold text-ink">{cfg.appName || "GLPI Move"}</div>
              <div className="text-[11px] text-muted">Control de bienes GLPI</div>
            </div>
          </div>
          <nav className="flex gap-1 ml-auto flex-wrap">
            {nav.map((n) => {
              const active = pathname === n.href || (n.href !== "/" && pathname?.startsWith(n.href));
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
      </header>
      <main className="max-w-[1500px] mx-auto p-4 w-full">{children}</main>
    </div>
  );
}
