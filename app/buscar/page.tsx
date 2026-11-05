"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ScanModal from "@/components/ScanModal";
import AuthModal from "@/components/AuthModal";
import { useLocations } from "@/components/Places";
import { Spinner, EmptyState, TypeIcon } from "@/components/ui";
import { formatLocationDisplay } from "@/lib/location-display";
import AssetEditModal from "@/components/AssetEditModal";

function CompactLocation({ locId, fallback, byId }: { locId: number | null | undefined; fallback: any; byId: Map<number, any> }) {
  if (locId == null) return <span className="badge badge-warning">Sin ubicación</span>;
  const d = formatLocationDisplay(locId, byId as any, fallback != null ? String(fallback) : null);
  return (
    <span className="block min-w-0" title={d.full}>
      <span className="block truncate font-medium text-ink">{d.primary}</span>
      {d.isFloorOnly
        ? <span className="badge badge-warning mt-0.5 w-fit">Sin puesto</span>
        : d.secondary && <span className="block truncate text-xs text-muted">{d.secondary}</span>}
      {d.isFloorOnly && d.secondary && <span className="block truncate text-xs text-muted">{d.secondary}</span>}
    </span>
  );
}

type Asset = any;
type Person = { id: number; login: string | null; firstname: string | null; realname: string | null; display: string; email: string | null; phone: string | null };
type PersonGroup = { location_id: number; items: Asset[] };
type AuthUser = { login: string; name: string; profiles: string[]; canOperate: boolean };
const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

type AccessMail = { accountId: string; nombre?: string; direccion?: string; area?: string; canSend: boolean; canRead: boolean };
type AccessShare = { shareId: string; nombre?: string; ruta?: string; area?: string };

