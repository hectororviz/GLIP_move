"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { Spinner, EmptyState, SidePanel, Tabs, AdminSection, SearchCombobox, ConfirmDialog, CopyButton, BusyButton, PermBadges, ExpandableMeta, decodeEntities } from "@/components/ui";
import { IconDownload, IconEye, IconFolder, IconMail, IconPlus, IconUser, IconBuilding } from "@/components/icons";

type Area = { id: string; nombre: string; responsableUserId: number; responsableNombre: string | null; mails: number; shares: number };
type Mail = { id: string; nombre: string; direccion: string; areaId: string; area: string; personas: number; envian: number; reciben: number };
type Share = { id: string; nombre: string; ruta: string; areaId: string; area: string; personas: number };
type GlpiUser = { id: number; login: string | null; display: string };
type MailGrant = { accountId: string; userId: number; userDisplay: string | null; canSend: boolean; canRead: boolean; nombre?: string; direccion?: string; area?: string };
type ShareGrant = { shareId: string; userId: number; userDisplay: string | null; nombre?: string; ruta?: string; area?: string };

type Panel =
  | { kind: "area"; area: Area; mails: Mail[]; shares: Share[] }
  | { kind: "mail"; mail: Mail; personas: MailGrant[] }
  | { kind: "share"; share: Share; personas: ShareGrant[] }
  | { kind: "person"; user: GlpiUser; mails: MailGrant[]; shares: ShareGrant[] };

type ConfirmState =
  | { kind: "delArea"; area: Area }
  | { kind: "delMail"; mail: Mail; force: boolean; serverMsg?: string }
  | { kind: "delShare"; share: Share; force: boolean; serverMsg?: string }
  | { kind: "rmMail"; g: MailGrant }
  | { kind: "rmShare"; g: ShareGrant };

