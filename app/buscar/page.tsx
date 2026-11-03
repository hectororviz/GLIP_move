"use client";
import { useEffect, useRef, useState } from "react";
import ScanModal from "@/components/ScanModal";
import AuthModal from "@/components/AuthModal";
import { useLocations } from "@/components/Places";
import { inventoryVariants, parseGlpiUrl } from "@/lib/inventory";
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

function FichaPersona({ p, groups, unlocated, byId, onQuitar, onRefresh }: {
  p: Person;
  groups: PersonGroup[];
  unlocated: Asset[];
  byId: Map<number, any>;
  onQuitar: (group: PersonGroup) => void;
  onRefresh: () => void;
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
      let found: Asset | undefined;
      const parsed = parseGlpiUrl(inv);
      if (parsed) {
        const r = await fetch(`/api/glpi?type=${encodeURIComponent(parsed.type)}&id=${parsed.id}`);
        const j = await r.json();
        found = r.ok ? j.item : undefined;
      } else {
        const s = await fetch(`/api/glpi?q=${encodeURIComponent(inv.trim())}&type=all`).then((r) => r.json());
        const list: Asset[] = s.items || [];
        const variants = new Set(inventoryVariants(inv).map((v) => v.toUpperCase()));
        found = list.find((it) => variants.has(String(it.otherserial || "").trim().toUpperCase())) || list[0];
      }
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
    <div className="card p-4 grid gap-3 text-sm">
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
    </div>
  );
}

