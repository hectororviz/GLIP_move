"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { comparePisos, formatLocationDisplay } from "@/lib/location-display";
import { ConfirmDialog, SearchCombobox, Tabs, BusyButton } from "./ui";
import { IconBuilding, IconUser } from "./icons";

type Asset = any;
type Person = { id: number; display: string };
type FloorRef = { id: string; name: string; glpiLocationId: number | null };

const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

/**
 * Detalle + edición de equipo para SidePanel.
 * Pestañas: Ubicación | Usuario. No muta hasta confirmar.
 * Pisos = floors.json vía /api/maps; puestos = hijos GLPI del piso.
 */
export default function AssetEditModal({
  asset,
  byId,
  childrenOf,
  canEdit,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  asset: Asset;
  byId: Map<number, any>;
  childrenOf?: Map<number | null, any[]>;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<"ubic" | "user">("ubic");
  const [locPick, setLocPick] = useState("");
  const [pisoPick, setPisoPick] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<Person[]>([]);
  const [pmsg, setPmsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [opBusy, setOpBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState<null | { kind: "move" | "unlinkLoc" | "assignUser" | "unlinkUser" | "close"; payload?: any }>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locName = asset._locationName && asset._locationName !== "—" ? String(asset._locationName) : null;
  const hasLoc = asset._locationId != null && locName;
  const hasUser = asset._userId != null;
  const userDisplay =
    (asset._userName && asset._userName !== "—" ? String(asset._userName) : null) ||
    (hasUser ? `Usuario #${asset._userId}` : null);
  const compact = formatLocationDisplay(asset._locationId, byId as any, locName);
  const dirty = locPick !== "" || pq !== "";

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

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
  const [floorsLoading, setFloorsLoading] = useState(false);
  useEffect(() => {
    if (!canEdit) return;
    setFloorsLoading(true);
    fetch("/api/maps").then((r) => r.json()).then((j) => {
      if (Array.isArray(j?.floors)) {
        setFloors(j.floors.filter((f: any) => f && f.glpiLocationId != null).map((f: any) => ({
          id: String(f.id),
          name: String(f.name || f.id),
          glpiLocationId: Number(f.glpiLocationId),
        })));
        setFloorsMsg("");
      } else setFloorsMsg("No se pudo cargar la lista de pisos.");
    }).catch(() => setFloorsMsg("No se pudo cargar la lista de pisos."))
      .finally(() => setFloorsLoading(false));
  }, [canEdit]);

  const pisos = useMemo(() => {
    const only = floors.filter((f) => Number.isFinite(f.glpiLocationId as number));
    only.sort((a, b) => comparePisos(a.name, b.name));
    return only;
  }, [floors]);

  const puestosDelPiso = useMemo(() => {
    if (!pisoPick) return [];
    const arr = kidsOf.get(Number(pisoPick)) || [];
    return [...arr].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  }, [kidsOf, pisoPick]);

  const puestoOptions = useMemo(
    () => puestosDelPiso.map((l: any) => ({
      value: String(l.id),
      label: String(l.name || `Puesto ${l.id}`),
      hint: `${l.room ? `Int. ${l.room} · ` : ""}id ${l.id}`,
    })),
    [puestosDelPiso]
  );

  // Preselección del piso (no del puesto)
  useEffect(() => {
    if (asset._locationId == null || !floors.length) return;
    const ids = new Set(floors.map((f) => Number(f.glpiLocationId)));
    const cur: any = byId.get(asset._locationId);
    if (cur && ids.has(Number(cur.id))) { setPisoPick(String(cur.id)); return; }
    const parentId = cur?.parentId != null ? Number(cur.parentId) : null;
    if (parentId != null && ids.has(parentId)) setPisoPick(String(parentId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset._locationId, floors]);

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

  async function execMove() {
    const newId = Number(locPick);
    if (!Number.isFinite(newId) || newId <= 0) { setLocMsg("Elegí un puesto válido."); return; }
    if (newId === asset._locationId) { setLocMsg("Ya está en ese puesto."); return; }
    setOpBusy("move");
    setLocMsg("Moviendo…");
    const ok = await apiPatch({ location_id: newId });
    setOpBusy(null);
    setLocMsg(ok ? "" : locMsg);
    if (ok) { setLocPick(""); onSaved(); }
  }

  async function execUnlinkLoc() {
    if (asset._locationId == null) return;
    setOpBusy("unlinkLoc");
    setLocMsg("Quitando del puesto…");
    const ok = await apiPatch({ location_id: null });
    setOpBusy(null);
    if (ok) { setLocPick(""); onSaved(); }
    else setLocMsg("");
  }

  async function searchPerson(q?: string) {
    const term = (q ?? pq).trim();
    if (!term) return;
    setPmsg("Buscando personas…");
    const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(term)}`);
    const j = await r.json();
    if (!r.ok) { setPmsg("Error: " + j.error); setPresults([]); return; }
    setPresults(j.users || []);
    setPmsg(j.users?.length ? "" : "Sin personas para esa búsqueda.");
  }

  // Debounce: búsqueda remota sin llamadas en cada tecla
  useEffect(() => {
    if (!canEdit) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = pq.trim();
    if (term.length < 2) return;
    debounceRef.current = setTimeout(() => { searchPerson(term); }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pq]);

  async function execAssignUser(u: Person) {
    setOpBusy(`assign:${u.id}`);
    const ok = await apiPatch({ user_id: u.id });
    setOpBusy(null);
    if (ok) { setPq(""); setPresults([]); setPmsg(""); onSaved(); }
  }

  async function execUnlinkUser() {
    if (!hasUser) return;
    setOpBusy("unlinkUser");
    const ok = await apiPatch({ user_id: null });
    setOpBusy(null);
    if (ok) onSaved();
  }

  function requestClose() {
    if (dirty) { setConfirm({ kind: "close" }); return; }
    onClose();
  }

  const destName = locPick ? (byId.get(Number(locPick))?.name || `puesto ${locPick}`) : "";

  return (
    <div className="grid gap-4">
      {!canEdit && <p className="text-sm text-muted card p-3">Iniciá sesión con perfil operador para editar (solo lectura).</p>}
      {err && <p className="text-sm text-danger card p-3 toast-err border" role="alert">{err}</p>}

      {/* A. Encabezado compacto + resumen */}
      <section aria-label="Resumen del estado actual" className="grid gap-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="rounded-xl border border-line bg-canvas/60 p-3 grid gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted inline-flex items-center gap-1">
              <IconBuilding size={12} /> Ubicación actual
            </span>
            <span className="min-w-0" title={compact.full}>
              <span className="font-semibold text-ink block truncate">{compact.primary}</span>
              {compact.secondary && <span className="text-muted text-xs block truncate">{compact.secondary}</span>}
            </span>
            {!hasLoc
              ? <span className="badge badge-warning w-fit">Sin ubicación — sin puesto asignado</span>
              : compact.isFloorOnly && <span className="badge badge-warning w-fit">Sin puesto (solo piso)</span>}
          </div>
          <div className="rounded-xl border border-line bg-canvas/60 p-3 grid gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted inline-flex items-center gap-1">
              <IconUser size={12} /> Usuario asignado
            </span>
            {userDisplay
              ? <span className="badge badge-success w-fit max-w-full truncate" title={userDisplay}>{userDisplay}</span>
              : <span className="badge w-fit">Sin asignar — equipo disponible</span>}
            <span className="text-xs text-muted">{asset._userId != null ? `GLPI user_id ${asset._userId}` : "Sin user_id en GLPI"}</span>
          </div>
        </div>
        <div className="text-xs text-muted tabular-nums">
          Inv. <b className="text-ink">{disp(asset.otherserial)}</b> · Serie {disp(asset.serial)}{asset._model ? ` · ${disp(asset._model)}` : ""}
        </div>
      </section>

      {/* C. Pestañas */}
      <section aria-label="Operaciones del equipo" className="grid gap-0">
        <Tabs
          ariaLabel="Operaciones del equipo"
          value={tab}
          onChange={(id) => setTab(id as "ubic" | "user")}
          tabs={[
            { id: "ubic", label: "Ubicación", icon: <IconBuilding size={14} /> },
            { id: "user", label: "Usuario", icon: <IconUser size={14} /> },
          ]}
        />
        <div className="border border-t-0 border-line rounded-b-xl p-3 sm:p-4 grid gap-3 bg-white" role="tabpanel" aria-label={tab === "ubic" ? "Ubicación" : "Usuario"}>
          {tab === "ubic" && (
            <>
              {canEdit ? (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-ink" htmlFor="asset-piso">Piso (con mapa)</label>
                    <select
                      id="asset-piso"
                      className="input text-sm"
                      value={pisoPick}
                      disabled={busy || floorsLoading}
                      onChange={(e) => { setPisoPick(e.target.value); setLocPick(""); }}
                    >
                      <option value="">{floorsLoading ? "Cargando pisos…" : "Elegir piso…"}</option>
                      {pisos.map((f) => (
                        <option key={f.id} value={String(f.glpiLocationId)}>{f.name} (id {f.glpiLocationId})</option>
                      ))}
                    </select>
                    {floorsMsg && <p className="text-xs text-danger" role="alert">{floorsMsg}</p>}
                  </div>
                  <SearchCombobox
                    id="asset-puesto"
                    label="Puesto destino"
                    placeholder={pisoPick ? "Escribí para filtrar puestos…" : "Primero elegí un piso…"}
                    options={puestoOptions}
                    value={locPick}
                    onSelect={setLocPick}
                    disabled={busy || !pisoPick}
                    loading={false}
                    error={undefined}
                    emptyText={puestosDelPiso.length ? "Sin coincidencias para ese filtro." : "Este piso aún no tiene puestos cargados en GLPI."}
                    filterHint={pisoPick ? `${puestosDelPiso.length} puesto(s) en este piso.` : undefined}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <BusyButton
                      className="btn btn-primary text-sm flex-1 sm:flex-none sm:min-w-[160px]"
                      busy={opBusy === "move"}
                      disabled={busy || !locPick}
                      onClick={() => setConfirm({ kind: "move" })}
                    >
                      Mover aquí
                    </BusyButton>
                    {asset._locationId != null && (
                      <button className="btn btn-danger-outline text-sm" disabled={busy || !!opBusy} onClick={() => setConfirm({ kind: "unlinkLoc" })}>
                        {opBusy === "unlinkLoc" ? "Quitando…" : "Desvincular del puesto"}
                      </button>
                    )}
                  </div>
                  {locMsg && <p className="text-xs text-muted" role="status">{locMsg}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted">Solo lectura. La ubicación se edita con perfil operador.</p>
              )}
            </>
          )}

          {tab === "user" && (
            <>
              <div className="text-sm flex items-center gap-2 flex-wrap">
                <span className="text-muted">Actual:</span>
                {userDisplay ? <b className="text-ink">{userDisplay}</b> : <span className="badge">Sin asignar</span>}
              </div>
              {canEdit ? (
                <div className="grid gap-2">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-ink" htmlFor="asset-user-q">Buscar usuario GLPI</label>
                    <div className="flex gap-2">
                      <input
                        id="asset-user-q"
                        aria-label="Buscar persona por nombre, apellido o usuario GLPI"
                        className="input flex-1 text-sm"
                        placeholder="Nombre, apellido o usuario…"
                        value={pq}
                        disabled={busy}
                        onChange={(e) => setPq(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchPerson()}
                      />
                      <button className="btn btn-secondary text-sm shrink-0 tap-target" disabled={busy} onClick={() => searchPerson()}>
                        Buscar
                      </button>
                    </div>
                  </div>
                  {pmsg && <p className="text-xs text-muted" role="status">{pmsg}</p>}
                  <ul className="grid gap-1.5 max-h-[240px] overflow-y-auto pr-0.5" aria-label="Resultados de usuarios">
                    {presults.map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl px-3 py-2 min-h-[52px]">
                        <span className="truncate min-w-0" title={`${u.display} #${u.id}`}>{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
                        <button className="btn btn-secondary text-xs shrink-0" disabled={busy || !!opBusy} onClick={() => setConfirm({ kind: "assignUser", payload: u })}>
                          {opBusy === `assign:${u.id}` ? "Asignando…" : "Asignar"}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {hasUser && (
                    <button className="btn btn-danger-outline text-sm w-fit" disabled={busy || !!opBusy} onClick={() => setConfirm({ kind: "unlinkUser" })}>
                      {opBusy === "unlinkUser" ? "Quitando…" : "Quitar usuario (conserva puesto)"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">Solo lectura. El usuario se edita con perfil operador.</p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Confirmaciones explícitas */}
      {confirm?.kind === "move" && (
        <ConfirmDialog
          title="Confirmar movimiento"
          body={<><span>Mover <b className="text-ink">{asset._type} {asset.otherserial || asset.name}</b> al puesto <b className="text-ink">{destName}</b>.</span>{userDisplay && <span>Conservará su usuario ({userDisplay}).</span>}</>}
          confirmLabel="Mover equipo"
          busy={opBusy === "move"}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); execMove(); }}
        />
      )}
      {confirm?.kind === "unlinkLoc" && (
        <ConfirmDialog
          title="Desvincular del puesto"
          body={<><span>Sacar <b className="text-ink">{asset._type} {asset.otherserial || asset.name}</b> del puesto <b className="text-ink">{locName || asset._locationId}</b>.</span><span>Conservará su usuario{userDisplay ? ` (${userDisplay})` : ""}.</span></>}
          confirmLabel="Desvincular"
          danger
          busy={opBusy === "unlinkLoc"}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); execUnlinkLoc(); }}
        />
      )}
      {confirm?.kind === "assignUser" && (
        <ConfirmDialog
          title="Asignar usuario"
          body={<><span>Asignar <b className="text-ink">{asset._type} {asset.otherserial || asset.name}</b> a <b className="text-ink">{confirm.payload.display}</b>.</span>{locName ? <span>Conservará el puesto {locName}.</span> : <span>Quedará sin puesto (conserva ubicación actual).</span>}</>}
          confirmLabel="Asignar"
          busy={!!opBusy}
          onClose={() => setConfirm(null)}
          onConfirm={() => { const u = confirm.payload; setConfirm(null); execAssignUser(u); }}
        />
      )}
      {confirm?.kind === "unlinkUser" && (
        <ConfirmDialog
          title="Quitar usuario"
          body={<><span>Quitar a <b className="text-ink">{userDisplay}</b> como usuario de <b className="text-ink">{asset._type} {asset.otherserial || asset.name}</b>.</span><span>El equipo conservará su puesto.</span></>}
          confirmLabel="Quitar usuario"
          danger
          busy={opBusy === "unlinkUser"}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); execUnlinkUser(); }}
        />
      )}
      {confirm?.kind === "close" && (
        <ConfirmDialog
          title="Cerrar sin guardar"
          body={<span>Hay una selección o búsqueda sin aplicar. Se perderá si cerrás ahora.</span>}
          confirmLabel="Cerrar igual"
          cancelLabel="Seguir editando"
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); onClose(); }}
        />
      )}

      {/* Cierre accesible dentro del contenido (además del header del panel) */}
      <div className="flex justify-end">
        <button className="btn btn-secondary text-sm" onClick={requestClose}>Cerrar detalle</button>
      </div>
    </div>
  );
}
