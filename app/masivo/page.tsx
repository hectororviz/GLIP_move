"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import BatchScanModal from "@/components/BatchScanModal";
import AuthModal from "@/components/AuthModal";
import { useLocations } from "@/components/Places";
import { inventoryVariants, parseGlpiUrl } from "@/lib/inventory";
import { comparePisos, formatLocationDisplay } from "@/lib/location-display";
import { Spinner, TypeIcon } from "@/components/ui";

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

const disp = (v: any) => (v == null || v === "" ? "—" : String(v));
let uidSeq = 1;

export default function Masivo() {
  const { byId, childrenOf } = useLocations();
  const [pisoPick, setPisoPick] = useState("");
  const [puestoQuery, setPuestoQuery] = useState("");
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

  const puestosFiltrados = useMemo(() => {
    const q = puestoQuery.trim().toLowerCase();
    if (!q) return puestosDelPiso;
    return puestosDelPiso.filter(
      (l: any) =>
        String(l.name || "").toLowerCase().includes(q) ||
        String(l.room || "").toLowerCase().includes(q) ||
        String(l.id) === q.trim()
    );
  }, [puestosDelPiso, puestoQuery]);

  const destLoc = destLocId ? byId.get(Number(destLocId)) : null;
  const destName = destLoc
    ? formatLocationDisplay(Number(destLocId), byId as any, String((destLoc as any).name || "")).primary
    : destLocId
      ? `puesto ${destLocId}`
      : "";

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

  const clearAll = () => {
    if (busy || !rows.length) return;
    if (!confirm(`Quitar los ${rows.length} renglones de la lista?`)) return;
    setRows([]);
    setResult("");
    setMsg("");
    setProgress(null);
  };

  const clearMoved = () => {
    setRows((prev) => prev.filter((r) => r.status !== "movido" && r.status !== "ya-ahi"));
    setResult("");
  };

  async function doConfirm() {
    const dest = Number(destLocId);
    if (!Number.isFinite(dest) || dest <= 0) {
      setMsg("Elegí el puesto destino antes de confirmar.");
      return;
    }
    const targets = rows.filter((r) => r.status === "listo");
    if (!targets.length) {
      setMsg("No hay equipos listos para mover (revisá duplicados / no encontrados).");
      return;
    }
    if (
      !confirm(
        `Mover ${targets.length} equipo(s) al puesto ${destName}? Conservarán su usuario actual. Esta acción se registra en Actividad.`
      )
    )
      return;
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
      <section aria-label="Puesto destino" className="card p-4 grid gap-2">
        <h2 className="font-bold text-ink">1 · Puesto destino</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="grid gap-1">
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
                setPuestoQuery("");
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
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-ink" htmlFor="masivo-puesto">
              Puesto destino
            </label>
            <input
              className="input text-sm"
              placeholder={pisoPick ? "Filtrar por nombre, interno o id…" : "Primero elegí un piso…"}
              aria-label="Filtrar puestos del piso"
              value={puestoQuery}
              disabled={busy || !pisoPick}
              onChange={(e) => setPuestoQuery(e.target.value)}
            />
          </div>
        </div>
        {floorsMsg && (
          <p className="text-xs text-danger" role="alert">
            {floorsMsg}
          </p>
        )}
        <select
          id="masivo-puesto"
          aria-label="Puesto destino"
          className="input text-sm"
          value={destLocId}
          disabled={busy || !pisoPick}
          onChange={(e) => setDestLocId(e.target.value)}
          size={Math.min(8, Math.max(3, puestosFiltrados.length))}
        >
          <option value="">Elegir puesto…</option>
          {puestosFiltrados.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.room ? ` · Int. ${l.room}` : ""} (id {l.id})
            </option>
          ))}
        </select>
        {pisoPick && !puestosFiltrados.length && (
          <p className="text-xs text-muted" role="status">
            {puestosDelPiso.length ? "Sin coincidencias para ese filtro." : "Este piso aún no tiene puestos cargados en GLPI."}
          </p>
        )}
        {destLocId && (
          <p className="text-sm" role="status">
            Destino: <b className="text-ink">{destName}</b>{" "}
            <span className="text-muted text-xs">(id {destLocId})</span>
          </p>
        )}
      </section>

      {/* Escaneo */}
      <section aria-label="Escaneo en ráfaga" className="card p-4 grid gap-2">
        <h2 className="font-bold text-ink">2 · Escaneá en ráfaga</h2>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary text-sm" disabled={busy} onClick={() => setScanOpen(true)}>
            📷 Escanear
          </button>
          <span className="text-xs text-muted self-center">La cámara abre en modal; el destello verde confirma sin cerrar.</span>
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
            className="input flex-1 text-sm"
            placeholder="Inventario manual o QR: 0000012865, A 0001-0537, URL GLPI…"
            value={manual}
            disabled={busy}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) {
                addCode(manual);
                setManual("");
              }
            }}
          />
          <button
            className="btn btn-secondary text-sm"
            disabled={busy || !manual.trim()}
            onClick={() => {
              addCode(manual);
              setManual("");
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
      <section aria-label="Equipos escaneados" className="card p-4 grid gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-ink">3 · Lista ({rows.length})</h2>
          {rows.length > 0 && (
            <button className="btn btn-secondary text-xs" disabled={busy} onClick={clearAll}>
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
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="table-dense min-w-[720px]">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Inventario</th>
                  <th>Nombre</th>
                  <th>Ubicación actual</th>
                  <th>Estado</th>
                  <th></th>
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
                        {a?._userName && a._userName !== "—" && (
                          <span className="text-xs text-muted block truncate" title={disp(a._userName)}>
                            👤 {disp(a._userName)}
                          </span>
                        )}
                      </td>
                      <td className="text-xs max-w-[160px] truncate" title={loc}>
                        {loc}
                      </td>
                      <td>
                        {r.status === "buscando" && <Spinner label="Buscando…" />}
                        {r.status === "listo" && <span className="badge badge-success">listo</span>}
                        {r.status === "duplicado" && <span className="badge badge-warning">duplicado</span>}
                        {r.status === "ya-ahi" && <span className="badge">ya está ahí</span>}
                        {r.status === "no-encontrado" && <span className="badge badge-danger">no existe</span>}
                        {r.status === "error" && (
                          <span className="badge badge-danger" title={r.note}>
                            error
                          </span>
                        )}
                        {r.status === "moviendo" && <Spinner label="Moviendo…" />}
                        {r.status === "movido" && <span className="badge badge-success">movido ✓</span>}
                        {r.status === "fallo" && (
                          <span className="badge badge-danger" title={r.note}>
                            falló
                          </span>
                        )}
                      </td>
                      <td>
                        {!busy && r.status !== "movido" && (
                          <button
                            className="btn btn-secondary text-xs !min-h-[28px] !py-0.5"
                            onClick={() => removeRow(r.uid)}
                            aria-label={`Quitar ${r.code}`}
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
            <div ref={listEndRef} />
          </div>
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
      <div className="sticky bottom-3 z-10 card p-3 flex items-center gap-2 flex-wrap shadow-lift">
        <span className="text-sm text-muted tabular-nums">
          {readyRows.length} listo(s) {destName ? `→ ${destName}` : "· sin destino"}
        </span>
        <span className="ml-auto inline-flex gap-2">
          {rows.some((r) => r.status === "movido") && (
            <button className="btn btn-secondary text-sm" disabled={busy} onClick={clearMoved}>
              Nuevo lote
            </button>
          )}
          <button className="btn btn-primary text-sm" disabled={confirmDisabled} onClick={() => requireEdit(doConfirm)}>
            {busy ? "Moviendo…" : `Confirmar movimiento (${readyRows.length})`}
          </button>
        </span>
      </div>
      {!destLocId && rows.length > 0 && (
        <p className="text-xs text-muted" role="status">
          Elegí el puesto destino para habilitar Confirmar.
        </p>
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
