"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { comparePisos, formatLocationDisplay } from "@/lib/location-display";
import { AdminSection, ConfirmDialog, SearchCombobox, BusyButton, CopyButton, decodeEntities } from "./ui";
import { IconBuilding, IconUser } from "./icons";

type Asset = any;
type Person = { id: number; display: string };
type FloorRef = { id: string; name: string; glpiLocationId: number | null };

const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

/**
 * Detalle de equipo para SidePanel: consulta primero, administración después.
 * - Información general / Ubicación actual / Usuario asignado siempre visibles.
 * - "Administrar equipo" (acordeón cerrado, solo operadores): cambiar ubicación,
 *   modificar usuario, desvincular puesto, quitar usuario. Sin tabs.
 * Pisos = floors.json vía /api/maps; puestos = hijos GLPI del piso.
 */
export default function AssetEditModal({
  asset,
  byId,
  childrenOf,
  canEdit,
  onSaved,
  onDirtyChange,
  onOpenUser,
}: {
  asset: Asset;
  byId: Map<number, any>;
  childrenOf?: Map<number | null, any[]>;
  canEdit: boolean;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenUser?: (userId: number) => Promise<boolean>;
}) {
  const [adminView, setAdminView] = useState<"menu" | "move" | "user">("menu");
  const [locPick, setLocPick] = useState("");
  const [pisoPick, setPisoPick] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<Person[]>([]);
  const [pmsg, setPmsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [opBusy, setOpBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [userNavBusy, setUserNavBusy] = useState(false);
  const [userNavMsg, setUserNavMsg] = useState("");
  const [confirm, setConfirm] = useState<null | { kind: "move" | "unlinkLoc" | "assignUser" | "unlinkUser"; payload?: any }>(null);
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
    if (ok) { setLocPick(""); setAdminView("menu"); onSaved(); }
  }

  async function execUnlinkLoc() {
    if (asset._locationId == null) return;
    setOpBusy("unlinkLoc");
    setLocMsg("Quitando del puesto…");
    const ok = await apiPatch({ location_id: null });
    setOpBusy(null);
    if (ok) { setLocPick(""); setAdminView("menu"); onSaved(); }
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
    if (ok) { setPq(""); setPresults([]); setPmsg(""); setAdminView("menu"); onSaved(); }
  }

  async function execUnlinkUser() {
    if (!hasUser) return;
    setOpBusy("unlinkUser");
    const ok = await apiPatch({ user_id: null });
    setOpBusy(null);
    if (ok) onSaved();
  }

  async function goToUser() {
    if (!onOpenUser || asset._userId == null) return;
    setUserNavBusy(true);
    setUserNavMsg("");
    const ok = await onOpenUser(Number(asset._userId));
    setUserNavBusy(false);
    if (!ok) setUserNavMsg("No se pudo abrir la ficha de esa persona.");
  }

  const destName = locPick ? (byId.get(Number(locPick))?.name || `puesto ${locPick}`) : "";
  const estado = asset.states_id != null && String(asset.states_id) !== "" && String(asset.states_id) !== "—" ? String(asset.states_id) : null;

  return (
    <div className="grid gap-3">
      {err && <p className="text-sm text-danger card p-3 toast-err border" role="alert">{err}</p>}

      {/* 1. Información general */}
      <section aria-label="Información general del equipo" className="grid gap-1.5">
        <h3 className="section-h">Información general</h3>
        <dl className="info-card">
          <div className="info-row"><dt>Tipo</dt><dd>{disp(asset._type)}</dd></div>
          <div className="info-row"><dt>Nombre</dt><dd className="font-semibold"><span className="copy-wrap"><span>{decodeEntities(disp(asset.name))}</span><CopyButton value={String(asset.name ?? "")} label="nombre del equipo" /></span></dd></div>
          <div className="info-row"><dt>Inventario</dt><dd className="tabular-nums font-semibold"><span className="copy-wrap"><span>{disp(asset.otherserial)}</span><CopyButton value={String(asset.otherserial ?? "")} label="número de inventario" /></span></dd></div>
          <div className="info-row"><dt>Serie</dt><dd className="tabular-nums"><span className="copy-wrap"><span>{disp(asset.serial)}</span><CopyButton value={String(asset.serial ?? "")} label="número de serie" /></span></dd></div>
          {asset._model && <div className="info-row"><dt>Modelo</dt><dd>{decodeEntities(disp(asset._model))}</dd></div>}
          {asset._manufacturer && <div className="info-row"><dt>Fabricante</dt><dd>{decodeEntities(disp(asset._manufacturer))}</dd></div>}
          {estado && <div className="info-row"><dt>Estado</dt><dd>{decodeEntities(estado)}</dd></div>}
        </dl>
      </section>

      {/* 2. Ubicación actual */}
      <section aria-label="Ubicación actual del equipo" className="grid gap-1.5">
        <h3 className="section-h">Ubicación actual</h3>
        <div className="info-card info-card-highlight grid gap-1 py-2.5">
          <span className="min-w-0" title={compact.full}>
            <span className="font-semibold text-ink block truncate">{compact.primary}</span>
            {compact.secondary && <span className="text-muted text-xs block truncate">{compact.secondary}</span>}
          </span>
          {!hasLoc && <span className="badge badge-warning w-fit">Sin ubicación — sin puesto asignado</span>}
          {hasLoc && compact.isFloorOnly && <span className="badge badge-warning w-fit">Sin puesto (solo piso)</span>}
        </div>
      </section>

      {/* 3. Usuario asignado */}
      <section aria-label="Usuario asignado al equipo" className="grid gap-1.5">
        <h3 className="section-h">Usuario asignado</h3>
        <div className="info-card grid gap-1.5 py-2.5">
          {userDisplay ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="min-w-0">
                <b className="block text-ink truncate" title={decodeEntities(userDisplay)}>{decodeEntities(userDisplay)}</b>
                {hasUser && <span className="block text-xs text-muted tabular-nums">GLPI user_id {asset._userId}</span>}
              </span>
              {hasUser && onOpenUser && (
                <button className="btn btn-secondary text-xs shrink-0" onClick={goToUser} disabled={userNavBusy}>
                  {userNavBusy ? "Abriendo…" : "Ver ficha →"}
                </button>
              )}
            </div>
          ) : (
            <span className="badge w-fit">Sin asignar — equipo disponible</span>
          )}
          {userNavMsg && <p className="text-xs text-muted" role="status">{userNavMsg}</p>}
        </div>
      </section>

      {/* 4. Administración (secundaria, cerrada, solo operadores).
          Sin permiso la sección se oculta por completo, sin avisos. */}
      {canEdit && (
        <AdminSection title="Administrar equipo" hint="Cambiar ubicación o usuario">
          {adminView === "menu" && (
            <div className="grid gap-1.5" role="list">
              <button className="admin-action" onClick={() => { setAdminView("move"); setLocMsg(""); }} role="listitem">
                <span className="admin-ic" aria-hidden="true"><IconBuilding size={15} /></span>
                <span className="min-w-0 flex-1"><b className="block text-ink">Cambiar ubicación</b><span className="block text-xs text-muted">Mover a otro puesto</span></span>
                <span className="text-muted" aria-hidden="true">›</span>
              </button>
              <button className="admin-action" onClick={() => { setAdminView("user"); setPmsg(""); }} role="listitem">
                <span className="admin-ic" aria-hidden="true"><IconUser size={15} /></span>
                <span className="min-w-0 flex-1"><b className="block text-ink">Modificar usuario</b><span className="block text-xs text-muted">Asignar a otra persona</span></span>
                <span className="text-muted" aria-hidden="true">›</span>
              </button>
              {asset._locationId != null && (
                <button className="admin-action admin-action-danger" disabled={!!opBusy} onClick={() => setConfirm({ kind: "unlinkLoc" })}>
                  <span className="admin-ic" aria-hidden="true">⿻</span>
                  <span className="min-w-0 flex-1"><b className="block text-ink">Desvincular del puesto</b><span className="block text-xs text-muted">Conserva el usuario asignado</span></span>
                </button>
              )}
              {hasUser && (
                <button className="admin-action admin-action-danger" disabled={!!opBusy} onClick={() => setConfirm({ kind: "unlinkUser" })}>
                  <span className="admin-ic" aria-hidden="true">○</span>
                  <span className="min-w-0 flex-1"><b className="block text-ink">Quitar usuario</b><span className="block text-xs text-muted">Conserva el puesto</span></span>
                </button>
              )}
              {(opBusy === "unlinkLoc" || opBusy === "unlinkUser") && <p className="text-xs text-muted" role="status">Procesando…</p>}
            </div>
          )}

          {adminView === "move" && (
            <div className="grid gap-2.5">
              <button className="text-xs text-muted underline w-fit" onClick={() => setAdminView("menu")}>← Volver a opciones</button>
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
              <BusyButton
                className="btn btn-primary text-sm w-fit min-w-[160px]"
                busy={opBusy === "move"}
                disabled={busy || !locPick}
                onClick={() => setConfirm({ kind: "move" })}
              >
                Mover aquí
              </BusyButton>
              {locMsg && <p className="text-xs text-muted" role="status">{locMsg}</p>}
            </div>
          )}

          {adminView === "user" && (
            <div className="grid gap-2">
              <button className="text-xs text-muted underline w-fit" onClick={() => setAdminView("menu")}>← Volver a opciones</button>
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-ink" htmlFor="asset-user-q">Buscar usuario GLPI</label>
                <div className="flex gap-2">
                  <input
                    id="asset-user-q"
                    aria-label="Buscar persona por nombre, apellido o usuario GLPI"
                    className="input flex-1 text-sm min-w-0"
                    placeholder="Nombre, apellido o usuario…"
                    value={pq}
                    disabled={busy}
                    onChange={(e) => setPq(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchPerson()}
                  />
                  <button className="btn btn-secondary text-sm shrink-0" disabled={busy} onClick={() => searchPerson()}>
                    Buscar
                  </button>
                </div>
              </div>
              {pmsg && <p className="text-xs text-muted" role="status">{pmsg}</p>}
              <ul className="grid gap-1.5 max-h-[240px] overflow-y-auto pr-0.5" aria-label="Resultados de usuarios">
                {presults.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl bg-white px-3 py-2 min-h-[52px]">
                    <span className="truncate min-w-0" title={`${u.display} #${u.id}`}>{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
                    <button className="btn btn-secondary text-xs shrink-0" disabled={busy || !!opBusy} onClick={() => setConfirm({ kind: "assignUser", payload: u })}>
                      {opBusy === `assign:${u.id}` ? "Asignando…" : "Asignar"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AdminSection>
      )}

      {/* Confirmaciones explícitas: sin cambios hasta confirmar */}
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
    </div>
  );
}
