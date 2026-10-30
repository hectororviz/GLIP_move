"use client";
import { useState } from "react";
import Scanner from "@/components/Scanner";
import { useLocations } from "@/components/Places";

type Asset = any;
type Person = { id: number; login: string | null; firstname: string | null; realname: string | null; display: string; email: string | null; phone: string | null };
type PersonGroup = { location_id: number; items: Asset[] };
const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

function Ficha({ a }: { a: Asset }) {
  return (
    <div className="card p-4 grid gap-2 text-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="font-bold text-ink">{a._type} — {disp(a.name)}</div>
        {a._locationId ? (
          <a className="btn btn-secondary text-xs" href={`/mapa?focus=${a._locationId}`}>Ver en mapa →</a>
        ) : (
          <span className="badge">Sin ubicación</span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-muted">
        <div><b className="text-ink">Fabricante:</b> {disp(a._manufacturer)}</div>
        <div><b className="text-ink">Modelo:</b> {disp(a._model)}</div>
        <div><b className="text-ink">Inventario:</b> <span className="tabular-nums">{disp(a.otherserial)}</span></div>
        <div><b className="text-ink">Serie:</b> <span className="tabular-nums">{disp(a.serial)}</span></div>
        <div><b className="text-ink">Lugar:</b> {disp(a._locationName)}</div>
        <div><b className="text-ink">Usuario:</b> {disp(a._userName)}</div>
      </div>
    </div>
  );
}

function FichaPersona({ p, groups, unlocated, byId, onQuitar }: {
  p: Person;
  groups: PersonGroup[];
  unlocated: Asset[];
  byId: Map<number, any>;
  onQuitar: (group: PersonGroup) => void;
}) {
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
          <b className="text-ink">Equipos sin puesto</b>
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
        {mode === "assets" && scan && <Scanner onResult={(v) => { setQ(v); setScan(false); search(v); }} />}
        <p className="text-sm text-muted">{msg}</p>
      </div>

      {mode === "assets" && (
        <div className="grid gap-3">
          {items.map((a) => <Ficha key={`${a._type}-${a.id}`} a={a} />)}
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
          <FichaPersona p={selPerson} groups={groups} unlocated={unlocated} byId={byId} onQuitar={quitarDelPuesto} />
        </div>
      )}
    </div>
  );
}
