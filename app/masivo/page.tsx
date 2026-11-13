"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import BatchScanModal from "@/components/BatchScanModal";
import AuthModal from "@/components/AuthModal";
import { useLocations } from "@/components/Places";
import { inventoryVariants, parseGlpiUrl } from "@/lib/inventory";
import { comparePisos, formatLocationDisplay } from "@/lib/location-display";
import { Spinner, TypeIcon, SearchCombobox, ConfirmDialog } from "@/components/ui";
import { IconUser } from "@/components/icons";

type Asset = any;
type AuthUser = { login: string; name: string; profiles: string[]; canOperate: boolean };
type FloorRef = { id: string; name: string; glpiLocationId: number | null };
type RowStatus =
  | "buscando"
  | "listo"
  | "duplicado"
  | "ya-ahi"
  | "no-encontrado"
  | "error"
  | "moviendo"
  | "movido"
  | "fallo";
type Row = {
  uid: number;
  code: string;
  status: RowStatus;
  asset?: Asset;
  note?: string;
};

type ConfirmState = null | { kind: "move" } | { kind: "clear" };

const disp = (v: any) => (v == null || v === "" ? "—" : String(v));
let uidSeq = 1;

const STATUS_META: Record<RowStatus, { label: string; cls: string; title: string }> = {
  buscando: { label: "Buscando…", cls: "", title: "Buscando el bien en GLPI" },
  listo: { label: "Listo", cls: "badge-success", title: "Validado, pendiente de mover" },
  duplicado: { label: "Duplicado", cls: "badge-warning", title: "Ya está en la lista (mismo bien, otro código)" },
  "ya-ahi": { label: "Ya está ahí", cls: "", title: "El bien ya está en el puesto destino" },
  "no-encontrado": { label: "No existe", cls: "badge-danger", title: "Sin coincidencias en GLPI" },
  error: { label: "Error", cls: "badge-danger", title: "Error de red o de GLPI" },
  moviendo: { label: "Moviendo…", cls: "", title: "Moviendo en este momento" },
  movido: { label: "Movido ✓", cls: "badge-success", title: "Movimiento confirmado por GLPI" },
  fallo: { label: "Falló", cls: "badge-danger", title: "GLPI rechazó el movimiento" },
};

function StatusBadge({ status, note }: { status: RowStatus; note?: string }) {
  if (status === "buscando") return <Spinner label="Buscando…" />;
  if (status === "moviendo") return <Spinner label="Moviendo…" />;
  const m = STATUS_META[status];
  return <span className={`badge ${m.cls}`} title={note || m.title}>{m.label}</span>;
}

