"use client";
import { useEffect, useRef, useState } from "react";
import ScanModal from "@/components/ScanModal";
import AuthModal from "@/components/AuthModal";
import { useLocations } from "@/components/Places";
import { inventoryVariants, parseGlpiUrl } from "@/lib/inventory";

type Asset = any;
type Person = { id: number; login: string | null; firstname: string | null; realname: string | null; display: string; email: string | null; phone: string | null };
type PersonGroup = { location_id: number; items: Asset[] };
type AuthUser = { login: string; name: string; profiles: string[]; canOperate: boolean };
const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

function EditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function Ficha({ a, byId, canEdit, requireEdit, onChanged }: {
  a: Asset;
  byId: Map<number, any>;
  canEdit: boolean;
  requireEdit: (fn: () => void) => void;
  onChanged: () => void;
}) {
  const [showPerson, setShowPerson] = useState(false);
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<Person[]>([]);
  const [pmsg, setPmsg] = useState("");
  const [showLocEdit, setShowLocEdit] = useState(false);
  const [locPick, setLocPick] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const [resolvedUser, setResolvedUser] = useState<string | null>(null);

  const locName = a._locationName && a._locationName !== "—" ? String(a._locationName) : null;
  const hasLoc = a._locationId != null && locName;
  const hasUser = a._userId != null;

  // Si GLPI devolvió users_id expandido vacío pero hay _userId, resolver nombre real.
  useEffect(() => {
    let alive = true;
    setResolvedUser(null);
    if (a?._userId != null && (!a._userName || a._userName === "—")) {
      fetch(`/api/glpi/users?id=${a._userId}`)
        .then((r) => r.json())
        .then((j) => { if (alive && j?.user?.display) setResolvedUser(j.user.display); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [a?._userId, a?._userName]);

  const userDisplay = (a._userName && a._userName !== "—" ? String(a._userName) : resolvedUser)
    || (hasUser ? `Usuario #${a._userId}` : null);

  async function searchPerson() {
    if (!pq.trim()) return;
    setPmsg("Buscando personas...");
    const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(pq.trim())}`);
    const j = await r.json();
    if (!r.ok) { setPmsg("Error: " + j.error); setPresults([]); return; }
    setPresults(j.users || []);
    setPmsg(j.users?.length ? "" : "Sin personas.");
  }

  async function assignToUser(u: Person) {
    const curLoc = locName;
    if (!confirm(`Reasignar ${a._type} ${a.otherserial || a.name} a ${u.display}? ${curLoc ? `Saldrá del puesto ${curLoc}.` : "Quedará sin puesto."}`)) return;
    const r = await fetch("/api/glpi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: a._type, id: a.id, location_id: null, user_id: u.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPmsg("Error: " + (j.error || r.status)); return; }
    setShowPerson(false);
    setPq("");
    setPresults([]);
    setPmsg("");
    onChanged();
  }

  async function desasignarUsuario() {
    if (!hasUser) return;
    const label = userDisplay || `usuario #${a._userId}`;
    if (!confirm(`Quitar a ${label} como usuario de ${a._type} ${a.otherserial || a.name}? El equipo conservará su puesto.`)) return;
    setPmsg("Quitando usuario...");
    const r = await fetch("/api/glpi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: a._type, id: a.id, location_id: a._locationId, user_id: null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPmsg("Error: " + (j.error || r.status)); return; }
    setPmsg("");
    onChanged();
  }

  async function desasignarUbicacion() {
    if (a._locationId == null) return;
    if (!confirm(`Sacar ${a._type} ${a.otherserial || a.name} del puesto ${locName || a._locationId}? Conservará su usuario.`)) return;
    setLocMsg("Quitando del puesto...");
    const r = await fetch("/api/glpi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: a._type, id: a.id, location_id: null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setLocMsg("Error: " + (j.error || r.status)); return; }
    setLocMsg("");
    setShowLocEdit(false);
    onChanged();
  }

  async function reasignarUbicacion() {
    const newId = Number(locPick);
    if (!Number.isFinite(newId) || newId <= 0) { setLocMsg("Elegí un puesto válido."); return; }
    if (newId === a._locationId) { setLocMsg("Ya está en ese puesto."); return; }
    const destName = byId.get(newId)?.name || byId.get(newId)?.completename || `puesto ${newId}`;
    const owner = userDisplay ? ` Conservará su usuario (${userDisplay}).` : "";
    if (!confirm(`Mover ${a._type} ${a.otherserial || a.name} al puesto ${destName}?${owner}`)) return;
    setLocMsg("Moviendo...");
    const r = await fetch("/api/glpi", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: a._type, id: a.id, location_id: newId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setLocMsg("Error: " + (j.error || r.status)); return; }
    setLocMsg("");
    setShowLocEdit(false);
    onChanged();
  }

  const locOptions = [...byId.values()].sort((x, y) => String(x.completename || x.name || "").localeCompare(String(y.completename || y.name || "")));

  return (
    <div className="card p-4 grid gap-2 text-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="font-bold text-ink">{a._type} — {disp(a.name)}</div>
        <div className="flex gap-2 flex-wrap">
          {a._locationId ? (
            <a className="btn btn-secondary text-xs" href={`/mapa?focus=${a._locationId}`}>Ver en mapa →</a>
          ) : (
            <span className="badge">Sin ubicación</span>
          )}
          {canEdit && (
            <button className="btn btn-secondary text-xs" onClick={() => setShowPerson(!showPerson)}>Asignar a persona</button>
          )}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-muted">
        <div><b className="text-ink">Fabricante:</b> {disp(a._manufacturer)}</div>
        <div><b className="text-ink">Modelo:</b> {disp(a._model)}</div>
        <div><b className="text-ink">Inventario:</b> <span className="tabular-nums">{disp(a.otherserial)}</span></div>
        <div><b className="text-ink">Serie:</b> <span className="tabular-nums">{disp(a.serial)}</span></div>
      </div>

      <div className="grid gap-2 rounded-xl border border-line bg-canvas/60 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base" aria-hidden="true">📍</span>
            <b className="text-ink">Ubicación:</b>
            {hasLoc ? (
              <span className="badge badge-brand truncate max-w-[220px]" title={locName || undefined}>{locName}</span>
            ) : (
              <span className="badge badge-warning">Sin ubicación</span>
            )}
          </div>
          {canEdit ? (
            <div className="flex gap-1 shrink-0">
              <button
                title="Reasignar ubicación"
                aria-label={`Reasignar ubicación de ${a._type} ${disp(a.otherserial)}`}
                className="btn btn-secondary btn-icon-sm"
                onClick={() => setShowLocEdit(!showLocEdit)}
              >
                <EditIcon size={13} />
              </button>
              {a._locationId != null && (
                <button
                  title="Desasignar ubicación (sacar del puesto, conserva usuario)"
                  aria-label={`Sacar ${a._type} ${disp(a.otherserial)} del puesto`}
                  className="btn btn-danger btn-icon-sm"
                  onClick={() => requireEdit(desasignarUbicacion)}
                >
                  <TrashIcon size={13} />
                </button>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-muted">Inicia sesión para editar</span>
          )}
        </div>
        {showLocEdit && canEdit && (
          <div className="grid gap-2 border-t pt-2">
            <select className="input text-sm" value={locPick} onChange={(e) => setLocPick(e.target.value)}>
              <option value="">Elegir puesto…</option>
              {locOptions.map((l: any) => (
                <option key={l.id} value={l.id}>{l.completename || l.name} (id {l.id})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button className="btn btn-primary text-xs" onClick={() => requireEdit(reasignarUbicacion)}>Mover aquí</button>
              <button className="btn btn-secondary text-xs" onClick={() => { setShowLocEdit(false); setLocMsg(""); }}>Cancelar</button>
            </div>
            {locMsg && <p className="text-xs text-muted">{locMsg}</p>}
          </div>
        )}
        {!showLocEdit && locMsg && <p className="text-xs text-muted">{locMsg}</p>}

        <div className="flex items-center justify-between gap-2 flex-wrap border-t pt-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base" aria-hidden="true">👤</span>
            <b className="text-ink">Usuario:</b>
            {userDisplay ? (
              <span className="badge badge-success truncate max-w-[220px]" title={userDisplay}>{userDisplay}</span>
            ) : (
              <span className="badge">Sin asignar</span>
            )}
          </div>
          {canEdit ? (
            <div className="flex gap-1 shrink-0">
              <button
                title="Reasignar usuario"
                aria-label={`Reasignar usuario de ${a._type} ${disp(a.otherserial)}`}
                className="btn btn-secondary btn-icon-sm"
                onClick={() => setShowPerson(!showPerson)}
              >
                <EditIcon size={13} />
              </button>
              {hasUser && (
                <button
                  title="Desasignar usuario (conserva el puesto)"
                  aria-label={`Quitar usuario de ${a._type} ${disp(a.otherserial)}`}
                  className="btn btn-danger btn-icon-sm"
                  onClick={() => requireEdit(desasignarUsuario)}
                >
                  <TrashIcon size={13} />
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {showPerson && canEdit && (
        <div className="grid gap-2 border-t pt-2">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Nombre, apellido o usuario GLPI…"
              value={pq}
              onChange={(e) => setPq(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPerson()}
            />
            <button className="btn btn-primary text-xs" onClick={searchPerson}>Buscar</button>
          </div>
          {pmsg && <p className="text-xs text-muted">{pmsg}</p>}
          {presults.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
              <button className="btn btn-secondary text-xs" onClick={() => requireEdit(() => assignToUser(u))}>Asignar</button>
            </div>
          ))}
        </div>
      )}
      {!canEdit && pmsg && <p className="text-xs text-muted">{pmsg}</p>}
    </div>
  );
}

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
        const locName = byId.get(g.location_id)?.name || g.items[0]?._locationName || `Puesto ${g.location_id}`;
        return (
          <div key={g.location_id} className="card p-3 grid gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <b className="text-ink">{locName}</b>
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
  const { byId } = useLocations();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => { if (j.authenticated) setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate }); else setAuthUser(null); })
      .catch(() => {});
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

      <div className="card p-3 flex items-center justify-between gap-2 text-sm flex-wrap">
        {authUser ? (
          <>
            <span className="text-muted truncate">{authUser.name} <span className="text-xs">({authUser.canOperate ? "editor" : "lectura"})</span></span>
            <button
              className="btn btn-secondary text-xs"
              onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); setAuthUser(null); }}
            >
              Salir
            </button>
          </>
        ) : (
          <>
            <span className="text-muted text-xs">Inicia sesión para reasignar o desasignar ubicación/usuario.</span>
            <button className="btn btn-primary text-xs" onClick={() => setAuthOpen(true)}>Iniciar sesión para editar</button>
          </>
        )}
      </div>

      <div className="card p-4 grid gap-3">
        <div className="flex gap-2 flex-wrap">
          {(["assets", "people"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setMsg(""); setItems([]); setPeople([]); setSelPerson(null); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                mode === m ? "text-white border-transparent" : "bg-white text-muted border-line hover:text-ink"
              }`}
              style={mode === m ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
            >
              {m === "assets" ? "Equipos" : "Personas"}
            </button>
          ))}
        </div>

        {mode === "assets" && (
          <div className="flex gap-2 flex-wrap">
            {["all", "Computer", "Monitor", "Phone", "Printer", "Peripheral"].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
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
          {items.map((a) => (
            <Ficha
              key={`${a._type}-${a.id}`}
              a={a}
              byId={byId}
              canEdit={!!authUser?.canOperate}
              requireEdit={requireEdit}
              onChanged={() => search()}
            />
          ))}
          {!items.length && !msg && <div className="empty-state card"><span>Sin resultados aún. Realiza una búsqueda.</span></div>}
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
      {authOpen && (
        <AuthModal
          open={authOpen}
          onClose={() => { setAuthOpen(false); pendingAction.current = null; }}
          onSuccess={() => {
            fetch("/api/auth/me").then((r) => r.json()).then((j) => { if (j.authenticated) setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate }); }).catch(() => {});
            const a = pendingAction.current; pendingAction.current = null;
            if (a) a();
          }}
        />
      )}
    </div>
  );
}
