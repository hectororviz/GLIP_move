"use client";
import { useState } from "react";
import ScanModal from "@/components/ScanModal";
import { useLocations } from "@/components/Places";
import { inventoryVariants, parseGlpiUrl } from "@/lib/inventory";

type Asset = any;
type Person = { id: number; login: string | null; firstname: string | null; realname: string | null; display: string; email: string | null; phone: string | null };
type PersonGroup = { location_id: number; items: Asset[] };
const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

function Ficha({ a, onChanged }: { a: Asset; onChanged: () => void }) {
  const [showPerson, setShowPerson] = useState(false);
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<Person[]>([]);
  const [pmsg, setPmsg] = useState("");

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
    const curLoc = a._locationName && a._locationName !== "—" ? a._locationName : null;
    if (!confirm(`Asignar ${a._type} ${a.otherserial || a.name} a ${u.display}? ${curLoc ? `Saldrá del puesto ${curLoc}.` : "Quedará sin puesto."}`)) return;
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
    onChanged();
  }

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
          <button className="btn btn-secondary text-xs" onClick={() => setShowPerson(!showPerson)}>Asignar a persona</button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-muted">
        <div><b className="text-ink">Fabricante:</b> {disp(a._manufacturer)}</div>
        <div><b className="text-ink">Modelo:</b> {disp(a._model)}</div>
        <div><b className="text-ink">Inventario:</b> <span className="tabular-nums">{disp(a.otherserial)}</span></div>
        <div><b className="text-ink">Serie:</b> <span className="tabular-nums">{disp(a.serial)}</span></div>
        <div><b className="text-ink">Lugar:</b> {disp(a._locationName)}</div>
        <div><b className="text-ink">Usuario:</b> {disp(a._userName)}</div>
      </div>
      {showPerson && (
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
              <button className="btn btn-secondary text-xs" onClick={() => assignToUser(u)}>Asignar</button>
            </div>
          ))}
        </div>
      )}
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
  const { byId } = useLocations();

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
          {items.map((a) => <Ficha key={`${a._type}-${a.id}`} a={a} onChanged={() => search()} />)}
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
          <FichaPersona p={selPerson} groups={groups} unlocated={unlocated} byId={byId} onQuitar={quitarDelPuesto} onRefresh={() => selPerson && openPerson(selPerson)} />
        </div>
      )}
    </div>
  );
}
