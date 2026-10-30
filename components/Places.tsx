"use client";
import { useEffect, useMemo, useState } from "react";
import type { Floor } from "@/lib/maps";

export type GLoc = { id: number; name: string; completename: string; parentId: number | null };

export function useLocations() {
  const [locations, setLocations] = useState<GLoc[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/glpi/locations")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Error");
        setLocations(j.locations || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const childrenOf = useMemo(() => {
    const m = new Map<number | null, GLoc[]>();
    for (const l of locations) {
      const k = l.parentId;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [locations]);
  return { locations, byId, childrenOf, error, loading };
}

// Desplegable plano con breadcrumb para elegir ubicación padre (piso).
export function ParentPicker({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { locations, loading, error } = useLocations();
  const sorted = useMemo(() => [...locations].sort((a, b) => a.completename.localeCompare(b.completename)), [locations]);
  if (loading) return <span className="text-xs text-slate-400">Cargando ubicaciones…</span>;
  if (error) return <span className="text-xs text-red-700">Sin GLPI: {error.slice(0, 80)}</span>;
  return (
    <select className="border rounded p-2 text-sm w-full" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
      <option value="">— Sin ubicación padre —</option>
      {sorted.map((l) => (
        <option key={l.id} value={l.id}>{l.completename} (id {l.id})</option>
      ))}
    </select>
  );
}

// Árbol Polo → … → puestos, con badges de mapa. Clic puesto → onPuesto(id).
export function PlacesTree({
  floors, onPuesto, onPiso, occByLoc,
}: {
  floors: Floor[];
  onPuesto: (glpiId: number) => void;
  onPiso: (floor: Floor) => void;
  occByLoc?: Record<number, string>;
}) {
  const { locations, byId, childrenOf, loading, error } = useLocations();
  const [open, setOpen] = useState<Set<number | null>>(new Set([null]));
  const floorByParent = useMemo(() => {
    const m = new Map<number, Floor>();
    for (const f of floors) if (f.glpiLocationId != null) m.set(f.glpiLocationId, f);
    return m;
  }, [floors]);
  const placedByFloor = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const f of floors) m.set(f.id, new Set(f.puestos.map((p) => p.glpi_id)));
    return m;
  }, [floors]);

  if (loading) return <p className="text-xs text-slate-400">Cargando lugares…</p>;
  if (error) return <p className="text-xs text-red-700">Sin GLPI: {error.slice(0, 100)}</p>;

  const toggle = (id: number | null) =>
    setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const renderKids = (pid: number | null, depth: number): React.ReactNode => {
    const kids = childrenOf.get(pid) || [];
    if (!kids.length) return null;
    return (
      <ul className={depth ? "ml-3 border-l pl-2" : ""}>
        {kids.map((l) => {
          const floor = floorByParent.get(l.id);
          const sub = childrenOf.get(l.id) || [];
          const placed = floor ? placedByFloor.get(floor.id)! : null;
          const placedCount = floor ? sub.filter((c) => placed!.has(c.id)).length : 0;
          const isLeaf = !sub.length;
          return (
            <li key={l.id} className="py-0.5 min-w-0">
              <div className="flex items-center gap-1 text-sm min-w-0">
                {!isLeaf && (
                  <button onClick={() => toggle(l.id)} className="w-4 shrink-0 text-slate-500">{open.has(l.id) ? "−" : "+"}</button>
                )}
                {floor ? (
                  <button onClick={() => onPiso(floor)} className="font-semibold text-blue-800 underline text-left break-words min-w-0" title={`Ver mapa ${floor.name}`}>
                    {l.name} <span className="text-[10px] no-underline text-green-700 border border-green-600 rounded px-1 whitespace-nowrap">mapa</span>
                  </button>
                ) : isLeaf ? (
                  <span className="text-slate-700 break-words min-w-0">{l.name}</span>
                ) : (
                  <button onClick={() => toggle(l.id)} className="font-medium text-left break-words min-w-0">{l.name}</button>
                )}
                {floor && <span className="text-[10px] text-slate-500">{placedCount}/{sub.length} puestos</span>}
              </div>
              {/* puestos del piso como hojas clicables */}
              {floor && open.has(l.id) && (
                <ul className="ml-3 border-l pl-2">
                  {sub.map((c) => (
                    <li key={c.id} className="min-w-0">
                      {placed!.has(c.id) ? (
                        <button onClick={() => onPuesto(c.id)} className="text-sm text-slate-700 underline text-left break-words">{c.name}{occByLoc?.[c.id] ? ` · ${occByLoc[c.id]}` : ""}</button>
                      ) : (
                        <span className="text-sm text-slate-400 break-words">{c.name} <span className="text-[10px]">(sin dibujar)</span></span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!floor && open.has(l.id) && renderKids(l.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex gap-1 mb-1">
        <button className="text-[11px] underline text-slate-500" onClick={() => setOpen(new Set([null]))}>contraer</button>
      </div>
      {renderKids(null, 0)}
      {!locations.length && <p className="text-xs text-slate-400">Sin ubicaciones en GLPI.</p>}
      {/* byId precargado para labels */}
      <span className="hidden">{byId.size}</span>
    </div>
  );
}
