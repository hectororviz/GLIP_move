import "./globals.css";
import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "GLPI Move — Control de puestos",
  description: "Registro y consulta de bienes GLPI con mapa de puestos",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "GLPI Move" },
};

export const viewport: Viewport = { themeColor: "#0b5ed7", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-canvas text-ink min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