export default function Buscar() {
  const [mode, setMode] = useState<"assets" | "people">("assets");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [items, setItems] = useState<Asset[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selPerson, setSelPerson] = useState<Person | null>(null);
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const [unlocated, setUnlocated] = useState<Asset[]>([]);
  const [msg, setMsg] = useState("");
  const [scan, setScan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const { byId, childrenOf } = useLocations();
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const openEdit = (a: Asset) => {
    if (!authUser?.canOperate) {
      pendingAction.current = () => setEditAsset(a);
      setAuthOpen(true);
      return;
    }
    setEditAsset(a);
  };
  const [sortKey, setSortKey] = useState<"type" | "name" | "otherserial" | "location">("type");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const locLabel = (a: Asset) => formatLocationDisplay(a._locationId, byId as any, a._locationName != null ? String(a._locationName) : null).primary;
  const sortedItems = [...items].sort((a, b) => {
    const va = sortKey === "type" ? String(a._type || "") : sortKey === "name" ? String(a.name || "") : sortKey === "otherserial" ? String(a.otherserial || "") : locLabel(a);
    const vb = sortKey === "type" ? String(b._type || "") : sortKey === "name" ? String(b.name || "") : sortKey === "otherserial" ? String(b.otherserial || "") : locLabel(b);
    return va.localeCompare(vb, undefined, { numeric: true }) * sortDir;
  });
  const toggleSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };

  useEffect(() => {
    const syncAuth = () => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((j) => { if (j.authenticated) setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate }); else setAuthUser(null); })
        .catch(() => {});
    };
    syncAuth();
    window.addEventListener("auth-changed", syncAuth);
    return () => window.removeEventListener("auth-changed", syncAuth);
  }, []);

  const requireEdit = (action: () => void) => {
    if (authUser?.canOperate) { action(); return; }
    pendingAction.current = action;
    setAuthOpen(true);
  };

  async function search(v?: string) {
    const query = (v ?? q).trim();
    if (!query) return;
    setLoading(true);
    setMsg("Buscando...");
    setSelPerson(null);
    if (mode === "assets") {
      const parsed = parseGlpiUrl(query);
      if (parsed) {
        const r = await fetch(`/api/glpi?type=${encodeURIComponent(parsed.type)}&id=${parsed.id}`);
        const j = await r.json();
        setLoading(false);
        if (!r.ok || !j.item) { setMsg("No existe ese bien en GLPI"); setItems([]); return; }
        setItems([j.item]);
        setMsg("1 resultado(s)");
        return;
      }
      const r = await fetch(`/api/glpi?q=${encodeURIComponent(query)}&type=${type}`);
      const j = await r.json();
      setLoading(false);
      if (!r.ok) { setMsg("Error: " + j.error); setItems([]); return; }
      setItems(j.items || []);
      setMsg(j.items?.length ? `${j.items.length} resultado(s)` : "Sin resultados. Probá con/sin ceros (0000012865 vs 12865).");
    } else {
      const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(query)}`);
      const j = await r.json();
      setLoading(false);
      if (!r.ok) { setMsg("Error: " + j.error); setPeople([]); return; }
      setPeople(j.users || []);
      setMsg(j.users?.length ? `${j.users.length} persona(s)` : "Sin personas. Probá por nombre, apellido o usuario GLPI.");
    }
  }

  async function openPerson(p: Person) {
    setSelPerson(p);
    setMsg("Cargando puesto y equipos...");
    const r = await fetch(`/api/glpi/user-assets?user_id=${p.id}`);
    const j = await r.json();
    if (!r.ok) { setMsg("Error: " + j.error); setGroups([]); setUnlocated([]); return; }
    setGroups(j.groups || []);
    setUnlocated(j.unlocated || []);
    setMsg(j.groups?.length ? "" : "Persona sin puesto asignado.");
  }

  async function quitarDelPuesto(g: PersonGroup) {
    if (!selPerson) return;
    if (!confirm(`Quitar a ${selPerson.display} de este puesto? Se quitará como usuario de ${g.items.length} equipo(s).`)) return;
    setMsg("Quitando usuario...");
    for (const a of g.items) {
      await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: a._type, id: a.id, location_id: a._locationId, user_id: null }),
      });
    }
    openPerson(selPerson);
  }

  return (
    <div className="grid gap-4">
      <div className="page-header">
        <h1>Búsqueda</h1>
        <p>Busca equipos por inventario/serie/nombre o personas por nombre/apellido/usuario GLPI.</p>
      </div>

      <div className="card p-3 grid gap-2">
        <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Qué buscar">
          {(["assets", "people"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setType("all"); setMsg(""); setItems([]); setPeople([]); setSelPerson(null); }}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                mode === m ? "text-white border-transparent" : "bg-white text-muted border-line hover:text-ink"
              }`}
              style={mode === m ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
            >
              {m === "assets" ? "Equipos" : "Personas"}
            </button>
          ))}
        </div>

        {mode === "assets" && (
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtrar por tipo">
            {["all", "Computer", "Monitor", "Phone", "Printer", "Peripheral"].map((t) => (
              <button
                key={t}
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  type === t ? "text-white border-transparent" : "bg-white text-muted border-line hover:text-ink"
                }`}
                style={type === t ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
              >
                {t === "all" ? "Todos" : t}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder={mode === "assets" ? "N° inventario, serie o nombre…" : "Nombre, apellido o usuario GLPI…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button onClick={() => search()} className="btn btn-primary" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
          {mode === "assets" && (
            <button onClick={() => setScan(!scan)} className="btn btn-secondary">📷</button>
          )}
        </div>
        {mode === "assets" && scan && (
          <ScanModal
            title="Buscar equipo (escaneo)"
            onClose={() => setScan(false)}
            onResult={(v) => { setQ(v); setScan(false); search(v); }}
          />
        )}
        <p className="text-sm text-muted">{msg}</p>
      </div>

      {mode === "assets" && (
        <div className="grid gap-3">
          {sortedItems.length > 0 && (
            <p className="text-xs text-muted" role="status">{sortedItems.length} resultado(s){msg.startsWith("Error") ? ` · ${msg}` : ""}</p>
          )}
          {sortedItems.length > 0 && (
            <div className="card overflow-x-auto p-0">
              <table className="table-dense min-w-[760px]">
                <thead>
                  <tr>
                    {(["type", "name", "otherserial", "location"] as const).map((k) => (
                      <th key={k} aria-sort={sortKey === k ? (sortDir === 1 ? "ascending" : "descending") : "none"}>
                        <button onClick={() => toggleSort(k)} className="font-bold uppercase text-[11px] tracking-wide">
                          {k === "type" ? "Tipo" : k === "name" ? "Nombre" : k === "otherserial" ? "Inventario" : "Ubicación / Usuario"}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                        </button>
                      </th>
                    ))}
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((a) => (
                    <tr key={`${a._type}-${a.id}`}>
                      <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><TypeIcon type={a._type} /><b>{a._type}</b><span className="text-muted text-xs hidden xl:inline">{disp(a._model)}</span></span></td>
                      <td className="max-w-[220px]"><span className="block truncate font-medium" title={disp(a.name)}>{disp(a.name)}</span><span className="text-xs text-muted tabular-nums">S. {disp(a.serial)}</span></td>
                      <td className="tabular-nums font-semibold">{disp(a.otherserial)}</td>
                      <td className="max-w-[240px] min-w-0"><CompactLocation locId={a._locationId} fallback={a._locationName} byId={byId} /><span className="text-xs text-muted block truncate" title={disp(a._userName)}>👤 {disp(a._userName)}</span></td>
                      <td>
                        <span className="inline-flex gap-1 flex-wrap">
                          {a._locationId != null && <a className="btn btn-secondary text-xs !min-h-[30px] !py-1" href={`/mapa?focus=${a._locationId}`}>Ver mapa</a>}
                          <button className="btn btn-secondary text-xs !min-h-[30px] !py-1" onClick={() => openEdit(a)} aria-label={`Editar ${a._type} ${disp(a.otherserial)}`}>Editar</button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {loading && <Spinner label="Buscando en GLPI…" />}
          {!items.length && !msg && <EmptyState title="Sin resultados aún" hint="Buscá por inventario, serie o nombre." />}
          {!items.length && !!msg && !msg.startsWith("Error") && !loading && <EmptyState title={msg} hint="Probá con/sin ceros o por serie." />}
          {!!msg && msg.startsWith("Error") && <div className="card p-4 text-sm toast-err border" role="alert">{msg}. No es lo mismo que “sin resultados”: revisá GLPI.</div>}
        </div>
      )}

      {mode === "people" && !selPerson && (
        <div className="grid gap-3">
          {people.map((p) => (
            <div key={p.id} className="card p-4 flex items-center justify-between gap-3 flex-wrap text-sm">
              <div>
                <div className="font-bold text-ink">{p.display}</div>
                <div className="text-muted text-xs">GLPI #{p.id}{p.login ? ` · ${p.login}` : ""}</div>
              </div>
              <button className="btn btn-secondary text-xs" onClick={() => openPerson(p)}>Ver puesto y equipos →</button>
            </div>
          ))}
          {!people.length && !msg && <div className="empty-state card"><span>Sin personas aún. Realiza una búsqueda.</span></div>}
        </div>
      )}

      {mode === "people" && selPerson && (
        <div className="grid gap-3">
          <button className="text-sm text-muted underline w-fit" onClick={() => { setSelPerson(null); setGroups([]); setUnlocated([]); }}>← Volver a personas</button>
          <FichaPersona p={selPerson} groups={groups} unlocated={unlocated} byId={byId} onQuitar={(g) => requireEdit(() => quitarDelPuesto(g))} onRefresh={() => selPerson && openPerson(selPerson)} />
        </div>
      )}
      {editAsset && (
        <AssetEditModal
          key={`${editAsset._type}-${editAsset.id}`}
          asset={editAsset}
          byId={byId}
          childrenOf={childrenOf}
          canEdit={!!authUser?.canOperate}
          onClose={() => setEditAsset(null)}
          onSaved={() => { const a = editAsset; setEditAsset(null); search(); }}
        />
      )}
      {authOpen && (
        <AuthModal
          open={authOpen}
          onClose={() => { setAuthOpen(false); pendingAction.current = null; }}
          onSuccess={() => {
            fetch("/api/auth/me").then((r) => r.json()).then((j) => { if (j.authenticated) setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate }); }).catch(() => {});
            window.dispatchEvent(new Event("auth-changed"));
            const a = pendingAction.current; pendingAction.current = null;
            if (a) a();
          }}
        />
      )}
    </div>
  );
}
