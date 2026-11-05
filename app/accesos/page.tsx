"use client";
import { useCallback, useEffect, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { Spinner, EmptyState } from "@/components/ui";

type Area = { id: string; nombre: string; responsableUserId: number; responsableNombre: string | null; mails: number; shares: number };
type Mail = { id: string; nombre: string; direccion: string; areaId: string; area: string; personas: number; envian: number; reciben: number };
type Share = { id: string; nombre: string; ruta: string; areaId: string; area: string; personas: number };
type GlpiUser = { id: number; login: string | null; display: string };
type MailGrant = { accountId: string; userId: number; userDisplay: string | null; canSend: boolean; canRead: boolean; nombre?: string; direccion?: string; area?: string };
type ShareGrant = { shareId: string; userId: number; userDisplay: string | null; nombre?: string; ruta?: string; area?: string };

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" />
      <div className={`relative bg-white w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-lift overflow-hidden`}>
        <div className="p-4 pb-3 border-b border-line flex items-start justify-between gap-2">
          <h2 className="font-bold text-ink">{title}</h2>
          <button className="btn btn-secondary icon-btn-sm" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="p-4 grid gap-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function SubModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-md max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-lift overflow-hidden">
        <div className="p-4 pb-3 border-b border-line flex items-start justify-between gap-2">
          <h2 className="font-bold text-ink">{title}</h2>
          <button className="btn btn-secondary icon-btn-sm" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="p-4 grid gap-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function UserSearch({ value, onPick }: { value: GlpiUser | null; onPick: (u: GlpiUser | null) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GlpiUser[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    setMsg("Buscando…");
    try {
      const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(q.trim())}`);
      const j = await r.json();
      if (!r.ok) { setMsg("Error: " + (j.error || r.status)); setRes([]); return; }
      setRes(j.users || []);
      setMsg(j.users?.length ? "" : "Sin personas en GLPI.");
    } catch (e: any) {
      setMsg(e.message || "Error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <label className="text-xs font-semibold text-ink">Responsable / Persona (usuario GLPI)</label>
      {value && (
        <div className="flex items-center justify-between gap-2 text-sm rounded-xl border border-line bg-canvas/60 px-3 py-2">
          <span className="truncate"><b>{value.display}</b> <span className="text-xs text-muted">#{value.id}</span></span>
          <button className="btn btn-secondary text-xs" onClick={() => onPick(null)}>Cambiar</button>
        </div>
      )}
      {!value && (
        <>
          <div className="flex gap-2">
            <input className="input flex-1 text-sm" placeholder="Nombre, apellido o usuario GLPI…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button className="btn btn-secondary text-xs" disabled={busy} onClick={search}>Buscar</button>
          </div>
          {msg && <p className="text-xs text-muted" role="status">{msg}</p>}
          {res.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
              <button className="btn btn-secondary text-xs shrink-0" onClick={() => onPick(u)}>Elegir</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function Accesos() {
  const [tab, setTab] = useState<"areas" | "mails" | "shares" | "personas">("areas");
  const [authChecked, setAuthChecked] = useState(false);
  const [canOperate, setCanOperate] = useState(false);
  const [login, setLogin] = useState("");
  const [authOpen, setAuthOpen] = useState(false);

  const [areas, setAreas] = useState<Area[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [areaFilter, setAreaFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // modales ABM
  const [areaModal, setAreaModal] = useState<null | { id?: string; nombre: string; resp: GlpiUser | null }>(null);
  const [mailModal, setMailModal] = useState<null | { id?: string; nombre: string; direccion: string; areaId: string }>(null);
  const [shareModal, setShareModal] = useState<null | { id?: string; nombre: string; ruta: string; areaId: string }>(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  // detalle recurso -> personas
  const [mailDetail, setMailDetail] = useState<null | { mail: Mail; personas: MailGrant[] }>(null);
  const [shareDetail, setShareDetail] = useState<null | { share: Share; personas: ShareGrant[] }>(null);
  const [grantUser, setGrantUser] = useState<GlpiUser | null>(null);
  const [grantSend, setGrantSend] = useState(true);
  const [grantRead, setGrantRead] = useState(true);
  const [grantAdd, setGrantAdd] = useState<null | "mail" | "share">(null);
  const [exporting, setExporting] = useState<string | null>(null);

  async function downloadExport(scope: "area" | "mail" | "share", id: string) {
    const key = `${scope}:${id}`;
    setExporting(key);
    try {
      const r = await fetch(`/api/access/export?scope=${scope}&id=${encodeURIComponent(id)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || `Error ${r.status}`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || `accesos-${scope}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  // ficha persona
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<GlpiUser[]>([]);
  const [pmsg, setPmsg] = useState("");
  const [selPerson, setSelPerson] = useState<GlpiUser | null>(null);
  const [pMails, setPMails] = useState<MailGrant[]>([]);
  const [pShares, setPShares] = useState<ShareGrant[]>([]);

  const refreshAuth = useCallback(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setCanOperate(!!j.canOperate);
      setLogin(j.authenticated ? (j.user?.login || "") : "");
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, []);
  useEffect(() => {
    refreshAuth();
    window.addEventListener("auth-changed", refreshAuth);
    return () => window.removeEventListener("auth-changed", refreshAuth);
  }, [refreshAuth]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const [a, m, s] = await Promise.all([
        fetch("/api/access/areas").then((r) => r.json()),
        fetch(`/api/access/mails${areaFilter ? `?area=${encodeURIComponent(areaFilter)}` : ""}`).then((r) => r.json()),
        fetch(`/api/access/shares${areaFilter ? `?area=${encodeURIComponent(areaFilter)}` : ""}`).then((r) => r.json()),
      ]);
      if (a.error) throw new Error(a.error);
      if (m.error) throw new Error(m.error);
      if (s.error) throw new Error(s.error);
      setAreas(a.areas || []);
      setMails(m.mails || []);
      setShares(s.shares || []);
    } catch (e: any) {
      setMsg(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }, [areaFilter]);

  useEffect(() => { if (canOperate) loadAll(); }, [canOperate, loadAll]);

  async function saveArea() {
    if (!areaModal) return;
    if (!areaModal.nombre.trim()) { setFormErr("Nombre requerido"); return; }
    if (!areaModal.id && !areaModal.resp) { setFormErr("Elegí el responsable (usuario GLPI)"); return; }
    setBusy(true);
    setFormErr("");
    try {
      const body: any = areaModal.id ? { id: areaModal.id, nombre: areaModal.nombre.trim() } : { nombre: areaModal.nombre.trim(), responsableUserId: areaModal.resp!.id };
      if (areaModal.id && areaModal.resp) body.responsableUserId = areaModal.resp.id;
      const r = await fetch("/api/access/areas", { method: areaModal.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setFormErr(j.error || `Error ${r.status}`); return; }
      setAreaModal(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteArea(a: Area) {
    if (!confirm(`Borrar el área "${a.nombre}"? Solo se permite si no tiene correos ni carpetas.`)) return;
    const r = await fetch(`/api/access/areas?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error || `Error ${r.status}`); return; }
    loadAll();
  }

  async function saveMail() {
    if (!mailModal) return;
    setBusy(true);
    setFormErr("");
    try {
      const body: any = mailModal.id ? { ...mailModal } : { nombre: mailModal.nombre, direccion: mailModal.direccion, areaId: mailModal.areaId };
      const r = await fetch("/api/access/mails", { method: mailModal.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setFormErr(j.error || `Error ${r.status}`); return; }
      setMailModal(null);
      loadAll();
      if (mailDetail && mailModal.id === mailDetail.mail.id) openMail(mailDetail.mail);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMail(m: Mail, force = false) {
    if (!confirm(force ? `Borrar "${m.nombre}" y sus ${m.personas} acceso(s)?` : `Borrar el correo "${m.nombre}" (${m.direccion})?`)) return;
    const r = await fetch(`/api/access/mails?id=${encodeURIComponent(m.id)}${force ? "&force=1" : ""}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 && !force) {
        if (confirm(`${j.error} ¿Borrar igual con sus accesos?`)) deleteMail(m, true);
        return;
      }
      alert(j.error || `Error ${r.status}`);
      return;
    }
    setMailDetail(null);
    loadAll();
  }

  async function saveShare() {
    if (!shareModal) return;
    setBusy(true);
    setFormErr("");
    try {
      const r = await fetch("/api/access/shares", { method: shareModal.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shareModal) });
      const j = await r.json();
      if (!r.ok) { setFormErr(j.error || `Error ${r.status}`); return; }
      setShareModal(null);
      loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteShare(s: Share, force = false) {
    if (!confirm(force ? `Borrar "${s.nombre}" y sus ${s.personas} acceso(s)?` : `Borrar la carpeta "${s.nombre}" (${s.ruta})?`)) return;
    const r = await fetch(`/api/access/shares?id=${encodeURIComponent(s.id)}${force ? "&force=1" : ""}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 && !force) {
        if (confirm(`${j.error} ¿Borrar igual con sus accesos?`)) deleteShare(s, true);
        return;
      }
      alert(j.error || `Error ${r.status}`);
      return;
    }
    setShareDetail(null);
    loadAll();
  }

  async function openMail(m: Mail) {
    const r = await fetch(`/api/access/grants?accountId=${encodeURIComponent(m.id)}`);
    const j = await r.json();
    if (!r.ok) { setMsg(j.error || "Error"); return; }
    setMailDetail({ mail: m, personas: j.personas || [] });
    setGrantUser(null);
    setGrantAdd(null);
    setGrantSend(true);
    setGrantRead(true);
  }

  async function openShare(s: Share) {
    const r = await fetch(`/api/access/grants?shareId=${encodeURIComponent(s.id)}`);
    const j = await r.json();
    if (!r.ok) { setMsg(j.error || "Error"); return; }
    setShareDetail({ share: s, personas: j.personas || [] });
    setGrantUser(null);
    setGrantAdd(null);
  }

  async function addMailGrant() {
    if (!mailDetail || !grantUser) return;
    const r = await fetch("/api/access/grants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "mail", accountId: mailDetail.mail.id, userId: grantUser.id, canSend: grantSend, canRead: grantRead }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error || `Error ${r.status}`); return; }
    setGrantUser(null);
    openMail(mailDetail.mail);
    loadAll();
  }

  async function updateMailGrant(g: MailGrant, patch: Partial<MailGrant>) {
    const r = await fetch("/api/access/grants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "mail", accountId: g.accountId, userId: g.userId, canSend: patch.canSend ?? g.canSend, canRead: patch.canRead ?? g.canRead }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error || `Error ${r.status}`); return; }
    if (mailDetail) openMail(mailDetail.mail);
    if (selPerson) openPerson(selPerson);
    loadAll();
  }

  async function removeMailGrant(g: MailGrant) {
    if (!confirm(`Quitar a ${g.userDisplay || `#${g.userId}`} de este correo?`)) return;
    await fetch(`/api/access/grants?scope=mail&accountId=${encodeURIComponent(g.accountId)}&userId=${g.userId}`, { method: "DELETE" });
    if (mailDetail) openMail(mailDetail.mail);
    if (selPerson) openPerson(selPerson);
    loadAll();
  }

  async function addShareGrant() {
    if (!shareDetail || !grantUser) return;
    const r = await fetch("/api/access/grants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "share", shareId: shareDetail.share.id, userId: grantUser.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error || `Error ${r.status}`); return; }
    setGrantUser(null);
    openShare(shareDetail.share);
    loadAll();
  }

  async function removeShareGrant(g: ShareGrant) {
    if (!confirm(`Quitar acceso de ${g.userDisplay || `#${g.userId}`} a esta carpeta?`)) return;
    await fetch(`/api/access/grants?scope=share&shareId=${encodeURIComponent(g.shareId)}&userId=${g.userId}`, { method: "DELETE" });
    if (shareDetail) openShare(shareDetail.share);
    if (selPerson) openPerson(selPerson);
    loadAll();
  }

  async function searchPeople() {
    if (!pq.trim()) return;
    setPmsg("Buscando…");
    const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(pq.trim())}`);
    const j = await r.json();
    if (!r.ok) { setPmsg("Error: " + (j.error || r.status)); setPresults([]); return; }
    setPresults(j.users || []);
    setPmsg(j.users?.length ? "" : "Sin personas en GLPI.");
  }

  async function openPerson(p: GlpiUser) {
    setSelPerson(p);
    setPmsg("Cargando accesos…");
    const r = await fetch(`/api/access/grants?user_id=${p.id}`);
    const j = await r.json();
    if (!r.ok) { setPmsg("Error: " + (j.error || r.status)); return; }
    setPMails(j.mails || []);
    setPShares(j.shares || []);
    setPmsg("");
  }

  if (!authChecked) {
    return (
      <div className="grid gap-4">
        <div className="page-header"><h1>Accesos 🔒</h1><p>Verificando permisos…</p></div>
        <Spinner label="Verificando sesión…" />
      </div>
    );
  }

  if (!canOperate) {
    return (
      <div className="grid gap-4">
        <div className="page-header"><h1>Accesos 🔒</h1><p>Acceso restringido a usuarios con permiso de edición.</p></div>
        <div className="card p-6 grid gap-3 text-center max-w-[480px] mx-auto w-full">
          <span className="text-4xl" aria-hidden="true">🔒</span>
          <b className="text-ink">{login ? `Sesión como ${login} sin permiso` : "Iniciá sesión para continuar"}</b>
          <p className="text-sm text-muted">Áreas, correos institucionales y carpetas compartidas. Requiere perfil operador (Super-Admin/Admin según GLPI_OPERATOR_PROFILES).</p>
          <button className="btn btn-primary text-sm mx-auto" onClick={() => setAuthOpen(true)}>{login ? "Cambiar de usuario" : "Iniciar sesión"}</button>
        </div>
        {authOpen && (
          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { refreshAuth(); window.dispatchEvent(new Event("auth-changed")); }} />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="page-header">
        <h1>Accesos</h1>
        <p>Áreas, correos institucionales y carpetas compartidas. Todo requiere sesión con permiso (sin lectura anónima).</p>
      </div>

      <div className="card p-3 grid gap-2">
        <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Secciones">
          {(["areas", "mails", "shares", "personas"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${tab === t ? "text-white border-transparent" : "bg-white text-muted border-line hover:text-ink"}`}
              style={tab === t ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}>
              {t === "areas" ? "Áreas" : t === "mails" ? "Correos" : t === "shares" ? "Carpetas" : "Personas"}
            </button>
          ))}
        </div>
        {(tab === "mails" || tab === "shares") && (
          <div className="flex gap-2 flex-wrap items-center">
            <label className="text-xs font-semibold text-ink" htmlFor="acc-area">Filtrar por área</label>
            <select id="acc-area" className="input text-sm max-w-[280px]" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="">Todas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        )}
        {msg && <p className="text-sm text-danger" role="alert">{msg}</p>}
      </div>

      {loading && <Spinner label="Cargando accesos…" />}

      {tab === "areas" && !loading && (
        <div className="card overflow-x-auto p-0">
          <div className="p-3 flex justify-end"><button className="btn btn-primary text-xs" onClick={() => { setFormErr(""); setAreaModal({ nombre: "", resp: null }); }}>+ Nueva área</button></div>
          <table className="table-dense min-w-[420px]">
            <thead><tr><th>Área</th><th className="hidden md:table-cell">Responsable (GLPI)</th><th title="Correos"><span aria-hidden="true">✉️</span><span className="sr-only">Correos</span></th><th title="Carpetas"><span aria-hidden="true">📁</span><span className="sr-only">Carpetas</span></th><th>Acciones</th></tr></thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.nombre}</b><span className="block text-xs text-muted font-normal md:hidden">{a.responsableNombre || "—"}</span></td>
                  <td className="text-sm hidden md:table-cell">{a.responsableNombre || "—"} <span className="text-xs text-muted">#{a.responsableUserId}</span></td>
                  <td className="tabular-nums">{a.mails}</td>
                  <td className="tabular-nums">{a.shares}</td>
                  <td><span className="inline-flex gap-1">
                    <button className="btn btn-secondary icon-btn-sm" title="Editar" aria-label={`Editar área ${a.nombre}`} onClick={() => setAreaModal({ id: a.id, nombre: a.nombre, resp: { id: a.responsableUserId, login: null, display: a.responsableNombre || `#${a.responsableUserId}` } })}>✏️</button>
                    <button className="btn btn-secondary icon-btn-sm" title="Exportar Excel" aria-label={`Exportar Excel del área ${a.nombre}`} disabled={exporting === `area:${a.id}`} onClick={() => downloadExport("area", a.id)}>{exporting === `area:${a.id}` ? "⏳" : "📥"}</button>
                    <button className="btn btn-danger icon-btn-sm" title="Borrar" aria-label={`Borrar área ${a.nombre}`} onClick={() => deleteArea(a)}>🗑️</button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!areas.length && <div className="p-4"><EmptyState title="Sin áreas" hint="Creá la primera con + Nueva área." /></div>}
        </div>
      )}

      {tab === "mails" && !loading && (
        <div className="card overflow-x-auto p-0">
          <div className="p-3 flex justify-end"><button className="btn btn-primary text-xs" onClick={() => { setFormErr(""); setMailModal({ nombre: "", direccion: "", areaId: areaFilter || areas[0]?.id || "" }); }}>+ Nuevo correo</button></div>
          <table className="table-dense min-w-[420px]">
            <thead><tr><th>Nombre</th><th className="hidden md:table-cell">Dirección</th><th className="hidden md:table-cell">Área</th><th className="hidden md:table-cell">Personas</th><th>Envían/Reciben</th><th>Acciones</th></tr></thead>
            <tbody>
              {mails.map((m) => (
                <tr key={m.id} className="cursor-pointer" title={`Ver personas de ${m.nombre}`} tabIndex={0}
                  onClick={() => openMail(m)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMail(m); } }}>
                  <td><b>{m.nombre}</b><span className="block text-xs text-muted font-normal tabular-nums md:hidden">{m.direccion}</span><span className="block text-xs text-muted font-normal md:hidden">{m.area}</span></td>
                  <td className="tabular-nums text-sm hidden md:table-cell">{m.direccion}</td>
                  <td className="text-sm hidden md:table-cell">{m.area}</td>
                  <td className="tabular-nums hidden md:table-cell">{m.personas} <span className="text-muted" aria-hidden="true">›</span></td>
                  <td className="text-xs text-muted tabular-nums">{m.envian} ✉️ / {m.reciben} 👁️</td>
                  <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><span className="inline-flex gap-1">
                    <button className="btn btn-secondary icon-btn-sm" title="Exportar Excel" aria-label={`Exportar Excel de ${m.nombre}`} disabled={exporting === `mail:${m.id}`} onClick={() => downloadExport("mail", m.id)}>{exporting === `mail:${m.id}` ? "⏳" : "📥"}</button>
                    <button className="btn btn-secondary icon-btn-sm" title="Editar" aria-label={`Editar correo ${m.nombre}`} onClick={() => { setFormErr(""); setMailModal({ id: m.id, nombre: m.nombre, direccion: m.direccion, areaId: m.areaId }); }}>✏️</button>
                    <button className="btn btn-danger icon-btn-sm" title="Borrar" aria-label={`Borrar correo ${m.nombre}`} onClick={() => deleteMail(m)}>🗑️</button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!mails.length && <div className="p-4"><EmptyState title="Sin correos" hint="Creá el primero con + Nuevo correo." /></div>}
        </div>
      )}

      {tab === "shares" && !loading && (
        <div className="card overflow-x-auto p-0">
          <div className="p-3 flex justify-end"><button className="btn btn-primary text-xs" onClick={() => { setFormErr(""); setShareModal({ nombre: "", ruta: "", areaId: areaFilter || areas[0]?.id || "" }); }}>+ Nueva carpeta</button></div>
          <table className="table-dense min-w-[380px]">
            <thead><tr><th>Nombre</th><th className="hidden md:table-cell">Ruta</th><th className="hidden md:table-cell">Área</th><th>Personas</th><th>Acciones</th></tr></thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.id} className="cursor-pointer" title={`Ver personas de ${s.nombre}`} tabIndex={0}
                  onClick={() => openShare(s)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openShare(s); } }}>
                  <td><b>{s.nombre}</b><span className="block text-xs text-muted font-normal tabular-nums md:hidden truncate" title={s.ruta}>{s.ruta}</span><span className="block text-xs text-muted font-normal md:hidden">{s.area}</span></td>
                  <td className="tabular-nums text-sm max-w-[280px] hidden md:table-cell"><span className="block truncate" title={s.ruta}>{s.ruta}</span></td>
                  <td className="text-sm hidden md:table-cell">{s.area}</td>
                  <td className="tabular-nums">{s.personas} <span className="text-muted" aria-hidden="true">›</span></td>
                  <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><span className="inline-flex gap-1">
                    <button className="btn btn-secondary icon-btn-sm" title="Exportar Excel" aria-label={`Exportar Excel de ${s.nombre}`} disabled={exporting === `share:${s.id}`} onClick={() => downloadExport("share", s.id)}>{exporting === `share:${s.id}` ? "⏳" : "📥"}</button>
                    <button className="btn btn-secondary icon-btn-sm" title="Editar" aria-label={`Editar carpeta ${s.nombre}`} onClick={() => { setFormErr(""); setShareModal({ id: s.id, nombre: s.nombre, ruta: s.ruta, areaId: s.areaId }); }}>✏️</button>
                    <button className="btn btn-danger icon-btn-sm" title="Borrar" aria-label={`Borrar carpeta ${s.nombre}`} onClick={() => deleteShare(s)}>🗑️</button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shares.length && <div className="p-4"><EmptyState title="Sin carpetas" hint="Creá la primera con + Nueva carpeta." /></div>}
        </div>
      )}

      {tab === "personas" && (
        <div className="grid gap-3">
          <div className="card p-4 grid gap-2">
            <div className="flex gap-2">
              <input className="input flex-1 min-w-0" placeholder="Nombre, apellido o usuario GLPI…" value={pq} onChange={(e) => setPq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchPeople()} />
              <button className="btn btn-primary shrink-0" onClick={searchPeople}>Buscar</button>
            </div>
            {pmsg && <p className="text-sm text-muted" role="status">{pmsg}</p>}
            <div className="grid gap-2">
              {presults.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 flex-wrap text-sm card p-3">
                  <span className="min-w-0"><b className="block truncate">{p.display}</b> <span className="text-xs text-muted">#{p.id}</span></span>
                  <button className="btn btn-secondary text-xs shrink-0" onClick={() => openPerson(p)}>Ver accesos →</button>
                </div>
              ))}
            </div>
          </div>
          {selPerson && (
            <div className="card p-4 grid gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div><b className="text-ink text-base">Ficha de accesos: {selPerson.display}</b><div className="text-xs text-muted">GLPI #{selPerson.id}</div></div>
                <button className="text-sm text-muted underline" onClick={() => { setSelPerson(null); setPMails([]); setPShares([]); }}>← Volver</button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="card p-3 grid gap-2">
                  <b className="text-sm">✉️ Correos ({pMails.length})</b>
                  {pMails.map((g) => (
                    <div key={g.accountId} className="flex items-center justify-between gap-2 flex-wrap text-sm border-t pt-2">
                      <span className="min-w-0 flex-1 basis-40"><span className="block truncate font-medium">{g.nombre}</span><span className="block truncate text-xs text-muted">{g.direccion} · {g.area}</span></span>
                      <span className="inline-flex gap-1 shrink-0 flex-wrap justify-end">
                        <label className="badge cursor-pointer" title="Puede enviar"><input type="checkbox" checked={g.canSend} onChange={(e) => updateMailGrant(g, { canSend: e.target.checked })} /> ✉️</label>
                        <label className="badge cursor-pointer" title="Puede recibir/leer"><input type="checkbox" checked={g.canRead} onChange={(e) => updateMailGrant(g, { canRead: e.target.checked })} /> 👁️</label>
                        <button className="btn btn-danger icon-btn-sm" title="Quitar acceso" aria-label={`Quitar ${g.nombre || ""}`} onClick={() => removeMailGrant(g)}>🗑️</button>
                      </span>
                    </div>
                  ))}
                  {!pMails.length && <p className="text-sm text-muted">Sin correos asignados.</p>}
                </div>
                <div className="card p-3 grid gap-2">
                  <b className="text-sm">📁 Carpetas ({pShares.length})</b>
                  {pShares.map((g) => (
                    <div key={g.shareId} className="flex items-center justify-between gap-2 flex-wrap text-sm border-t pt-2">
                      <span className="min-w-0 flex-1 basis-40"><span className="block truncate font-medium">{g.nombre}</span><span className="block truncate text-xs text-muted" title={g.ruta}>{g.ruta} · {g.area}</span></span>
                      <button className="btn btn-danger icon-btn-sm shrink-0" title="Quitar acceso" aria-label={`Quitar ${g.nombre || ""}`} onClick={() => removeShareGrant(g)}>🗑️</button>
                    </div>
                  ))}
                  {!pShares.length && <p className="text-sm text-muted">Sin carpetas asignadas.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {areaModal && (
        <Modal title={areaModal.id ? "Editar área" : "Nueva área"} onClose={() => setAreaModal(null)}>
          <label className="grid gap-1 text-sm">Nombre<input className="input text-sm" value={areaModal.nombre} onChange={(e) => setAreaModal({ ...areaModal, nombre: e.target.value })} placeholder="Ej. Administración" /></label>
          <UserSearch value={areaModal.resp} onPick={(u) => setAreaModal({ ...areaModal, resp: u })} />
          {formErr && <p className="text-sm text-danger" role="alert">{formErr}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary text-xs" onClick={() => setAreaModal(null)}>Cancelar</button>
            <button className="btn btn-primary text-xs" disabled={busy} onClick={saveArea}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </Modal>
      )}

      {mailModal && (
        <Modal title={mailModal.id ? "Editar correo" : "Nuevo correo"} onClose={() => setMailModal(null)}>
          <label className="grid gap-1 text-sm">Nombre<input className="input text-sm" value={mailModal.nombre} onChange={(e) => setMailModal({ ...mailModal, nombre: e.target.value })} placeholder="Ej. Ventas" /></label>
          <label className="grid gap-1 text-sm">Dirección<input className="input text-sm tabular-nums" value={mailModal.direccion} onChange={(e) => setMailModal({ ...mailModal, direccion: e.target.value })} placeholder="ventas@ejemplo.org" /></label>
          <label className="grid gap-1 text-sm">Área
            <select className="input text-sm" value={mailModal.areaId} onChange={(e) => setMailModal({ ...mailModal, areaId: e.target.value })}>
              <option value="">Elegir área…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          {formErr && <p className="text-sm text-danger" role="alert">{formErr}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary text-xs" onClick={() => setMailModal(null)}>Cancelar</button>
            <button className="btn btn-primary text-xs" disabled={busy} onClick={saveMail}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </Modal>
      )}

      {shareModal && (
        <Modal title={shareModal.id ? "Editar carpeta" : "Nueva carpeta"} onClose={() => setShareModal(null)}>
          <label className="grid gap-1 text-sm">Nombre<input className="input text-sm" value={shareModal.nombre} onChange={(e) => setShareModal({ ...shareModal, nombre: e.target.value })} placeholder="Ej. Contable" /></label>
          <label className="grid gap-1 text-sm">Ruta<input className="input text-sm tabular-nums" value={shareModal.ruta} onChange={(e) => setShareModal({ ...shareModal, ruta: e.target.value })} placeholder="\\\\srv\\contable" /></label>
          <label className="grid gap-1 text-sm">Área
            <select className="input text-sm" value={shareModal.areaId} onChange={(e) => setShareModal({ ...shareModal, areaId: e.target.value })}>
              <option value="">Elegir área…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          {formErr && <p className="text-sm text-danger" role="alert">{formErr}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary text-xs" onClick={() => setShareModal(null)}>Cancelar</button>
            <button className="btn btn-primary text-xs" disabled={busy} onClick={saveShare}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </Modal>
      )}

      {mailDetail && (
        <Modal wide title={`Personas con acceso a ${mailDetail.mail.nombre}`} onClose={() => setMailDetail(null)}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted">{mailDetail.mail.direccion} · Área {mailDetail.mail.area}</p>
            <div className="flex gap-1 flex-wrap">
              <button className="btn btn-primary text-xs" onClick={() => { setGrantUser(null); setGrantSend(true); setGrantRead(true); setGrantAdd("mail"); }} aria-label="Agregar persona">+ Agregar</button>
              <button className="btn btn-secondary text-xs" disabled={exporting === `mail:${mailDetail.mail.id}`} onClick={() => downloadExport("mail", mailDetail.mail.id)}>{exporting === `mail:${mailDetail.mail.id}` ? "Exportando…" : "Excel ↓"}</button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="table-dense min-w-[340px]">
              <thead><tr><th>Persona</th><th title="Puede enviar"><span aria-hidden="true">✉️</span><span className="sr-only">Envía</span></th><th title="Puede recibir"><span aria-hidden="true">👁️</span><span className="sr-only">Recibe</span></th><th><span className="sr-only">Quitar</span></th></tr></thead>
              <tbody>
                {mailDetail.personas.map((g) => (
                  <tr key={g.userId}>
                    <td className="min-w-0"><span className="block truncate" title={g.userDisplay || `#${g.userId}`}>{g.userDisplay || `#${g.userId}`} <span className="text-xs text-muted">#{g.userId}</span></span></td>
                    <td><input type="checkbox" aria-label="Envía" checked={g.canSend} onChange={(e) => updateMailGrant(g, { canSend: e.target.checked })} /></td>
                    <td><input type="checkbox" aria-label="Recibe" checked={g.canRead} onChange={(e) => updateMailGrant(g, { canRead: e.target.checked })} /></td>
                    <td><button className="btn btn-danger icon-btn-sm" title="Quitar acceso" aria-label={`Quitar acceso de ${g.userDisplay || g.userId}`} onClick={() => removeMailGrant(g)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!mailDetail.personas.length && <p className="text-sm text-muted p-2">Nadie tiene acceso aún. Tocá <b>+ Agregar</b> para otorgar.</p>}
          </div>
        </Modal>
      )}

      {shareDetail && (
        <Modal wide title={`Personas con acceso a ${shareDetail.share.nombre}`} onClose={() => setShareDetail(null)}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted tabular-nums">{shareDetail.share.ruta} · Área {shareDetail.share.area}</p>
            <div className="flex gap-1 flex-wrap">
              <button className="btn btn-primary text-xs" onClick={() => { setGrantUser(null); setGrantAdd("share"); }} aria-label="Agregar persona">+ Agregar</button>
              <button className="btn btn-secondary text-xs" disabled={exporting === `share:${shareDetail.share.id}`} onClick={() => downloadExport("share", shareDetail.share.id)}>{exporting === `share:${shareDetail.share.id}` ? "Exportando…" : "Excel ↓"}</button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="table-dense min-w-[320px]">
              <thead><tr><th>Persona</th><th><span className="sr-only">Quitar</span></th></tr></thead>
              <tbody>
                {shareDetail.personas.map((g) => (
                  <tr key={g.userId}>
                    <td className="min-w-0"><span className="block truncate" title={g.userDisplay || `#${g.userId}`}>{g.userDisplay || `#${g.userId}`} <span className="text-xs text-muted">#{g.userId}</span></span></td>
                    <td><button className="btn btn-danger icon-btn-sm" title="Quitar acceso" aria-label={`Quitar acceso de ${g.userDisplay || g.userId}`} onClick={() => removeShareGrant(g)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shareDetail.personas.length && <p className="text-sm text-muted p-2">Nadie tiene acceso aún. Tocá <b>+ Agregar</b> para otorgar.</p>}
          </div>
        </Modal>
      )}

      {grantAdd === "mail" && mailDetail && (
        <SubModal title={`Agregar a ${mailDetail.mail.nombre}`} onClose={() => { setGrantAdd(null); setGrantUser(null); }}>
          <UserSearch value={grantUser} onPick={setGrantUser} />
          {grantUser && (
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-1"><input type="checkbox" checked={grantSend} onChange={(e) => setGrantSend(e.target.checked)} /> Envía ✉️</label>
                <label className="inline-flex items-center gap-1"><input type="checkbox" checked={grantRead} onChange={(e) => setGrantRead(e.target.checked)} /> Recibe 👁️</label>
              </div>
              <div className="flex gap-2 justify-end">
                <button className="btn btn-secondary text-xs" onClick={() => { setGrantAdd(null); setGrantUser(null); }}>Listo</button>
                <button className="btn btn-primary text-xs" onClick={addMailGrant}>Otorgar</button>
              </div>
            </div>
          )}
          {!grantUser && <div className="flex justify-end"><button className="btn btn-secondary text-xs" onClick={() => setGrantAdd(null)}>Cerrar</button></div>}
        </SubModal>
      )}

      {grantAdd === "share" && shareDetail && (
        <SubModal title={`Agregar a ${shareDetail.share.nombre}`} onClose={() => { setGrantAdd(null); setGrantUser(null); }}>
          <UserSearch value={grantUser} onPick={setGrantUser} />
          {grantUser && (
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary text-xs" onClick={() => { setGrantAdd(null); setGrantUser(null); }}>Listo</button>
              <button className="btn btn-primary text-xs" onClick={addShareGrant}>Otorgar acceso</button>
            </div>
          )}
          {!grantUser && <div className="flex justify-end"><button className="btn btn-secondary text-xs" onClick={() => setGrantAdd(null)}>Cerrar</button></div>}
        </SubModal>
      )}

      {authOpen && (
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { refreshAuth(); window.dispatchEvent(new Event("auth-changed")); }} />
      )}
    </div>
  );
}
