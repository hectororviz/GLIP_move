"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [stats, setStats] = useState({ floors: 0, puestos: 0 });

  useEffect(() => {
    fetch("/api/maps")
      .then((r) => r.json())
      .then((j) => {
        const floors = j.floors || [];
        setStats({ floors: floors.length, puestos: floors.reduce((a: number, f: any) => a + (f.puestos?.length || 0), 0) });
      })
      .catch(() => {});
  }, []);

  const cards = [
    { href: "/mapa", title: "Control por piso", desc: "Mapa JPG, zoom, clic en puesto, ver equipos, asignar o escanear Code128.", icon: "🗺️" },
    { href: "/mapa?calibrar=1", title: "Calibración", desc: "Dibujar, mover y redimensionar puestos; asignar ubicaciones GLPI.", icon: "✏️" },
    { href: "/buscar", title: "Búsqueda", desc: "Por inventario, serie o nombre. Ficha completa y acceso al mapa.", icon: "🔎" },
    { href: "/config", title: "Configuración", desc: "Conexión GLPI, planos, puestos y apariencia.", icon: "⚙️" },
  ];

  return (
    <div className="grid gap-6">
      <div className="page-header">
        <h1>Panel de control</h1>
        <p>Gestión diaria de bienes GLPI con mapa de puestos. Accesos rápidos y estado general.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card p-4 grid gap-1">
          <span className="text-xs text-muted uppercase tracking-wide font-semibold">Pisos configurados</span>
          <span className="text-3xl font-bold tabular-nums">{stats.floors}</span>
        </div>
        <div className="card p-4 grid gap-1">
          <span className="text-xs text-muted uppercase tracking-wide font-semibold">Puestos dibujados</span>
          <span className="text-3xl font-bold tabular-nums">{stats.puestos}</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card p-5 grid gap-2 hover:-translate-y-0.5 transition">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{c.icon}</span>
              <span className="font-bold text-ink">{c.title}</span>
            </div>
            <p className="text-sm text-muted">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
