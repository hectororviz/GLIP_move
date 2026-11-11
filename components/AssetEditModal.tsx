"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { comparePisos, formatLocationDisplay } from "@/lib/location-display";

type Asset = any;
type Person = { id: number; display: string };
type FloorRef = { id: string; name: string; glpiLocationId: number | null };

const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

/**
 * Modal de edición reutilizable: ubicación + usuario, misma lógica y
 * permisos que la ficha, sin cambiar de vista. No muta hasta confirmar.
 * Pisos = los cargados con mapa en /api/maps (floors.json); puestos = todos
 * los hijos GLPI del piso elegido.
 */

export default function AssetEditModal({
  asset,
  byId,
  childrenOf,
  canEdit,
  onClose,
  onSaved,
}: {
  asset: Asset;
  byId: Map<number, any>;
  childrenOf?: Map<number | null, any[]>;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [locPick, setLocPick] = useState("");
  const [pisoPick, setPisoPick] = useState("");
  const [puestoQuery, setPuestoQuery] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<Person[]>([]);
  const [pmsg, setPmsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const opener = useRef<Element | null>(null);
  const firstField = useRef<HTMLSelectElement>(null);

  const locName = asset._locationName && asset._locationName !== "—" ? String(asset._locationName) : null;
  const hasLoc = asset._locationId != null && locName;
  const hasUser = asset._userId != null;
  const userDisplay =
    (asset._userName && asset._userName !== "—" ? String(asset._userName) : null) ||
    (hasUser ? `Usuario #${asset._userId}` : null);
  const compact = formatLocationDisplay(asset._locationId, byId as any, locName);
  const dirty = locPick !== "" || pq !== "";

  // Pisos = los cargados con mapa (floors.json vía /api/maps).
  // Puestos = todos los hijos GLPI del piso elegido.
  const kidsOf: Map<number | null, any[]> = useMemo(() => {
    if (childrenOf) return childrenOf as Map<number | null, any[]>;
    const m = new Map<number | null, any[]>();
    for (const l of byId.values()) {
      const k = (l.parentId ?? null) as number | null;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return m;
  }, [byId, childrenOf]);

  const [floors, setFloors] = useState<FloorRef[]>([]);
  const [floorsMsg, setFloorsMsg] = useState("");
  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/maps").then((r) => r.json()).then((j) => {
      if (Array.isArray(j?.floors)) {
        setFloors(j.floors.filter((f: any) => f && f.glpiLocationId != null).map((f: any) => ({
          id: String(f.id),
          name: String(f.name || f.id),
          glpiLocationId: Number(f.glpiLocationId),
        })));
        setFloorsMsg("");
      } else setFloorsMsg("No se pudo cargar la lista de pisos.");
    }).catch(() => setFloorsMsg("No se pudo cargar la lista de pisos."));
  }, [canEdit]);

  const pisos = useMemo(() => {
    const only = floors.filter((f) => Number.isFinite(f.glpiLocationId as number));
    only.sort((a, b) => comparePisos(a.name, b.name));
    return only;
  }, [floors]);

  const hasPB = useMemo(
    () => pisos.some((f) => /(^|\s)pb(\s|$)/i.test(f.name) || /planta\s*baja/i.test(f.name)),
    [pisos]
  );

  const puestosDelPiso = useMemo(() => {
    if (!pisoPick) return [];
    const arr = kidsOf.get(Number(pisoPick)) || [];
    return [...arr].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  }, [kidsOf, pisoPick]);

  const puestosFiltrados = useMemo(() => {
    const q = puestoQuery.trim().toLowerCase();
    if (!q) return puestosDelPiso;
    return puestosDelPiso.filter((l: any) =>
      String(l.name || "").toLowerCase().includes(q) ||
      String(l.room || "").toLowerCase().includes(q) ||
      String(l.id) === q.trim()
    );
  }, [puestosDelPiso, puestoQuery]);

  // Preselección del piso (no del puesto): el piso es el floor cuyo
  // glpiLocationId coincide con la ubicación actual o con su padre.
  // Se preselecciona solo el piso para que el usuario elija el puesto destino.
  useEffect(() => {
    if (asset._locationId == null || !floors.length) return;
    const ids = new Set(floors.map((f) => Number(f.glpiLocationId)));
    const cur: any = byId.get(asset._locationId);
    if (cur && ids.has(Number(cur.id))) { setPisoPick(String(cur.id)); return; }
    const parentId = cur?.parentId != null ? Number(cur.parentId) : null;
    if (parentId != null && ids.has(parentId)) setPisoPick(String(parentId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset._locationId, floors]);

  useEffect(() => {
    opener.current = document.activeElement;
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dirty && !confirm("Hay cambios sin guardar. ¿Cerrar sin guardar?")) return;
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      (opener.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function apiPatch(body: object) {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: asset._type, id: asset.id, ...body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || `Error ${r.status}`);
        return false;
      }
      return true;
    } catch (e: any) {
      setErr(e.message || "Error de red");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function doMove() {
    const newId = Number(locPick);
    if (!Number.isFinite(newId) || newId <= 0) { setLocMsg("Elegí un puesto válido."); return; }
    if (newId === asset._locationId) { setLocMsg("Ya está en ese puesto."); return; }
    const dest = byId.get(newId)?.name || `puesto ${newId}`;
    const owner = userDisplay ? ` Conservará su usuario (${userDisplay}).` : "";
    if (!confirm(`Mover ${asset._type} ${asset.otherserial || asset.name} al puesto ${dest}?${owner}`)) return;
    setLocMsg("Moviendo…");
    const ok = await apiPatch({ location_id: newId });
    setLocMsg(ok ? "" : locMsg);
    if (ok) { setLocPick(""); onSaved(); }
  }

  async function doUnlinkLoc() {
    if (asset._locationId == null) return;
    if (!confirm(`Sacar ${asset._type} ${asset.otherserial || asset.name} del puesto ${locName || asset._locationId}? Conservará su usuario.`)) return;
    setLocMsg("Quitando del puesto…");
    const ok = await apiPatch({ location_id: null });
    if (ok) { setLocPick(""); onSaved(); }
    else setLocMsg("");
  }

  async function searchPerson() {
    if (!pq.trim()) return;
    setPmsg("Buscando personas…");
    const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(pq.trim())}`);
    const j = await r.json();
    if (!r.ok) { setPmsg("Error: " + j.error); setPresults([]); return; }
    setPresults(j.users || []);
    setPmsg(j.users?.length ? "" : "Sin personas.");
  }

  async function doAssignUser(u: Person) {
    const curLoc = locName;
    if (!confirm(`Asignar ${asset._type} ${asset.otherserial || asset.name} a ${u.display}? ${curLoc ? `Conservará el puesto ${curLoc}.` : "Quedará sin puesto (conserva ubicación actual)."}`)) return;
    const ok = await apiPatch({ user_id: u.id });
    if (ok) { setPq(""); setPresults([]); setPmsg(""); onSaved(); }
  }

  async function doUnlinkUser() {
    if (!hasUser) return;
    if (!confirm(`Quitar a ${userDisplay || `usuario #${asset._userId}`} como usuario de ${asset._type} ${asset.otherserial || asset.name}? El equipo conservará su puesto.`)) return;
    const ok = await apiPatch({ user_id: null });
    if (ok) onSaved();
  }

  function requestClose() {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Cerrar sin guardar?")) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="asset-edit-title">
      <div className="absolute inset-0 bg-ink/50" onClick={requestClose} aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-lift overflow-hidden">
        <div className="p-4 pb-3 border-b border-line grid gap-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="asset-edit-title" className="font-bold text-ink clamp-2" title={`${asset._type} ${disp(asset.name)}`}>
                {asset._type} · {disp(asset.name)}
              </h2>
              <p className="text-xs text-muted tabular-nums">Inv. {disp(asset.otherserial)} · Serie {disp(asset.serial)}{asset._model ? ` · ${disp(asset._model)}` : ""}</p>
            </div>
            <button className="btn btn-secondary icon-btn-sm" onClick={requestClose} aria-label="Cerrar editor">✕</button>
          </div>
        </div>

        <div className="p-4 grid gap-4 overflow-y-auto">
          {!canEdit && <p className="text-sm text-muted">Inicia sesión para editar (solo lectura).</p>}
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}

          <section aria-label="Ubicación actual" className="grid gap-2">
            <h3 className="text-sm font-bold text-ink">Ubicación</h3>
            <div className="rounded-xl border border-line bg-canvas/60 p-3 grid gap-1 text-sm">
              <div className="min-w-0" title={compact.full}>
                <span className="font-semibold">{compact.primary}</span>
                {compact.secondary && <span className="text-muted text-xs block truncate">{compact.secondary}</span>}
              </div>
              {!hasLoc && <span className="badge badge-warning w-fit">Sin ubicación</span>}
            </div>
            {canEdit && (
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-ink" htmlFor="asset-edit-piso">Piso (con mapa)</label>
                <select
                  id="asset-edit-piso"
                  ref={firstField}
                  className="input text-sm"
                  value={pisoPick}
                  disabled={busy}
                  onChange={(e) => { setPisoPick(e.target.value); setLocPick(""); setPuestoQuery(""); }}
                >
                  <option value="">Elegir piso…</option>
                  {pisos.map((f) => (
                    <option key={f.id} value={String(f.glpiLocationId)}>{f.name} (id {f.glpiLocationId})</option>
                  ))}
                </select>
                {floorsMsg && <p className="text-xs text-danger" role="alert">{floorsMsg}</p>}
                {!floorsMsg && !hasPB && pisos.length > 0 && (
                  <p className="text-xs text-muted">PB aún no cargado — crealo en /config → Pisos y planos.</p>
                )}
                <label className="text-xs font-semibold text-ink" htmlFor="asset-edit-loc">Mover a puesto</label>
                <input
                  className="input text-sm"
                  placeholder={pisoPick ? "Filtrar puestos por nombre, interno o id…" : "Primero elegí un piso…"}
                  aria-label="Filtrar puestos del piso"
                  value={puestoQuery}
                  disabled={busy || !pisoPick}
                  onChange={(e) => setPuestoQuery(e.target.value)}
                />
                <select
                  id="asset-edit-loc"
                  className="input text-sm"
                  value={locPick}
                  disabled={busy || !pisoPick}
                  onChange={(e) => setLocPick(e.target.value)}
                  size={Math.min(8, Math.max(3, puestosFiltrados.length))}
                >
                  <option value="">Elegir puesto…</option>
                  {puestosFiltrados.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}{l.room ? ` · Int. ${l.room}` : ""} (id {l.id})</option>
                  ))}
                </select>
                {pisoPick && !puestosFiltrados.length && (
                  <p className="text-xs text-muted" role="status">
                    {puestosDelPiso.length ? "Sin coincidencias para ese filtro." : "Este piso aún no tiene puestos cargados en GLPI."}
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-primary text-xs" disabled={busy || !locPick} onClick={doMove}>
                    {busy ? "Guardando…" : "Mover aquí"}
                  </button>
                  {asset._locationId != null && (
                    <button className="btn btn-secondary text-xs" disabled={busy} onClick={doUnlinkLoc}>Desvincular del puesto</button>
                  )}
                </div>
                {locMsg && <p className="text-xs text-muted" role="status">{locMsg}</p>}
              </div>
            )}
          </section>

          <section aria-label="Usuario asignado" className="grid gap-2 border-t pt-3">
            <h3 className="text-sm font-bold text-ink">Usuario (asignación directa, opcional)</h3>
            <div className="text-sm">
              {userDisplay ? <span className="badge badge-success" title={userDisplay}>{userDisplay}</span> : <span className="badge">Sin asignar</span>}
            </div>
            {canEdit && (
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <input
                    aria-label="Buscar persona"
                    className="input flex-1 text-sm"
                    placeholder="Nombre, apellido o usuario GLPI…"
                    value={pq}
                    disabled={busy}
                    onChange={(e) => setPq(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchPerson()}
                  />
                  <button className="btn btn-secondary text-xs" disabled={busy} onClick={searchPerson}>Buscar</button>
                </div>
                {pmsg && <p className="text-xs text-muted" role="status">{pmsg}</p>}
                {presults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2 text-sm min-w-0">
                    <span className="truncate" title={u.display}>{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
                    <button className="btn btn-secondary text-xs shrink-0" disabled={busy} onClick={() => doAssignUser(u)}>Asignar</button>
                  </div>
                ))}
                {hasUser && (
                  <button className="btn btn-secondary text-xs w-fit" disabled={busy} onClick={doUnlinkUser}>Quitar usuario (conserva puesto)</button>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="p-4 pt-3 border-t border-line flex gap-2 justify-end bg-white">
          <button className="btn btn-secondary text-sm" onClick={requestClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