function Modal({ title, onClose, children, guard }: { title: string; onClose: () => void; children: React.ReactNode; guard?: string | null }) {
  useEffect(() => {
    const tryClose = () => { if (guard && !confirm(guard)) return; onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") tryClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, guard]);
  const tryClose = () => { if (guard && !confirm(guard)) return; onClose(); };
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50" onClick={tryClose} aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-lift overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="p-4 pb-3 border-b border-line flex items-start justify-between gap-2">
          <h2 className="font-bold text-ink">{title}</h2>
          <button className="btn btn-secondary icon-btn tap-target" onClick={tryClose} aria-label="Cerrar diálogo">✕</button>
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white w-full sm:max-w-md max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-lift overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="p-4 pb-3 border-b border-line flex items-start justify-between gap-2">
          <h2 className="font-bold text-ink">{title}</h2>
          <button className="btn btn-secondary icon-btn tap-target" onClick={onClose} aria-label="Cerrar diálogo">✕</button>
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function search(term?: string) {
    const t = (term ?? q).trim();
    if (!t) return;
    setBusy(true);
    setMsg("Buscando…");
    try {
      const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(t)}`);
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
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) return;
    debounceRef.current = setTimeout(() => { search(q); }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="grid gap-2">
      <label className="text-xs font-semibold text-ink" htmlFor="acc-user-q">Responsable / Persona (usuario GLPI)</label>
      {value && (
        <div className="flex items-center justify-between gap-2 text-sm rounded-xl border border-line bg-canvas/60 px-3 py-2 min-h-[52px]">
          <span className="truncate min-w-0"><b>{value.display}</b> <span className="text-xs text-muted">#{value.id}</span></span>
          <button className="btn btn-secondary text-xs shrink-0" onClick={() => onPick(null)}>Cambiar</button>
        </div>
      )}
      {!value && (
        <>
          <div className="flex gap-2">
            <input id="acc-user-q" className="input flex-1 text-sm min-w-0" placeholder="Nombre, apellido o usuario GLPI…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button className="btn btn-secondary text-sm shrink-0 tap-target" disabled={busy} onClick={() => search()}>Buscar</button>
          </div>
          {msg && <p className="text-xs text-muted" role="status">{msg}</p>}
          {res.length > 0 && (
            <ul className="grid gap-1.5 max-h-[220px] overflow-y-auto" aria-label="Usuarios encontrados">
              {res.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl px-3 py-2 min-h-[52px]">
                  <span className="truncate min-w-0" title={`${u.display} #${u.id}`}>{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
                  <button className="btn btn-secondary text-xs shrink-0" onClick={() => onPick(u)}>Elegir</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function PersonRow({ display, userId, onOpen, right }: { display: string; userId: number; onOpen: () => void; right: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 min-w-0 py-1.5 border-b border-line last:border-0">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line text-muted" aria-hidden="true">
        <IconUser size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <button type="button" className="rowlink font-medium text-ink text-[0.85rem] clamp-2" title={`${display} — abrir ficha`} onClick={onOpen}>{display}</button>
        <span className="block text-xs text-muted tabular-nums">GLPI #{userId}</span>
      </span>
      <span className="shrink-0">{right}</span>
    </li>
  );
}

export default function Accesos() {
  const [tab, setTab] = useState<"areas" | "mails" | "shares" | "personas">("areas");
  const [authChecked, setAuthChecked] = useState(false);
  const [canOperate, setCanOperate] = useState(false);
  const [access, setAccess] = useState<"full" | "read" | "none">("none");
  const [login, setLogin] = useState("");
  const [authOpen, setAuthOpen] = useState(false);

  const [areas, setAreas] = useState<Area[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [areaFilter, setAreaFilter] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // panel lateral + pila de navegación
  const [panel, setPanel] = useState<Panel | null>(null);
  const [stack, setStack] = useState<Panel[]>([]);
  const panelRef = useRef<Panel | null>(null);
  const scrollSave = useRef(0);
  const panelDirtyRef = useRef(false);
  const [panelErr, setPanelErr] = useState("");

  // modales ABM
  const [areaModal, setAreaModal] = useState<null | { id?: string; nombre: string; resp: GlpiUser | null }>(null);
  const [mailModal, setMailModal] = useState<null | { id?: string; nombre: string; direccion: string; areaId: string }>(null);
  const [shareModal, setShareModal] = useState<null | { id?: string; nombre: string; ruta: string; areaId: string }>(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  // otorgar accesos
  const [grantUser, setGrantUser] = useState<GlpiUser | null>(null);
  const [grantSend, setGrantSend] = useState(true);
  const [grantRead, setGrantRead] = useState(true);
  const [grantAdd, setGrantAdd] = useState<null | "mail" | "share">(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // búsqueda de personas
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<GlpiUser[]>([]);
  const [pmsg, setPmsg] = useState("");

  function setPanelBoth(p: Panel | null) { panelRef.current = p; setPanel(p); }
  function openPanel(p: Panel, push = true) {
    setPanelErr("");
    if (push) {
      if (!panelRef.current) scrollSave.current = window.scrollY;
      else setStack((s) => [...s, panelRef.current as Panel]);
      panelDirtyRef.current = false;
      setGrantUser(null);
      setGrantAdd(null);
    }
    setPanelBoth(p);
  }
  function closePanel() {
    if (panelDirtyRef.current && !confirm("Hay cambios sin guardar. ¿Cerrar sin guardar?")) return;
    if (stack.length) {
      const top = stack[stack.length - 1];
      setStack(stack.slice(0, -1));
      panelDirtyRef.current = false;
      setGrantUser(null);
      setGrantAdd(null);
      setPanelErr("");
      setPanelBoth(top);
      void refreshPanelFor(top);
    } else {
      setPanelBoth(null);
      setStack([]);
      panelDirtyRef.current = false;
      requestAnimationFrame(() => window.scrollTo({ top: scrollSave.current }));
    }
  }

  useEffect(() => { panelDirtyRef.current = grantUser != null; }, [grantUser]);

  async function refreshPanelFor(p: Panel) {
    try {
      if (p.kind === "area") {
        const r = await fetch(`/api/access/overview?area=${encodeURIComponent(p.area.id)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        const found = (j.areas || [])[0];
        if (found) setPanelBoth({ kind: "area", area: p.area, mails: found.mails || [], shares: found.shares || [] });
      } else if (p.kind === "mail") {
        const r = await fetch(`/api/access/grants?accountId=${encodeURIComponent(p.mail.id)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        setPanelBoth({ kind: "mail", mail: j.mail || p.mail, personas: j.personas || [] });
      } else if (p.kind === "share") {
        const r = await fetch(`/api/access/grants?shareId=${encodeURIComponent(p.share.id)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        setPanelBoth({ kind: "share", share: j.share || p.share, personas: j.personas || [] });
      } else {
        const r = await fetch(`/api/access/grants?user_id=${p.user.id}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        setPanelBoth({ kind: "person", user: p.user, mails: j.mails || [], shares: j.shares || [] });
      }
    } catch (e: any) {
      setPanelErr(e.message || "Error al actualizar");
    }
  }
  function refreshCurrent() { if (panelRef.current) void refreshPanelFor(panelRef.current); }

  async function downloadExport(scope: "area" | "mail" | "share" | "mails" | "shares" | "areas", id: string) {
    const key = `${scope}:${id}`;
    setExporting(key);
    try {
      const r = await fetch(`/api/access/export?scope=${scope}&id=${encodeURIComponent(id)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setMsg(j.error || `Error ${r.status}`);
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

  const refreshAuth = useCallback(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setCanOperate(!!j.canOperate);
      setAccess(j.access ? j.access : (j.canOperate ? "full" : "none"));
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

  useEffect(() => { if (access !== "none") loadAll(); }, [access, loadAll]);

  /* ---------- aperturas (información primero) ---------- */
  async function openAreaDetail(a: Area, push = true) {
    if (push) openPanel({ kind: "area", area: a, mails: [], shares: [] });
    try {
      const r = await fetch(`/api/access/overview?area=${encodeURIComponent(a.id)}`);
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Error"); return; }
      const found = (j.areas || [])[0];
      if (found) setPanelBoth({ kind: "area", area: a, mails: found.mails || [], shares: found.shares || [] });
    } catch (e: any) {
      setMsg(e.message || "Error");
    }
  }

  async function openMailDetail(m: Mail, push = true) {
    if (push) openPanel({ kind: "mail", mail: m, personas: [] });
    try {
      const r = await fetch(`/api/access/grants?accountId=${encodeURIComponent(m.id)}`);
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Error"); return; }
      setPanelBoth({ kind: "mail", mail: j.mail || m, personas: j.personas || [] });
    } catch (e: any) {
      setMsg(e.message || "Error");
    }
  }

  async function openShareDetail(s: Share, push = true) {
    if (push) openPanel({ kind: "share", share: s, personas: [] });
    try {
      const r = await fetch(`/api/access/grants?shareId=${encodeURIComponent(s.id)}`);
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Error"); return; }
      setPanelBoth({ kind: "share", share: j.share || s, personas: j.personas || [] });
    } catch (e: any) {
      setMsg(e.message || "Error");
    }
  }

  async function openPersonDetail(p: GlpiUser, push = true) {
    if (push) openPanel({ kind: "person", user: p, mails: [], shares: [] });
    try {
      const r = await fetch(`/api/access/grants?user_id=${p.id}`);
      const j = await r.json();
      if (!r.ok) { setMsg(j.error || "Error"); return; }
      setPanelBoth({ kind: "person", user: p, mails: j.mails || [], shares: j.shares || [] });
    } catch (e: any) {
      setMsg(e.message || "Error");
    }
  }

  function mailFromGrant(g: MailGrant): Mail {
    return { id: g.accountId, nombre: g.nombre || g.accountId, direccion: g.direccion || "—", areaId: "", area: g.area || "—", personas: 0, envian: 0, reciben: 0 };
  }
  function shareFromGrant(g: ShareGrant): Share {
    return { id: g.shareId, nombre: g.nombre || g.shareId, ruta: g.ruta || "—", areaId: "", area: g.area || "—", personas: 0 };
  }

  /* ---------- ABM (misma lógica y validaciones) ---------- */
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
      await loadAll();
      refreshCurrent();
    } finally {
      setBusy(false);
    }
  }

  async function execDeleteArea(a: Area) {
    const r = await fetch(`/api/access/areas?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setPanelErr(j.error || `Error ${r.status}`);
      setConfirmState(null);
      return;
    }
    setConfirmState(null);
    setPanelBoth(null);
    setStack([]);
    await loadAll();
  }

  async function saveMail() {
    if (!mailModal) return;
    if (!mailModal.nombre.trim()) { setFormErr("Nombre requerido"); return; }
    if (!mailModal.direccion.trim()) { setFormErr("Dirección requerida"); return; }
    if (!mailModal.areaId) { setFormErr("Elegí el área"); return; }
    setBusy(true);
    setFormErr("");
    try {
      const body: any = mailModal.id ? { ...mailModal } : { nombre: mailModal.nombre.trim(), direccion: mailModal.direccion.trim(), areaId: mailModal.areaId };
      const r = await fetch("/api/access/mails", { method: mailModal.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setFormErr(j.error || `Error ${r.status}`); return; }
      setMailModal(null);
      await loadAll();
      refreshCurrent();
    } finally {
      setBusy(false);
    }
  }

  async function execDeleteMail(m: Mail, force: boolean) {
    const r = await fetch(`/api/access/mails?id=${encodeURIComponent(m.id)}${force ? "&force=1" : ""}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 && !force) {
        setConfirmState({ kind: "delMail", mail: m, force: true, serverMsg: j.error });
        return;
      }
      setPanelErr(j.error || `Error ${r.status}`);
      setConfirmState(null);
      return;
    }
    setConfirmState(null);
    setPanelBoth(null);
    setStack([]);
    await loadAll();
  }

  async function saveShare() {
    if (!shareModal) return;
    if (!shareModal.nombre.trim()) { setFormErr("Nombre requerido"); return; }
    if (!shareModal.ruta.trim()) { setFormErr("Ruta requerida"); return; }
    if (!shareModal.areaId) { setFormErr("Elegí el área"); return; }
    setBusy(true);
    setFormErr("");
    try {
      const body: any = shareModal.id
        ? { id: shareModal.id, nombre: shareModal.nombre.trim(), ruta: shareModal.ruta.trim(), areaId: shareModal.areaId }
        : { nombre: shareModal.nombre.trim(), ruta: shareModal.ruta.trim(), areaId: shareModal.areaId };
      const r = await fetch("/api/access/shares", { method: shareModal.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setFormErr(j.error || `Error ${r.status}`); return; }
      setShareModal(null);
      await loadAll();
      refreshCurrent();
    } finally {
      setBusy(false);
    }
  }

  async function execDeleteShare(s: Share, force: boolean) {
    const r = await fetch(`/api/access/shares?id=${encodeURIComponent(s.id)}${force ? "&force=1" : ""}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 && !force) {
        setConfirmState({ kind: "delShare", share: s, force: true, serverMsg: j.error });
        return;
      }
      setPanelErr(j.error || `Error ${r.status}`);
      setConfirmState(null);
      return;
    }
    setConfirmState(null);
    setPanelBoth(null);
    setStack([]);
    await loadAll();
  }

  /* ---------- relaciones (misma lógica) ---------- */
  async function addMailGrant() {
    const cur = panelRef.current;
    if (cur?.kind !== "mail" || !grantUser) return;
    const r = await fetch("/api/access/grants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "mail", accountId: cur.mail.id, userId: grantUser.id, canSend: grantSend, canRead: grantRead }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPanelErr(j.error || `Error ${r.status}`); return; }
    setGrantUser(null);
    setGrantAdd(null);
    setPanelErr("");
    refreshCurrent();
    loadAll();
  }

  async function updateMailGrant(g: MailGrant, patch: Partial<MailGrant>) {
    const r = await fetch("/api/access/grants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "mail", accountId: g.accountId, userId: g.userId, canSend: patch.canSend ?? g.canSend, canRead: patch.canRead ?? g.canRead }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPanelErr(j.error || `Error ${r.status}`); return; }
    setPanelErr("");
    refreshCurrent();
    loadAll();
  }

  async function execRemoveMailGrant(g: MailGrant) {
    await fetch(`/api/access/grants?scope=mail&accountId=${encodeURIComponent(g.accountId)}&userId=${g.userId}`, { method: "DELETE" });
    setConfirmState(null);
    refreshCurrent();
    loadAll();
  }

  async function addShareGrant() {
    const cur = panelRef.current;
    if (cur?.kind !== "share" || !grantUser) return;
    const r = await fetch("/api/access/grants", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "share", shareId: cur.share.id, userId: grantUser.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setPanelErr(j.error || `Error ${r.status}`); return; }
    setGrantUser(null);
    setGrantAdd(null);
    setPanelErr("");
    refreshCurrent();
    loadAll();
  }

  async function execRemoveShareGrant(g: ShareGrant) {
    await fetch(`/api/access/grants?scope=share&shareId=${encodeURIComponent(g.shareId)}&userId=${g.userId}`, { method: "DELETE" });
    setConfirmState(null);
    refreshCurrent();
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

  if (!authChecked) {
    return (
      <div className="grid gap-4">
        <div className="page-header"><h1>Accesos</h1><p>Verificando permisos…</p></div>
        <Spinner label="Verificando sesión…" />
      </div>
    );
  }

  const readOnly = access === "read";

  if (access === "none") {
    return (
      <div className="grid gap-4">
        <div className="page-header"><h1>Accesos</h1><p>Acceso restringido a usuarios con permiso (lectura o edición).</p></div>
        <div className="card p-6 grid gap-3 text-center max-w-[480px] mx-auto w-full">
          <p className="text-sm text-muted">Áreas, correos institucionales y carpetas compartidas. Requiere perfil operador (Super-Admin/Admin según GLPI_OPERATOR_PROFILES).</p>
          <b className="text-ink">{login ? `Sesión como ${login} sin permiso` : "Iniciá sesión para continuar"}</b>
          <button className="btn btn-primary text-sm mx-auto tap-target" onClick={() => setAuthOpen(true)}>{login ? "Cambiar de usuario" : "Iniciar sesión"}</button>
        </div>
        {authOpen && (
          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { refreshAuth(); window.dispatchEvent(new Event("auth-changed")); }} />
        )}
      </div>
    );
  }

  const q = filterQ.trim().toLowerCase();
  const matchQ = (...parts: (string | null | undefined)[]) => !q || parts.some((x) => (x || "").toLowerCase().includes(q));
  const fAreas = areas.filter((a) => matchQ(a.nombre, a.responsableNombre));
  const fMails = mails.filter((m) => matchQ(m.nombre, m.direccion, m.area));
  const fShares = shares.filter((s) => matchQ(s.nombre, s.ruta, s.area));
  const areaOptions = areas.map((a) => ({ value: a.id, label: a.nombre }));

  return (
    <div className="grid gap-3 no-hscroll">
      <div className="page-header">
        <h1>Accesos</h1>
        <p>Áreas, correos institucionales y carpetas compartidas.</p>
      </div>

      <div className="card p-3 grid gap-2">
        <div className="tabs-scroll -mx-1 px-1" role="presentation">
          <Tabs
            ariaLabel="Secciones de accesos"
            value={tab}
            onChange={(id) => setTab(id as typeof tab)}
            tabs={[
              { id: "areas", label: "Áreas", icon: <IconBuilding size={14} />, badge: <span className="badge badge-brand">{areas.length}</span> },
              { id: "mails", label: "Correos", icon: <IconMail size={14} />, badge: <span className="badge badge-brand">{mails.length}</span> },
              { id: "shares", label: "Carpetas", icon: <IconFolder size={14} />, badge: <span className="badge badge-brand">{shares.length}</span> },
              { id: "personas", label: "Personas", icon: <IconUser size={14} /> },
            ]}
          />
        </div>
        {tab !== "personas" && (
          <div className="flex gap-2 flex-wrap items-center">
            <input
              className="input text-sm flex-1 min-w-[160px]"
              placeholder={`Filtrar ${tab === "areas" ? "áreas" : tab === "mails" ? "correos" : "carpetas"}…`}
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
              aria-label={`Filtrar ${tab}`}
            />
            {(tab === "mails" || tab === "shares") && (
              <>
                <label className="text-xs font-semibold text-ink sr-only" htmlFor="acc-area">Filtrar por área</label>
                <select id="acc-area" className="input text-sm max-w-[220px]" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filtrar por área">
                  <option value="">Todas las áreas</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </>
            )}
          </div>
        )}
        {msg && <p className="text-sm text-danger" role="alert">{msg}</p>}
      </div>

      {loading && <div className="card p-4"><Spinner label="Cargando accesos…" /></div>}

      {tab === "areas" && !loading && (
        <section aria-label="Listado de áreas" className="grid gap-2">
          <div className="flex gap-2 justify-between items-center flex-wrap">
            <span className="text-sm text-muted" role="status">{fAreas.length} área(s)</span>
            <span className="flex gap-2 flex-wrap">
              <button className="btn btn-secondary text-xs" disabled={exporting === "areas:all"} onClick={() => downloadExport("areas", "all")}>
                {exporting === "areas:all" ? "Descargando…" : <span className="inline-flex items-center gap-1"><IconDownload size={13} /> Descargar todo</span>}
              </button>
              {!readOnly && <button className="btn btn-primary text-xs" onClick={() => { setFormErr(""); setAreaModal({ nombre: "", resp: null }); }}>+ Nueva área</button>}
            </span>
          </div>
          {/* Desktop: tabla compacta */}
          <div className="table-scroll hidden md:block card p-0" tabIndex={0} aria-label="Áreas en tabla">
            <table className="table-dense">
              <thead><tr><th scope="col">Área</th><th scope="col">Responsable</th><th scope="col">Correos</th><th scope="col">Carpetas</th><th scope="col"><span className="sr-only">Detalle</span></th></tr></thead>
              <tbody>
                {fAreas.map((a) => (
                  <tr key={a.id}>
                    <td className="min-w-0"><b className="block truncate">{decodeEntities(a.nombre)}</b></td>
                    <td className="text-sm min-w-0">{a.responsableNombre ? <span className="block truncate">{decodeEntities(a.responsableNombre)} <span className="text-xs text-muted">#{a.responsableUserId}</span></span> : <span className="text-muted">Sin responsable</span>}</td>
                    <td className="tabular-nums">{a.mails}</td>
                    <td className="tabular-nums">{a.shares}</td>
                    <td><button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openAreaDetail(a)}>Ver detalle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Móvil: tarjetas */}
          <div className="grid gap-2 md:hidden">
            {fAreas.map((a) => (
              <article key={a.id} className="card asset-card">
                <button onClick={() => openAreaDetail(a)} className="grid gap-1 text-left min-w-0" aria-label={`Ver detalle del área ${a.nombre}`}>
                  <b className="text-ink break-words leading-snug">{decodeEntities(a.nombre)}</b>
                  <span className="block text-xs text-muted break-words leading-snug">{a.responsableNombre ? `Resp. ${decodeEntities(a.responsableNombre)}` : "Sin responsable"}</span>
                  <span className="block text-xs text-muted">{a.mails} correo(s) · {a.shares} carpeta(s)</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--accent)" }} aria-hidden="true">Detalle ›</span>
                </button>
              </article>
            ))}
          </div>
          {!fAreas.length && <EmptyState title="Sin áreas" hint={q ? "Sin coincidencias para ese filtro." : "Creá la primera con + Nueva área."} />}
        </section>
      )}

      {tab === "mails" && !loading && (
        <section aria-label="Listado de correos" className="grid gap-2">
          <div className="flex gap-2 justify-between items-center flex-wrap">
            <span className="text-sm text-muted" role="status">{fMails.length} correo(s)</span>
            <span className="flex gap-2 flex-wrap">
              <button className="btn btn-secondary text-xs" disabled={exporting === "mails:all"} onClick={() => downloadExport("mails", "all")}>
                {exporting === "mails:all" ? "Descargando…" : <span className="inline-flex items-center gap-1"><IconDownload size={13} /> Descargar todo</span>}
              </button>
              {!readOnly && <button className="btn btn-primary text-xs" onClick={() => { setFormErr(""); setMailModal({ nombre: "", direccion: "", areaId: areaFilter || areas[0]?.id || "" }); }}>+ Nuevo correo</button>}
            </span>
          </div>
          <div className="table-scroll hidden md:block card p-0" tabIndex={0} aria-label="Correos en tabla">
            <table className="table-dense">
              <thead><tr><th scope="col">Nombre</th><th scope="col">Dirección</th><th scope="col">Área</th><th scope="col">Personas</th><th scope="col">Permisos</th><th scope="col"><span className="sr-only">Detalle</span></th></tr></thead>
              <tbody>
                {fMails.map((m) => (
                  <tr key={m.id}>
                    <td className="min-w-0"><button type="button" className="rowlink truncate font-medium text-ink text-[0.85rem]" title={`${m.nombre} — abrir ficha`} onClick={() => openMailDetail(m)}>{decodeEntities(m.nombre)}</button></td>
                    <td className="tabular-nums text-sm max-w-[240px]"><span className="block truncate" title={m.direccion}>{m.direccion}</span></td>
                    <td className="text-sm">{m.area}</td>
                    <td className="tabular-nums">{m.personas}</td>
                    <td className="text-xs text-muted whitespace-nowrap" title={`${m.envian} persona(s) pueden enviar, ${m.reciben} pueden recibir`} aria-label={`${m.envian} envían, ${m.reciben} reciben`}>{m.envian} envían · {m.reciben} reciben</td>
                    <td><button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openMailDetail(m)}>Ver detalle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {fMails.map((m) => (
              <article key={m.id} className="card asset-card">
                <button onClick={() => openMailDetail(m)} className="grid gap-1 text-left min-w-0" aria-label={`Ver detalle del correo ${m.nombre}`}>
                  <b className="text-ink break-words leading-snug">{decodeEntities(m.nombre)}</b>
                  <span className="block text-xs text-muted tabular-nums break-all leading-snug">{m.direccion}</span>
                  <span className="block text-xs text-muted leading-snug">{m.area} · {m.personas} pers. ({m.envian} envían · {m.reciben} reciben)</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--accent)" }} aria-hidden="true">Detalle ›</span>
                </button>
              </article>
            ))}
          </div>
          {!fMails.length && <EmptyState title="Sin correos" hint={q ? "Sin coincidencias para ese filtro." : "Creá el primero con + Nuevo correo."} />}
        </section>
      )}

      {tab === "shares" && !loading && (
        <section aria-label="Listado de carpetas" className="grid gap-2">
          <div className="flex gap-2 justify-between items-center flex-wrap">
            <span className="text-sm text-muted" role="status">{fShares.length} carpeta(s)</span>
            <span className="flex gap-2 flex-wrap">
              <button className="btn btn-secondary text-xs" disabled={exporting === "shares:all"} onClick={() => downloadExport("shares", "all")}>
                {exporting === "shares:all" ? "Descargando…" : <span className="inline-flex items-center gap-1"><IconDownload size={13} /> Descargar todo</span>}
              </button>
              {!readOnly && <button className="btn btn-primary text-xs" onClick={() => { setFormErr(""); setShareModal({ nombre: "", ruta: "", areaId: areaFilter || areas[0]?.id || "" }); }}>+ Nueva carpeta</button>}
            </span>
          </div>
          <div className="table-scroll hidden md:block card p-0" tabIndex={0} aria-label="Carpetas en tabla">
            <table className="table-dense">
              <thead><tr><th scope="col">Nombre</th><th scope="col">Ruta</th><th scope="col">Área</th><th scope="col">Personas</th><th scope="col"><span className="sr-only">Detalle</span></th></tr></thead>
              <tbody>
                {fShares.map((s) => (
                  <tr key={s.id}>
                    <td className="min-w-0"><button type="button" className="rowlink truncate font-medium text-ink text-[0.85rem]" title={`${s.nombre} — abrir ficha`} onClick={() => openShareDetail(s)}>{decodeEntities(s.nombre)}</button></td>
                    <td className="tabular-nums text-sm max-w-[280px]"><span className="block truncate" title={s.ruta}>{s.ruta}</span></td>
                    <td className="text-sm">{s.area}</td>
                    <td className="tabular-nums">{s.personas}</td>
                    <td><button className="btn btn-secondary text-xs !min-h-[36px]" onClick={() => openShareDetail(s)}>Ver detalle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 md:hidden">
            {fShares.map((s) => (
              <article key={s.id} className="card asset-card">
                <button onClick={() => openShareDetail(s)} className="grid gap-1 text-left min-w-0" aria-label={`Ver detalle de la carpeta ${s.nombre}`}>
                  <b className="text-ink break-words leading-snug">{decodeEntities(s.nombre)}</b>
                  <span className="block text-xs text-muted tabular-nums break-all leading-snug">{s.ruta}</span>
                  <span className="block text-xs text-muted leading-snug">{s.area} · {s.personas} pers.</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--accent)" }} aria-hidden="true">Detalle ›</span>
                </button>
              </article>
            ))}
          </div>
          {!fShares.length && <EmptyState title="Sin carpetas" hint={q ? "Sin coincidencias para ese filtro." : "Creá la primera con + Nueva carpeta."} />}
        </section>
      )}

      {tab === "personas" && (
        <section aria-label="Búsqueda de personas" className="grid gap-2">
          <div className="card p-3 grid gap-2">
            <form role="search" aria-label="Buscar persona por accesos" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); searchPeople(); }}>
              <input className="input flex-1 min-w-0" placeholder="Nombre, apellido o usuario GLPI…" value={pq} onChange={(e) => setPq(e.target.value)} aria-label="Buscar persona" autoComplete="off" enterKeyHint="search" />
              <button type="submit" className="btn btn-primary text-sm shrink-0 tap-target">Buscar</button>
            </form>
            {pmsg && <p className="text-sm text-muted" role="status">{pmsg}</p>}
            {presults.length > 0 && (
              <ul className="grid gap-2" aria-label="Personas encontradas">
                {presults.map((p) => (
                  <li key={p.id} className="card p-3 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <b className="block truncate text-ink">{p.display}</b>
                      <span className="block text-xs text-muted truncate">{p.login ? `${p.login} · ` : ""}GLPI #{p.id}</span>
                    </span>
                    <button className="btn btn-secondary text-xs shrink-0 !min-h-[36px]" onClick={() => openPersonDetail(p)}>Ver accesos</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ---------- panel lateral ---------- */}
      {panel?.kind === "area" && (
        <SidePanel
          title={decodeEntities(panel.area.nombre)}
          subtitle={<span className="badge">Área</span>}
          onClose={closePanel}
          footer={<div className="flex gap-2 justify-end"><button className="btn btn-secondary text-sm tap-target" onClick={closePanel}>{stack.length ? "← Volver" : "Volver al listado"}</button></div>}
        >
          <AreaPanel
            area={panel.area} mails={panel.mails} shares={panel.shares}
            canEdit={!readOnly} busyOp={exporting != null}
            onOpenMail={(m) => openMailDetail(m)} onOpenShare={(s) => openShareDetail(s)}
            onEdit={() => { setFormErr(""); setAreaModal({ id: panel.area.id, nombre: panel.area.nombre, resp: panel.area.responsableUserId ? { id: panel.area.responsableUserId, login: null, display: panel.area.responsableNombre || `#${panel.area.responsableUserId}` } : null }); }}
            onExport={() => downloadExport("area", panel.area.id)} exporting={exporting === `area:${panel.area.id}`}
            onDelete={() => setConfirmState({ kind: "delArea", area: panel.area })}
            err={panelErr}
          />
        </SidePanel>
      )}

      {panel?.kind === "mail" && (
        <SidePanel
          title={decodeEntities(panel.mail.nombre)}
          subtitle={<span className="badge">Correo</span>}
          onClose={closePanel}
          footer={<div className="flex gap-2 justify-end flex-wrap"><button className="btn btn-secondary text-sm tap-target" onClick={closePanel}>{stack.length ? "← Volver" : "Volver al listado"}</button></div>}
        >
          <MailPanel
            mail={panel.mail} personas={panel.personas} areas={areas}
            canEdit={!readOnly}
            onOpenPerson={(u) => openPersonDetail(u)} onOpenArea={(a) => openAreaDetail(a)}
            onToggle={(g, patch) => updateMailGrant(g, patch)}
            onAdd={() => { setGrantUser(null); setGrantSend(true); setGrantRead(true); setGrantAdd("mail"); }}
            onRemove={(g) => setConfirmState({ kind: "rmMail", g })}
            onEdit={() => { setFormErr(""); setMailModal({ id: panel.mail.id, nombre: panel.mail.nombre, direccion: panel.mail.direccion, areaId: panel.mail.areaId }); }}
            onExport={() => downloadExport("mail", panel.mail.id)} exporting={exporting === `mail:${panel.mail.id}`}
            onDelete={() => setConfirmState({ kind: "delMail", mail: panel.mail, force: false })}
            err={panelErr}
          />
        </SidePanel>
      )}

      {panel?.kind === "share" && (
        <SidePanel
          title={decodeEntities(panel.share.nombre)}
          subtitle={<span className="badge">Carpeta</span>}
          onClose={closePanel}
          footer={<div className="flex gap-2 justify-end flex-wrap"><button className="btn btn-secondary text-sm tap-target" onClick={closePanel}>{stack.length ? "← Volver" : "Volver al listado"}</button></div>}
        >
          <SharePanel
            share={panel.share} personas={panel.personas} areas={areas}
            canEdit={!readOnly}
            onOpenPerson={(u) => openPersonDetail(u)} onOpenArea={(a) => openAreaDetail(a)}
            onAdd={() => { setGrantUser(null); setGrantAdd("share"); }}
            onRemove={(g) => setConfirmState({ kind: "rmShare", g })}
            onEdit={() => { setFormErr(""); setShareModal({ id: panel.share.id, nombre: panel.share.nombre, ruta: panel.share.ruta, areaId: panel.share.areaId }); }}
            onExport={() => downloadExport("share", panel.share.id)} exporting={exporting === `share:${panel.share.id}`}
            onDelete={() => setConfirmState({ kind: "delShare", share: panel.share, force: false })}
            err={panelErr}
          />
        </SidePanel>
      )}

      {panel?.kind === "person" && (
        <SidePanel
          title={panel.user.display}
          subtitle={`GLPI #${panel.user.id}${panel.user.login ? ` · ${panel.user.login}` : ""}`}
          onClose={closePanel}
          footer={<div className="flex gap-2 justify-end"><button className="btn btn-secondary text-sm tap-target" onClick={closePanel}>{stack.length ? "← Volver" : "Volver al listado"}</button></div>}
        >
          <PersonPanel
            user={panel.user} mails={panel.mails} shares={panel.shares}
            canEdit={!readOnly}
            onOpenMail={(m) => openMailDetail(mailFromGrant(m))} onOpenShare={(s) => openShareDetail(shareFromGrant(s))}
            onToggle={(g, patch) => updateMailGrant(g, patch)}
            onRemoveMail={(g) => setConfirmState({ kind: "rmMail", g })}
            onRemoveShare={(g) => setConfirmState({ kind: "rmShare", g })}
            err={panelErr}
          />
        </SidePanel>
      )}

      {/* ---------- ABM ---------- */}
      {areaModal && (
        <Modal
          title={areaModal.id ? "Editar área" : "Nueva área"}
          onClose={() => setAreaModal(null)}
          guard={(areaModal.nombre.trim() || areaModal.resp) ? "Hay datos sin guardar. ¿Cerrar sin guardar?" : null}
        >
          <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-ink">Nombre</span><input className="input text-sm" value={areaModal.nombre} onChange={(e) => setAreaModal({ ...areaModal, nombre: e.target.value })} placeholder="Ej. Administración" /></label>
          <UserSearch value={areaModal.resp} onPick={(u) => setAreaModal({ ...areaModal, resp: u })} />
          {formErr && <p className="text-sm text-danger" role="alert">{formErr}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary text-sm tap-target" onClick={() => setAreaModal(null)}>Cancelar</button>
            <BusyButton className="btn btn-primary text-sm tap-target min-w-[120px]" busy={busy} onClick={saveArea}>Guardar</BusyButton>
          </div>
        </Modal>
      )}

      {mailModal && (
        <Modal
          title={mailModal.id ? "Editar correo" : "Nuevo correo"}
          onClose={() => setMailModal(null)}
          guard={(mailModal.nombre.trim() || mailModal.direccion.trim()) ? "Hay datos sin guardar. ¿Cerrar sin guardar?" : null}
        >
          <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-ink">Nombre</span><input className="input text-sm" value={mailModal.nombre} onChange={(e) => setMailModal({ ...mailModal, nombre: e.target.value })} placeholder="Ej. Ventas" /></label>
          <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-ink">Dirección</span><input className="input text-sm tabular-nums" value={mailModal.direccion} onChange={(e) => setMailModal({ ...mailModal, direccion: e.target.value })} placeholder="ventas@ejemplo.org" inputMode="email" /></label>
          <SearchCombobox
            id="acc-mail-area"
            label="Área"
            placeholder="Escribí para filtrar áreas…"
            options={areaOptions}
            value={mailModal.areaId}
            onSelect={(v) => setMailModal({ ...mailModal, areaId: v })}
            emptyText="Sin áreas cargadas. Creá una en la pestaña Áreas."
          />
          {formErr && <p className="text-sm text-danger" role="alert">{formErr}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary text-sm tap-target" onClick={() => setMailModal(null)}>Cancelar</button>
            <BusyButton className="btn btn-primary text-sm tap-target min-w-[120px]" busy={busy} onClick={saveMail}>Guardar</BusyButton>
          </div>
        </Modal>
      )}

      {shareModal && (
        <Modal
          title={shareModal.id ? "Editar carpeta" : "Nueva carpeta"}
          onClose={() => setShareModal(null)}
          guard={(shareModal.nombre.trim() || shareModal.ruta.trim()) ? "Hay datos sin guardar. ¿Cerrar sin guardar?" : null}
        >
          <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-ink">Nombre</span><input className="input text-sm" value={shareModal.nombre} onChange={(e) => setShareModal({ ...shareModal, nombre: e.target.value })} placeholder="Ej. Contable" /></label>
          <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-ink">Ruta</span><input className="input text-sm tabular-nums" value={shareModal.ruta} onChange={(e) => setShareModal({ ...shareModal, ruta: e.target.value })} placeholder="\\\\srv\\contable" /></label>
          <SearchCombobox
            id="acc-share-area"
            label="Área"
            placeholder="Escribí para filtrar áreas…"
            options={areaOptions}
            value={shareModal.areaId}
            onSelect={(v) => setShareModal({ ...shareModal, areaId: v })}
            emptyText="Sin áreas cargadas. Creá una en la pestaña Áreas."
          />
          {formErr && <p className="text-sm text-danger" role="alert">{formErr}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn btn-secondary text-sm tap-target" onClick={() => setShareModal(null)}>Cancelar</button>
            <BusyButton className="btn btn-primary text-sm tap-target min-w-[120px]" busy={busy} onClick={saveShare}>Guardar</BusyButton>
          </div>
        </Modal>
      )}

      {/* ---------- otorgar acceso (encima del panel) ---------- */}
      {grantAdd === "mail" && panel?.kind === "mail" && (
        <SubModal title={`Agregar a ${panel.mail.nombre}`} onClose={() => { setGrantAdd(null); setGrantUser(null); }}>
          <UserSearch value={grantUser} onPick={setGrantUser} />
          {grantUser && (
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" className="check-lg" checked={grantSend} onChange={(e) => setGrantSend(e.target.checked)} /> Envía <IconMail size={13} /></label>
                <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer"><input type="checkbox" className="check-lg" checked={grantRead} onChange={(e) => setGrantRead(e.target.checked)} /> Recibe <IconEye size={13} /></label>
              </div>
              <p className="text-xs text-muted">Al otorgar se guarda de inmediato con estos permisos.</p>
              <div className="flex gap-2 justify-end">
                <button className="btn btn-secondary text-sm tap-target" onClick={() => { setGrantAdd(null); setGrantUser(null); }}>Cancelar</button>
                <button className="btn btn-primary text-sm tap-target min-w-[120px]" onClick={addMailGrant}>Otorgar</button>
              </div>
            </div>
          )}
        </SubModal>
      )}

      {grantAdd === "share" && panel?.kind === "share" && (
        <SubModal title={`Agregar a ${panel.share.nombre}`} onClose={() => { setGrantAdd(null); setGrantUser(null); }}>
          <UserSearch value={grantUser} onPick={setGrantUser} />
          {grantUser && (
            <div className="grid gap-2 text-sm">
              <p className="text-xs text-muted">Al otorgar se guarda de inmediato el acceso a la carpeta.</p>
              <div className="flex gap-2 justify-end">
                <button className="btn btn-secondary text-sm tap-target" onClick={() => { setGrantAdd(null); setGrantUser(null); }}>Cancelar</button>
                <button className="btn btn-primary text-sm tap-target min-w-[140px]" onClick={addShareGrant}>Otorgar acceso</button>
              </div>
            </div>
          )}
        </SubModal>
      )}

      {/* ---------- confirmaciones ---------- */}
      {confirmState?.kind === "delArea" && (
        <ConfirmDialog
          title="Eliminar área"
          body={<><span>Se eliminará el área <b className="text-ink">{confirmState.area.nombre}</b>.</span><span>Solo se permite si no tiene correos ni carpetas: únicamente se elimina el área, ningún otro elemento.</span></>}
          confirmLabel="Eliminar área"
          danger
          busy={confirmBusy}
          onClose={() => setConfirmState(null)}
          onConfirm={async () => { setConfirmBusy(true); try { await execDeleteArea(confirmState.area); } finally { setConfirmBusy(false); } }}
        />
      )}
      {confirmState?.kind === "delMail" && (
        <ConfirmDialog
          title={confirmState.force ? "Eliminar correo con accesos" : "Eliminar correo"}
          body={<>
            <span>Se eliminará el correo <b className="text-ink">{confirmState.mail.nombre}</b> <span className="tabular-nums">({confirmState.mail.direccion})</span>.</span>
            {confirmState.force
              ? <span>{confirmState.serverMsg || `Tiene ${confirmState.mail.personas} persona(s) asignada(s).`} También se quitarán esos accesos. Esta acción no se puede deshacer.</span>
              : <span>Si tiene personas asignadas se te pedirá confirmación adicional. Los equipos de GLPI no se ven afectados.</span>}
          </>}
          confirmLabel={confirmState.force ? "Eliminar con accesos" : "Eliminar correo"}
          danger
          busy={confirmBusy}
          onClose={() => setConfirmState(null)}
          onConfirm={async () => { setConfirmBusy(true); try { await execDeleteMail(confirmState.mail, confirmState.force); } finally { setConfirmBusy(false); } }}
        />
      )}
      {confirmState?.kind === "delShare" && (
        <ConfirmDialog
          title={confirmState.force ? "Eliminar carpeta con accesos" : "Eliminar carpeta"}
          body={<>
            <span>Se eliminará la carpeta <b className="text-ink">{confirmState.share.nombre}</b> <span className="tabular-nums break-all">({confirmState.share.ruta})</span>.</span>
            {confirmState.force
              ? <span>{confirmState.serverMsg || `Tiene ${confirmState.share.personas} persona(s) asignada(s).`} También se quitarán esos accesos. Esta acción no se puede deshacer.</span>
              : <span>Si tiene personas asignadas se te pedirá confirmación adicional. La carpeta real del servidor no se toca: solo se elimina el registro de acceso.</span>}
          </>}
          confirmLabel={confirmState.force ? "Eliminar con accesos" : "Eliminar carpeta"}
          danger
          busy={confirmBusy}
          onClose={() => setConfirmState(null)}
          onConfirm={async () => { setConfirmBusy(true); try { await execDeleteShare(confirmState.share, confirmState.force); } finally { setConfirmBusy(false); } }}
        />
      )}
      {confirmState?.kind === "rmMail" && (
        <ConfirmDialog
          title="Quitar acceso"
          body={<span>Quitar a <b className="text-ink">{confirmState.g.userDisplay || `#${confirmState.g.userId}`}</b> el acceso a este correo. Podrá otorgarse de nuevo cuando se necesite.</span>}
          confirmLabel="Quitar acceso"
          danger
          onClose={() => setConfirmState(null)}
          onConfirm={() => execRemoveMailGrant(confirmState.g)}
        />
      )}
      {confirmState?.kind === "rmShare" && (
        <ConfirmDialog
          title="Quitar acceso"
          body={<span>Quitar a <b className="text-ink">{confirmState.g.userDisplay || `#${confirmState.g.userId}`}</b> el acceso a esta carpeta. Podrá otorgarse de nuevo cuando se necesite.</span>}
          confirmLabel="Quitar acceso"
          danger
          onClose={() => setConfirmState(null)}
          onConfirm={() => execRemoveShareGrant(confirmState.g)}
        />
      )}

      {authOpen && (
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { refreshAuth(); window.dispatchEvent(new Event("auth-changed")); }} />
      )}
    </div>
  );
}

/* ================= fichas del panel ================= */

function AreaPanel({ area, mails, shares, canEdit, busyOp, onOpenMail, onOpenShare, onEdit, onExport, exporting, onDelete, err }: {
  area: Area; mails: Mail[]; shares: Share[]; canEdit: boolean; busyOp: boolean;
  onOpenMail: (m: Mail) => void; onOpenShare: (s: Share) => void;
  onEdit: () => void; onExport: () => void; exporting: boolean; onDelete: () => void; err: string;
}) {
  return (
    <div className="grid gap-3 text-sm">
      {err && <p className="text-sm text-danger card p-3 toast-err border" role="alert">{err}</p>}
      <section aria-label="Información del área" className="grid gap-1.5">
        <h3 className="section-h">Información general</h3>
        <dl className="info-card">
          <div className="info-row"><dt>Nombre</dt><dd className="font-semibold">{decodeEntities(area.nombre)}</dd></div>
          <div className="info-row"><dt>Responsable</dt><dd>{area.responsableNombre ? <>{decodeEntities(area.responsableNombre)} <span className="text-xs text-muted tabular-nums">#{area.responsableUserId}</span></> : <span className="text-muted">Sin responsable</span>}</dd></div>
          <div className="info-row"><dt>Recursos</dt><dd className="tabular-nums">{area.mails} correo(s) · {area.shares} carpeta(s)</dd></div>
        </dl>
      </section>

      <section aria-label="Correos del área" className="grid gap-1.5">
        <h3 className="section-h">Correos ({mails.length})</h3>
        {mails.length > 0 ? (
          <ul className="card p-3 grid gap-0">
            {mails.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 min-w-0 py-1.5 border-b border-line last:border-0">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line text-muted" aria-hidden="true"><IconMail size={15} /></span>
                <span className="min-w-0 flex-1">
                  <button type="button" className="rowlink font-medium text-ink text-[0.85rem] clamp-2" title={`${m.nombre} — abrir ficha`} onClick={() => onOpenMail(m)}>{decodeEntities(m.nombre)}</button>
                  <ExpandableMeta label={`Dirección y personas de ${m.nombre}`} text={`${m.direccion} · ${m.personas} pers.`} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Sin correos en esta área.</p>}
      </section>

      <section aria-label="Carpetas del área" className="grid gap-1.5">
        <h3 className="section-h">Carpetas ({shares.length})</h3>
        {shares.length > 0 ? (
          <ul className="card p-3 grid gap-0">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5 min-w-0 py-1.5 border-b border-line last:border-0">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line text-muted" aria-hidden="true"><IconFolder size={15} /></span>
                <span className="min-w-0 flex-1">
                  <button type="button" className="rowlink font-medium text-ink text-[0.85rem] clamp-2" title={`${s.nombre} — abrir ficha`} onClick={() => onOpenShare(s)}>{decodeEntities(s.nombre)}</button>
                  <ExpandableMeta label={`Ruta y personas de ${s.nombre}`} text={`${s.ruta} · ${s.personas} pers.`} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Sin carpetas en esta área.</p>}
      </section>

      {canEdit && (
        <AdminSection title="Administrar área" hint="Editar, exportar o eliminar">
          <div className="grid gap-1.5">
            <button className="admin-action" onClick={onEdit}>
              <span className="admin-ic" aria-hidden="true">✎</span>
              <span className="min-w-0 flex-1"><b className="block text-ink">Editar área</b><span className="block text-xs text-muted">Nombre y responsable</span></span>
              <span className="text-muted" aria-hidden="true">›</span>
            </button>
            <button className="admin-action" onClick={onExport} disabled={busyOp || exporting}>
              <span className="admin-ic" aria-hidden="true"><IconDownload size={15} /></span>
              <span className="min-w-0 flex-1"><b className="block text-ink">{exporting ? "Exportando…" : "Exportar Excel"}</b><span className="block text-xs text-muted">Correos y carpetas del área</span></span>
            </button>
            <button className="admin-action admin-action-danger" onClick={onDelete}>
              <span className="admin-ic" aria-hidden="true">×</span>
              <span className="min-w-0 flex-1"><b className="block text-ink">Eliminar área</b><span className="block text-xs text-muted">Solo si no tiene recursos</span></span>
            </button>
          </div>
        </AdminSection>
      )}
    </div>
  );
}

function MailPanel({ mail, personas, areas, canEdit, onOpenPerson, onOpenArea, onToggle, onRemove, onAdd, onEdit, onExport, exporting, onDelete, err }: {
  mail: Mail; personas: MailGrant[]; areas: Area[]; canEdit: boolean;
  onOpenPerson: (u: GlpiUser) => void;
  onOpenArea: (a: Area) => void;
  onToggle: (g: MailGrant, patch: Partial<MailGrant>) => void;
  onRemove: (g: MailGrant) => void; onAdd: () => void;
  onEdit: () => void; onExport: () => void; exporting: boolean; onDelete: () => void; err: string;
}) {
  const area = areas.find((a) => a.id === mail.areaId);
  return (
    <div className="grid gap-3 text-sm">
      {err && <p className="text-sm text-danger card p-3 toast-err border" role="alert">{err}</p>}
      <section aria-label="Información del correo" className="grid gap-1.5">
        <h3 className="section-h">Información general</h3>
        <dl className="info-card">
          <div className="info-row"><dt>Nombre</dt><dd className="font-semibold">{decodeEntities(mail.nombre)}</dd></div>
          <div className="info-row"><dt>Dirección</dt><dd className="tabular-nums"><span className="copy-wrap"><span>{mail.direccion}</span><CopyButton value={mail.direccion} label="dirección de correo" /></span></dd></div>
          <div className="info-row"><dt>Área</dt><dd>{area
            ? <button type="button" className="rowlink font-medium" title={`Abrir ficha del área ${area.nombre}`} onClick={() => onOpenArea(area)}>{decodeEntities(area.nombre)} →</button>
            : <>{mail.area}</>}</dd></div>
          <div className="info-row"><dt>Personas</dt><dd className="tabular-nums">{personas.length} con acceso</dd></div>
        </dl>
      </section>

      <section aria-label="Personas con acceso" className="grid gap-1.5">
        <h3 className="section-h">Personas ({personas.length})</h3>
        {personas.length > 0 ? (
          <ul className="card p-3" aria-label={`Personas con acceso a ${mail.nombre}`}>
            {personas.map((g) => (
              <PersonRow
                key={g.userId}
                display={decodeEntities(g.userDisplay || `#${g.userId}`)}
                userId={g.userId}
                onOpen={() => onOpenPerson({ id: g.userId, login: null, display: g.userDisplay || `#${g.userId}` })}
                right={<PermBadges canSend={g.canSend} canRead={g.canRead} />}
              />
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nadie tiene acceso aún.{canEdit ? " Agregá personas desde Administrar accesos." : ""}</p>}
      </section>

      {canEdit && (
        <AdminSection title="Administrar accesos" hint="Agregar, permisos, exportar o eliminar">
          <button className="admin-action" onClick={onAdd}>
            <span className="admin-ic" aria-hidden="true"><IconPlus size={15} /></span>
            <span className="min-w-0 flex-1"><b className="block text-ink">Agregar persona</b><span className="block text-xs text-muted">Otorgar acceso con permisos</span></span>
            <span className="text-muted" aria-hidden="true">›</span>
          </button>
          <div className="grid gap-1.5" role="group" aria-label="Modificar permisos">
            <span className="text-xs font-semibold text-ink">Permisos por persona (se guardan de inmediato)</span>
            {personas.map((g) => (
              <div key={g.userId} className="border border-line rounded-xl bg-white px-3 py-2 grid gap-1.5">
                <span className="truncate text-sm font-medium" title={g.userDisplay || `#${g.userId}`}>{decodeEntities(g.userDisplay || `#${g.userId}`)} <span className="text-xs text-muted">#{g.userId}</span></span>
                <span className="flex items-center gap-4 flex-wrap">
                  <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer text-sm"><input type="checkbox" className="check-lg" checked={g.canSend} onChange={(e) => onToggle(g, { canSend: e.target.checked })} aria-label={`${g.userDisplay || g.userId} puede enviar`} /> Envía</label>
                  <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer text-sm"><input type="checkbox" className="check-lg" checked={g.canRead} onChange={(e) => onToggle(g, { canRead: e.target.checked })} aria-label={`${g.userDisplay || g.userId} puede recibir`} /> Recibe</label>
                  <button className="btn btn-danger-outline text-xs ml-auto" onClick={() => onRemove(g)}>Quitar</button>
                </span>
              </div>
            ))}
            {!personas.length && <p className="text-xs text-muted">Sin personas para modificar.</p>}
          </div>
          <div className="grid gap-1.5">
            <button className="admin-action" onClick={onEdit}>
              <span className="admin-ic" aria-hidden="true">✎</span>
              <span className="min-w-0 flex-1"><b className="block text-ink">Editar correo</b><span className="block text-xs text-muted">Nombre, dirección y área</span></span>
              <span className="text-muted" aria-hidden="true">›</span>
            </button>
            <button className="admin-action" onClick={onExport} disabled={exporting}>
              <span className="admin-ic" aria-hidden="true"><IconDownload size={15} /></span>
              <span className="min-w-0 flex-1"><b className="block text-ink">{exporting ? "Exportando…" : "Exportar Excel"}</b><span className="block text-xs text-muted">Personas y permisos</span></span>
            </button>
            <button className="admin-action admin-action-danger" onClick={onDelete}>
              <span className="admin-ic" aria-hidden="true">×</span>
              <span className="min-w-0 flex-1"><b className="block text-ink">Eliminar correo</b><span className="block text-xs text-muted">Pide confirmación adicional si tiene accesos</span></span>
            </button>
          </div>
        </AdminSection>
      )}
    </div>
  );
}

function SharePanel({ share, personas, areas, canEdit, onOpenPerson, onOpenArea, onRemove, onAdd, onEdit, onExport, exporting, onDelete, err }: {
  share: Share; personas: ShareGrant[]; areas: Area[]; canEdit: boolean;
  onOpenPerson: (u: GlpiUser) => void;
  onOpenArea: (a: Area) => void;
  onRemove: (g: ShareGrant) => void; onAdd: () => void;
  onEdit: () => void; onExport: () => void; exporting: boolean; onDelete: () => void; err: string;
}) {
  const area = areas.find((a) => a.id === share.areaId);
  return (
    <div className="grid gap-3 text-sm">
      {err && <p className="text-sm text-danger card p-3 toast-err border" role="alert">{err}</p>}
      <section aria-label="Información de la carpeta" className="grid gap-1.5">
        <h3 className="section-h">Información general</h3>
        <dl className="info-card">
          <div className="info-row"><dt>Nombre</dt><dd className="font-semibold">{decodeEntities(share.nombre)}</dd></div>
          <div className="info-row"><dt>Ruta</dt><dd className="tabular-nums"><span className="copy-wrap"><span>{share.ruta}</span><CopyButton value={share.ruta} label="ruta de la carpeta" /></span></dd></div>
          <div className="info-row"><dt>Área</dt><dd>{area
            ? <button type="button" className="rowlink font-medium" title={`Abrir ficha del área ${area.nombre}`} onClick={() => onOpenArea(area)}>{decodeEntities(area.nombre)} →</button>
            : <>{share.area}</>}</dd></div>
          <div className="info-row"><dt>Personas</dt><dd className="tabular-nums">{personas.length} con acceso</dd></div>
        </dl>
      </section>

      <section aria-label="Personas con acceso" className="grid gap-1.5">
        <h3 className="section-h">Personas ({personas.length})</h3>
        {personas.length > 0 ? (
          <ul className="card p-3" aria-label={`Personas con acceso a ${share.nombre}`}>
            {personas.map((g) => (
              <PersonRow
                key={g.userId}
                display={decodeEntities(g.userDisplay || `#${g.userId}`)}
                userId={g.userId}
                onOpen={() => onOpenPerson({ id: g.userId, login: null, display: g.userDisplay || `#${g.userId}` })}
                right={<span className="badge badge-success">Acceso</span>}
              />
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nadie tiene acceso aún.{canEdit ? " Agregá personas desde Administrar accesos." : ""}</p>}
      </section>

      {canEdit && (
        <AdminSection title="Administrar accesos" hint="Agregar, exportar o eliminar">
          <button className="admin-action" onClick={onAdd}>
            <span className="admin-ic" aria-hidden="true"><IconPlus size={15} /></span>
            <span className="min-w-0 flex-1"><b className="block text-ink">Agregar persona</b><span className="block text-xs text-muted">Otorgar acceso a la carpeta</span></span>
            <span className="text-muted" aria-hidden="true">›</span>
          </button>
          {personas.length > 0 && (
            <div className="grid gap-1.5" role="group" aria-label="Quitar accesos">
              <span className="text-xs font-semibold text-ink">Quitar accesos</span>
              {personas.map((g) => (
                <div key={g.userId} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl bg-white px-3 py-2 min-h-[52px]">
                  <span className="truncate min-w-0" title={g.userDisplay || `#${g.userId}`}>{decodeEntities(g.userDisplay || `#${g.userId}`)} <span className="text-xs text-muted">#{g.userId}</span></span>
                  <button className="btn btn-danger-outline text-xs shrink-0" onClick={() => onRemove(g)}>Quitar</button>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-1.5">
            <button className="admin-action" onClick={onEdit}>
              <span className="admin-ic" aria-hidden="true">✎</span>
              <span className="min-w-0 flex-1"><b className="block text-ink">Editar carpeta</b><span className="block text-xs text-muted">Nombre, ruta y área</span></span>
              <span className="text-muted" aria-hidden="true">›</span>
            </button>
            <button className="admin-action" onClick={onExport} disabled={exporting}>
              <span className="admin-ic" aria-hidden="true"><IconDownload size={15} /></span>
              <span className="min-w-0 flex-1"><b className="block text-ink">{exporting ? "Exportando…" : "Exportar Excel"}</b><span className="block text-xs text-muted">Personas con acceso</span></span>
            </button>
            <button className="admin-action admin-action-danger" onClick={onDelete}>
              <span className="admin-ic" aria-hidden="true">×</span>
              <span className="min-w-0 flex-1"><b className="block text-ink">Eliminar carpeta</b><span className="block text-xs text-muted">Solo el registro de acceso</span></span>
            </button>
          </div>
        </AdminSection>
      )}
    </div>
  );
}

function PersonPanel({ user, mails, shares, canEdit, onOpenMail, onOpenShare, onToggle, onRemoveMail, onRemoveShare, err }: {
  user: GlpiUser; mails: MailGrant[]; shares: ShareGrant[]; canEdit: boolean;
  onOpenMail: (m: MailGrant) => void; onOpenShare: (s: ShareGrant) => void;
  onToggle: (g: MailGrant, patch: Partial<MailGrant>) => void;
  onRemoveMail: (g: MailGrant) => void; onRemoveShare: (g: ShareGrant) => void; err: string;
}) {
  return (
    <div className="grid gap-3 text-sm">
      {err && <p className="text-sm text-danger card p-3 toast-err border" role="alert">{err}</p>}
      <section aria-label="Información de la persona" className="grid gap-1.5">
        <h3 className="section-h">Información general</h3>
        <dl className="info-card">
          <div className="info-row"><dt>Nombre</dt><dd className="font-semibold">{user.display}</dd></div>
          {user.login && <div className="info-row"><dt>Usuario</dt><dd>{user.login}</dd></div>}
          <div className="info-row"><dt>GLPI ID</dt><dd className="tabular-nums">#{user.id}</dd></div>
          <div className="info-row"><dt>Accesos</dt><dd className="tabular-nums">{mails.length} correo(s) · {shares.length} carpeta(s)</dd></div>
        </dl>
      </section>

      <section aria-label="Correos de la persona" className="grid gap-1.5">
        <h3 className="section-h">Correos ({mails.length})</h3>
        {mails.length > 0 ? (
          <ul className="card p-3" aria-label={`Correos de ${user.display}`}>
            {mails.map((g) => (
              <li key={g.accountId} className="flex items-center gap-2.5 min-w-0 py-1.5 border-b border-line last:border-0">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line text-muted" aria-hidden="true"><IconMail size={15} /></span>
                <span className="min-w-0 flex-1">
                  <button type="button" className="rowlink font-medium text-ink text-[0.85rem] clamp-2" title={`${g.nombre} — abrir ficha`} onClick={() => onOpenMail(g)}>{decodeEntities(g.nombre || g.accountId)}</button>
                  <ExpandableMeta label={`Dirección y área de ${g.nombre}`} text={`${g.direccion} · ${g.area}`} />
                </span>
                <span className="shrink-0"><PermBadges canSend={g.canSend} canRead={g.canRead} /></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Sin correos asignados.</p>}
      </section>

      <section aria-label="Carpetas de la persona" className="grid gap-1.5">
        <h3 className="section-h">Carpetas ({shares.length})</h3>
        {shares.length > 0 ? (
          <ul className="card p-3" aria-label={`Carpetas de ${user.display}`}>
            {shares.map((g) => (
              <li key={g.shareId} className="flex items-center gap-2.5 min-w-0 py-1.5 border-b border-line last:border-0">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line text-muted" aria-hidden="true"><IconFolder size={15} /></span>
                <span className="min-w-0 flex-1">
                  <button type="button" className="rowlink font-medium text-ink text-[0.85rem] clamp-2" title={`${g.nombre} — abrir ficha`} onClick={() => onOpenShare(g)}>{decodeEntities(g.nombre || g.shareId)}</button>
                  <ExpandableMeta label={`Ruta y área de ${g.nombre}`} text={`${g.ruta} · ${g.area}`} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Sin carpetas asignadas.</p>}
      </section>

      {canEdit && (mails.length > 0 || shares.length > 0) && (
        <AdminSection title="Administrar accesos" hint="Permisos y desvinculaciones">
          {mails.length > 0 && (
            <div className="grid gap-1.5" role="group" aria-label="Permisos de correo (se guardan de inmediato)">
              <span className="text-xs font-semibold text-ink">Permisos de correo</span>
              {mails.map((g) => (
                <div key={g.accountId} className="border border-line rounded-xl bg-white px-3 py-2 grid gap-1.5">
                  <span className="truncate text-sm font-medium" title={g.nombre}>{decodeEntities(g.nombre || g.accountId)}</span>
                  <span className="flex items-center gap-4 flex-wrap">
                    <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer text-sm"><input type="checkbox" className="check-lg" checked={g.canSend} onChange={(e) => onToggle(g, { canSend: e.target.checked })} aria-label={`${g.nombre} puede enviar`} /> Envía</label>
                    <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer text-sm"><input type="checkbox" className="check-lg" checked={g.canRead} onChange={(e) => onToggle(g, { canRead: e.target.checked })} aria-label={`${g.nombre} puede recibir`} /> Recibe</label>
                    <button className="btn btn-danger-outline text-xs ml-auto" onClick={() => onRemoveMail(g)}>Quitar</button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {shares.length > 0 && (
            <div className="grid gap-1.5" role="group" aria-label="Desvincular carpetas">
              <span className="text-xs font-semibold text-ink">Desvincular carpetas</span>
              {shares.map((g) => (
                <div key={g.shareId} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl bg-white px-3 py-2 min-h-[52px]">
                  <span className="truncate min-w-0" title={g.nombre}>{decodeEntities(g.nombre || g.shareId)}</span>
                  <button className="btn btn-danger-outline text-xs shrink-0" onClick={() => onRemoveShare(g)}>Quitar</button>
                </div>
              ))}
            </div>
          )}
        </AdminSection>
      )}
    </div>
  );
}
