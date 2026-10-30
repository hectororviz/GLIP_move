import type { MetadataRoute } from "next";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const c = await loadConfig();
  const icons: MetadataRoute.Manifest["icons"] = [];
  if (c.brandIcon) {
    icons.push({ src: "/api/brand/icon", sizes: "any", type: "image/png", purpose: "any" });
  }
  return {
    name: c.appName || "GLPI Move",
    short_name: (c.appName || "GLPI Move").slice(0, 12),
    description: "Control de bienes GLPI con mapa de puestos",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f6fb",
    theme_color: c.accentColor || "#0b5ed7",
    icons,
  };
}
