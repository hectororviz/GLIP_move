import { loadConfig } from "@/lib/config";

// Prefijo de despliegue: '' en raíz, '/move' en producción.
// Misma regla idempotente que lib/base.ts (duplicada a propósito:
// este módulo lo usa el manifest y no debe depender del bundle cliente).
function prefix(p: string): string {
  const BP = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  if (p === '/') return `${BP}/` || '/';
  if (!BP || p === BP || p.startsWith(`${BP}/`)) return p;
  return `${BP}${p}`;
}

export async function buildManifest() {
  const c = await loadConfig();
  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];
  if (c.brandIcon) {
    icons.push({ src: prefix("/api/brand/icon"), sizes: "any", type: "image/png", purpose: "any" });
  }
  return {
    name: c.appName || "GLPI Move",
    short_name: (c.appName || "GLPI Move").slice(0, 12),
    description: "Control de bienes GLPI con mapa de puestos",
    start_url: prefix("/"),
    scope: prefix("/"),
    display: "standalone",
    background_color: "#f3f6fb",
    theme_color: c.accentColor || "#0b5ed7",
    icons,
  };
}
