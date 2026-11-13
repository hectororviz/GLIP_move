"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SegmentedBar, Spinner } from "@/components/ui";

type TypeStat = { type: string; total: number; truncated: boolean; unlocated: number; assigned: number };
type FloorStat = { id: string; name: string; hasMap: boolean; puestos: number; withItems: number; occupied: number; enUso: number; disponible: number; incompleto: number; inconsistente: number; top: { id: number; name: string; items: number; users: number }[] };
type Recent = { ts: number; actor: string; action: string; type: string; id: number };
type Dash = {
  stats: { total: number; unlocated: number; assigned: number; truncated: boolean; byType: TypeStat[] };
  floors: FloorStat[];
  puestos: { drawn: number; withItems: number; occupied: number; enUso: number; disponible: number; incompleto: number; inconsistente: number };
  recent: Recent[];
  health: { glpiOk: boolean; glpiError: string | null; latencyMs: number | null; appTokenSet: boolean; userTokenSet: boolean; floorsWithoutMap: { id: string; name: string }[]; undrawn: number };
  cached_at: number;
  cached: boolean;
};

const TYPE_ICON: Record<string, string> = { Computer: "🖥️", Monitor: "🖵", Phone: "☎️", Printer: "🖨️", Peripheral: "⌨️", NetworkEquipment: "🌐" };

