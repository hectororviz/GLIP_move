"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ScanModal from "@/components/ScanModal";
import AuthModal from "@/components/AuthModal";
import { useLocations } from "@/components/Places";
import { Spinner, EmptyState, TypeIcon, SidePanel, AdminSection } from "@/components/ui";
import { IconBuilding, IconCamera, IconDownload, IconEye, IconFolder, IconLock, IconMail, IconMonitor, IconUser } from "@/components/icons";
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

/* Fila compacta de equipo: tipo + nombre + inventario + consulta de detalle */
function AssetRow({ a, onOpen }: { a: Asset; onOpen: () => void }) {
  return (
    <li className="flex items-center gap-2.5 min-w-0 py-1.5 border-b border-line last:border-0">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line" aria-hidden="true">
        <TypeIcon type={a._type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink text-[0.85rem]" title={disp(a.name)}>{disp(a.name)}</span>
        <span className="block text-xs text-muted truncate">{a._type} · Inv <span className="tabular-nums">{disp(a.otherserial)}</span></span>
      </span>
      <button className="btn btn-secondary text-xs shrink-0 !min-h-[44px]" onClick={onOpen}>Ver equipo</button>
    </li>
  );
}

type PersonDetail = { p: Person; groups: PersonGroup[]; unlocated: Asset[]; mails: AccessMail[]; shares: AccessShare[] };
type ReturnTarget = { kind: "person"; detail: PersonDetail } | { kind: "asset"; asset: Asset };

function FichaPersona({ p, groups, unlocated, byId, onQuitar, onRefresh, onOpenAsset, accessMails, accessShares, canSeeAccess, canEdit, onDirtyChange }: {
  p: Person;
  groups: PersonGroup[];
  unlocated: Asset[];
  byId: Map<number, any>;
  onQuitar: (group: PersonGroup) => void;
  onRefresh: () => void;
  onOpenAsset: (a: Asset) => void;
  accessMails: AccessMail[];
  accessShares: AccessShare[];
  canSeeAccess: boolean;
  canEdit: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [assignInv, setAssignInv] = useState("");
  const [assignMsg, setAssignMsg] = useState("");
  const [assignScan, setAssignScan] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const dirty = assignInv !== "";
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

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
        curLoc ? `conservará el puesto ${curLoc}` : "quedará sin puesto",
        curUser ? `usuario actual: ${curUser}` : null,
      ].filter(Boolean).join(" · ");
      if (!confirm(`Asignar ${found._type} ${found.otherserial || found.name} a ${p.display}? ${extra}.`)) return;
      setAssignMsg("Asignando...");
      const r = await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: found._type, id: found.id, user_id: p.id }),
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
        <div className="min-w-0">
          <div className="font-bold text-ink text-base truncate">{p.display}</div>
          <div className="text-muted text-xs">Usuario GLPI #{p.id}{p.login ? ` · ${p.login}` : ""}</div>
          {(p.email || p.phone) && (
            <div className="text-muted text-xs break-all">{[p.email, p.phone].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <span className="badge badge-brand shrink-0">{groups.length} puesto(s)</span>
      </div>

      <section aria-label="Equipos asignados" className="grid gap-1.5">
        <h3 className="section-h">Equipos asignados</h3>
        {groups.map((g) => {
          const d = formatLocationDisplay(g.location_id, byId as any, g.items[0]?._locationName || null);
          const locName = d.isFloorOnly ? `${d.primary} (sin puesto)` : d.primary;
          return (
            <div key={g.location_id} className="card p-3 grid gap-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <b className="text-ink text-sm min-w-0 truncate" title={d.full}>{locName}</b>
                <a className="btn btn-secondary text-xs" href={`/mapa?focus=${g.location_id}`}>Ver en mapa →</a>
              </div>
              <ul aria-label={`Equipos en ${locName}`}>
                {g.items.map((a) => (
                  <AssetRow key={`${a._type}-${a.id}`} a={a} onOpen={() => onOpenAsset(a)} />
                ))}
              </ul>
            </div>
          );
        })}

        {unlocated.length > 0 && (
          <div className="card p-3 grid gap-1">
            <b className="text-ink text-sm">Asignados directos (sin puesto)</b>
            <ul aria-label="Equipos asignados directos">
              {unlocated.map((a) => (
                <AssetRow key={`${a._type}-${a.id}`} a={a} onOpen={() => onOpenAsset(a)} />
              ))}
            </ul>
          </div>
        )}

        {!groups.length && !unlocated.length && (
          <p className="text-muted">Esta persona no tiene equipos asignados en GLPI.</p>
        )}
      </section>

      {canEdit ? (
        <AdminSection title="Administrar asignaciones" hint="Asignar y desvincular equipos">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-ink" htmlFor="person-assign">Asignar equipo a esta persona</label>
            <div className="flex gap-2">
              <input
                id="person-assign"
                className="input flex-1 text-sm min-w-0"
                placeholder="Inventario, serie o URL GLPI…"
                value={assignInv}
                onChange={(e) => setAssignInv(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && assignInv && assignToPerson(assignInv)}
                aria-label="Inventario a asignar"
              />
              <button onClick={() => assignInv && assignToPerson(assignInv)} className="btn btn-secondary text-xs shrink-0" disabled={assignBusy}>OK</button>
              <button onClick={() => setAssignScan(!assignScan)} className="btn btn-secondary icon-btn tap-target shrink-0" aria-label="Escanear inventario"><IconCamera size={16} /></button>
            </div>
            {assignMsg && <p className="text-xs text-muted" role="status">{assignMsg}</p>}
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
              <div key={g.location_id} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl bg-white px-3 py-2 min-h-[52px]">
                <span className="truncate min-w-0" title={d.full}>{locName} <span className="text-xs text-muted">· {g.items.length} equipo(s)</span></span>
                <button className="btn btn-danger-outline text-xs shrink-0" onClick={() => onQuitar(g)}>Quitar del puesto</button>
              </div>
            );
          })}
        </AdminSection>
      ) : (
        <p className="text-xs text-muted">La edición requiere perfil operador.</p>
      )}

      {canSeeAccess && (
        <div className="grid gap-2 border-t pt-3">
          <div className="text-sm font-semibold">Accesos (áreas / correos / carpetas) <a className="underline text-xs font-normal" href="/accesos">gestionar en Accesos →</a></div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="card p-3 grid gap-1">
              <b className="text-sm inline-flex items-center gap-1"><IconMail size={13} /> Correos ({accessMails.length})</b>
              {accessMails.map((g) => (
                <div key={g.accountId} className="text-sm text-muted">
                  <b className="text-ink">{g.nombre || g.accountId}</b> <span className="text-xs tabular-nums break-all">{g.direccion || ""}</span>
                  <span className="text-xs inline-flex items-center gap-1"> · {g.canSend ? <><IconMail size={11} /> Envía</> : ""}{g.canSend && g.canRead ? " + " : ""}{g.canRead ? <><IconEye size={11} /> Recibe</> : ""} · {g.area || ""}</span>
                </div>
              ))}
              {!accessMails.length && <span className="text-sm text-muted">Sin correos.</span>}
            </div>
            <div className="card p-3 grid gap-1">
              <b className="text-sm inline-flex items-center gap-1"><IconFolder size={13} /> Carpetas ({accessShares.length})</b>
              {accessShares.map((g) => (
                <div key={g.shareId} className="text-sm text-muted" title={g.ruta || ""}>
                  <b className="text-ink">{g.nombre || g.shareId}</b> <span className="text-xs tabular-nums break-all">{g.ruta || ""}</span>
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

const CATS: { id: Cat; icon: (p: { size?: number }) => React.ReactNode; label: string }[] = [
  { id: "equipos", icon: (p) => <IconMonitor size={18} {...p} />, label: "Equipos" },
  { id: "personas", icon: (p) => <IconUser size={18} {...p} />, label: "Personas" },
  { id: "areas", icon: (p) => <IconBuilding size={18} {...p} />, label: "Áreas" },
  { id: "correos", icon: (p) => <IconMail size={18} {...p} />, label: "Correos" },
  { id: "carpetas", icon: (p) => <IconFolder size={18} {...p} />, label: "Carpetas" },
];

/* Tarjeta móvil de equipo: 1ª línea icono+nombre+inventario, 2ª ubicación/usuario, 3ª serie, acción */
function AssetCard({ a, byId, onOpen }: { a: Asset; byId: Map<number, any>; onOpen: () => void }) {
  const hasUser = (a._userName && a._userName !== "—") || a._userId != null;
  return (
    <article className="card asset-card" aria-label={`${a._type} ${disp(a.name)}`}>
      <button onClick={onOpen} className="grid gap-1.5 text-left min-w-0 rounded-lg focus-visible:outline-2" aria-label={`Ver detalle de ${a._type} ${disp(a.name)}, inventario ${disp(a.otherserial)}`}>
        <span className="flex items-start gap-2 min-w-0">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas border border-line" aria-hidden="true">
            <TypeIcon type={a._type} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2 min-w-0">
              <b className="text-ink truncate text-[0.95rem]">{disp(a.name)}</b>
              <span className="tabular-nums text-[0.8rem] font-bold text-ink shrink-0">#{disp(a.otherserial)}</span>
            </span>
            <span className="block text-xs text-muted truncate">{a._type}{a._model ? ` · ${disp(a._model)}` : ""}</span>
          </span>
        </span>
        <span className="min-w-0 pl-11">
          <CompactLocation locId={a._locationId} fallback={a._locationName} byId={byId} />
        </span>
        <span className="flex items-center gap-2 pl-11 min-w-0">
          {hasUser
            ? <span className="badge badge-success max-w-full truncate" title={String(a._userName && a._userName !== "—" ? a._userName : `Usuario #${a._userId}`)}>{String(a._userName && a._userName !== "—" ? a._userName : `Usuario #${a._userId}`)}</span>
            : <span className="badge">Sin asignar</span>}
          <span className="text-xs text-muted tabular-nums truncate">S. {disp(a.serial)}</span>
          <span className="ml-auto text-sm font-semibold shrink-0" style={{ color: "var(--accent)" }} aria-hidden="true">Detalle ›</span>
        </span>
      </button>
    </article>
  );
}

function PersonCard({ p, onOpen }: { p: Person; onOpen: () => void }) {
  return (
    <article className="card asset-card">
      <button onClick={onOpen} className="flex items-center gap-3 text-left min-w-0" aria-label={`Ver detalle de ${p.display}`}>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas border border-line" aria-hidden="true"><IconUser size={16} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-ink truncate">{p.display}</b>
          <span className="block text-xs text-muted truncate">GLPI #{p.id}{p.login ? ` · ${p.login}` : ""}</span>
        </span>
        <span className="text-sm font-semibold shrink-0" style={{ color: "var(--accent)" }} aria-hidden="true">›</span>
      </button>
    </article>
  );
}

function GenericCard({ title, lines, onOpen, label }: { title: string; lines: string[]; onOpen: () => void; label: string }) {
  return (
    <article className="card asset-card">
      <button onClick={onOpen} className="grid gap-1 text-left min-w-0" aria-label={label}>
        <b className="text-ink break-words leading-snug">{title}</b>
        {lines.filter(Boolean).map((l, i) => (
          <span key={i} className="block text-xs text-muted break-words leading-snug">{l}</span>
        ))}
        <span className="text-sm font-semibold" style={{ color: "var(--accent)" }} aria-hidden="true">Detalle ›</span>
      </button>
    </article>
  );
}

export default function Buscar() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [canOperate, setCanOperate] = useState(false);
  const [canSeeAccess, setCanSeeAccess] = useState(false);
  const canSee = canOperate || canSeeAccess;
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
  const scrollRestore = useRef(0);
  const dirtyRef = useRef(false);
  const personDirtyRef = useRef(false);

  // detalle en panel lateral + retorno de navegación equipo↔persona
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [detailPerson, setDetailPerson] = useState<null | PersonDetail>(null);
  const [detailMail, setDetailMail] = useState<null | { mail: any; personas: any[] }>(null);
  const [detailShare, setDetailShare] = useState<null | { share: any; personas: any[] }>(null);
  const [detailArea, setDetailArea] = useState<null | { area: any; mails: any[]; shares: any[] }>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  function openDetail(saveScroll = true) {
    if (saveScroll) scrollRestore.current = window.scrollY;
  }
  function closeDetail(restore = true) {
    setDetailAsset(null);
    setDetailPerson(null);
    setDetailMail(null);
    setDetailShare(null);
    setDetailArea(null);
    setReturnTarget(null);
    dirtyRef.current = false;
    personDirtyRef.current = false;
    if (restore) requestAnimationFrame(() => window.scrollTo({ top: scrollRestore.current }));
  }
  function closeAsset() {
    if (dirtyRef.current && !confirm("Hay cambios sin guardar. ¿Cerrar sin guardar?")) return;
    const rt = returnTarget;
    setReturnTarget(null);
    dirtyRef.current = false;
    if (rt?.kind === "person") {
      setDetailAsset(null);
      setDetailPerson(rt.detail);
    } else {
      closeDetail(true);
    }
  }
  function closePerson() {
    if (personDirtyRef.current && !confirm("Hay cambios sin guardar. ¿Cerrar sin guardar?")) return;
    const rt = returnTarget;
    setReturnTarget(null);
    personDirtyRef.current = false;
    if (rt?.kind === "asset") {
      setDetailPerson(null);
      setDetailAsset(rt.asset);
    } else {
      closeDetail(true);
    }
  }

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
          setCanSeeAccess(j.access ? j.access !== "none" : !!j.canOperate);
        } else {
          setAuthUser(null);
          setCanOperate(false);
          setCanSeeAccess(false);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    syncAuth();
    window.addEventListener("auth-changed", syncAuth);
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

  async function search(v?: string) {
    const query = (v ?? q).trim();
    if (!query) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    setMsg("Buscando en equipos, personas, áreas, correos y carpetas…");
    setSearched(true);
    closeDetail(false);
    try {
      history.replaceState(null, "", `/buscar?q=${encodeURIComponent(query)}`);
    } catch {}
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal });
      const j = await r.json();
      if (!r.ok) { setMsg("Error: " + (j.error || r.status)); setResults(null); return; }
      setResults(j.results);
      setCanOperate(!!j.canOperate);
      setCanSeeAccess(!!(j.canSeeAccess ?? j.canOperate));
      const totals = [j.results.equipos.total, j.results.personas.total, j.results.areas.total, j.results.correos.total, j.results.carpetas.total];
      const sum = totals.reduce((a: number, b: number) => a + b, 0);
      const cats = totals.filter((t: number) => t > 0).length;
      setMsg(sum ? `${sum} resultado(s) en ${cats} categoría(s).` : "Sin resultados en ninguna categoría. Probá con/sin ceros, por serie, nombre o sigla de área (ej. CTIC).");
      // Auto-expandir primera categoría con resultados (conserva contexto, evita acordeones vacíos)
      const order: Cat[] = ["equipos", "personas", "areas", "correos", "carpetas"];
      const first = order.find((c) => (j.results[c]?.total || 0) > 0);
      setOpen(first ? new Set([first]) : new Set());
    } catch (e: any) {
      if (String(e.name) === "AbortError") return;
      setMsg("Error: " + (e.message || "red"));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const toggle = (c: Cat) => setOpen((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  async function openPersonDetail(p: Person, saveScroll = true) {
    if (saveScroll) openDetail(true);
    setDetailPerson({ p, groups: [], unlocated: [], mails: [], shares: [] });
    try {
      const [ra, rg] = await Promise.all([
        fetch(`/api/glpi/user-assets?user_id=${p.id}`).then((r) => r.json()),
        canOperate || canSeeAccess || authUser?.canOperate
          ? fetch(`/api/access/grants?user_id=${p.id}`).then((r) => (r.ok ? r.json() : { mails: [], shares: [] })).catch(() => ({ mails: [], shares: [] }))
          : Promise.resolve({ mails: [], shares: [] }),
      ]);
      setDetailPerson({ p, groups: ra.groups || [], unlocated: ra.unlocated || [], mails: rg.mails || [], shares: rg.shares || [] });
    } catch {}
  }

  async function openMailDetail(m: any) {
    openDetail(true);
    setDetailMail({ mail: m, personas: [] });
    if (!canSee) return;
    try {
      const r = await fetch(`/api/access/grants?accountId=${encodeURIComponent(m.id)}`);
      const j = await r.json();
      if (r.ok) setDetailMail({ mail: j.mail || m, personas: j.personas || [] });
    } catch {}
  }

  async function openShareDetail(s: any) {
    openDetail(true);
    setDetailShare({ share: s, personas: [] });
    if (!canSee) return;
    try {
      const r = await fetch(`/api/access/grants?shareId=${encodeURIComponent(s.id)}`);
      const j = await r.json();
      if (r.ok) setDetailShare({ share: j.share || s, personas: j.personas || [] });
    } catch {}
  }

  async function openAreaDetail(a: any) {
    openDetail(true);
    setDetailArea({ area: a, mails: [], shares: [] });
    if (!canSee) return;
    try {
      const r = await fetch(`/api/access/overview?area=${encodeURIComponent(a.id)}`);
      const j = await r.json();
      const found = (j.areas || []).find((x: any) => x.id === a.id);
      if (found) setDetailArea({ area: a, mails: found.mails || [], shares: found.shares || [] });
    } catch {}
  }

  function openAssetDetail(a: Asset, fromPerson?: PersonDetail) {
    if (fromPerson) {
      setReturnTarget({ kind: "person", detail: fromPerson });
      setDetailPerson(null);
    } else {
      openDetail(true);
    }
    dirtyRef.current = false;
    setDetailAsset(a);
  }

  // Desde el equipo: abrir la ficha de su usuario asignado (con retorno)
  async function openPersonFromAsset(userId: number): Promise<boolean> {
    if (!detailAsset) return false;
    try {
      const r = await fetch(`/api/glpi/users?id=${userId}`);
      const j = await r.json();
      const u = j.user;
      if (!r.ok || !u || u.id == null) return false;
      const p: Person = {
        id: Number(u.id),
        login: u.login ?? null,
        firstname: u.firstname ?? null,
        realname: u.realname ?? null,
        display: u.display || [u.firstname, u.realname].filter(Boolean).join(" ") || u.login || `Usuario ${u.id}`,
        email: u.email ?? null,
        phone: u.phone ?? null,
      };
      setReturnTarget({ kind: "asset", asset: detailAsset });
      setDetailAsset(null);
      dirtyRef.current = false;
      await openPersonDetail(p, false);
      return true;
    } catch {
      return false;
    }
  }

  async function quitarDelPuesto(g: PersonGroup) {
    const p = detailPerson?.p;
    if (!p) return;
    if (!confirm(`Quitar a ${p.display} de este puesto? Se quitará como usuario de ${g.items.length} equipo(s) (conservan el puesto).`)) return;
    for (const a of g.items) {
      await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: a._type, id: a.id, user_id: null }),
      });
    }
    openPersonDetail(p);
    search();
  }

  const lockedBox = (label: string) => (
    <div className="p-4 grid gap-2 text-center">
      <span className="inline-flex justify-center text-muted" aria-hidden="true"><IconLock size={28} /></span>
      <p className="text-sm text-muted">{label} requiere sesión con perfil operador. <button className="underline font-semibold" onClick={() => setAuthOpen(true)}>Iniciar sesión</button></p>
    </div>
  );

  const totals = results ? [results.equipos.total, results.personas.total, results.areas.total, results.correos.total, results.carpetas.total] : [];
  const sumTotals = totals.reduce((a: number, b: number) => a + (b || 0), 0);

  return (
    <div className="grid gap-3 no-hscroll">
      <div className="page-header">
        <h1>Búsqueda</h1>
        <p>Buscador único: equipos, personas, áreas, correos y carpetas.</p>
      </div>

      <div className="card p-3 grid gap-2">
        <form
          className="searchbar"
          role="search"
          aria-label="Búsqueda unificada"
          onSubmit={(e) => { e.preventDefault(); search(); }}
        >
          <input
            className="input w-full min-w-0"
            placeholder="Inventario, serie, nombre, persona, área, correo, carpeta…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Búsqueda genérica"
            autoComplete="off"
            enterKeyHint="search"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1 sm:flex-none sm:min-w-[120px]" disabled={loading || !q.trim()}>
              {loading ? <span className="inline-flex items-center gap-2"><span className="spinner" aria-hidden="true" /> Buscando…</span> : "Buscar"}
            </button>
            <button type="button" onClick={() => setScan(!scan)} className="btn btn-secondary tap-target shrink-0" aria-label="Escanear código con cámara" aria-pressed={scan}>
              <IconCamera size={17} />
            </button>
          </div>
        </form>
        {scan && (
          <ScanModal
            title="Buscar (escaneo)"
            onClose={() => setScan(false)}
            onResult={(v) => { setQ(v); setScan(false); search(v); }}
          />
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-muted" role="status" aria-live="polite">{msg || "Ej. inventario, serie, CTIC."}</p>
          {searched && results && !loading && sumTotals > 0 && (
            <span className="badge badge-brand" aria-label={`${sumTotals} resultados en total`}>{sumTotals} en total</span>
          )}
        </div>
      </div>

      {loading && (
        <div className="card p-4"><Spinner label="Buscando en las 5 categorías…" /></div>
      )}

      {searched && results && !loading && (
        <div className="grid gap-2.5">
          {results.equipos.error && <div className="card p-3 text-sm toast-err border" role="alert">Equipos: {results.equipos.error}</div>}
          {results.personas.error && <div className="card p-3 text-sm toast-err border" role="alert">Personas: {results.personas.error}</div>}
          {CATS.map((c) => {
            const r: any = (results as any)[c.id];
            const isOpen = open.has(c.id);
            const count = r.locked ? 0 : r.total;
            const panelId = `panel-${c.id}`;
            return (
              <section key={c.id} className="card p-0 overflow-hidden" aria-label={`${c.label}`}>
                <h2 className="m-0">
                  <button
                    onClick={() => toggle(c.id)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="acc-trigger w-full flex items-center gap-2.5 px-3 sm:px-4 text-left transition"
                  >
                    <span aria-hidden="true" className="inline-flex text-muted shrink-0"><c.icon /></span>
                    <b className="text-ink text-[0.95rem]">{c.label}</b>
                    <span className={`badge shrink-0 ${count > 0 ? "badge-brand" : ""}`} aria-label={`${count} encontrados`}>
                      {r.locked ? <IconLock size={12} /> : `${count}`}
                    </span>
                    {r.error && !r.locked && <span className="text-xs text-danger truncate">· error parcial</span>}
                    <span className="ml-auto text-muted text-base w-6 text-center shrink-0" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                  </button>
                </h2>
                {isOpen && (
                  <div id={panelId} role="region" aria-label={`${c.label} resultados`} className="border-t border-line p-2.5 sm:p-3 grid gap-2">
                    {r.locked && lockedBox(c.label)}
                    {!r.locked && count === 0 && <EmptyState title={`Sin ${c.label.toLowerCase()}`} hint={r.error || "Sin coincidencias para esta búsqueda."} />}
                    {!r.locked && c.id === "equipos" && (r.items as any[]).length > 0 && (
                      <>
                        {/* Desktop: tabla compacta */}
                        <div className="table-scroll hidden md:block" tabIndex={0} aria-label="Resultados de equipos en tabla">
                          <table className="table-dense min-w-[760px]">
                            <thead><tr><th scope="col">Tipo</th><th scope="col">Nombre</th><th scope="col">Inventario</th><th scope="col">Ubicación / Usuario</th><th scope="col"><span className="sr-only">Detalle</span></th></tr></thead>
                            <tbody>
                              {(r.items as any[]).map((a) => (
                                <tr key={`${a._type}-${a.id}`}>
                                  <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><TypeIcon type={a._type} /><b>{a._type}</b></span></td>
                                  <td className="max-w-[220px]"><span className="block truncate font-medium" title={disp(a.name)}>{disp(a.name)}</span><span className="text-xs text-muted tabular-nums">S. {disp(a.serial)}</span></td>
                                  <td className="tabular-nums font-semibold">{disp(a.otherserial)}</td>
                                  <td className="max-w-[240px] min-w-0"><CompactLocation locId={a._locationId} fallback={a._locationName} byId={byId} />{(a._userName && a._userName !== "—") || a._userId != null ? <span className="badge badge-success mt-1 w-fit max-w-full truncate" title={a._userName && a._userName !== "—" ? String(a._userName) : `Usuario #${a._userId}`}><span className="inline-flex items-center gap-1 truncate"><IconUser size={11} /> {a._userName && a._userName !== "—" ? String(a._userName) : `Usuario #${a._userId}`}</span></span> : <span className="badge mt-1 w-fit">Sin asignar</span>}</td>
                                  <td><button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openAssetDetail(a)}>Ver detalle</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Móvil/tablet: tarjetas */}
                        <div className="grid gap-2 md:hidden">
                          {(r.items as any[]).map((a) => (
                            <AssetCard key={`${a._type}-${a.id}`} a={a} byId={byId} onOpen={() => openAssetDetail(a)} />
                          ))}
                        </div>
                      </>
                    )}
                    {!r.locked && c.id === "personas" && (r.items as Person[]).length > 0 && (
                      <div className="grid gap-2">
                        {(r.items as Person[]).map((p) => (
                          <div key={p.id} className="hidden md:flex card p-3 items-center justify-between gap-3 flex-wrap text-sm border-line">
                            <div className="min-w-0"><div className="font-bold text-ink truncate">{p.display}</div><div className="text-muted text-xs">GLPI #{p.id}{p.login ? ` · ${p.login}` : ""}</div></div>
                            <button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openPersonDetail(p)}>Ver detalle</button>
                          </div>
                        ))}
                        <div className="grid gap-2 md:hidden">
                          {(r.items as Person[]).map((p) => (
                            <PersonCard key={p.id} p={p} onOpen={() => openPersonDetail(p)} />
                          ))}
                        </div>
                      </div>
                    )}
                    {!r.locked && c.id === "areas" && (r.items as any[]).length > 0 && (
                      <>
                        <div className="table-scroll hidden md:block" tabIndex={0} aria-label="Resultados de áreas en tabla">
                          <table className="table-dense">
                            <thead><tr><th scope="col">Área</th><th scope="col">Responsable</th><th scope="col">Correos</th><th scope="col">Carpetas</th><th scope="col"><span className="sr-only">Abrir</span></th></tr></thead>
                            <tbody>
                              {(r.items as any[]).map((a) => (
                                <tr key={a.id}>
                                  <td className="min-w-0"><b className="block truncate">{a.nombre}</b></td>
                                  <td className="text-sm">{a.responsableNombre || "—"} <span className="text-xs text-muted">#{a.responsableUserId}</span></td>
                                  <td className="tabular-nums">{a.mails}</td>
                                  <td className="tabular-nums">{a.shares}</td>
                                  <td><button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openAreaDetail(a)}>Ver detalle</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="grid gap-2 md:hidden">
                          {(r.items as any[]).map((a) => (
                            <GenericCard key={a.id} title={a.nombre} lines={[`Resp. ${a.responsableNombre || "—"}`, `${a.mails} correos · ${a.shares} carpetas`]} label={`Ver detalle del área ${a.nombre}`} onOpen={() => openAreaDetail(a)} />
                          ))}
                        </div>
                      </>
                    )}
                    {!r.locked && c.id === "correos" && (r.items as any[]).length > 0 && (
                      <>
                        <div className="table-scroll hidden md:block" tabIndex={0} aria-label="Resultados de correos en tabla">
                          <table className="table-dense">
                            <thead><tr><th scope="col">Nombre</th><th scope="col">Dirección</th><th scope="col">Área</th><th scope="col">Personas</th><th scope="col"><span className="sr-only">Abrir</span></th></tr></thead>
                            <tbody>
                              {(r.items as any[]).map((m) => (
                                <tr key={m.id}>
                                  <td className="min-w-0"><b className="block truncate">{m.nombre}</b></td>
                                  <td className="tabular-nums text-sm">{m.direccion}</td>
                                  <td className="text-sm">{m.area}</td>
                                  <td className="tabular-nums text-xs">{m.personas} <span className="text-muted">({m.envian} env./{m.reciben} rec.)</span></td>
                                  <td><button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openMailDetail(m)}>Ver detalle</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="grid gap-2 md:hidden">
                          {(r.items as any[]).map((m) => (
                            <GenericCard key={m.id} title={m.nombre} lines={[m.direccion, `${m.area} · ${m.personas} pers. (${m.envian} env./${m.reciben} rec.)`]} label={`Ver detalle del correo ${m.nombre}`} onOpen={() => openMailDetail(m)} />
                          ))}
                        </div>
                      </>
                    )}
                    {!r.locked && c.id === "carpetas" && (r.items as any[]).length > 0 && (
                      <>
                        <div className="table-scroll hidden md:block" tabIndex={0} aria-label="Resultados de carpetas en tabla">
                          <table className="table-dense">
                            <thead><tr><th scope="col">Nombre</th><th scope="col">Ruta</th><th scope="col">Área</th><th scope="col">Personas</th><th scope="col"><span className="sr-only">Abrir</span></th></tr></thead>
                            <tbody>
                              {(r.items as any[]).map((s) => (
                                <tr key={s.id}>
                                  <td className="min-w-0"><b className="block truncate">{s.nombre}</b></td>
                                  <td className="tabular-nums text-sm max-w-[280px]"><span className="block truncate" title={s.ruta}>{s.ruta}</span></td>
                                  <td className="text-sm">{s.area}</td>
                                  <td className="tabular-nums">{s.personas}</td>
                                  <td><button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openShareDetail(s)}>Ver detalle</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="grid gap-2 md:hidden">
                          {(r.items as any[]).map((s) => (
                            <GenericCard key={s.id} title={s.nombre} lines={[s.ruta, `${s.area} · ${s.personas} pers.`]} label={`Ver detalle de la carpeta ${s.nombre}`} onOpen={() => openShareDetail(s)} />
                          ))}
                        </div>
                      </>
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
        <SidePanel
          title={`${detailAsset._type} · ${disp(detailAsset.name)}`}
          onClose={closeAsset}
          footer={
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary text-sm tap-target" onClick={closeAsset}>
                {returnTarget?.kind === "person" ? "← Volver a la persona" : "Volver a resultados"}
              </button>
            </div>
          }
        >
          <AssetEditModal
            key={`${detailAsset._type}-${detailAsset.id}`}
            asset={detailAsset}
            byId={byId}
            childrenOf={childrenOf}
            canEdit={!!authUser?.canOperate}
            onSaved={() => { search(); }}
            onDirtyChange={(d) => { dirtyRef.current = d; }}
            onOpenUser={openPersonFromAsset}
          />
        </SidePanel>
      )}

      {detailPerson && (
        <SidePanel
          title={`Persona: ${detailPerson.p.display}`}
          subtitle={`GLPI #${detailPerson.p.id}${detailPerson.p.login ? ` · ${detailPerson.p.login}` : ""}`}
          onClose={closePerson}
          footer={<div className="flex gap-2 justify-end"><button className="btn btn-secondary text-sm tap-target" onClick={closePerson}>{returnTarget?.kind === "asset" ? "← Volver al equipo" : "Volver a resultados"}</button></div>}
        >
          <FichaPersona
            p={detailPerson.p}
            groups={detailPerson.groups}
            unlocated={detailPerson.unlocated}
            byId={byId}
            onQuitar={(g) => quitarDelPuesto(g)}
            onRefresh={() => openPersonDetail(detailPerson.p)}
            onOpenAsset={(a) => openAssetDetail(a, detailPerson)}
            accessMails={detailPerson.mails}
            accessShares={detailPerson.shares}
            canSeeAccess={canSee}
            canEdit={!!authUser?.canOperate}
            onDirtyChange={(d) => { personDirtyRef.current = d; }}
          />
        </SidePanel>
      )}

      {detailMail && (
        <SidePanel
          title={`Correo: ${detailMail.mail.nombre || detailMail.mail.direccion}`}
          subtitle={`${detailMail.mail.direccion || ""} · Área ${detailMail.mail.area || "—"}`}
          onClose={() => closeDetail(true)}
          footer={<div className="flex gap-2 justify-end flex-wrap"><a className="btn btn-secondary text-xs tap-target" href="/accesos">Gestionar en Accesos</a><button className="btn btn-secondary text-xs tap-target" disabled={exporting === `mail:${detailMail.mail.id}`} onClick={() => downloadExport("mail", detailMail.mail.id)}>{exporting === `mail:${detailMail.mail.id}` ? "Exportando…" : <span className="inline-flex items-center gap-1"><IconDownload size={13} /> Excel</span>}</button><button className="btn btn-secondary text-xs tap-target" onClick={() => closeDetail(true)}>Volver</button></div>}
        >
          <div className="grid gap-2 text-sm">
            {!canSee && <p className="text-sm text-muted inline-flex items-start gap-1"><span className="inline-flex mt-0.5"><IconLock size={12} /></span><span>Iniciá sesión con perfil operador o de lectura para ver las personas.</span></p>}
            {canSee && !detailMail.personas.length && <p className="text-sm text-muted">Nadie tiene acceso aún. Gestionar en <a className="underline" href="/accesos">Accesos →</a></p>}
            {canSee && detailMail.personas.length > 0 && (
              <div className="table-scroll" tabIndex={0}>
                <table className="table-dense table-modal-fluid">
                  <thead><tr><th scope="col">Persona</th><th scope="col">Envía</th><th scope="col">Recibe</th></tr></thead>
                  <tbody>
                    {detailMail.personas.map((g: any) => (
                      <tr key={g.userId}>
                        <td className="min-w-0"><span className="block truncate" title={g.userDisplay || `#${g.userId}`}>{g.userDisplay || `#${g.userId}`} <span className="text-xs text-muted">#{g.userId}</span></span></td>
                        <td className="text-center text-muted">{g.canSend ? <IconMail size={14} /> : "—"}</td>
                        <td className="text-center text-muted">{g.canRead ? <IconEye size={14} /> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SidePanel>
      )}

      {detailShare && (
        <SidePanel
          title={`Carpeta: ${detailShare.share.nombre}`}
          subtitle={`${detailShare.share.ruta || ""} · Área ${detailShare.share.area || "—"}`}
          onClose={() => closeDetail(true)}
          footer={<div className="flex gap-2 justify-end flex-wrap"><a className="btn btn-secondary text-xs tap-target" href="/accesos">Gestionar en Accesos</a><button className="btn btn-secondary text-xs tap-target" disabled={exporting === `share:${detailShare.share.id}`} onClick={() => downloadExport("share", detailShare.share.id)}>{exporting === `share:${detailShare.share.id}` ? "Exportando…" : <span className="inline-flex items-center gap-1"><IconDownload size={13} /> Excel</span>}</button><button className="btn btn-secondary text-xs tap-target" onClick={() => closeDetail(true)}>Volver</button></div>}
        >
          <div className="grid gap-2 text-sm">
            {!canSee && <p className="text-sm text-muted inline-flex items-start gap-1"><span className="inline-flex mt-0.5"><IconLock size={12} /></span><span>Iniciá sesión con perfil operador o de lectura para ver las personas.</span></p>}
            {canSee && !detailShare.personas.length && <p className="text-sm text-muted">Nadie tiene acceso aún. Gestionar en <a className="underline" href="/accesos">Accesos →</a></p>}
            {canSee && detailShare.personas.length > 0 && (
              <div className="table-scroll" tabIndex={0}>
                <table className="table-dense table-modal-fluid">
                  <thead><tr><th scope="col">Persona</th></tr></thead>
                  <tbody>
                    {detailShare.personas.map((g: any) => (
                      <tr key={g.userId}>
                        <td className="min-w-0"><span className="block truncate" title={g.userDisplay || `#${g.userId}`}>{g.userDisplay || `#${g.userId}`} <span className="text-xs text-muted">#{g.userId}</span></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SidePanel>
      )}

      {detailArea && (
        <SidePanel
          title={`Área: ${detailArea.area.nombre}`}
          subtitle={`Responsable: ${detailArea.area.responsableNombre || "—"} #${detailArea.area.responsableUserId}`}
          onClose={() => closeDetail(true)}
          footer={<div className="flex gap-2 justify-end flex-wrap"><a className="btn btn-secondary text-xs tap-target" href="/accesos">Gestionar en Accesos</a>{canSee && <button className="btn btn-secondary text-xs tap-target" disabled={exporting === `area:${detailArea.area.id}`} onClick={() => downloadExport("area", detailArea.area.id)}>{exporting === `area:${detailArea.area.id}` ? "Exportando…" : <span className="inline-flex items-center gap-1"><IconDownload size={13} /> Excel</span>}</button>}<button className="btn btn-secondary text-xs tap-target" onClick={() => closeDetail(true)}>Volver</button></div>}
        >
          <div className="grid gap-2 text-sm">
            <b className="text-sm inline-flex items-center gap-1"><IconMail size={13} /> Correos ({detailArea.mails.length})</b>
            {detailArea.mails.map((m: any) => <div key={m.id} className="text-sm text-muted"><b className="text-ink">{m.nombre}</b> <span className="tabular-nums text-xs break-all">{m.direccion}</span> <span className="text-xs">· {m.personas} persona(s)</span></div>)}
            {!detailArea.mails.length && <p className="text-sm text-muted">Sin correos.</p>}
            <b className="text-sm inline-flex items-center gap-1"><IconFolder size={13} /> Carpetas ({detailArea.shares.length})</b>
            {detailArea.shares.map((s: any) => <div key={s.id} className="text-sm text-muted" title={s.ruta}><b className="text-ink">{s.nombre}</b> <span className="tabular-nums text-xs break-all">{s.ruta}</span> <span className="text-xs">· {s.personas} persona(s)</span></div>)}
            {!detailArea.shares.length && <p className="text-sm text-muted">Sin carpetas.</p>}
          </div>
        </SidePanel>
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
