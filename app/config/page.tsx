"use client";
import { useEffect, useState } from "react";
import { ParentPicker, useLocations } from "@/components/Places";
import AuthModal from "@/components/AuthModal";
import { Tabs, AdminSection, ConfirmDialog, BusyButton, EmptyState } from "@/components/ui";

type Floor = {
  id: string;
  name: string;
  image: string | null;
  glpiLocationId: number | null;
  puestos: { glpi_id: number; x: number; y: number; w: number; h: number }[];
};

const ACCENTS = ["#0b5ed7", "#0f766e", "#7c3a2d", "#b45309", "#b91c1c", "#1d4ed8", "#0891b2", "#4f46e5"];

type ConfirmState =
  | { kind: "delFloor"; id: string; name: string }
  | { kind: "rmIcon" }
  | { kind: "import"; file: File };

export default function ConfigPage() {
  const [form, setForm] = useState({ glpiBaseUrl: "", appToken: "", userToken: "", keepUserOnMove: true, appName: "GLPI Move", accentColor: "#0b5ed7", brandIcon: null as string | null });
  const [saved, setSaved] = useState({ glpiBaseUrl: "", keepUserOnMove: true, appName: "GLPI Move", accentColor: "#0b5ed7" });
  const [sets, setSets] = useState({ appTokenSet: false, userTokenSet: false });
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [msg, setMsg] = useState("");
  const [testRes, setTestRes] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [newFloor, setNewFloor] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [tab, setTab] = useState<"conn" | "floors" | "look" | "adv">("conn");
  const [backupMsg, setBackupMsg] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [iconMsg, setIconMsg] = useState("");
  const [iconBusy, setIconBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function uploadIcon(file: File) {
    setIconMsg("Subiendo logo...");
    setIconBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const r = await fetch("/api/brand/icon", { method: "POST", body: fd });
      const j = await r.json();
      setIconMsg(r.ok ? "Logo guardado." : "Error: " + j.error);
      if (r.ok) {
        setForm((f) => ({ ...f, brandIcon: j.brandIcon }));
        fetch("/api/config").then((x) => x.json()).then((c) => setForm((f) => ({ ...f, brandIcon: c.brandIcon || null }))).catch(() => {});
        window.dispatchEvent(new Event("brand-icon-changed"));
      }
    } catch (e: any) {
      setIconMsg("Error: " + e.message);
    } finally {
      setIconBusy(false);
    }
  }

  async function execRemoveIcon() {
    setIconMsg("Quitando logo...");
    setIconBusy(true);
    try {
      const r = await fetch("/api/brand/icon", { method: "DELETE" });
      const j = await r.json();
      setIconMsg(r.ok ? "Logo quitado." : "Error: " + j.error);
      if (r.ok) { setForm((f) => ({ ...f, brandIcon: null })); window.dispatchEvent(new Event("brand-icon-changed")); }
    } catch (e: any) {
      setIconMsg("Error: " + e.message);
    } finally {
      setIconBusy(false);
      setConfirmState(null);
    }
  }

  async function exportBackup() {
    setBackupMsg("Generando respaldo...");
    setBackupBusy(true);
    try {
      const r = await fetch("/api/backup");
      if (!r.ok) { setBackupMsg("Error: " + (await r.json()).error); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "glpi-move-backup.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupMsg("Respaldo descargado.");
    } catch (e: any) {
      setBackupMsg("Error: " + e.message);
    } finally {
      setBackupBusy(false);
    }
  }

  async function execImportBackup(file: File) {
    setBackupMsg("Importando respaldo...");
    setBackupBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const r = await fetch("/api/backup", { method: "POST", body: fd });
      const j = await r.json();
      setBackupMsg(r.ok ? `Importado: ${j.pisos} pisos, ${j.puestos} puestos.` : "Error: " + j.error);
      if (r.ok) refreshFloors();
    } catch (e: any) {
      setBackupMsg("Error: " + e.message);
    } finally {
      setBackupBusy(false);
      setConfirmState(null);
    }
  }

  function requestImport(file: File) {
    if (!/\.zip$/i.test(file.name)) { setBackupMsg("Error: el archivo debe ser un ZIP (.zip)."); return; }
    setConfirmState({ kind: "import", file });
  }

  const { childrenOf } = useLocations();

  async function refreshFloors() {
    const r = await fetch("/api/maps").then((x) => x.json()).catch(() => null);
    if (r?.floors) setFloors(r.floors);
  }

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((j) => {
      const snap = {
        glpiBaseUrl: j.glpiBaseUrl || "",
        keepUserOnMove: j.keepUserOnMove ?? true,
        appName: j.appName || "GLPI Move",
        accentColor: j.accentColor || "#0b5ed7",
      };
      setForm((f) => ({ ...f, ...snap, brandIcon: j.brandIcon || null }));
      setSaved(snap);
      setSets({ appTokenSet: !!j.appTokenSet, userTokenSet: !!j.userTokenSet });
    }).catch(() => {});
    refreshFloors();
    fetch("/api/admin/check").then((r) => r.json()).then((j) => setAdminAuthed(!!j.admin)).catch(() => {});
  }, []);

  const dirtyConn = form.glpiBaseUrl !== saved.glpiBaseUrl;
  const dirtyLook = form.appName !== saved.appName || form.accentColor !== saved.accentColor;
  const dirtyAdv = form.keepUserOnMove !== saved.keepUserOnMove;

  async function save() {
    setMsg("Guardando...");
    setSaveBusy(true);
    try {
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          glpiBaseUrl: form.glpiBaseUrl,
          appToken: form.appToken || undefined,
          userToken: form.userToken || undefined,
          keepUserOnMove: form.keepUserOnMove,
          appName: form.appName,
          accentColor: form.accentColor,
        }),
      });
      const j = await r.json();
      setMsg(r.ok ? "Guardado." : "Error: " + j.error);
      if (r.ok) {
        setForm((f) => ({ ...f, appToken: "", userToken: "" }));
        fetch("/api/config").then((x) => x.json()).then((c) => {
          const snap = {
            glpiBaseUrl: c.glpiBaseUrl || "",
            keepUserOnMove: c.keepUserOnMove ?? true,
            appName: c.appName || "GLPI Move",
            accentColor: c.accentColor || "#0b5ed7",
          };
          setSaved(snap);
          setSets({ appTokenSet: !!c.appTokenSet, userTokenSet: !!c.userTokenSet });
          setForm((f) => ({ ...f, ...snap, brandIcon: c.brandIcon ?? f.brandIcon }));
        }).catch(() => {});
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function test() {
    setTestRes("Probando conexión…");
    setTestBusy(true);
    try {
      const r = await fetch("/api/config/test");
      const j = await r.json();
      setTestRes(r.ok ? `OK. Perfiles: ${(j.profiles || []).join(", ") || "—"}` : "Fallo: " + j.error);
    } finally {
      setTestBusy(false);
    }
  }

  async function addFloor() {
    if (!newFloor.trim()) return;
    const r = await fetch("/api/maps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newFloor.trim() }) });
    const j = await r.json();
    if (r.ok) { setNewFloor(""); refreshFloors(); } else setMsg("Error: " + j.error);
  }

  async function upload(floorId: string, file: File) {
    setUploading(floorId);
    const fd = new FormData();
    fd.set("floorId", floorId);
    fd.set("file", file);
    const r = await fetch("/api/maps/upload", { method: "POST", body: fd });
    const j = await r.json();
    setMsg(r.ok ? "Plano subido." : "Error: " + j.error);
    setUploading(null);
    refreshFloors();
  }

  async function setParent(floor: Floor, glpiLocationId: number | null) {
    const r = await fetch("/api/maps", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: floor.id, glpiLocationId }) });
    const j = await r.json();
    setMsg(r.ok ? `Piso vinculado a ubicación ${glpiLocationId ?? "—"}.` : "Error: " + j.error);
    refreshFloors();
  }

  async function execDelFloor(id: string) {
    await fetch(`/api/maps?id=${id}`, { method: "DELETE" });
    setConfirmState(null);
    refreshFloors();
  }

  return (
    <div className="grid gap-3 no-hscroll">
      <div className="page-header">
        <h1>Configuración</h1>
        <p>Administración de conexión GLPI, planos y personalización de la herramienta.</p>
      </div>

      <div className="card p-3 grid gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {adminAuthed ? (
            <span className="badge badge-success">Sesión admin activa</span>
          ) : (
            <span className="text-sm text-muted">Sin sesión admin</span>
          )}
          {msg && <span className="text-sm text-muted break-words min-w-0" role="status">{msg}</span>}
        </div>
        <div className="tabs-scroll -mx-1 px-1" role="presentation">
          <Tabs
            ariaLabel="Secciones de configuración"
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
            tabs={[
              { id: "conn", label: "Conexión", badge: dirtyConn ? <span className="badge badge-warning">sin guardar</span> : undefined },
              { id: "floors", label: "Pisos y planos", badge: <span className="badge badge-brand">{floors.length}</span> },
              { id: "look", label: "Apariencia", badge: dirtyLook ? <span className="badge badge-warning">sin guardar</span> : undefined },
              { id: "adv", label: "Avanzada", badge: dirtyAdv ? <span className="badge badge-warning">sin guardar</span> : undefined },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-3 max-w-3xl">
        {tab === "conn" && (
          <section className="card p-4 grid gap-3" aria-label="Conexión GLPI">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-bold">Conexión GLPI 10 (API legacy)</h2>
              {dirtyConn && <span className="badge badge-warning">Con cambios sin guardar</span>}
            </div>
            <p className="text-xs text-muted">Los tokens se guardan solo en el servidor (cifrado AES en disco). Nunca se exponen al navegador; aquí solo se ven indicadores “guardado”. Vacío = no cambiar.</p>
            <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-ink">GLPI Base URL</span>
              <input className="input" value={form.glpiBaseUrl} onChange={(e) => setForm({ ...form, glpiBaseUrl: e.target.value })} placeholder="http://192.168.170.125" disabled={!adminAuthed} inputMode="url" />
            </label>
            <div className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-ink">App-Token (Setup &gt; API clients) {sets.appTokenSet && <span className="badge badge-success ml-1">guardado</span>}</span>
              <input className="input tabular-nums" value={form.appToken} onChange={(e) => setForm({ ...form, appToken: e.target.value })} placeholder="vacío = no cambiar" disabled={!adminAuthed} autoComplete="off" />
            </div>
            <div className="grid gap-1.5 text-sm">
              <span className="text-xs font-semibold text-ink">User token (clave de acceso remoto del usuario) {sets.userTokenSet && <span className="badge badge-success ml-1">guardado</span>}</span>
              <input type="password" className="input tabular-nums" value={form.userToken} onChange={(e) => setForm({ ...form, userToken: e.target.value })} placeholder="vacío = no cambiar" disabled={!adminAuthed} autoComplete="off" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <BusyButton className="btn btn-primary text-sm tap-target min-w-[140px]" busy={saveBusy} disabled={!adminAuthed} onClick={save}>Guardar</BusyButton>
              <BusyButton className="btn btn-secondary text-sm tap-target min-w-[160px]" busy={testBusy} disabled={!adminAuthed} onClick={test}>Probar conexión</BusyButton>
            </div>
            {testRes && <p className="text-sm text-muted break-words" role="status">{testRes}</p>}
          </section>
        )}

        {tab === "floors" && (
          <section className="grid gap-2" aria-label="Planos por piso">
            <div className="card p-4 grid gap-2">
              <h2 className="font-bold">Planos por piso</h2>
              <p className="text-xs text-muted">Cada piso se vincula a su ubicación GLPI padre. Los puestos a dibujar serán sus hijos.</p>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addFloor(); }}>
                <input className="input flex-1 min-w-0" placeholder="Nuevo piso, ej. 1° piso" value={newFloor} onChange={(e) => setNewFloor(e.target.value)} disabled={!adminAuthed} aria-label="Nombre del nuevo piso" />
                <button type="submit" disabled={!adminAuthed || !newFloor.trim()} className="btn btn-primary text-sm tap-target shrink-0">Agregar</button>
              </form>
            </div>
            {floors.map((f) => {
              const kids = f.glpiLocationId != null ? childrenOf.get(f.glpiLocationId) || [] : [];
              const linked = f.glpiLocationId != null;
              return (
                <AdminSection
                  key={f.id}
                  title={f.name}
                  hint={linked ? `${f.puestos.length}/${kids.length} puestos dibujados` : "Sin ubicación GLPI — vincular para calibrar"}
                >
                  <div className="flex gap-3 items-center text-sm flex-wrap">
                    {f.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/maps/${f.id}/image`} alt={`Plano de ${f.name}`} className="w-32 h-20 object-cover rounded-lg border border-line" loading="lazy" />
                    ) : (
                      <span className="text-muted text-xs w-32">sin imagen</span>
                    )}
                    <div className="grid gap-1.5 min-w-0 flex-1">
                      <span className="text-xs text-muted">
                        {linked ? `${f.puestos.length}/${kids.length} puestos dibujados` : "Sin ubicación padre: vincúlala para calibrar"}
                      </span>
                      <span className="flex gap-2 flex-wrap">
                        <label className="btn btn-secondary text-xs cursor-pointer tap-target">
                          {uploading === f.id ? "Subiendo…" : f.image ? "Reemplazar plano" : "Subir plano"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!adminAuthed || !!uploading}
                            onChange={(e) => { const fl = e.target.files?.[0]; if (fl && adminAuthed) upload(f.id, fl); e.target.value = ""; }} />
                        </label>
                        <a className="btn btn-secondary text-xs tap-target" href={`/mapa?calibrar=1&floor=${f.id}`}>Calibrar puestos →</a>
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs font-semibold text-ink">Ubicación GLPI padre (el piso)</span>
                    <ParentPicker value={f.glpiLocationId} onChange={(id) => adminAuthed && setParent(f, id)} />
                  </div>
                  <button onClick={() => setConfirmState({ kind: "delFloor", id: f.id, name: f.name })} disabled={!adminAuthed} className="btn btn-danger-outline text-xs w-fit tap-target">Eliminar piso y su plano</button>
                </AdminSection>
              );
            })}
            {!floors.length && <EmptyState title="Sin pisos" hint='Agregá el primero (ej. "1° piso").' />}
          </section>
        )}

        {tab === "look" && (
          <section className="card p-4 grid gap-3" aria-label="Apariencia">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-bold">Apariencia</h2>
              {dirtyLook && <span className="badge badge-warning">Con cambios sin guardar</span>}
            </div>
            <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-ink">Nombre de la herramienta</span>
              <input className="input" value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} disabled={!adminAuthed} maxLength={40} />
            </label>
            <div className="grid gap-2" role="group" aria-label="Color de acento">
              <span className="text-xs font-semibold text-ink">Color de acento</span>
              <div className="flex gap-2 flex-wrap">
                {ACCENTS.map((c) => {
                  const active = form.accentColor.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, accentColor: c })}
                      className={`h-11 w-11 rounded-full border-2 transition tap-target inline-flex items-center justify-center ${active ? "border-ink scale-105" : "border-transparent"}`}
                      style={{ background: c }}
                      aria-label={`Color ${c}`}
                      aria-pressed={active}
                      title={c}
                      disabled={!adminAuthed}
                    >
                      {active && <span aria-hidden="true" className="text-white font-bold text-sm drop-shadow">✓</span>}
                    </button>
                  );
                })}
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                  disabled={!adminAuthed}
                  aria-label="Color personalizado"
                  className="h-11 w-11 rounded-full border border-line cursor-pointer tap-target"
                />
              </div>
              <div className="card p-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted">Vista previa:</span>
                <button type="button" className="btn btn-primary text-xs" style={{ background: form.accentColor }}>Botón</button>
                <span className="badge badge-brand" style={{ background: form.accentColor + "1a", color: form.accentColor }}>Insignia</span>
                <a className="text-sm underline" style={{ color: form.accentColor }} href="#" onClick={(e) => e.preventDefault()}>Enlace</a>
              </div>
            </div>
            <div className="grid gap-2">
              <span className="text-xs font-semibold text-ink">Logo de la herramienta (PNG/JPG/WebP/SVG, máx. 2 MB)</span>
              <div className="flex items-center gap-3 flex-wrap">
                {form.brandIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/api/brand/icon" alt="Logo" className="h-12 w-12 rounded-xl object-contain border border-line bg-white" />
                ) : (
                  <div className="h-12 w-12 rounded-xl grid place-items-center text-white font-bold" style={{ background: "var(--accent)" }}>
                    {(form.appName || "GLPI Move").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <label className={`btn btn-secondary text-xs cursor-pointer tap-target ${!adminAuthed || iconBusy ? "opacity-40 pointer-events-none" : ""}`}>
                  {iconBusy ? "Subiendo…" : form.brandIcon ? "Reemplazar logo" : "Subir logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" disabled={!adminAuthed || iconBusy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(f); e.target.value = ""; }} />
                </label>
                {form.brandIcon && (
                  <button onClick={() => setConfirmState({ kind: "rmIcon" })} disabled={!adminAuthed || iconBusy} className="btn btn-danger-outline text-xs tap-target">Quitar logo</button>
                )}
              </div>
              {iconMsg && <p className="text-sm text-muted" role="status">{iconMsg}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <BusyButton className="btn btn-primary text-sm tap-target min-w-[160px]" busy={saveBusy} disabled={!adminAuthed} onClick={save}>Guardar apariencia</BusyButton>
              <button onClick={() => setForm((f) => ({ ...f, appName: "GLPI Move", accentColor: "#0b5ed7" }))} disabled={!adminAuthed} className="btn btn-secondary text-sm tap-target">Restablecer</button>
            </div>
          </section>
        )}

        {tab === "adv" && (
          <section className="card p-4 grid gap-3" aria-label="Avanzada">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-bold">Avanzada</h2>
              {dirtyAdv && <span className="badge badge-warning">Con cambios sin guardar</span>}
            </div>
            <label className="flex items-center gap-2.5 text-sm min-h-[44px] cursor-pointer">
              <input type="checkbox" className="check-lg" checked={form.keepUserOnMove} onChange={(e) => setForm({ ...form, keepUserOnMove: e.target.checked })} disabled={!adminAuthed} />
              <span>Conservar usuario asignado al mover un bien <span className="block text-xs text-muted font-normal">Al mover (individual o masivo), el equipo mantiene su usuario salvo que se quite expresamente.</span></span>
            </label>
            <div><BusyButton className="btn btn-primary text-sm tap-target min-w-[140px]" busy={saveBusy} disabled={!adminAuthed} onClick={save}>Guardar</BusyButton></div>

            <div className="border-t pt-3 grid gap-2">
              <h3 className="font-bold text-sm">Respaldo (pisos, puestos y planos)</h3>
              <p className="text-xs text-muted">Exporta e importa `floors.json` + imágenes. No incluye conexión GLPI ni tokens.</p>
              <div className="flex gap-2 flex-wrap">
                <BusyButton className="btn btn-primary text-xs tap-target" busy={backupBusy} disabled={!adminAuthed} onClick={exportBackup}>Exportar ZIP</BusyButton>
                <label className={`btn btn-secondary text-xs cursor-pointer tap-target ${!adminAuthed || backupBusy ? "opacity-40 pointer-events-none" : ""}`}>
                  {backupBusy ? "Procesando…" : "Importar ZIP"}
                  <input type="file" accept="application/zip,.zip" className="hidden" disabled={!adminAuthed || backupBusy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) requestImport(f); e.target.value = ""; }} />
                </label>
              </div>
              {backupMsg && <p className="text-sm text-muted break-words" role="status">{backupMsg}</p>}
            </div>
          </section>
        )}
      </div>

      {!adminAuthed && (
        <AuthModal open={true} onClose={() => {}} onSuccess={() => { fetch("/api/admin/check").then((r) => r.json()).then((j) => setAdminAuthed(!!j.admin)).catch(() => {}); }} />
      )}

      {confirmState?.kind === "delFloor" && (
        <ConfirmDialog
          title="Eliminar piso"
          body={<><span>Se eliminará el piso <b className="text-ink">{confirmState.name}</b> junto con su plano y todos sus puestos dibujados.</span><span>Esta acción no se puede deshacer.</span></>}
          confirmLabel="Eliminar piso"
          danger
          busy={confirmBusy}
          onClose={() => setConfirmState(null)}
          onConfirm={async () => { setConfirmBusy(true); try { await execDelFloor(confirmState.id); } finally { setConfirmBusy(false); } }}
        />
      )}
      {confirmState?.kind === "rmIcon" && (
        <ConfirmDialog
          title="Quitar logo"
          body={<span>Se quitará el logo personalizado y volverá la inicial de la herramienta.</span>}
          confirmLabel="Quitar logo"
          danger
          busy={iconBusy}
          onClose={() => setConfirmState(null)}
          onConfirm={execRemoveIcon}
        />
      )}
      {confirmState?.kind === "import" && (
        <ConfirmDialog
          title="Importar respaldo"
          body={<><span>La importación <b className="text-ink">reemplaza TODOS los pisos, puestos y planos actuales</b> por el contenido de <b className="text-ink tabular-nums break-all">{confirmState.file.name}</b>.</span><span>Exportá un ZIP antes si necesitás conservar la configuración actual.</span></>}
          confirmLabel="Importar y reemplazar"
          danger
          busy={backupBusy}
          onClose={() => setConfirmState(null)}
          onConfirm={() => execImportBackup(confirmState.file)}
        />
      )}
    </div>
  );
}