export default function Home() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [canOperate, setCanOperate] = useState(false);

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

  useEffect(() => {
    const check = () => {
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setCanOperate(!!j.canOperate))
        .catch(() => setCanOperate(false));
    };
    check();
    window.addEventListener("auth-changed", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("auth-changed", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  const maxType = Math.max(1, ...(dash?.stats.byType.map((b) => b.total) || [1]));
  const cards = [
    { href: "/mapa", title: "Control por piso", desc: "Mapa, estados por color, búsqueda en plano y panel del puesto.", icon: "🗺️" },
    { href: "/masivo", title: "Movimiento masivo", desc: "Destino + escaneo en ráfaga y confirmación conjunta.", icon: "📦" },
    { href: "/buscar", title: "Búsqueda", desc: "Inventario, serie, nombre y personas. Vista tabla.", icon: "🔎" },
    { href: "/config", title: "Configuración", desc: "Conexión GLPI, planos y apariencia.", icon: "⚙️" },
  ];

  return (
    <div className="grid gap-5">
      <div className="page-header">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1>Panel de control</h1>
            <p>Estado operativo de GLPI, puestos por estado y salud del sistema.</p>
          </div>
          <button onClick={load} disabled={loading} className="btn btn-secondary text-xs">
            {loading ? "Actualizando…" : "↻ Actualizar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm toast-err border" role="alert">
          No se pudo cargar el panel: {error}. Revisá la conexión con GLPI.
        </div>
      )}

      {dash?.health.glpiOk === false && !error && (
        <div className="card p-4 text-sm toast-warn border" role="alert">
          <b>GLPI no responde:</b> <span className="break-all">{(dash.health.glpiError || "sin conexión").slice(0, 160)}</span>
          <Link href="/config" className="underline ml-2">Revisar conexión</Link>
        </div>
      )}

      {/* KPIs principales */}
      <section aria-label="Indicadores principales" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Equipos en GLPI", value: dash ? String(dash.stats.total) + (dash.stats.truncated ? "+" : "") : "…", sub: dash?.stats.truncated ? "conteo parcial (límite GLPI 1000/tipo)" : "6 tipos de bienes" },
            { label: "Asignados directos a usuario", value: dash ? String(dash.stats.assigned) : "…", sub: dash ? `${Math.round((dash.stats.assigned / Math.max(1, dash.stats.total)) * 100)}% del total · estén o no en puesto` : "" },
            { label: "Sin ubicación", value: dash ? String(dash.stats.unlocated) : "…", sub: "locations_id = 0 (no cuenta no dibujados)" },
            { label: "Puestos dibujados", value: dash ? String(dash.puestos.drawn) : "…", sub: dash ? `${dash.puestos.withItems} equipados · ${dash.puestos.occupied} con usuario` : "" },
          ].map((k) => (
            <div key={k.label} className="card p-4 grid gap-1 min-h-[118px] content-start">
              <span className="text-xs text-muted uppercase tracking-wide font-semibold leading-snug">{k.label}</span>
              <span className="text-3xl font-bold tabular-nums leading-none">{loading && !dash ? <Spinner label="" /> : k.value}</span>
              <span className="text-xs text-muted leading-snug break-words">{k.sub}</span>
            </div>
          ))}
      </section>

      {/* Estados de puestos */}
      <section aria-label="Estados de puestos" className="card p-4 grid gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold">Puestos por estado</h2>
          {dash && <span className="text-xs text-muted">Equipado ≠ ocupado: el puesto es la unidad principal; el usuario se asocia al puesto.</span>}
        </div>
        {!dash ? <p className="text-sm text-muted">{loading ? <Spinner /> : "Sin datos."}</p> : (
          <>
            <SegmentedBar parts={[
              { value: dash.puestos.enUso, color: "#15803d", label: "Equipado en uso" },
              { value: dash.puestos.disponible, color: "#2563eb", label: "Equipado disponible" },
              { value: dash.puestos.incompleto, color: "#b45309", label: "Incompleto" },
              { value: dash.puestos.inconsistente, color: "#dc2626", label: "Inconsistente" },
            ]} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
              <span><b className="tabular-nums" style={{ color: "#15803d" }}>{dash.puestos.enUso}</b> <span className="text-muted">Equipados en uso (bien + usuario)</span></span>
              <span><b className="tabular-nums" style={{ color: "#2563eb" }}>{dash.puestos.disponible}</b> <span className="text-muted">Equipados disponibles (bien, sin usuario)</span></span>
              <span><b className="tabular-nums" style={{ color: "#b45309" }}>{dash.puestos.incompleto}</b> <span className="text-muted">Incompletos (sin bien ni usuario)</span></span>
              <span><b className="tabular-nums" style={{ color: "#dc2626" }}>{dash.puestos.inconsistente}</b> <span className="text-muted">Inconsistentes (usuario sin bien) ⚠</span></span>
            </div>
          </>
        )}
      </section>

      {/* Por tipo + por piso */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section aria-label="Equipos por tipo" className="card p-4 grid gap-3">
          <h2 className="font-bold">Equipos por tipo</h2>
          {!dash ? <p className="text-sm text-muted">{loading ? <Spinner /> : "Sin datos."}</p> : (
            <div className="grid gap-2.5">
              {dash.stats.byType.map((b) => (
                <div key={b.type} className="grid gap-1">
                  <div className="flex justify-between text-sm gap-2">
                    <span className="font-medium min-w-0 truncate" title={b.type}><span aria-hidden="true" className="mr-1">{TYPE_ICON[b.type] || "📦"}</span>{b.type}</span>
                    <span className="tabular-nums text-muted text-xs sm:text-sm whitespace-nowrap shrink-0">{b.total}{b.truncated ? "+" : ""} · {b.assigned} con usuario · {b.unlocated} sin ubic.</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#eef2f8" }} role="img" aria-label={`${b.type}: ${b.total} equipos (barra relativa al tipo con más equipos, no es porcentaje)`}>
                    <div className="h-full rounded-full" style={{ width: `${(b.total / maxType) * 100}%`, background: "var(--accent)" }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted">Barras relativas al tipo con más equipos (no son porcentajes).{dash.stats.truncated && " “+” indica truncado en 1000 por tipo (límite GLPI)."}</p>
            </div>
          )}
        </section>

        <section aria-label="Ocupación por piso" className="card p-4 grid gap-3">
          <h2 className="font-bold">Distribución por piso</h2>
          {!dash ? <p className="text-sm text-muted">{loading ? <Spinner /> : "Sin datos."}</p> : dash.floors.length === 0 ? (
            <p className="text-sm text-muted">Sin pisos configurados. <Link href="/config" className="underline">Crear uno en /config</Link>.</p>
          ) : (
            <div className="grid gap-3">
              {dash.floors.map((f) => (
                <div key={f.id} className="grid gap-1">
                  <div className="flex justify-between text-sm gap-2 flex-wrap">
                    <Link href={`/mapa?floor=${f.id}`} className="font-medium underline">{f.name}</Link>
                    <span className="tabular-nums text-muted text-xs">{f.puestos} puestos · {f.enUso} uso · {f.disponible} disp. · {f.incompleto} inc.{f.inconsistente ? ` · ${f.inconsistente} ⚠` : ""}{f.hasMap ? "" : " · sin plano"}</span>
                  </div>
                  <SegmentedBar parts={[
                    { value: f.enUso, color: "#15803d", label: "en uso" },
                    { value: f.disponible, color: "#2563eb", label: "disponible" },
                    { value: f.incompleto, color: "#b45309", label: "incompleto" },
                    { value: f.inconsistente, color: "#dc2626", label: "inconsistente" },
                  ]} />
                  {f.top.filter((t) => t.items > 0).length > 0 && (
                    <div className="text-xs text-muted truncate">
                      Top: {f.top.filter((t) => t.items > 0).map((t) => `${t.name} (${t.items})`).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Actividad + salud */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section aria-label="Actividad reciente" className="card p-4 grid gap-3">
          <h2 className="font-bold">Actividad reciente</h2>
          {!dash ? <p className="text-sm text-muted">{loading ? <Spinner /> : "Sin datos."}</p> : dash.recent.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay movimientos registrados desde la app.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {dash.recent.map((a, i) => (
                <li key={`${a.ts}-${i}`} className="flex justify-between gap-2 flex-wrap border-b border-line pb-1.5 last:border-0">
                  <span className="min-w-0 break-words">
                    <b>{a.actor}</b> {a.action} <span className="text-muted break-all">{a.type} #{a.id}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums shrink-0">
                    {new Date(a.ts).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Salud del sistema" className="card p-4 grid gap-3">
          <h2 className="font-bold">Salud del sistema</h2>
          {!dash ? <p className="text-sm text-muted">{loading ? <Spinner /> : "Sin datos."}</p> : (
            <ul className="grid gap-1.5 text-sm">
              <li>
                {dash.health.glpiOk ? <span className="badge badge-success">● GLPI conectado</span> : <span className="badge badge-danger">● GLPI sin conexión</span>}
                {dash.health.latencyMs != null && <span className="text-xs text-muted ml-2 tabular-nums" title="Tiempo de respuesta de GLPI">{dash.health.latencyMs} ms</span>}
                <span className="text-xs text-muted ml-2">sync {new Date(dash.cached_at).toLocaleTimeString()}{dash.cached ? " (caché 5 min)" : ""}</span>
              </li>
              {!dash.health.appTokenSet && <li>⚠️ Falta el App-Token. <Link href="/config" className="underline">Cargarlo en /config</Link>.</li>}
              {!dash.health.userTokenSet && <li>⚠️ Falta el User token. <Link href="/config" className="underline">Cargarlo en /config</Link>.</li>}
              {dash.health.floorsWithoutMap.map((f) => (
                <li key={f.id}>🗺️ “{f.name}” sin plano. <Link href="/config" className="underline">Subirlo en /config</Link>.</li>
              ))}
              {dash.health.undrawn > 0 && <li>✏️ {dash.health.undrawn} puesto(s) GLPI sin dibujar. <Link href="/mapa?calibrar=1" className="underline">Calibrar</Link>.</li>}
              {dash.health.appTokenSet && dash.health.userTokenSet && !dash.health.floorsWithoutMap.length && !dash.health.undrawn && (
                <li><span className="badge badge-success">● Todo en orden</span></li>
              )}
            </ul>
          )}
        </section>
      </div>

      <nav aria-label="Accesos rápidos" className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          if (c.href === "/masivo" && !canOperate) {
            return (
              <span
                key={c.href}
                aria-disabled="true"
                title="Requiere sesión con perfil operador para movimientos masivos"
                className="card p-4 grid gap-1 text-muted/60 select-none"
              >
                <span className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{c.icon}</span>
                  <span className="font-bold text-ink">{c.title} 🔒</span>
                </span>
                <span className="text-sm text-muted">Iniciá sesión con perfil operador para mover en lote.</span>
              </span>
            );
          }
          return (
            <Link key={c.href} href={c.href} className="card p-4 grid gap-1 hover:-translate-y-0.5 transition">
              <span className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">{c.icon}</span>
                <span className="font-bold text-ink">{c.title}</span>
              </span>
              <span className="text-sm text-muted">{c.desc}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
