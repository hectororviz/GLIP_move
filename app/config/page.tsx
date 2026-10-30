"use client";
import { useEffect, useState } from "react";
import { ParentPicker, useLocations } from "@/components/Places";

type Floor = {
  id: string;
  name: string;
  image: string | null;
  glpiLocationId: number | null;
  puestos: { glpi_id: number; x: number; y: number; w: number; h: number }[];
};

const ACCENTS = ["#0b5ed7", "#0f766e", "#7c3aed", "#b45309", "#b91c1c", "#1d4ed8", "#0891b2", "#4f46e5"];

export default function ConfigPage() {
  const [form, setForm] = useState({ glpiBaseUrl: "", appToken: "", userToken: "", keepUserOnMove: true, appName: "GLPI Move", accentColor: "#0b5ed7" });
  const [sets, setSets] = useState({ appTokenSet: false, userTokenSet: false });
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [msg, setMsg] = useState("");
  const [testRes, setTestRes] = useState("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [newFloor, setNewFloor] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [tab, setTab] = useState<"conn" | "floors" | "look" | "adv">("conn");
  const [loginOpen, setLoginOpen] = useState(true);
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
      }));
      setSets({ appTokenSet: !!j.appTokenSet, userTokenSet: !!j.userTokenSet });
    }).catch(() => {});
    refreshFloors();
  }, []);

  useEffect(() => {
    setLoginOpen(!authed);
  }, [authed]);

  async function login() {
    const r = await fetch("/api/config/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pass }) });
    setAuthed(r.ok);
    setMsg(r.ok ? "Sesión admin iniciada" : "");
    if (r.ok) { setLoginOpen(false); refreshFloors(); }
  }

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
        setForm((f) => ({ ...f, glpiBaseUrl: c.glpiBaseUrl || f.glpiBaseUrl, appName: c.appName || f.appName, accentColor: c.accentColor || f.accentColor }));
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
        {authed ? (
          <span className="badge badge-success">Sesión admin activa</span>
        ) : (
          <button onClick={() => setLoginOpen(true)} className="btn btn-primary text-xs">Iniciar sesión admin</button>
        )}
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>

      <div className="card p-2 flex gap-1 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
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
        <section className="card p-4 grid gap-3">
          <h2 className="font-bold">Conexión GLPI 10 (API legacy)</h2>
          <label className="text-sm grid gap-1">GLPI Base URL
            <input className="input" value={form.glpiBaseUrl} onChange={(e) => setForm({ ...form, glpiBaseUrl: e.target.value })} placeholder="http://192.168.170.125" disabled={!authed} />
          </label>
          <label className="text-sm grid gap-1">App-Token (Setup &gt; API clients) {sets.appTokenSet && <span className="badge badge-success">guardado</span>}
            <input className="input" value={form.appToken} onChange={(e) => setForm({ ...form, appToken: e.target.value })} placeholder="vacío = no cambiar" disabled={!authed} />
          </label>
          <label className="text-sm grid gap-1">User token (clave de acceso remoto del usuario) {sets.userTokenSet && <span className="badge badge-success">guardado</span>}
            <input type="password" className="input" value={form.userToken} onChange={(e) => setForm({ ...form, userToken: e.target.value })} placeholder="vacío = no cambiar" disabled={!authed} />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button onClick={save} disabled={!authed} className="btn btn-primary">Guardar</button>
            <button onClick={test} disabled={!authed} className="btn btn-secondary">Probar conexión</button>
          </div>
          {testRes && <p className="text-sm text-muted">{testRes}</p>}
        </section>
      )}

      {tab === "floors" && (
        <section className="card p-4 grid gap-3">
          <h2 className="font-bold">Planos por piso</h2>
          <p className="text-xs text-muted">Cada piso se vincula a su ubicación GLPI padre. Los puestos a dibujar serán sus hijos.</p>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Nuevo piso, ej. 1° piso" value={newFloor} onChange={(e) => setNewFloor(e.target.value)} disabled={!authed} />
            <button onClick={addFloor} disabled={!authed} className="btn btn-primary">Agregar</button>
          </div>
          {floors.map((f) => {
            const kids = f.glpiLocationId != null ? childrenOf.get(f.glpiLocationId) || [] : [];
            return (
              <div key={f.id} className="card p-4 grid gap-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <b className="text-ink">{f.name}</b>
                  <button onClick={() => delFloor(f.id, f.name)} disabled={!authed} className="text-xs text-danger underline disabled:opacity-40">eliminar</button>
                </div>
                <label className="text-xs grid gap-1">Ubicación GLPI padre (el piso)
                  <ParentPicker value={f.glpiLocationId} onChange={(id) => authed && setParent(f, id)} />
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
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!authed || !!uploading}
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
            <input className="input" value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} disabled={!authed} maxLength={40} />
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
                  disabled={!authed}
                />
              ))}
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                disabled={!authed}
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
          <div className="flex gap-2">
            <button onClick={save} disabled={!authed} className="btn btn-primary">Guardar apariencia</button>
            <button onClick={() => setForm((f) => ({ ...f, appName: "GLPI Move", accentColor: "#0b5ed7" }))} disabled={!authed} className="btn btn-secondary">Restablecer</button>
          </div>
        </section>
      )}

      {tab === "adv" && (
        <section className="card p-4 grid gap-3">
          <h2 className="font-bold">Avanzada</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.keepUserOnMove} onChange={(e) => setForm({ ...form, keepUserOnMove: e.target.checked })} disabled={!authed} />
            Conservar usuario asignado al mover un bien
          </label>
          <button onClick={save} disabled={!authed} className="btn btn-primary w-fit">Guardar</button>
        </section>
      )}

      {loginOpen && !authed && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="card p-5 w-full max-w-sm grid gap-3">
            <h2 className="font-bold text-lg">Acceso administrador</h2>
            <p className="text-sm text-muted">Ingresa la clave local (ADMIN_PASSWORD) para administrar.</p>
            <input
              type="password"
              className="input"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLoginOpen(false)} className="btn btn-secondary text-xs">Cancelar</button>
              <button onClick={login} className="btn btn-primary text-xs">Entrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
