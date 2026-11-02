"use client";
import { useEffect, useState } from "react";
import { ParentPicker, useLocations } from "@/components/Places";
import AuthModal from "@/components/AuthModal";

type Floor = {
  id: string;
  name: string;
  image: string | null;
  glpiLocationId: number | null;
  puestos: { glpi_id: number; x: number; y: number; w: number; h: number }[];
};

const ACCENTS = ["#0b5ed7", "#0f766e", "#7c3aed", "#b45309", "#b91c1c", "#1d4ed8", "#0891b2", "#4f46e5"];

export default function ConfigPage() {
  const [form, setForm] = useState({ glpiBaseUrl: "", appToken: "", userToken: "", keepUserOnMove: true, appName: "GLPI Move", accentColor: "#0b5ed7", brandIcon: null as string | null });
  const [sets, setSets] = useState({ appTokenSet: false, userTokenSet: false });
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [msg, setMsg] = useState("");
  const [testRes, setTestRes] = useState("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [newFloor, setNewFloor] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [tab, setTab] = useState<"conn" | "floors" | "look" | "adv">("conn");
  const [backupMsg, setBackupMsg] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [iconMsg, setIconMsg] = useState("");
  const [iconBusy, setIconBusy] = useState(false);

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

  async function removeIcon() {
    if (!confirm("Quitar el logo de la herramienta?")) return;
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

  async function importBackup(file: File) {
    if (!confirm("Esto reemplaza TODOS los pisos, puestos y planos actuales. ¿Continuar?")) return;
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
    }
  }
  const { childrenOf } = useLocations();

  async function refreshFloors() {
    const r = await fetch("/api/maps").then((x) => x.json()).catch(() => null);
    if (r?.floors) setFloors(r.floors);
  }

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((j) => {
      setForm((f) => ({
        ...f,
        glpiBaseUrl: j.glpiBaseUrl || "",
        keepUserOnMove: j.keepUserOnMove ?? true,
        appName: j.appName || "GLPI Move",
        accentColor: j.accentColor || "#0b5ed7",
        brandIcon: j.brandIcon || null,
      }));
      setSets({ appTokenSet: !!j.appTokenSet, userTokenSet: !!j.userTokenSet });
    }).catch(() => {});
    refreshFloors();
    fetch("/api/admin/check").then((r) => r.json()).then((j) => setAdminAuthed(!!j.admin)).catch(() => {});
  }, []);



  async function save() {
    setMsg("Guardando...");
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
        setSets({ appTokenSet: !!c.appTokenSet, userTokenSet: !!c.userTokenSet });
        setForm((f) => ({ ...f, glpiBaseUrl: c.glpiBaseUrl || f.glpiBaseUrl, appName: c.appName || f.appName, accentColor: c.accentColor || f.accentColor, brandIcon: c.brandIcon ?? f.brandIcon }));
      }).catch(() => {});
    }
  }

  async function test() {
    setTestRes("Probando conexión...");
    const r = await fetch("/api/config/test");
    const j = await r.json();
    setTestRes(r.ok ? `OK. Perfiles: ${(j.profiles || []).join(", ") || "—"}` : "Fallo: " + j.error);
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

  async function delFloor(id: string, name: string) {
    if (!confirm(`Eliminar piso "${name}" y su plano?`)) return;
    await fetch(`/api/maps?id=${id}`, { method: "DELETE" });
    refreshFloors();
  }

  const tabs = [
    { id: "conn", label: "Conexión" },
    { id: "floors", label: "Pisos y planos" },
    { id: "look", label: "Apariencia" },
    { id: "adv", label: "Avanzada" },
  ] as const;

  return (
    <div className="grid gap-4">
      <div className="page-header">
        <h1>Configuración</h1>
        <p>Administración de conexión GLPI, planos y personalización de la herramienta.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {adminAuthed ? (
          <span className="badge badge-success">Sesión admin activa</span>
        ) : (
          <span className="text-sm text-muted">Sin sesión admin</span>
        )}
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>

      <div className="card p-2 flex gap-1 flex-wrap" role="tablist" aria-label="Secciones de configuración">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.id ? "text-white" : "text-muted hover:text-ink hover:bg-canvas"
            }`}
            style={tab === t.id ? { background: "var(--accent)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "conn" && (
        <section className="card p-4 grid gap-3" aria-label="Conexión GLPI">
          <h2 className="font-bold">Conexión GLPI 10 (API legacy)</h2>
          <p className="text-xs text-muted">Los tokens se guardan solo en el servidor (cifrado AES en disco). Nunca se exponen al navegador; aquí solo se ven indicadores “guardado”.</p>
          <label className="text-sm grid gap-1">GLPI Base URL
            <input className="input" value={form.glpiBaseUrl} onChange={(e) => setForm({ ...form, glpiBaseUrl: e.target.value })} placeholder="http://192.168.170.125" disabled={!adminAuthed} />
          </label>
          <label className="text-sm grid gap-1">App-Token (Setup &gt; API clients) {sets.appTokenSet && <span className="badge badge-success">guardado</span>}
            <input className="input" value={form.appToken} onChange={(e) => setForm({ ...form, appToken: e.target.value })} placeholder="vacío = no cambiar" disabled={!adminAuthed} />
          </label>
          <label className="text-sm grid gap-1">User token (clave de acceso remoto del usuario) {sets.userTokenSet && <span className="badge badge-success">guardado</span>}
            <input type="password" className="input" value={form.userToken} onChange={(e) => setForm({ ...form, userToken: e.target.value })} placeholder="vacío = no cambiar" disabled={!adminAuthed} />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button onClick={save} disabled={!adminAuthed} className="btn btn-primary">Guardar</button>
            <button onClick={test} disabled={!adminAuthed} className="btn btn-secondary">Probar conexión</button>
          </div>
          {testRes && <p className="text-sm text-muted">{testRes}</p>}
        </section>
      )}

      {tab === "floors" && (
        <section className="card p-4 grid gap-3">
          <h2 className="font-bold">Planos por piso</h2>
          <p className="text-xs text-muted">Cada piso se vincula a su ubicación GLPI padre. Los puestos a dibujar serán sus hijos.</p>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Nuevo piso, ej. 1° piso" value={newFloor} onChange={(e) => setNewFloor(e.target.value)} disabled={!adminAuthed} />
            <button onClick={addFloor} disabled={!adminAuthed} className="btn btn-primary">Agregar</button>
          </div>
          {floors.map((f) => {
            const kids = f.glpiLocationId != null ? childrenOf.get(f.glpiLocationId) || [] : [];
            return (
              <div key={f.id} className="card p-4 grid gap-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <b className="text-ink">{f.name}</b>
                  <button onClick={() => delFloor(f.id, f.name)} disabled={!adminAuthed} className="text-xs text-danger underline disabled:opacity-40">eliminar</button>
                </div>
                <label className="text-xs grid gap-1">Ubicación GLPI padre (el piso)
                  <ParentPicker value={f.glpiLocationId} onChange={(id) => adminAuthed && setParent(f, id)} />
                </label>
                <div className="flex gap-3 items-center text-sm flex-wrap">
                  {f.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/maps/${f.id}/image`} alt={f.name} className="w-32 h-20 object-cover rounded-lg border border-line" />
                  ) : (
                    <span className="text-muted text-xs">sin imagen</span>
                  )}
                  <div className="grid gap-1">
                    <span className="text-xs text-muted">
                      {f.glpiLocationId == null
                        ? "Sin ubicación padre: vincúlala para calibrar"
                        : `${f.puestos.length}/${kids.length} puestos dibujados`}
                    </span>
                    <label className="text-xs border border-line rounded-lg px-2 py-1 cursor-pointer w-fit hover:bg-canvas">
                      {uploading === f.id ? "Subiendo..." : f.image ? "Reemplazar plano" : "Subir plano"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!adminAuthed || !!uploading}
                        onChange={(e) => { const fl = e.target.files?.[0]; if (fl) upload(f.id, fl); e.target.value = ""; }} />
                    </label>
                    <a className="text-xs text-brand-600 underline" href={`/mapa?calibrar=1&floor=${f.id}`}>Calibrar puestos →</a>
                  </div>
                </div>
              </div>
            );
          })}
          {!floors.length && <p className="text-sm text-muted">Sin pisos. Agrega el primero (ej. "1° piso").</p>}
        </section>
      )}

      {tab === "look" && (
        <section className="card p-4 grid gap-4">
          <h2 className="font-bold">Apariencia</h2>
          <label className="text-sm grid gap-1">Nombre de la herramienta
            <input className="input" value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} disabled={!adminAuthed} maxLength={40} />
          </label>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Color de acento</span>
            <div className="flex gap-2 flex-wrap">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, accentColor: c })}
                  className={`h-9 w-9 rounded-full border-2 transition ${form.accentColor === c ? "border-ink scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                  aria-label={c}
                  disabled={!adminAuthed}
                />
              ))}
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                disabled={!adminAuthed}
                className="h-9 w-9 rounded-full border border-line cursor-pointer"
              />
            </div>
            <div className="card p-3 flex items-center gap-3">
              <span className="text-sm text-muted">Vista previa:</span>
              <button className="btn btn-primary text-xs" style={{ background: form.accentColor }}>Botón</button>
              <span className="badge badge-brand" style={{ background: form.accentColor + "1a", color: form.accentColor }}>Insignia</span>
              <a className="text-sm underline" style={{ color: form.accentColor }} href="#">Enlace</a>
            </div>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Logo de la herramienta (PNG/JPG/WebP/SVG, máx. 2 MB)</span>
            <div className="flex items-center gap-3 flex-wrap">
              {form.brandIcon ? (
                <img src="/api/brand/icon" alt="Logo" className="h-12 w-12 rounded-xl object-contain border border-line bg-white" />
              ) : (
                <div className="h-12 w-12 rounded-xl grid place-items-center text-white font-bold" style={{ background: "var(--accent)" }}>
                  {(form.appName || "GLPI Move").slice(0, 1).toUpperCase()}
                </div>
              )}
              <label className={`btn btn-secondary text-xs cursor-pointer ${!adminAuthed || iconBusy ? "opacity-40 pointer-events-none" : ""}`}>
                {iconBusy ? "Subiendo..." : form.brandIcon ? "Reemplazar logo" : "Subir logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" disabled={!adminAuthed || iconBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(f); e.target.value = ""; }} />
              </label>
              {form.brandIcon && (
                <button onClick={removeIcon} disabled={!adminAuthed || iconBusy} className="btn btn-danger text-xs">Quitar logo</button>
              )}
            </div>
            {iconMsg && <p className="text-sm text-muted">{iconMsg}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!adminAuthed} className="btn btn-primary">Guardar apariencia</button>
            <button onClick={() => setForm((f) => ({ ...f, appName: "GLPI Move", accentColor: "#0b5ed7" }))} disabled={!adminAuthed} className="btn btn-secondary">Restablecer</button>
          </div>
        </section>
      )}

      {tab === "adv" && (
        <section className="card p-4 grid gap-4">
          <h2 className="font-bold">Avanzada</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.keepUserOnMove} onChange={(e) => setForm({ ...form, keepUserOnMove: e.target.checked })} disabled={!adminAuthed} />
            Conservar usuario asignado al mover un bien
          </label>
          <button onClick={save} disabled={!adminAuthed} className="btn btn-primary w-fit">Guardar</button>

          <div className="border-t pt-3 grid gap-3">
            <h3 className="font-bold text-sm">Respaldo (pisos, puestos y planos)</h3>
            <p className="text-xs text-muted">Exporta e importa `floors.json` + imágenes. No incluye conexión GLPI ni tokens. La importación reemplaza todos los pisos actuales.</p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={exportBackup} disabled={!adminAuthed || backupBusy} className="btn btn-primary text-xs">Exportar ZIP</button>
              <label className={`btn btn-secondary text-xs cursor-pointer ${!adminAuthed || backupBusy ? "opacity-40 pointer-events-none" : ""}`}>
                {backupBusy ? "Importando..." : "Importar ZIP"}
                <input type="file" accept="application/zip,.zip" className="hidden" disabled={!adminAuthed || backupBusy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ""; }} />
              </label>
            </div>
            {backupMsg && <p className="text-sm text-muted">{backupMsg}</p>}
          </div>
        </section>
      )}

      {!adminAuthed && (
        <AuthModal open={true} onClose={() => {}} onSuccess={() => { fetch("/api/admin/check").then((r) => r.json()).then((j) => setAdminAuthed(!!j.admin)).catch(() => {}); }} />
      )}
    </div>
  );
}
