"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import Scanner from "./Scanner";
import { PlacesTree, useLocations } from "./Places";

type Puesto = { glpi_id: number; x: number; y: number; w: number; h: number };
type Floor = { id: string; name: string; image: string | null; glpiLocationId: number | null; puestos: Puesto[] };
type Asset = any;

const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

type Drag =
  | { mode: "draw"; sx: number; sy: number; cx: number; cy: number }
  | { mode: "move"; id: number; sx: number; sy: number; ox: number; oy: number }
  | { mode: "resize"; id: number; sx: number; sy: number; ow: number; oh: number };

export default function Mapa({ calibrar, focus, floorParam }: { calibrar: boolean; focus: string | null; floorParam: string | null }) {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState<string | null>(floorParam);
  const [sel, setSel] = useState<Puesto | null>(null);
  const [items, setItems] = useState<Asset[]>([]);
  const [msg, setMsg] = useState("");
  const [scanMode, setScanMode] = useState<"add" | "replace" | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<Asset | null>(null);
  const [manualInv, setManualInv] = useState("");
  const [occOpen, setOccOpen] = useState(false);
  const [occQuery, setOccQuery] = useState("");
  const [occResults, setOccResults] = useState<any[]>([]);
  const [occByLoc, setOccByLoc] = useState<Record<number, string>>({});
  const [userNames, setUserNames] = useState<Record<number, string>>({});
  // calibración
  const [draft, setDraft] = useState<Puesto[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [tool, setTool] = useState<"pan" | "draw">("pan"); // en calibración: navegar vs dibujar
  const [pending, setPending] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<
    | { x: number; y: number; kind: "new"; rect: { x: number; y: number; w: number; h: number } }
    | { x: number; y: number; kind: "reassign"; targetId: number }
    | null
  >(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const { byId, childrenOf } = useLocations();

  const floor = floors.find((f) => f.id === floorId) || floors[0] || null;
  const puestos: Puesto[] = calibrar && floor ? draft : floor?.puestos || [];
  const children = useMemo(
    () => (floor?.glpiLocationId != null ? childrenOf.get(floor.glpiLocationId) || [] : []),
    [childrenOf, floor]
  );
  const placedIds = useMemo(() => new Set(puestos.map((p) => p.glpi_id)), [puestos]);
  const nameOf = (id: number) => byId.get(id)?.name || `#${id}`;

  useEffect(() => {
    fetch("/api/maps").then((r) => r.json()).then((j) => {
      const fl: Floor[] = j.floors || [];
      setFloors(fl);
      if (!floorParam && fl.length) setFloorId((cur) => cur || fl[0].id);
    }).catch(() => setMsg("No se pudieron cargar los pisos. Créelos en /config."));
  }, [floorParam]);

  // al cambiar de piso en modo calibración, parte del server
  useEffect(() => {
    if (floor) { setDraft(floor.puestos); setPending(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor?.id]);

  useEffect(() => {
    if (focus && floors.length) openById(Number(focus));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, floors]);

  function floorOf(glpiId: number): Floor | undefined {
    return floors.find((f) => f.puestos.some((p) => p.glpi_id === glpiId));
  }

  function openById(glpiId: number) {
    const f = floors.find((x) => x.id === floor?.id && x.puestos.some((p) => p.glpi_id === glpiId)) || floorOf(glpiId);
    if (!f) { setMsg(`El puesto ${nameOf(glpiId)} no está dibujado en ningún plano.`); return; }
    if (f.id !== floor?.id) setFloorId(f.id);
    const p = f.puestos.find((x) => x.glpi_id === glpiId)!;
    openPuesto(p);
  }

  async function resolveUserNames(list: Asset[]) {
    const ids = [...new Set(list.map((a) => a._userId).filter((id) => id != null))] as number[];
    const map: Record<number, string> = {};
    if (!ids.length) return map;
    await Promise.all(ids.map(async (id) => {
      try {
        const r = await fetch(`/api/glpi/users?id=${id}`);
        const j = await r.json();
        if (j.user?.display) map[id] = j.user.display;
      } catch {}
    }));
    if (Object.keys(map).length) setUserNames((m) => ({ ...m, ...map }));
    return map;
  }

  async function openPuesto(p: Puesto) {
    setSel(p); setMsg("Cargando equipos..."); setScanMode(null);
    const r = await fetch(`/api/glpi?location_id=${p.glpi_id}`);
    const j = await r.json();
    if (!r.ok) { setMsg("Error: " + j.error); setItems([]); return; }
    const loaded: Asset[] = j.items || [];
    setItems(loaded);
    const resolved = await resolveUserNames(loaded);
    const fullName = (a: Asset) => resolved[a._userId] || userNames[a._userId] || a._userName || `Usuario ${a._userId}`;
    const names = [...new Map(loaded.filter((a) => a._userId != null).map((a) => [a._userId, fullName(a)] as const)).values()];
    setOccByLoc((m) => ({ ...m, [p.glpi_id]: names.join(", ") }));
    setMsg(loaded.length ? "" : "Puesto vacío");
  }

  async function assignInventory(inv: string, opts: { replace?: Asset } = {}) {
    if (!sel) return;
    setMsg("Buscando inventario " + inv + "...");
    const s = await fetch(`/api/glpi?q=${encodeURIComponent(inv)}&type=all`).then((r) => r.json());
    const found = s.items?.[0];
    if (!found) { setMsg("No existe ese inventario en GLPI"); return; }
    if (opts.replace) {
      await fetch("/api/glpi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: opts.replace._type, id: opts.replace.id, location_id: null }) });
    }
    const r = await fetch("/api/glpi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: found._type, id: found.id, location_id: sel.glpi_id }) });
    const j = await r.json();
    setMsg(r.ok ? `Asignado ${found._type} ${found.otherserial || found.name} → ${nameOf(sel.glpi_id)}` : "Error: " + j.error);
    setScanMode(null); setManualInv(""); openPuesto(sel);
  }

  async function unassign(a: Asset) {
    if (!confirm(`Quitar ${a._type} ${a.otherserial || a.name} del puesto? Quedará sin ubicación.`)) return;
    const r = await fetch("/api/glpi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: a._type, id: a.id, location_id: null }) });
    setMsg(r.ok ? "Quitado (sin ubicación)" : "Error al quitar");
    if (sel) openPuesto(sel);
  }

  const occupants = useMemo(() => {
    const m = new Map<number, { id: number; name: string; count: number }>();
    for (const a of items) {
      if (a._userId == null) continue;
      const cur = m.get(a._userId) || { id: a._userId, name: userNames[a._userId] || a._userName || `Usuario ${a._userId}`, count: 0 };
      cur.count += 1;
      m.set(a._userId, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [items, userNames]);

  async function searchOccupants() {
    if (!occQuery.trim()) return;
    setMsg("Buscando personas...");
    const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(occQuery.trim())}`);
    const j = await r.json();
    if (!r.ok) { setMsg("Error: " + j.error); setOccResults([]); return; }
    setOccResults(j.users || []);
    setMsg(j.users?.length ? "" : "Sin personas.");
  }

  async function assignOccupant(u: { id: number; display: string }) {
    if (!sel || !items.length) return;
    if (!confirm(`Asignar a ${u.display} como ocupante de ${nameOf(sel.glpi_id)}? Se actualizará el usuario en ${items.length} equipo(s).`)) return;
    setMsg("Asignando ocupante...");
    for (const a of items) {
      await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: a._type, id: a.id, location_id: sel.glpi_id, user_id: u.id }),
      });
    }
    setOccOpen(false); setOccQuery(""); setOccResults([]);
    openPuesto(sel);
  }

  async function removeOccupant(id: number, name: string) {
    if (!sel) return;
    const mine = items.filter((a) => a._userId === id);
    if (!mine.length) return;
    if (!confirm(`Quitar a ${name} del puesto? Se quitará como usuario de ${mine.length} equipo(s).`)) return;
    setMsg("Quitando ocupante...");
    for (const a of mine) {
      await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: a._type, id: a.id, location_id: sel.glpi_id, user_id: null }),
      });
    }
    openPuesto(sel);
  }

  // ---------- calibración: dibujar / mover / redimensionar ----------
  const toPct = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)),
    };
  };

  const onBoxDown = (e: React.PointerEvent) => {
    if (!calibrar || !floor || drag || tool !== "draw") return;
    if ((e.target as HTMLElement).closest("[data-puesto]")) return; // lo maneja el rect
    const p = toPct(e.clientX, e.clientY);
    setDrag({ mode: "draw", sx: p.x, sy: p.y, cx: p.x, cy: p.y });
  };
  const onBoxMove = (e: React.PointerEvent) => {
    if (!calibrar || !drag) return;
    const p = toPct(e.clientX, e.clientY);
    if (drag.mode === "draw") setDrag({ ...drag, cx: p.x, cy: p.y });
    else if (drag.mode === "move") {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      setDraft((d) => d.map((x) => (x.glpi_id === drag.id ? { ...x, x: Math.min(95, Math.max(0, drag.ox + dx)), y: Math.min(95, Math.max(0, drag.oy + dy)) } : x)));
    } else {
      const dw = p.x - drag.sx, dh = p.y - drag.sy;
      setDraft((d) => d.map((x) => (x.glpi_id === drag.id ? { ...x, w: Math.min(100 - x.x, Math.max(2, drag.ow + dw)), h: Math.min(100 - x.y, Math.max(2, drag.oh + dh)) } : x)));
    }
  };
  const onBoxUp = () => {
    if (!drag) return;
    if (drag.mode === "draw") {
      const x = Math.min(drag.sx, drag.cx), y = Math.min(drag.sy, drag.cy);
      const w = Math.abs(drag.cx - drag.sx), h = Math.abs(drag.cy - drag.sy);
      if (w > 1 && h > 1) {
        const rect = { x, y, w, h };
        setPending(rect);
        const r = boxRef.current!.getBoundingClientRect();
        const cx = r.left + ((x + w / 2) / 100) * r.width;
        const cy = r.top + ((y + h / 2) / 100) * r.height;
        setCtxMenu({ x: cx, y: cy, kind: "new", rect });
      }
    }
    setDrag(null);
  };

  async function autoSave(next: Puesto[]) {
    if (!floor) return;
    const r = await fetch("/api/maps", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: floor.id, puestos: next }) });
    const j = await r.json();
    if (!r.ok) { setMsg(r.status === 401 ? "Inicia sesión admin en /config para guardar." : "Error: " + j.error); return; }
    setFloors((fs) => fs.map((f) => (f.id === floor.id ? j.floor : f)));
    setMsg(`Guardado en servidor: ${next.length} puestos.`);
  }

  function assignNew(childId: number, rect: { x: number; y: number; w: number; h: number }) {
    if (placedIds.has(childId)) { setMsg("Ese puesto ya está dibujado en este piso."); return; }
    const next = [...draft, { glpi_id: childId, ...rect }];
    setDraft(next);
    setPending(null);
    setCtxMenu(null);
    autoSave(next);
  }

  function reassignPuesto(targetId: number, childId: number) {
    if (placedIds.has(childId)) { setMsg("Ese puesto ya está dibujado en este piso."); return; }
    const next = draft.map((p) => (p.glpi_id === targetId ? { ...p, glpi_id: childId } : p));
    setDraft(next);
    setCtxMenu(null);
    autoSave(next);
  }

  async function saveCalib() {
    if (!floor) return;
    await autoSave(draft);
  }

  const drawRect = drag?.mode === "draw" ? {
    x: Math.min(drag.sx, drag.cx), y: Math.min(drag.sy, drag.cy),
    w: Math.abs(drag.cx - drag.sx), h: Math.abs(drag.cy - drag.sy),
  } : null;

  const noParent = calibrar && floor && floor.glpiLocationId == null;

  // panning del zoom se desactiva solo mientras se dibuja/mueve un rect
  const panDisabled = calibrar && (tool === "draw" || !!drag);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_370px] gap-4 overflow-x-clip">
      <div className="min-w-0 overflow-hidden">
        <div className="flex gap-2 items-center mb-2 flex-wrap">
          <h1 className="text-xl font-bold">Control {floor ? `· ${floor.name}` : ""} {calibrar && <span className="badge badge-warning ml-2">Calibración</span>}</h1>
          {floors.length > 1 && (
            <select className="input w-auto text-sm py-1.5" value={floor?.id || ""} onChange={(e) => { setFloorId(e.target.value); setSel(null); setItems([]); }}>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
        {!floor ? (
          <p className="text-sm text-slate-500 bg-white rounded p-4">Sin pisos configurados. Crea uno y sube su plano en <a className="underline" href="/config">/config</a>.</p>
        ) : !floor.image ? (
          <p className="text-sm text-slate-500 bg-white rounded p-4">El piso "{floor.name}" no tiene plano. <a className="underline" href="/config">Súbelo en /config</a>.</p>
        ) : noParent ? (
          <p className="text-sm text-amber-800 bg-amber-50 border rounded p-4">Este piso no tiene ubicación GLPI padre. <a className="underline" href="/config">Vincúlalo en /config</a> para dibujar puestos.</p>
        ) : (
            <TransformWrapper minScale={0.5} maxScale={8} panning={{ disabled: panDisabled }}>
              <div className="relative">
                <TransformComponent wrapperClass="!w-full !h-[60vh] bg-white rounded-xl shadow overflow-hidden">
                  <div ref={boxRef} className="relative inline-block select-none"
                    onPointerDown={onBoxDown} onPointerMove={onBoxMove} onPointerUp={onBoxUp}
                    onContextMenu={(e) => {
                      if (!calibrar) return;
                      const target = (e.target as HTMLElement).closest("[data-puesto]");
                      e.preventDefault();
                      if (target) return;
                      if (pending) {
                        setCtxMenu({ x: e.clientX, y: e.clientY, kind: "new", rect: pending });
                      }
                    }}
                    style={{ touchAction: panDisabled ? "none" : undefined, cursor: calibrar && tool === "draw" ? "crosshair" : undefined }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/maps/${floor.id}/image`} alt={`Plano ${floor.name}`} className="max-w-none max-h-[60vh]" draggable={false} />
                {puestos.map((p) => (
                  <div key={p.glpi_id} data-puesto
                    onClick={() => !calibrar && openPuesto(p)}
                    onPointerDown={(e) => {
                      if (!calibrar) return;
                      e.stopPropagation();
                      const q = toPct(e.clientX, e.clientY);
                      setDrag({ mode: "move", id: p.glpi_id, sx: q.x, sy: q.y, ox: p.x, oy: p.y });
                    }}
                    onContextMenu={(e) => {
                      if (!calibrar) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setCtxMenu({ x: e.clientX, y: e.clientY, kind: "reassign", targetId: p.glpi_id });
                    }}
                    title={`${nameOf(p.glpi_id)} (GLPI ${p.glpi_id})`}
                    className={`absolute border-2 rounded-lg text-[11px] font-bold overflow-hidden shadow-sm ${sel?.glpi_id === p.glpi_id ? "border-success bg-green-300/60" : "border-brand-600 bg-blue-300/50 hover:bg-blue-300/80"} ${calibrar ? "cursor-move" : "cursor-pointer"}`}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%` }}>
                    <span className="px-1">{nameOf(p.glpi_id)}{occByLoc[p.glpi_id] ? ` · ${occByLoc[p.glpi_id]}` : ""}</span>
                    {calibrar && (
                      <span
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const q = toPct(e.clientX, e.clientY);
                          setDrag({ mode: "resize", id: p.glpi_id, sx: q.x, sy: q.y, ow: p.w, oh: p.h });
                        }}
                        className="absolute right-0 bottom-0 w-3 h-3 bg-blue-800 cursor-nwse-resize"
                        title="Redimensionar"
                      />
                    )}
                  </div>
                ))}
                {drawRect && drawRect.w > 0.5 && (
                  <div className="absolute border-2 border-dashed border-amber-600 bg-amber-200/40 pointer-events-none"
                    style={{ left: `${drawRect.x}%`, top: `${drawRect.y}%`, width: `${drawRect.w}%`, height: `${drawRect.h}%` }} />
                )}
              </div>
            </TransformComponent>
            <ZoomControls />
            </div>
          </TransformWrapper>
        )}
        {calibrar && floor && floor.image && floor.glpiLocationId != null && (
          <div className="card p-4 mt-2 grid gap-2 text-sm bg-amber-50/60 border-amber-200">
            {pending ? (
              <div className="grid gap-2">
                <b>Rectángulo dibujado. Elige el puesto (click derecho sobre él también):</b>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const r = boxRef.current!.getBoundingClientRect();
                    const cx = r.left + ((pending.x + pending.w / 2) / 100) * r.width;
                    const cy = r.top + ((pending.y + pending.h / 2) / 100) * r.height;
                    setCtxMenu({ x: cx, y: cy, kind: "new", rect: pending });
                  }} className="btn btn-primary text-xs">Elegir puesto</button>
                  <button onClick={() => { setPending(null); setCtxMenu(null); }} className="btn btn-secondary text-xs">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="font-bold text-sm">Herramienta:</span>
                  <button onClick={() => setTool("pan")} className={`btn ${tool === "pan" ? "btn-primary" : "btn-secondary"} text-xs`}>🖐️ Navegar</button>
                  <button onClick={() => setTool("draw")} className={`btn ${tool === "draw" ? "btn-primary" : "btn-secondary"} text-xs`}>✏️ Dibujar</button>
                </div>
                <p>{tool === "draw"
                  ? "Arrastra sobre el plano para dibujar un puesto → elige su ubicación GLPI. Puedes hacer zoom con la rueda antes de dibujar para mayor precisión."
                  : "Muévete con arrastre y zoom (rueda/pinch o botones +/−). Para mover un puesto, arrástralo directamente; para dibujar, cambia a ✏️ Dibujar."}</p>
              </div>
            )}
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={saveCalib} className="btn btn-primary text-xs">Guardar en servidor ({draft.length})</button>
              <span className="text-xs text-muted">{draft.length}/{children.length} hijos dibujados</span>
            </div>
            {draft.length > 0 && (
              <div className="grid gap-1">
                {draft.map((p) => (
                  <div key={p.glpi_id} className="flex gap-2 items-center text-xs min-w-0">
                    <span className="font-mono break-all min-w-0">{nameOf(p.glpi_id)} (loc {p.glpi_id})</span>
                    <button className="underline text-red-700" onClick={() => {
                      setDraft((d) => d.filter((x) => x.glpi_id !== p.glpi_id));
                      if (sel?.glpi_id === p.glpi_id) { setSel(null); setItems([]); }
                    }}>borrar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!calibrar && (
          <p className="text-xs text-slate-500 mt-2">Zoom con rueda/pinch, click en puesto para ver equipos. <a className="underline" href={`/mapa?calibrar=1${floor ? `&floor=${floor.id}` : ""}`}>Calibrar puestos</a></p>
        )}
      </div>

      <aside className="card p-4 h-fit sticky top-20 grid gap-3 max-h-[85vh] overflow-y-auto overflow-x-hidden min-w-0">
        <details>
          <summary className="text-sm font-bold cursor-pointer">Lugares (árbol GLPI)</summary>
          <div className="mt-2">
            <PlacesTree floors={floors} occByLoc={occByLoc} onPuesto={(id) => openById(id)} onPiso={(f) => { setFloorId(f.id); setSel(null); setItems([]); }} />
          </div>
        </details>
        {!sel ? <p className="text-sm text-slate-500">Selecciona un puesto en el mapa o en Lugares.</p> : (
          <>
            <div className="font-bold">{nameOf(sel.glpi_id)} <span className="text-xs font-normal text-slate-500">GLPI loc {sel.glpi_id}</span></div>
            <div className="grid gap-2 border rounded-lg p-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-semibold">Ocupante</span>
                <button className="btn btn-secondary text-xs" onClick={() => setOccOpen(!occOpen)}>
                  {occupants.length ? "Cambiar" : "Asignar"}
                </button>
              </div>
              {occupants.length ? (
                <ul className="grid gap-1 text-sm">
                  {occupants.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span>{o.name} <span className="text-xs text-muted">· {o.count} equipo(s)</span></span>
                      <button className="text-xs text-danger underline" onClick={() => removeOccupant(o.id, o.name)}>quitar</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-muted">Puesto sin ocupante.</span>
              )}
              {occOpen && (
                <div className="grid gap-2">
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="Nombre, apellido o usuario GLPI…"
                      value={occQuery}
                      onChange={(e) => setOccQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchOccupants()}
                    />
                    <button className="btn btn-primary text-xs" onClick={searchOccupants}>Buscar</button>
                  </div>
                  {occResults.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
                      <button className="btn btn-secondary text-xs" onClick={() => assignOccupant(u)}>Asignar</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {items.map((a) => (
              <div key={`${a._type}-${a.id}`} className="card p-3 grid gap-1 min-w-0 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold min-w-0">{a._type}: {disp(a.name)}</div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      title="Reemplazar equipo"
                      aria-label={`Reemplazar ${a._type} ${disp(a.otherserial)}`}
                      onClick={() => { setReplaceTarget(a); setScanMode("replace"); }}
                      className="btn btn-secondary btn-icon"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                        <path d="M21 3v6h-6" />
                      </svg>
                    </button>
                    <button
                      title="Quitar equipo del puesto"
                      aria-label={`Quitar ${a._type} ${disp(a.otherserial)}`}
                      onClick={() => unassign(a)}
                      className="btn btn-danger btn-icon"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-600 grid gap-0.5">
                  <div>Mod.: {disp(a._model)}</div>
                  <div>Inv.: <span className="tabular-nums">{disp(a.otherserial)}</span></div>
                </div>
              </div>
            ))}
            <p className="text-sm text-slate-500">{msg}</p>
            <div className="grid gap-2 border-t pt-2">
              <div className="text-sm font-semibold">Agregar por inventario</div>
              <div className="flex gap-2">
                <input className="border rounded p-2 flex-1 text-sm" placeholder="0000012865 o 12865" value={manualInv} onChange={(e) => setManualInv(e.target.value)} onKeyDown={(e) => e.key === "Enter" && manualInv && assignInventory(manualInv, replaceTarget && scanMode === "replace" ? { replace: replaceTarget } : {})} />
                <button onClick={() => manualInv && assignInventory(manualInv)} className="btn btn-primary text-xs">OK</button>
                <button onClick={() => setScanMode(scanMode ? null : "add")} className="btn btn-secondary text-xs">📷</button>
              </div>
              {scanMode && <Scanner onResult={(v) => assignInventory(v, replaceTarget && scanMode === "replace" ? { replace: replaceTarget } : {})} />}
            </div>
          </>
        )}
       </aside>
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="fixed z-50 card p-2 min-w-[240px] max-w-[320px] max-h-[60vh] overflow-auto" style={{ left: Math.min(ctxMenu.x, window.innerWidth - 260), top: Math.min(ctxMenu.y, window.innerHeight - 220) }}>
            <div className="text-xs font-bold mb-1 px-1">Elegir puesto disponible</div>
            {children.filter((c) => !placedIds.has(c.id)).length === 0 ? (
              <div className="text-xs text-slate-500 px-2 py-1">No hay puestos disponibles.</div>
            ) : (
              <ul className="grid gap-1">
                {children.filter((c) => !placedIds.has(c.id)).map((c) => (
                  <li key={c.id}>
                    <button className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-canvas transition" onClick={() => {
                      if (ctxMenu.kind === "new") assignNew(c.id, ctxMenu.rect);
                      else reassignPuesto(ctxMenu.targetId, c.id);
                    }}>{c.name} <span className="text-[10px] text-slate-500">(id {c.id})</span></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mt-2 px-1">
              <button className="btn btn-secondary text-xs" onClick={() => { if (ctxMenu.kind === "new") setPending(null); setCtxMenu(null); }}>Cancelar</button>
            </div>
          </div>
        </>
      )}
     </div>
   );
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const btn = "bg-white/90 border rounded w-8 h-8 text-lg leading-none shadow";
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
      <button className={btn} onClick={() => zoomIn()} title="Acercar">+</button>
      <button className={btn} onClick={() => zoomOut()} title="Alejar">−</button>
      <button className={btn} onClick={() => resetTransform()} title="Encuadre inicial">⤾</button>
    </div>
  );
}