function FichaPersona({ p, groups, unlocated, byId, onQuitar, onRefresh, accessMails, accessShares, canSeeAccess }: {
  p: Person;
  groups: PersonGroup[];
  unlocated: Asset[];
  byId: Map<number, any>;
  onQuitar: (group: PersonGroup) => void;
  onRefresh: () => void;
  accessMails: AccessMail[];
  accessShares: AccessShare[];
  canSeeAccess: boolean;
}) {
  const [assignInv, setAssignInv] = useState("");
  const [assignMsg, setAssignMsg] = useState("");
  const [assignScan, setAssignScan] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  async function assignToPerson(inv: string) {
    if (!inv.trim()) return;
    setAssignBusy(true);
    setAssignMsg("Buscando bien...");
    try {
      const s = await fetch(`/api/glpi?q=${encodeURIComponent(inv.trim())}&type=all`).then((r) => r.json());
      const list: Asset[] = s.items || [];
      const found: Asset | undefined = list[0];
      if (!found) { setAssignMsg("No existe ese bien en GLPI"); return; }
      const curUser = found._userName && found._userName !== "—" ? found._userName : null;
      const curLoc = found._locationName && found._locationName !== "—" ? found._locationName : null;
      const extra = [
        curLoc ? `saldrá del puesto ${curLoc}` : "quedará sin puesto",
        curUser ? `usuario actual: ${curUser}` : null,
      ].filter(Boolean).join(" · ");
      if (!confirm(`Asignar ${found._type} ${found.otherserial || found.name} a ${p.display}? ${extra}.`)) return;
      setAssignMsg("Asignando...");
      const r = await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: found._type, id: found.id, location_id: null, user_id: p.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setAssignMsg("Error: " + (j.error || r.status)); return; }
      setAssignInv("");
      setAssignMsg("Asignado a " + p.display + ".");
      onRefresh();
    } finally {
      setAssignBusy(false);
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold text-ink text-base">{p.display}</div>
          <div className="text-muted text-xs">Usuario GLPI #{p.id}{p.login ? ` · ${p.login}` : ""}</div>
          {(p.email || p.phone) && (
            <div className="text-muted text-xs">{[p.email, p.phone].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <span className="badge badge-brand">{groups.length} puesto(s)</span>
      </div>

      <div className="grid gap-2 border-t pt-2">
        <div className="text-sm font-semibold">Asignar equipo a esta persona</div>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="Inventario, serie o URL GLPI…"
            value={assignInv}
            onChange={(e) => setAssignInv(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && assignInv && assignToPerson(assignInv)}
          />
          <button onClick={() => assignInv && assignToPerson(assignInv)} className="btn btn-primary text-xs" disabled={assignBusy}>OK</button>
          <button onClick={() => setAssignScan(!assignScan)} className="btn btn-secondary text-xs">📷</button>
        </div>
        {assignMsg && <p className="text-xs text-muted">{assignMsg}</p>}
      </div>
      {assignScan && (
        <ScanModal
          title={`Asignar equipo a ${p.display}`}
          onClose={() => setAssignScan(false)}
          onResult={(v) => { setAssignScan(false); assignToPerson(v); }}
        />
      )}

      {groups.map((g) => {
        const d = formatLocationDisplay(g.location_id, byId as any, g.items[0]?._locationName || null);
        const locName = d.isFloorOnly ? `${d.primary} (sin puesto)` : d.primary;
        return (
          <div key={g.location_id} className="card p-3 grid gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <b className="text-ink" title={d.full}>{locName}</b>
              <div className="flex gap-2">
                <a className="btn btn-secondary text-xs" href={`/mapa?focus=${g.location_id}`}>Ver en mapa →</a>
                <button className="btn btn-danger text-xs" onClick={() => onQuitar(g)}>Quitar del puesto</button>
              </div>
            </div>
            <ul className="grid gap-1 text-muted">
              {g.items.map((a) => (
                <li key={`${a._type}-${a.id}`}>
                  {a._type}: <b className="text-ink">{disp(a.name)}</b> · Inv <span className="tabular-nums">{disp(a.otherserial)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {unlocated.length > 0 && (
        <div className="card p-3 grid gap-1">
          <b className="text-ink">Asignados directos (sin puesto)</b>
          <ul className="grid gap-1 text-muted">
            {unlocated.map((a) => (
              <li key={`${a._type}-${a.id}`}>{a._type}: <b className="text-ink">{disp(a.name)}</b></li>
            ))}
          </ul>
        </div>
      )}

      {!groups.length && !unlocated.length && (
        <p className="text-muted">Esta persona no tiene equipos asignados en GLPI.</p>
      )}

      {canSeeAccess && (
        <div className="grid gap-2 border-t pt-2">
          <div className="text-sm font-semibold">Accesos (áreas / correos / carpetas) <a className="underline text-xs font-normal" href="/accesos">gestionar en Accesos →</a></div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="card p-3 grid gap-1">
              <b className="text-sm">✉️ Correos ({accessMails.length})</b>
              {accessMails.map((g) => (
                <div key={g.accountId} className="text-sm text-muted">
                  <b className="text-ink">{g.nombre || g.accountId}</b> <span className="text-xs tabular-nums">{g.direccion || ""}</span>
                  <span className="text-xs"> · {g.canSend ? "✉️ Envía" : ""}{g.canSend && g.canRead ? " + " : ""}{g.canRead ? "👁️ Recibe" : ""} · {g.area || ""}</span>
                </div>
              ))}
              {!accessMails.length && <span className="text-sm text-muted">Sin correos.</span>}
            </div>
            <div className="card p-3 grid gap-1">
              <b className="text-sm">📁 Carpetas ({accessShares.length})</b>
              {accessShares.map((g) => (
                <div key={g.shareId} className="text-sm text-muted" title={g.ruta || ""}>
                  <b className="text-ink">{g.nombre || g.shareId}</b> <span className="text-xs tabular-nums">{g.ruta || ""}</span>
                  <span className="text-xs"> · {g.area || ""}</span>
                </div>
              ))}
              {!accessShares.length && <span className="text-sm text-muted">Sin carpetas.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type Cat = "equipos" | "personas" | "areas" | "correos" | "carpetas";
type Results = {
  equipos: { total: number; items: any[]; error?: string };
  personas: { total: number; items: Person[]; error?: string };
  areas: { total: number; items: any[]; error?: string; locked?: boolean };
  correos: { total: number; items: any[]; error?: string; locked?: boolean };
  carpetas: { total: number; items: any[]; error?: string; locked?: boolean };
};

const CATS: { id: Cat; icon: string; label: string }[] = [
  { id: "equipos", icon: "🖥️", label: "Equipos" },
  { id: "personas", icon: "👤", label: "Personas" },
  { id: "areas", icon: "🏢", label: "Áreas" },
  { id: "correos", icon: "✉️", label: "Correos" },
  { id: "carpetas", icon: "📁", label: "Carpetas" },
];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-lift overflow-hidden">
        <div className="p-4 pb-3 border-b border-line flex items-start justify-between gap-2">
          <h2 className="font-bold text-ink">{title}</h2>
          <button className="btn btn-secondary icon-btn-sm" onClick={onClose} aria-label="Cerrar detalle">✕</button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function Buscar() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [canOperate, setCanOperate] = useState(false);
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState("");
  const [scan, setScan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Set<Cat>>(new Set());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const { byId, childrenOf } = useLocations();
  const abortRef = useRef<AbortController | null>(null);

  // detalle en modal
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [detailPerson, setDetailPerson] = useState<null | { p: Person; groups: PersonGroup[]; unlocated: Asset[]; mails: AccessMail[]; shares: AccessShare[] }>(null);
  const [detailMail, setDetailMail] = useState<null | { mail: any; personas: any[] }>(null);
  const [detailShare, setDetailShare] = useState<null | { share: any; personas: any[] }>(null);
  const [detailArea, setDetailArea] = useState<null | { area: any; mails: any[]; shares: any[] }>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  async function downloadExport(scope: "area" | "mail" | "share", id: string) {
    const key = `${scope}:${id}`;
    setExporting(key);
    try {
      const r = await fetch(`/api/access/export?scope=${scope}&id=${encodeURIComponent(id)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || `Error ${r.status}`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || `accesos-${scope}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  const syncAuth = useCallback(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.authenticated) {
          setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate });
          setCanOperate(!!j.canOperate);
        } else {
          setAuthUser(null);
          setCanOperate(false);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    syncAuth();
    window.addEventListener("auth-changed", syncAuth);
    // ?q= linkeable
    try {
      const init = new URLSearchParams(window.location.search).get("q") || "";
      if (init) {
        setQ(init);
        setTimeout(() => search(init), 300);
      }
    } catch {}
    return () => window.removeEventListener("auth-changed", syncAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requireEdit = (action: () => void) => {
    if (authUser?.canOperate) { action(); return; }
    pendingAction.current = action;
    setAuthOpen(true);
  };

  async function search(v?: string) {
    const query = (v ?? q).trim();
    if (!query) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    setMsg("Buscando en equipos, personas, áreas, correos y carpetas…");
    setSearched(true);
    setOpen(new Set()); // acordeones colapsados
    setDetailAsset(null);
    setDetailPerson(null);
    setDetailMail(null);
    setDetailShare(null);
    setDetailArea(null);
    try {
      history.replaceState(null, "", `/buscar?q=${encodeURIComponent(query)}`);
    } catch {}
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal });
      const j = await r.json();
      if (!r.ok) { setMsg("Error: " + (j.error || r.status)); setResults(null); return; }
      setResults(j.results);
      setCanOperate(!!j.canOperate);
      const totals = [j.results.equipos.total, j.results.personas.total, j.results.areas.total, j.results.correos.total, j.results.carpetas.total];
      const sum = totals.reduce((a: number, b: number) => a + b, 0);
      setMsg(sum ? `${sum} resultado(s) en ${totals.filter((t: number) => t > 0).length} categoría(s).` : "Sin resultados en ninguna categoría. Probá con/sin ceros, por serie, nombre o sigla de área (ej. CTIC).");
    } catch (e: any) {
      if (String(e.name) === "AbortError") return;
      setMsg("Error: " + (e.message || "red"));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const toggle = (c: Cat) => setOpen((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  async function openPersonDetail(p: Person) {
    setDetailPerson({ p, groups: [], unlocated: [], mails: [], shares: [] });
    try {
      const [ra, rg] = await Promise.all([
        fetch(`/api/glpi/user-assets?user_id=${p.id}`).then((r) => r.json()),
        canOperate || authUser?.canOperate
          ? fetch(`/api/access/grants?user_id=${p.id}`).then((r) => (r.ok ? r.json() : { mails: [], shares: [] })).catch(() => ({ mails: [], shares: [] }))
          : Promise.resolve({ mails: [], shares: [] }),
      ]);
      setDetailPerson({ p, groups: ra.groups || [], unlocated: ra.unlocated || [], mails: rg.mails || [], shares: rg.shares || [] });
    } catch {}
  }

  async function openMailDetail(m: any) {
    setDetailMail({ mail: m, personas: [] });
    if (!canOperate) return;
    try {
      const r = await fetch(`/api/access/grants?accountId=${encodeURIComponent(m.id)}`);
      const j = await r.json();
      if (r.ok) setDetailMail({ mail: j.mail || m, personas: j.personas || [] });
    } catch {}
  }

  async function openShareDetail(s: any) {
    setDetailShare({ share: s, personas: [] });
    if (!canOperate) return;
    try {
      const r = await fetch(`/api/access/grants?shareId=${encodeURIComponent(s.id)}`);
      const j = await r.json();
      if (r.ok) setDetailShare({ share: j.share || s, personas: j.personas || [] });
    } catch {}
  }

  async function openAreaDetail(a: any) {
    setDetailArea({ area: a, mails: [], shares: [] });
    if (!canOperate) return;
    try {
      const r = await fetch(`/api/access/overview?area=${encodeURIComponent(a.id)}`);
      const j = await r.json();
      const found = (j.areas || []).find((x: any) => x.id === a.id);
      if (found) setDetailArea({ area: a, mails: found.mails || [], shares: found.shares || [] });
    } catch {}
  }

  async function quitarDelPuesto(g: PersonGroup) {
    const p = detailPerson?.p;
    if (!p) return;
    if (!confirm(`Quitar a ${p.display} de este puesto? Se quitará como usuario de ${g.items.length} equipo(s).`)) return;
    for (const a of g.items) {
      await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: a._type, id: a.id, location_id: a._locationId, user_id: null }),
      });
    }
    openPersonDetail(p);
    search();
  }

  const lockedBox = (label: string) => (
    <div className="p-4 grid gap-2 text-center">
      <span className="text-2xl" aria-hidden="true">🔒</span>
      <p className="text-sm text-muted">{label} requiere sesión con perfil operador. <button className="underline" onClick={() => setAuthOpen(true)}>Iniciar sesión</button></p>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="page-header">
        <h1>Búsqueda</h1>
        <p>Buscador único: equipos, personas, áreas, correos y carpetas. <span className="text-muted">Ej. CTIC.</span></p>
      </div>

      <div className="card p-3 grid gap-2">
        <div className="flex gap-2 flex-wrap">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Inventario, serie, nombre, persona, área, correo, carpeta…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            aria-label="Búsqueda genérica"
          />
          <button onClick={() => search()} className="btn btn-primary" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
          <button onClick={() => setScan(!scan)} className="btn btn-secondary" aria-label="Escanear">📷</button>
        </div>
        {scan && (
          <ScanModal
            title="Buscar (escaneo)"
            onClose={() => setScan(false)}
            onResult={(v) => { setQ(v); setScan(false); search(v); }}
          />
        )}
        <p className="text-sm text-muted" role="status">{msg}</p>
      </div>

      {loading && <Spinner label="Buscando en las 5 categorías…" />}

      {searched && results && !loading && (
        <div className="grid gap-3">
          {results.equipos.error && <div className="card p-3 text-sm toast-err border" role="alert">Equipos: {results.equipos.error}</div>}
          {results.personas.error && <div className="card p-3 text-sm toast-err border" role="alert">Personas: {results.personas.error}</div>}
          {CATS.map((c) => {
            const r: any = (results as any)[c.id];
            const isOpen = open.has(c.id);
            const count = r.locked ? 0 : r.total;
            return (
              <section key={c.id} className="card p-0 overflow-hidden" aria-label={`${c.label}`}>
                <button
                  onClick={() => toggle(c.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 p-3 text-left hover:bg-canvas transition"
                >
                  <span aria-hidden="true">{c.icon}</span>
                  <b className="text-ink">{c.label}</b>
                  <span className="badge badge-brand" aria-label={`${count} encontrados`}>{r.locked ? "🔒" : `${count}`}</span>
                  {r.error && !r.locked && <span className="text-xs text-danger truncate">· error parcial</span>}
                  <span className="ml-auto text-muted text-sm" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="border-t p-3 grid gap-2">
                    {r.locked && lockedBox(c.label)}
                    {!r.locked && count === 0 && <EmptyState title={`Sin ${c.label.toLowerCase()}`} hint={r.error || "Sin coincidencias para esta búsqueda."} />}
                    {!r.locked && c.id === "equipos" && (r.items as any[]).length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="table-dense min-w-[760px]">
                          <thead><tr><th>Tipo</th><th>Nombre</th><th>Inventario</th><th>Ubicación / Usuario</th><th>Detalle</th></tr></thead>
                          <tbody>
                            {(r.items as any[]).map((a) => (
                              <tr key={`${a._type}-${a.id}`}>
                                <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><TypeIcon type={a._type} /><b>{a._type}</b></span></td>
                                <td className="max-w-[220px]"><span className="block truncate font-medium" title={disp(a.name)}>{disp(a.name)}</span><span className="text-xs text-muted tabular-nums">S. {disp(a.serial)}</span></td>
                                <td className="tabular-nums font-semibold">{disp(a.otherserial)}</td>
                                <td className="max-w-[240px] min-w-0"><CompactLocation locId={a._locationId} fallback={a._locationName} byId={byId} /><span className="text-xs text-muted block truncate" title={disp(a._userName)}>👤 {disp(a._userName)}</span></td>
                                <td><button className="btn btn-secondary text-xs !min-h-[30px] !py-1" onClick={() => setDetailAsset(a)}>Ver detalle →</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!r.locked && c.id === "personas" && (r.items as Person[]).length > 0 && (
                      <div className="grid gap-2">
                        {(r.items as Person[]).map((p) => (
                          <div key={p.id} className="card p-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                            <div><div className="font-bold text-ink">{p.display}</div><div className="text-muted text-xs">GLPI #{p.id}{p.login ? ` · ${p.login}` : ""}</div></div>
                            <button className="btn btn-secondary text-xs" onClick={() => openPersonDetail(p)}>Ver detalle →</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {!r.locked && c.id === "areas" && (r.items as any[]).length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="table-dense min-w-[640px]">
                          <thead><tr><th>Área</th><th>Responsable</th><th>Correos</th><th>Carpetas</th><th>Detalle</th></tr></thead>
                          <tbody>
                            {(r.items as any[]).map((a) => (
                              <tr key={a.id}>
                                <td><b>{a.nombre}</b></td>
                                <td className="text-sm">{a.responsableNombre || "—"} <span className="text-xs text-muted">#{a.responsableUserId}</span></td>
                                <td className="tabular-nums">{a.mails}</td>
                                <td className="tabular-nums">{a.shares}</td>
                                <td><button className="btn btn-secondary text-xs" onClick={() => openAreaDetail(a)}>Ver detalle →</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!r.locked && c.id === "correos" && (r.items as any[]).length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="table-dense min-w-[560px]">
                          <thead><tr><th>Nombre</th><th>Dirección</th><th className="hidden md:table-cell">Área</th><th>Personas</th><th><span className="sr-only">Abrir</span></th></tr></thead>
                          <tbody>
                            {(r.items as any[]).map((m) => (
                              <tr key={m.id} className="cursor-pointer" title={`Ver detalle de ${m.nombre}`} tabIndex={0}
                                onClick={() => openMailDetail(m)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMailDetail(m); } }}>
                                <td><b>{m.nombre}</b><span className="block text-xs text-muted font-normal md:hidden">{m.area}</span></td>
                                <td className="tabular-nums text-sm">{m.direccion}</td>
                                <td className="text-sm hidden md:table-cell">{m.area}</td>
                                <td className="tabular-nums text-xs">{m.personas} <span className="text-muted">({m.envian} ✉️/{m.reciben} 👁️)</span></td>
                                <td className="text-muted" aria-hidden="true">›</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!r.locked && c.id === "carpetas" && (r.items as any[]).length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="table-dense min-w-[560px]">
                          <thead><tr><th>Nombre</th><th>Ruta</th><th className="hidden md:table-cell">Área</th><th>Personas</th><th><span className="sr-only">Abrir</span></th></tr></thead>
                          <tbody>
                            {(r.items as any[]).map((s) => (
                              <tr key={s.id} className="cursor-pointer" title={`Ver detalle de ${s.nombre}`} tabIndex={0}
                                onClick={() => openShareDetail(s)}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openShareDetail(s); } }}>
                                <td><b>{s.nombre}</b><span className="block text-xs text-muted font-normal md:hidden">{s.area}</span></td>
                                <td className="tabular-nums text-sm max-w-[280px]"><span className="block truncate" title={s.ruta}>{s.ruta}</span></td>
                                <td className="text-sm hidden md:table-cell">{s.area}</td>
                                <td className="tabular-nums">{s.personas}</td>
                                <td className="text-muted" aria-hidden="true">›</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          {!results.equipos.total && !results.personas.total && !results.areas.total && !results.correos.total && !results.carpetas.total && !loading && (
            <EmptyState title="Sin resultados" hint="Probá con/sin ceros, por serie, nombre o sigla de área." />
          )}
        </div>
      )}

      {detailAsset && (
        <Modal title={`${detailAsset._type} · ${disp(detailAsset.name)}`} onClose={() => setDetailAsset(null)}>
          <AssetEditModal
            key={`${detailAsset._type}-${detailAsset.id}`}
            asset={detailAsset}
            byId={byId}
            childrenOf={childrenOf}
            canEdit={!!authUser?.canOperate}
            onClose={() => setDetailAsset(null)}
            onSaved={() => { search(); }}
          />
        </Modal>
      )}

      {detailPerson && (
        <Modal title={`Persona: ${detailPerson.p.display}`} onClose={() => setDetailPerson(null)}>
          <FichaPersona
            p={detailPerson.p}
            groups={detailPerson.groups}
            unlocated={detailPerson.unlocated}
            byId={byId}
            onQuitar={(g) => requireEdit(() => quitarDelPuesto(g))}
            onRefresh={() => openPersonDetail(detailPerson.p)}
            accessMails={detailPerson.mails}
            accessShares={detailPerson.shares}
            canSeeAccess={canOperate}
          />
        </Modal>
      )}

      {detailMail && (
        <Modal title={`Correo: ${detailMail.mail.nombre || detailMail.mail.direccion}`} onClose={() => setDetailMail(null)}>
          <div className="grid gap-2 text-sm">
            <p className="tabular-nums text-muted">{detailMail.mail.direccion} · Área {detailMail.mail.area || "—"}</p>
            {!canOperate && <p className="text-sm text-muted">🔒 Iniciá sesión con perfil operador para ver las personas.</p>}
            {canOperate && !detailMail.personas.length && <p className="text-sm text-muted">Nadie tiene acceso aún. Gestionar en <a className="underline" href="/accesos">Accesos →</a></p>}
            {canOperate && detailMail.personas.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table-dense min-w-[480px]">
                  <thead><tr><th>Persona</th><th>Envía</th><th>Recibe</th></tr></thead>
                  <tbody>
                    {detailMail.personas.map((g: any) => (
                      <tr key={g.userId}>
                        <td>{g.userDisplay || `#${g.userId}`} <span className="text-xs text-muted">#{g.userId}</span></td>
                        <td className="text-center">{g.canSend ? "✉️" : "—"}</td>
                        <td className="text-center">{g.canRead ? "👁️" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canOperate && <span className="inline-flex gap-1 flex-wrap"><a className="btn btn-secondary text-xs w-fit" href="/accesos">Gestionar en Accesos →</a><button className="btn btn-secondary text-xs w-fit" disabled={exporting === `mail:${detailMail.mail.id}`} onClick={() => downloadExport("mail", detailMail.mail.id)}>{exporting === `mail:${detailMail.mail.id}` ? "Exportando…" : "Excel ↓"}</button></span>}
          </div>
        </Modal>
      )}

      {detailShare && (
        <Modal title={`Carpeta: ${detailShare.share.nombre}`} onClose={() => setDetailShare(null)}>
          <div className="grid gap-2 text-sm">
            <p className="tabular-nums text-muted" title={detailShare.share.ruta}>{detailShare.share.ruta} · Área {detailShare.share.area || "—"}</p>
            {!canOperate && <p className="text-sm text-muted">🔒 Iniciá sesión con perfil operador para ver las personas.</p>}
            {canOperate && !detailShare.personas.length && <p className="text-sm text-muted">Nadie tiene acceso aún. Gestionar en <a className="underline" href="/accesos">Accesos →</a></p>}
            {canOperate && detailShare.personas.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table-dense min-w-[420px]">
                  <thead><tr><th>Persona</th><th>Acceso</th></tr></thead>
                  <tbody>
                    {detailShare.personas.map((g: any) => (
                      <tr key={g.userId}>
                        <td>{g.userDisplay || `#${g.userId}`} <span className="text-xs text-muted">#{g.userId}</span></td>
                        <td><span className="badge badge-success">Sí ✓</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canOperate && <span className="inline-flex gap-1 flex-wrap"><a className="btn btn-secondary text-xs w-fit" href="/accesos">Gestionar en Accesos →</a><button className="btn btn-secondary text-xs w-fit" disabled={exporting === `share:${detailShare.share.id}`} onClick={() => downloadExport("share", detailShare.share.id)}>{exporting === `share:${detailShare.share.id}` ? "Exportando…" : "Excel ↓"}</button></span>}
          </div>
        </Modal>
      )}

      {detailArea && (
        <Modal title={`Área: ${detailArea.area.nombre}`} onClose={() => setDetailArea(null)}>
          <div className="grid gap-2 text-sm">
            <p className="text-muted">Responsable: <b className="text-ink">{detailArea.area.responsableNombre || "—"}</b> <span className="text-xs">#{detailArea.area.responsableUserId}</span></p>
            <b className="text-sm">✉️ Correos ({detailArea.mails.length})</b>
            {detailArea.mails.map((m: any) => <div key={m.id} className="text-sm text-muted"><b className="text-ink">{m.nombre}</b> <span className="tabular-nums text-xs">{m.direccion}</span> <span className="text-xs">· {m.personas} persona(s)</span></div>)}
            {!detailArea.mails.length && <p className="text-sm text-muted">Sin correos.</p>}
            <b className="text-sm">📁 Carpetas ({detailArea.shares.length})</b>
            {detailArea.shares.map((s: any) => <div key={s.id} className="text-sm text-muted" title={s.ruta}><b className="text-ink">{s.nombre}</b> <span className="tabular-nums text-xs">{s.ruta}</span> <span className="text-xs">· {s.personas} persona(s)</span></div>)}
            {!detailArea.shares.length && <p className="text-sm text-muted">Sin carpetas.</p>}
            <span className="inline-flex gap-1 flex-wrap"><a className="btn btn-secondary text-xs w-fit" href="/accesos">Gestionar en Accesos →</a>{canOperate && <button className="btn btn-secondary text-xs w-fit" disabled={exporting === `area:${detailArea.area.id}`} onClick={() => downloadExport("area", detailArea.area.id)}>{exporting === `area:${detailArea.area.id}` ? "Exportando…" : "Excel ↓"}</button>}</span>
          </div>
        </Modal>
      )}

      {authOpen && (
        <AuthModal
          open={authOpen}
          onClose={() => { setAuthOpen(false); pendingAction.current = null; }}
          onSuccess={() => {
            syncAuth();
            window.dispatchEvent(new Event("auth-changed"));
            const a = pendingAction.current; pendingAction.current = null;
            if (a) a();
            else if (q.trim()) search();
          }}
        />
      )}
    </div>
  );
}