export default function Masivo() {
  const { byId, childrenOf } = useLocations();
  const [pisoPick, setPisoPick] = useState("");
  const [destLocId, setDestLocId] = useState("");
  const [floors, setFloors] = useState<FloorRef[]>([]);
  const [floorsMsg, setFloorsMsg] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const manualRef = useRef<HTMLInputElement>(null);

  // ---- auth (mismo patrón que /buscar) ----
  useEffect(() => {
    const syncAuth = () => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((j) => {
          if (j.authenticated)
            setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate });
          else setAuthUser(null);
        })
        .catch(() => {})
        .finally(() => setAuthChecked(true));
    };
    syncAuth();
    window.addEventListener("auth-changed", syncAuth);
    return () => window.removeEventListener("auth-changed", syncAuth);
  }, []);

  const requireEdit = (action: () => void) => {
    if (authUser?.canOperate) {
      action();
      return;
    }
    pendingAction.current = action;
    setAuthOpen(true);
  };

  // ---- pisos con mapa + puestos hijos ----
  useEffect(() => {
    fetch("/api/maps")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j?.floors)) {
          setFloors(
            j.floors
              .filter((f: any) => f && f.glpiLocationId != null)
              .map((f: any) => ({ id: String(f.id), name: String(f.name || f.id), glpiLocationId: Number(f.glpiLocationId) }))
          );
          setFloorsMsg("");
        } else setFloorsMsg("No se pudo cargar la lista de pisos.");
      })
      .catch(() => setFloorsMsg("No se pudo cargar la lista de pisos."));
  }, []);

  const pisos = useMemo(() => {
    const only = floors.filter((f) => Number.isFinite(f.glpiLocationId as number));
    only.sort((a, b) => comparePisos(a.name, b.name));
    return only;
  }, [floors]);

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

  const puestosDelPiso = useMemo(() => {
    if (!pisoPick) return [];
    const arr = kidsOf.get(Number(pisoPick)) || [];
    return [...arr].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  }, [kidsOf, pisoPick]);

  const puestoOptions = useMemo(
    () =>
      puestosDelPiso.map((l: any) => ({
        value: String(l.id),
        label: String(l.name || `Puesto ${l.id}`),
        hint: `${l.room ? `Int. ${l.room} · ` : ""}id ${l.id}`,
      })),
    [puestosDelPiso]
  );

  const destLoc = destLocId ? byId.get(Number(destLocId)) : null;
  const destName = destLoc
    ? formatLocationDisplay(Number(destLocId), byId as any, String((destLoc as any).name || "")).primary
    : destLocId
      ? `puesto ${destLocId}`
      : "";
  const destFloorName = useMemo(() => {
    const pid = (destLoc as any)?.parentId;
    if (pid == null) return "";
    return pisos.find((f) => Number(f.glpiLocationId) === Number(pid))?.name || "";
  }, [destLoc, pisos]);

  // ---- lookup de un código (misma lógica que /buscar) ----
  async function lookup(code: string): Promise<Asset | null> {
    const parsed = parseGlpiUrl(code);
    if (parsed) {
      const r = await fetch(`/api/glpi?type=${encodeURIComponent(parsed.type)}&id=${parsed.id}`);
      const j = await r.json();
      return r.ok ? j.item : null;
    }
    const s = await fetch(`/api/glpi?q=${encodeURIComponent(code.trim())}&type=all`).then((r) => r.json());
    const list: Asset[] = s.items || [];
    if (!list.length) return null;
    const variants = new Set(inventoryVariants(code).map((v) => v.toUpperCase()));
    return list.find((it) => variants.has(String(it.otherserial || "").trim().toUpperCase())) || list[0];
  }

  function addCode(raw: string) {
    const code = (raw || "").trim();
    if (!code || busy) return;
    // Duplicado por código crudo (insensible a mayúsculas/espacios).
    const norm = code.toUpperCase();
    if (rows.some((r) => r.code.toUpperCase() === norm)) {
      window.dispatchEvent(new Event("batch-scan-dup"));
      setMsg(`Duplicado: "${code}" ya está en la lista.`);
      return;
    }
    const uid = uidSeq++;
    setRows((prev) => [...prev, { uid, code, status: "buscando" }]);
    setMsg("");
    setResult("");
    // Scroll suave al final de la lista en móvil.
    setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    lookup(code)
      .then((found) => {
        if (!found) {
          setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, status: "no-encontrado" as RowStatus } : r)));
          return;
        }
        setRows((prev) => {
          // Duplicado por bien (distinto código, mismo bien).
          const key = `${found._type}-${found.id}`;
          const dup = prev.some((r) => r.uid !== uid && r.asset && `${r.asset._type}-${r.asset.id}` === key);
          if (dup) {
            window.dispatchEvent(new Event("batch-scan-dup"));
            return prev.map((r) => (r.uid === uid ? { ...r, status: "duplicado" as RowStatus, asset: found } : r));
          }
          const dest = destLocId ? Number(destLocId) : null;
          if (dest != null && found._locationId === dest) {
            return prev.map((r) => (r.uid === uid ? { ...r, status: "ya-ahi" as RowStatus, asset: found } : r));
          }
          return prev.map((r) => (r.uid === uid ? { ...r, status: "listo" as RowStatus, asset: found } : r));
        });
      })
      .catch((e: any) => {
        setRows((prev) =>
          prev.map((r) => (r.uid === uid ? { ...r, status: "error" as RowStatus, note: e?.message || "Error de red" } : r))
        );
      });
  }

  // Si cambia el destino, recalcula "ya-ahí" sobre filas listas.
  useEffect(() => {
    if (!destLocId) return;
    const dest = Number(destLocId);
    setRows((prev) =>
      prev.map((r) => {
        if (!r.asset) return r;
        if (r.status === "movido" || r.status === "moviendo" || r.status === "fallo") return r;
        if (r.asset._locationId === dest) return { ...r, status: "ya-ahi" as RowStatus };
        if (r.status === "ya-ahi") return { ...r, status: "listo" as RowStatus };
        return r;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destLocId]);

  const readyRows = rows.filter((r) => r.status === "listo");
  const readyWithUser = useMemo(() => readyRows.filter((r) => r.asset?._userId != null).length, [readyRows]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of readyRows) {
      const t = String(r.asset?._type || "?");
      m.set(t, (m.get(t) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [readyRows]);

  const removeRow = (uid: number) => {
    if (busy) return;
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  };

  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const clearAll = () => {
    if (busy || !rows.length) return;
    setRows([]);
    setResult("");
    setMsg("");
    setProgress(null);
    setConfirmState(null);
  };

  const clearMoved = () => {
    setRows((prev) => prev.filter((r) => r.status !== "movido" && r.status !== "ya-ahi"));
    setResult("");
  };

  async function doConfirm() {
    const dest = Number(destLocId);
    if (!Number.isFinite(dest) || dest <= 0) {
      setMsg("Elegí el puesto destino antes de confirmar.");
      setConfirmState(null);
      return;
    }
    const targets = rows.filter((r) => r.status === "listo");
    if (!targets.length) {
      setMsg("No hay equipos listos para mover (revisá duplicados / no encontrados).");
      setConfirmState(null);
      return;
    }
    setConfirmState(null);
    setBusy(true);
    setResult("");
    setProgress({ done: 0, total: targets.length });
    let ok = 0;
    const fails: string[] = [];
    // Marcar como moviendo
    const ids = new Set(targets.map((r) => r.uid));
    setRows((prev) => prev.map((r) => (ids.has(r.uid) ? { ...r, status: "moviendo" as RowStatus } : r)));
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      try {
        const resp = await fetch("/api/glpi", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: r.asset._type, id: r.asset.id, location_id: dest }),
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(j.error || `HTTP ${resp.status}`);
        ok++;
        setRows((prev) => prev.map((x) => (x.uid === r.uid ? { ...x, status: "movido" as RowStatus } : x)));
      } catch (e: any) {
        const m = e?.message || "Error";
        fails.push(`${r.asset?._type} ${r.asset?.otherserial || r.code}: ${m}`);
        setRows((prev) => prev.map((x) => (x.uid === r.uid ? { ...x, status: "fallo" as RowStatus, note: m } : x)));
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    setBusy(false);
    setResult(
      fails.length
        ? `Listo: ${ok}/${targets.length} movidos. Fallaron ${fails.length}: ${fails.slice(0, 3).join(" · ")}${fails.length > 3 ? "…" : ""}`
        : `Movimiento completo: ${ok}/${targets.length} equipos a ${destName}.`
    );
  }

  const confirmDisabled = busy || !destLocId || !readyRows.length;
  const canOperate = !!authUser?.canOperate;

  if (!authChecked) {
    return (
      <div className="grid gap-4">
        <div className="page-header">
          <h1>Movimiento masivo</h1>
          <p>Verificando permisos…</p>
        </div>
        <Spinner label="Verificando sesión…" />
      </div>
    );
  }

  if (!canOperate) {
    return (
      <div className="grid gap-4">
        <div className="page-header">
          <h1>Movimiento masivo 🔒</h1>
          <p>Acceso restringido a usuarios con permiso de edición.</p>
        </div>
        <div className="card p-6 grid gap-3 text-center max-w-[480px] mx-auto w-full">
          <span className="text-4xl" aria-hidden="true">
            🔒
          </span>
          <b className="text-ink">
            {authUser ? `Sesión como ${authUser.login} sin permiso de edición` : "Iniciá sesión para continuar"}
          </b>
          <p className="text-sm text-muted">
            El movimiento masivo mueve bienes en GLPI y queda registrado en Actividad. Requiere un perfil operador
            (Super-Admin/Admin según <span className="tabular-nums">GLPI_OPERATOR_PROFILES</span>).
          </p>
          <button className="btn btn-primary text-sm mx-auto" onClick={() => setAuthOpen(true)}>
            {authUser ? "Cambiar de usuario" : "Iniciar sesión"}
          </button>
        </div>
        {authOpen && (
          <AuthModal
            open={authOpen}
            onClose={() => {
              setAuthOpen(false);
              pendingAction.current = null;
            }}
            onSuccess={() => {
              fetch("/api/auth/me")
                .then((r) => r.json())
                .then((j) => {
                  if (j.authenticated)
                    setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate });
                })
                .catch(() => {});
              window.dispatchEvent(new Event("auth-changed"));
              const a = pendingAction.current;
              pendingAction.current = null;
              setAuthOpen(false);
              if (a) a();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="page-header">
        <h1>Movimiento masivo</h1>
        <p>Elegí el puesto destino, escaneá etiquetas en ráfaga (la cámara no se cierra) y confirmá todo junto al pie.</p>
      </div>

      {/* Destino */}
      <section aria-label="Puesto destino" className="card p-3 sm:p-4 grid gap-2.5">
        <h2 className="font-bold text-ink">1 · Puesto destino</h2>
        {destLocId ? (
          <div className="info-card info-card-highlight grid gap-1 py-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="min-w-0">
                <span className="block text-xs text-muted font-semibold uppercase tracking-wide">Destino</span>
                <b className="block text-ink truncate" title={`${destName} (id ${destLocId})`}>{destName}</b>
                <span className="block text-xs text-muted tabular-nums">id {destLocId} · {readyRows.length} equipo(s) listo(s)</span>
              </span>
              <button className="btn btn-secondary text-xs shrink-0" disabled={busy} onClick={() => setDestLocId("")}>Cambiar</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-ink" htmlFor="masivo-piso">
                Piso (con mapa)
              </label>
              <select
                id="masivo-piso"
                className="input text-sm"
                value={pisoPick}
                disabled={busy}
                onChange={(e) => {
                  setPisoPick(e.target.value);
                  setDestLocId("");
                }}
              >
                <option value="">Elegir piso…</option>
                {pisos.map((f) => (
                  <option key={f.id} value={String(f.glpiLocationId)}>
                    {f.name} (id {f.glpiLocationId})
                  </option>
                ))}
              </select>
            </div>
            {floorsMsg && (
              <p className="text-xs text-danger" role="alert">
                {floorsMsg}
              </p>
            )}
            <SearchCombobox
              id="masivo-puesto"
              label="Puesto destino"
              placeholder={pisoPick ? "Escribí para filtrar puestos…" : "Primero elegí un piso…"}
              options={puestoOptions}
              value={destLocId}
              onSelect={setDestLocId}
              disabled={busy || !pisoPick}
              loading={false}
              emptyText={puestosDelPiso.length ? "Sin coincidencias para ese filtro." : "Este piso aún no tiene puestos cargados en GLPI."}
              filterHint={pisoPick ? `${puestosDelPiso.length} puesto(s) en este piso.` : undefined}
            />
          </div>
        )}
      </section>

      {/* Escaneo */}
      <section aria-label="Escaneo en ráfaga" className="card p-3 sm:p-4 grid gap-2.5">
        <h2 className="font-bold text-ink">2 · Escaneá en ráfaga</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <button className="btn btn-primary text-sm tap-target min-w-[160px]" disabled={busy} onClick={() => setScanOpen(true)}>
            📷 Escanear
          </button>
          <span className="text-xs text-muted">La cámara no se cierra sola; el destello verde confirma cada lectura.</span>
        </div>
        {scanOpen && (
          <BatchScanModal
            title={`Escanear en ráfaga${destName ? ` → ${destName}` : ""}`}
            onScan={addCode}
            onClose={() => setScanOpen(false)}
            paused={busy}
          />
        )}
        <div className="flex gap-2">
          <input
            ref={manualRef}
            className="input flex-1 text-sm min-w-0"
            placeholder="Inventario manual o QR: 0000012865, A 0001-0537, URL GLPI…"
            value={manual}
            disabled={busy}
            aria-label="Inventario manual, QR o URL GLPI"
            enterKeyHint="done"
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) {
                addCode(manual);
                setManual("");
              }
            }}
          />
          <button
            className="btn btn-secondary text-sm tap-target shrink-0"
            disabled={busy || !manual.trim()}
            onClick={() => {
              addCode(manual);
              setManual("");
              requestAnimationFrame(() => manualRef.current?.focus());
            }}
          >
            Agregar
          </button>
        </div>
        {msg && (
          <p className="text-xs text-muted" role="status">
            {msg}
          </p>
        )}
      </section>

      {/* Lista */}
      <section aria-label="Equipos escaneados" className="card p-3 sm:p-4 grid gap-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-ink">3 · Lista ({rows.length})</h2>
          {rows.length > 0 && (
            <button className="btn btn-secondary text-xs" disabled={busy} onClick={() => setConfirmState({ kind: "clear" })}>
              Limpiar lista
            </button>
          )}
        </div>

        {counts.length > 0 && (
          <div className="flex gap-1.5 flex-wrap" role="status" aria-label="Recuento por tipo">
            {counts.map(([t, n]) => (
              <span key={t} className="badge badge-brand tabular-nums">
                <TypeIcon type={t} /> {t} ×{n}
              </span>
            ))}
            <span className="badge tabular-nums">Total listos: {readyRows.length}</span>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted">Todavía no escaneaste nada. Cada lectura suma un renglón con su estado.</p>
        ) : (
          <>
            <div className="table-scroll hidden md:block" tabIndex={0} aria-label="Equipos escaneados en tabla">
              <table className="table-dense min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Inventario</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Ubicación actual</th>
                    <th scope="col">Estado</th>
                    <th scope="col"><span className="sr-only">Quitar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = r.asset;
                    const loc = a
                      ? formatLocationDisplay(a._locationId, byId as any, a._locationName != null ? String(a._locationName) : null)
                          .primary
                      : "—";
                    return (
                      <tr key={r.uid}>
                        <td className="tabular-nums text-xs max-w-[160px] truncate" title={r.code}>
                          {r.code}
                        </td>
                        <td>
                          {a ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                              <TypeIcon type={a._type} />
                              <b>{a._type}</b>
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="tabular-nums font-semibold">{a ? disp(a.otherserial) : "—"}</td>
                        <td className="max-w-[180px]">
                          <span className="block truncate" title={a ? disp(a.name) : ""}>
                            {a ? disp(a.name) : "—"}
                          </span>
                          {a?._userId != null && (
                            <span className="inline-flex items-center gap-1 mt-0.5 min-w-0" title={`Con usuario asignado: ${a._userName && a._userName !== "—" ? disp(a._userName) : `#${a._userId}`}`}>
                              <span className="badge badge-success shrink-0"><span className="inline-flex items-center gap-1"><IconUser size={11} /> Con usuario</span></span>
                              <span className="truncate text-xs text-muted">{a._userName && a._userName !== "—" ? disp(a._userName) : `Usuario #${a._userId}`}</span>
                            </span>
                          )}
                        </td>
                        <td className="text-xs max-w-[160px] truncate" title={loc}>
                          {loc}
                        </td>
                        <td>
                          <StatusBadge status={r.status} note={r.note} />
                        </td>
                        <td>
                          {!busy && r.status !== "movido" && (
                            <button
                              className="btn btn-secondary text-xs !min-h-[36px]"
                              onClick={() => removeRow(r.uid)}
                              aria-label={`Quitar ${r.code} de la lista`}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 md:hidden" role="list" aria-label="Equipos escaneados">
              {rows.map((r) => {
                const a = r.asset;
                const loc = a
                  ? formatLocationDisplay(a._locationId, byId as any, a._locationName != null ? String(a._locationName) : null)
                      .primary
                  : "—";
                return (
                  <article key={r.uid} className="card asset-card" role="listitem">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas border border-line" aria-hidden="true">
                        {a ? <TypeIcon type={a._type} /> : <span className="text-muted text-xs">?</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2 min-w-0">
                          <b className="text-ink truncate text-[0.95rem]" title={a ? disp(a.name) : r.code}>{a ? disp(a.name) : r.code}</b>
                          {a && <span className="tabular-nums text-[0.8rem] font-bold text-ink shrink-0">#{disp(a.otherserial)}</span>}
                        </span>
                        <span className="block text-xs text-muted truncate tabular-nums" title={r.code}>{r.code}</span>
                      </span>
                      {!busy && r.status !== "movido" && (
                        <button className="btn btn-secondary icon-btn shrink-0" onClick={() => removeRow(r.uid)} aria-label={`Quitar ${r.code} de la lista`}>✕</button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-11 min-w-0 flex-wrap">
                      <StatusBadge status={r.status} note={r.note} />
                      {a ? (
                        <span className="text-xs text-muted truncate min-w-0" title={loc}>{a._type} · {loc}</span>
                      ) : (
                        <span className="text-xs text-muted">Sin datos de GLPI</span>
                      )}
                    </div>
                      {a?._userId != null && (
                        <span className="pl-11 inline-flex items-center gap-1.5 min-w-0" title={`Con usuario asignado: ${a._userName && a._userName !== "—" ? disp(a._userName) : `#${a._userId}`}`}>
                          <span className="badge badge-success shrink-0"><span className="inline-flex items-center gap-1"><IconUser size={11} /> Con usuario</span></span>
                          <span className="text-xs text-muted truncate">{a._userName && a._userName !== "—" ? disp(a._userName) : `Usuario #${a._userId}`}</span>
                        </span>
                      )}
                  </article>
                );
              })}
            </div>
            <div ref={listEndRef} />
          </>
        )}

        {progress && (
          <div className="grid gap-1" role="status" aria-live="polite">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#eef2f8" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, background: "var(--accent)" }}
              />
            </div>
            <p className="text-xs text-muted tabular-nums">
              Moviendo {progress.done}/{progress.total}…
            </p>
          </div>
        )}
        {result && (
          <p className="text-sm" role="status">
            {result}
          </p>
        )}
      </section>

      {/* Footer sticky confirmar */}
      <div className="sticky z-10 card p-3 flex items-center gap-2 flex-wrap shadow-lift" style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}>
        <span className="text-sm text-muted tabular-nums min-w-0">
          {readyRows.length} listo(s) {destName ? <span className="text-ink font-semibold">→ {destName}</span> : "· sin destino"}
        </span>
        <span className="ml-auto inline-flex gap-2 flex-wrap">
          {rows.some((r) => r.status === "movido") && (
            <button className="btn btn-secondary text-sm tap-target" disabled={busy} onClick={clearMoved}>
              Nuevo lote
            </button>
          )}
          <button className="btn btn-primary text-sm tap-target min-w-[200px]" disabled={confirmDisabled} onClick={() => requireEdit(() => setConfirmState({ kind: "move" }))}>
            {busy ? "Moviendo…" : `Confirmar movimiento (${readyRows.length})`}
          </button>
        </span>
      </div>
      {!destLocId && rows.length > 0 && (
        <p className="text-xs text-muted" role="status">
          Elegí el puesto destino para habilitar Confirmar.
        </p>
      )}

      {confirmState?.kind === "move" && (
        <ConfirmDialog
          title="Confirmar movimiento masivo"
          body={
            <>
              <span>Mover <b className="text-ink tabular-nums">{readyRows.length} equipo(s)</b>{readyWithUser > 0 && <> (<b className="text-ink tabular-nums">{readyWithUser} con usuario</b>)</>} al puesto <b className="text-ink">{destName}</b>{destFloorName ? <span className="text-muted"> · {destFloorName}</span> : null} <span className="text-xs text-muted">(id {destLocId})</span>.</span>
              <span>Conservarán su usuario actual: el movimiento solo actualiza el puesto, no modifica la asignación de usuarios.</span>
              <span>Esta acción se registra en Actividad y no se puede deshacer en lote.</span>
            </>
          }
          confirmLabel={`Mover ${readyRows.length} equipo(s)`}
          busy={busy}
          onClose={() => setConfirmState(null)}
          onConfirm={doConfirm}
        />
      )}
      {confirmState?.kind === "clear" && (
        <ConfirmDialog
          title="Limpiar lista"
          body={<span>Se quitarán los <b className="text-ink tabular-nums">{rows.length} renglones</b> de la lista (incluidos movidos y fallidos). Esta acción no toca GLPI.</span>}
          confirmLabel="Limpiar lista"
          danger
          onClose={() => setConfirmState(null)}
          onConfirm={clearAll}
        />
      )}

      {authOpen && (
        <AuthModal
          open={authOpen}
          onClose={() => {
            setAuthOpen(false);
            pendingAction.current = null;
          }}
          onSuccess={() => {
            fetch("/api/auth/me")
              .then((r) => r.json())
              .then((j) => {
                if (j.authenticated)
                  setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate });
              })
              .catch(() => {});
            window.dispatchEvent(new Event("auth-changed"));
            const a = pendingAction.current;
            pendingAction.current = null;
            setAuthOpen(false);
            if (a) a();
          }}
        />
      )}
    </div>
  );
}
