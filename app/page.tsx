"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TypeStat = { type: string; total: number; truncated: boolean; unlocated: number; assigned: number };
type FloorStat = { id: string; name: string; hasMap: boolean; puestos: number; withItems: number; occupied: number; top: { id: number; name: string; items: number; users: number }[] };
type Recent = { ts: number; actor: string; action: string; type: string; id: number };
type Dash = {
  stats: { total: number; unlocated: number; assigned: number; truncated: boolean; byType: TypeStat[] };
  floors: FloorStat[];
  puestos: { drawn: number; withItems: number; occupied: number };
  recent: Recent[];
  health: { glpiOk: boolean; glpiError: string | null; latencyMs: number | null; appTokenSet: boolean; userTokenSet: boolean; floorsWithoutMap: { id: string; name: string }[]; undrawn: number };
  cached_at: number;
  cached: boolean;
};

function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-canvas overflow-hidden" style={{ background: "#eef2f8" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color || "var(--accent)" }} />
    </div>
  );
}

export default function Home() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      setDash(j);
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxType = Math.max(1, ...(dash?.stats.byType.map((b) => b.total) || [1]));
  const cards = [
    { href: "/mapa", title: "Control por piso", desc: "Mapa JPG, zoom, clic en puesto, ver equipos, asignar o escanear Code128.", icon: "🗺️" },
    { href: "/mapa?calibrar=1", title: "Calibración", desc: "Dibujar, mover y redimensionar puestos; asignar ubicaciones GLPI.", icon: "✏️" },
    { href: "/buscar", title: "Búsqueda", desc: "Por inventario, serie o nombre. Ficha completa y acceso al mapa.", icon: "🔎" },
    { href: "/config", title: "Configuración", desc: "Conexión GLPI, planos, puestos y apariencia.", icon: "⚙️" },
  ];

  return (
    <div className="grid gap-6">
      <div className="page-header">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1>Panel de control</h1>
            <p>Estado operativo de GLPI, actividad reciente y salud del sistema.</p>
          </div>
          <button onClick={load} disabled={loading} className="btn btn-secondary text-xs">
            {loading ? "Actualizando…" : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-danger border-danger">
          No se pudo cargar el panel: {error}
        </div>
      )}

      {dash?.health.glpiOk === false && !error && (
        <div className="card p-4 text-sm" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
          <b>GLPI no responde:</b> {(dash.health.glpiError || "sin conexión").slice(0, 160)}
          <Link href="/config" className="underline ml-2">Revisar conexión</Link>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Equipos en GLPI", value: dash ? String(dash.stats.total) + (dash.stats.truncated ? "+" : "") : "…", sub: dash?.stats.truncated ? "conteo parcial (límite GLPI)" : "6 tipos" },
          { label: "Asignados a usuario", value: dash ? String(dash.stats.assigned) : "…", sub: dash ? `${Math.round((dash.stats.assigned / Math.max(1, dash.stats.total)) * 100)}% del total` : "" },
          { label: "Sin ubicación", value: dash ? String(dash.stats.unlocated) : "…", sub: "locations_id = 0" },
          { label: "Puestos ocupados", value: dash ? `${dash.puestos.occupied}/${dash.puestos.drawn}` : "…", sub: dash ? `${dash.puestos.withItems} con equipos` : "dibujados en planos" },
        ].map((k) => (
          <div key={k.label} className="card p-4 grid gap-1">
            <span className="text-xs text-muted uppercase tracking-wide font-semibold">{k.label}</span>
            <span className="text-3xl font-bold tabular-nums">{loading && !dash ? "…" : k.value}</span>
            <span className="text-xs text-muted">{k.sub}</span>
          </div>
        ))}
      </div>

      {/* Por tipo + por piso */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4 grid gap-3">
          <div className="font-bold">Equipos por tipo</div>
          {!dash ? <p className="text-sm text-muted">{loading ? "Cargando…" : "Sin datos."}</p> : (
            <div className="grid gap-2">
              {dash.stats.byType.map((b) => (
                <div key={b.type} className="grid gap-1">
                  <div className="flex justify-between text-sm gap-2">
                    <span className="font-medium">{b.type}</span>
                    <span className="tabular-nums text-muted">{b.total}{b.truncated ? "+" : ""} · {b.assigned} asign.</span>
                  </div>
                  <Bar pct={(b.total / maxType) * 100} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4 grid gap-3">
          <div className="font-bold">Ocupación por piso</div>
          {!dash ? <p className="text-sm text-muted">{loading ? "Cargando…" : "Sin datos."}</p> : dash.floors.length === 0 ? (
            <p className="text-sm text-muted">Sin pisos configurados. <Link href="/config" className="underline">Crear uno en /config</Link>.</p>
          ) : (
            <div className="grid gap-3">
              {dash.floors.map((f) => (
                <div key={f.id} className="grid gap-1">
                  <div className="flex justify-between text-sm gap-2 flex-wrap">
                    <Link href={`/mapa?floor=${f.id}`} className="font-medium underline">{f.name}</Link>
                    <span className="tabular-nums text-muted">{f.occupied}/{f.puestos} ocupados{f.hasMap ? "" : " · sin plano"}</span>
                  </div>
                  <Bar pct={f.puestos ? (f.occupied / f.puestos) * 100 : 0} color="#15803d" />
                  {f.top.filter((t) => t.items > 0).length > 0 && (
                    <div className="text-xs text-muted truncate">
                      Top: {f.top.filter((t) => t.items > 0).map((t) => `${t.name} (${t.items})`).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actividad + salud */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4 grid gap-3">
          <div className="font-bold">Actividad reciente</div>
          {!dash ? <p className="text-sm text-muted">{loading ? "Cargando…" : "Sin datos."}</p> : dash.recent.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay movimientos registrados desde la app.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {dash.recent.map((a, i) => (
                <li key={`${a.ts}-${i}`} className="flex justify-between gap-2 flex-wrap border-b border-line pb-1.5 last:border-0">
                  <span className="min-w-0">
                    <b>{a.actor}</b> {a.action} <span className="text-muted">{a.type} #{a.id}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums shrink-0">
                    {new Date(a.ts).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4 grid gap-3">
          <div className="font-bold">Salud del sistema</div>
          {!dash ? <p className="text-sm text-muted">{loading ? "Cargando…" : "Sin datos."}</p> : (
            <ul className="grid gap-1.5 text-sm">
              <li>
                {dash.health.glpiOk ? <span className="badge badge-success">GLPI conectado</span> : <span className="badge badge-danger">GLPI caído</span>}
                {dash.health.latencyMs != null && <span className="text-xs text-muted ml-2 tabular-nums">{dash.health.latencyMs} ms</span>}
                {dash.cached && <span className="text-xs text-muted ml-2">datos en caché ({new Date(dash.cached_at).toLocaleTimeString()})</span>}
              </li>
              {!dash.health.appTokenSet && <li>⚠️ Falta el App-Token. <Link href="/config" className="underline">Cargarlo en /config</Link>.</li>}
              {!dash.health.userTokenSet && <li>⚠️ Falta el User token. <Link href="/config" className="underline">Cargarlo en /config</Link>.</li>}
              {dash.health.floorsWithoutMap.map((f) => (
                <li key={f.id}>🗺️ “{f.name}” sin plano. <Link href="/config" className="underline">Subirlo en /config</Link>.</li>
              ))}
              {dash.health.undrawn > 0 && <li>✏️ {dash.health.undrawn} puesto(s) GLPI sin dibujar. <Link href="/mapa?calibrar=1" className="underline">Calibrar</Link>.</li>}
              {dash.health.appTokenSet && dash.health.userTokenSet && !dash.health.floorsWithoutMap.length && !dash.health.undrawn && (
                <li><span className="badge badge-success">Todo en orden</span></li>
              )}
            </ul>
          )}
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
