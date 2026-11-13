"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import ScanModal from "./ScanModal";
import AuthModal from "./AuthModal";
import { PlacesTree, useLocations } from "./Places";
import { inventoryVariants, editFormOf, parseGlpiUrl } from "@/lib/inventory";
import { clasificarPuesto, ESTADO_META, type EstadoPuesto } from "@/lib/puesto-state";
import { Spinner, SidePanel, AdminSection, TypeIcon, decodeEntities } from "./ui";
import AssetEditModal from "./AssetEditModal";

type Puesto = { glpi_id: number; x: number; y: number; w: number; h: number };
type Floor = { id: string; name: string; image: string | null; glpiLocationId: number | null; puestos: Puesto[] };
type Asset = any;

const disp = (v: any) => (v == null || v === "" ? "—" : String(v));

// Pisos como botones hasta este umbral; más pisos usan desplegable.
const MAX_FLOOR_BUTTONS = 5;

type Drag =
  | { mode: "draw"; sx: number; sy: number; cx: number; cy: number }
  | { mode: "move"; id: number; sx: number; sy: number; ox: number; oy: number }
  | { mode: "resize"; id: number; sx: number; sy: number; ow: number; oh: number };

export default function Mapa({ calibrar, focus, floorParam }: { calibrar: boolean; focus: string | null; floorParam: string | null }) {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState<string | null>(floorParam);
  const [sel, setSel] = useState<Puesto | null>(null);
  const [items, setItems] = useState<Asset[]>([]);
  const [msg, setMsg] = useState("");
  const [scanMode, setScanMode] = useState<"add" | "replace" | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<Asset | null>(null);
  const [manualInv, setManualInv] = useState("");
  const [occOpen, setOccOpen] = useState(false);
  const [occQuery, setOccQuery] = useState("");
  const [occResults, setOccResults] = useState<any[]>([]);
  const [roomOpen, setRoomOpen] = useState(false);
  const [roomVal, setRoomVal] = useState("");
  const [roomMsg, setRoomMsg] = useState("");

  const [occByLoc, setOccByLoc] = useState<Record<number, string>>({});
  const [countByLoc, setCountByLoc] = useState<Record<number, { items: number; users: number }>>({});
  const [dashEstados, setDashEstados] = useState<Record<number, { items: number; users: number; estado: EstadoPuesto }>>({});
  const [dashLoading, setDashLoading] = useState(false);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [mapQuery, setMapQuery] = useState("");
  const [mapResults, setMapResults] = useState<{ id: number; label: string; detail: string }[]>([]);
  const [mapMsg, setMapMsg] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const assetDirtyRef = useRef(false);
  const [showPuestos, setShowPuestos] = useState(true);
  const [showNumeros, setShowNumeros] = useState(true);
  const [showEstados, setShowEstados] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | EstadoPuesto>("todos");
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = useState(false);
  const [glpiBase, setGlpiBase] = useState<string>("");
  const [authUser, setAuthUser] = useState<{ login: string; name: string; profiles: string[]; canOperate: boolean } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const [userNames, setUserNames] = useState<Record<number, string>>({});
  const [personalByUser, setPersonalByUser] = useState<Record<number, Asset[]>>({});
  const openToken = useRef(0);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transformRef = useRef<any>(null);
  const puestoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const focusEpoch = useRef(0);
  const floorsRef = useRef(floors);
  const floorIdRef = useRef(floorId);
  const floorRef = useRef<Floor | null>(null);
  const pendingFocus = useRef<number | null>(null);

  const flashHighlight = (key: string) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightKey(key);
    highlightTimer.current = setTimeout(() => setHighlightKey(null), 5000);
  };

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  useEffect(() => {
    if (flashId == null) return;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 3200);
  }, [flashId]);
  // calibración
  const [draft, setDraft] = useState<Puesto[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [tool, setTool] = useState<"pan" | "draw">("pan"); // en calibración: navegar vs dibujar
  const [pending, setPending] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<
    | { x: number; y: number; kind: "new"; rect: { x: number; y: number; w: number; h: number } }
    | { x: number; y: number; kind: "reassign"; targetId: number }
    | null
  >(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const { byId, childrenOf, refresh: refreshLoc } = useLocations();

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((j) => setGlpiBase((j.glpiBaseUrl || "").replace(/\/$/, ""))).catch(() => {});
    const syncAuth = () => {
      fetch("/api/auth/me").then((r) => r.json()).then((j) => { if (j.authenticated) setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate }); else setAuthUser(null); }).catch(() => {});
    };
    syncAuth();
    window.addEventListener("auth-changed", syncAuth);
    if (calibrar) {
      fetch("/api/admin/check").then((r) => r.json()).then((j) => {
        setAdminAuthed(!!j.admin);
        if (!j.admin) setAuthOpen(true);
      }).catch(() => setAuthOpen(true));
    }
    return () => window.removeEventListener("auth-changed", syncAuth);
  }, [calibrar]);

  const requireEdit = (action: () => void) => {
    if (authUser?.canOperate) { action(); return; }
    pendingAction.current = action;
    setAuthOpen(true);
  };

  const floor = floors.find((f) => f.id === floorId) || floors[0] || null;
  floorsRef.current = floors;
  floorIdRef.current = floorId;
  floorRef.current = floor;
  const puestos: Puesto[] = calibrar && floor ? draft : floor?.puestos || [];
  const children = useMemo(
    () => (floor?.glpiLocationId != null ? childrenOf.get(floor.glpiLocationId) || [] : []),
    [childrenOf, floor]
  );
  const placedIds = useMemo(() => new Set(puestos.map((p) => p.glpi_id)), [puestos]);
  const nameOf = (id: number) => byId.get(id)?.name || `#${id}`;
  const shortNameOf = (id: number) => {
    const n = nameOf(id);
    const m = n.match(/^puesto\s+(.+)$/i);
    return m ? m[1] : n;
  };

  useEffect(() => {
    fetch("/api/maps").then((r) => r.json()).then((j) => {
      const fl: Floor[] = j.floors || [];
      setFloors(fl);
      if (!floorParam && fl.length) setFloorId((cur) => cur || fl[0].id);
    }).catch(() => setMsg("No se pudieron cargar los pisos. Créelos en /config."));
  }, [floorParam]);

  // Estados A/B/C desde el agregado del dashboard (una sola llamada, sin N×6).
  useEffect(() => {
    if (calibrar) return;
    setDashLoading(true);
    fetch("/api/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.estados) setDashEstados(j.estados);
        if (j.byLoc) {
          const m: Record<number, { items: number; users: number }> = {};
          for (const [k, v] of Object.entries<any>(j.byLoc)) m[Number(k)] = { items: v.items || 0, users: v.users?.length ?? v.users ?? 0 };
          setCountByLoc(m);
        }
      })
      .catch(() => {})
      .finally(() => setDashLoading(false));
  }, [calibrar]);

  const estadoOf = (id: number): EstadoPuesto => {
    const d = dashEstados[id];
    if (d?.estado) return d.estado as EstadoPuesto;
    const c = countByLoc[id];
    if (c) return clasificarPuesto(c.items, c.users);
    // Fallback local: si ya abrimos el puesto conocemos items/usuarios reales.
    if (sel?.glpi_id === id) return clasificarPuesto(items.length, occByLoc[id] ? occByLoc[id].split(",").filter(Boolean).length : 0);
    if (occByLoc[id] !== undefined) {
      const nUsers = occByLoc[id] ? occByLoc[id].split(",").filter(Boolean).length : 0;
      if (nUsers > 0) return "inconsistente";
    }
    return "incompleto";
  };

  const countsFloor = useMemo(() => {
    const c: Record<EstadoPuesto, number> = { "en-uso": 0, disponible: 0, incompleto: 0, inconsistente: 0 };
    for (const p of puestos) c[estadoOf(p.glpi_id)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestos, dashEstados, countByLoc, occByLoc, sel, items]);

  async function buscarEnPlano() {
    const q = mapQuery.trim();
    if (!q) return;
    setMapMsg("Buscando…");
    setMapResults([]);
    const needle = q.toLowerCase();
    const out: { id: number; label: string; detail: string }[] = [];
    // 1) Puestos dibujados del piso actual por número/nombre/interno/usuario.
    for (const p of puestos) {
      const loc = byId.get(p.glpi_id);
      const hay = `${p.glpi_id} ${loc?.name || ""} ${loc?.completename || ""} ${loc?.room || ""} ${occByLoc[p.glpi_id] || ""}`.toLowerCase();
      if (hay.includes(needle) || shortNameOf(p.glpi_id).toLowerCase() === needle) {
        const e = estadoOf(p.glpi_id);
        out.push({ id: p.glpi_id, label: `${shortNameOf(p.glpi_id)} · ${ESTADO_META[e].label}`, detail: `${occByLoc[p.glpi_id] || "sin usuario"} · ${dashEstados[p.glpi_id]?.items ?? countByLoc[p.glpi_id]?.items ?? 0} bienes` });
      }
      if (out.length >= 8) break;
    }
    // 2) Si no hay coincidencia local, resolver inventario en GLPI y mapear a puesto.
    if (!out.length) {
      try {
        const r = await fetch(`/api/glpi?q=${encodeURIComponent(q)}&type=all`);
        const j = await r.json();
        const list: any[] = j.items || [];
        for (const a of list.slice(0, 8)) {
          if (a._locationId != null) {
            const f = floorOf(a._locationId);
            out.push({ id: a._locationId, label: `${a._type} ${a.otherserial || a.name}`, detail: `${nameOf(a._locationId)}${f ? ` · ${f.name}` : ""}` });
          }
        }
      } catch {}
    }
    setMapResults(out);
    setMapMsg(out.length ? "" : "Sin coincidencias en puestos dibujados.");
  }

  function toggleFullscreen() {
    const el = mapWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => setMsg("Pantalla completa no disponible en este navegador."));
  }
  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // al cambiar de piso en modo calibración, parte del server
  useEffect(() => {
    if (floor) { setDraft(floor.puestos); setPending(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor?.id]);

  useEffect(() => {
    if (focus && floors.length) focusPuesto(Number(focus));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, floors]);

  async function focusPuesto(glpiId: number) {
    setFlashId(glpiId);
    pendingFocus.current = glpiId;
    const epoch = ++focusEpoch.current;
    openById(glpiId);
    centerWithRetry(glpiId, epoch, 0);
  }

  function centerWithRetry(glpiId: number, epoch: number, attempt = 0) {
    if (epoch !== focusEpoch.current) return; // cadena obsoleta
    const el = puestoRefs.current.get(glpiId);
    const img = boxRef.current?.querySelector("img") as HTMLImageElement | null;
    const imgReady = !!img && img.complete && (img.naturalWidth || 0) > 0;
    const f = floorsRef.current.find((x) => (x.puestos || []).some((p) => p.glpi_id === glpiId));
    const inFloor = !!f;
    const floorReady = !!floorRef.current && f != null && floorRef.current.id === f.id;
    if (el && transformRef.current && inFloor && imgReady && floorReady) {
      const before = { s: transformRef.current.state?.scale, x: transformRef.current.state?.positionX, y: transformRef.current.state?.positionY };
      try {
        transformRef.current.zoomToElement(el, 2.4, 600);
      } catch (e) {
        console.warn("zoomToElement fallo", e);
      }
      setTimeout(() => {
        if (epoch !== focusEpoch.current) return;
        const after = transformRef.current?.state;
        const moved = !after || after.scale !== before.s || after.positionX !== before.x || after.positionY !== before.y;
        if (!moved) {
          // fallback manual con setTransform
          try {
            const wrapper = transformRef.current.wrapperComponent as HTMLElement | null;
            const content = transformRef.current.contentComponent as HTMLElement | null;
            if (wrapper && content && el) {
              const wRect = wrapper.getBoundingClientRect();
              const scale = 2.4;
              const cx = el.offsetLeft + el.offsetWidth / 2;
              const cy = el.offsetTop + el.offsetHeight / 2;
              const x = wRect.width / 2 - cx * scale;
              const y = wRect.height / 2 - cy * scale;
              transformRef.current.setTransform(x, y, scale, 600);
              console.log("setTransform fallback", { x, y, scale });
            } else {
              transformRef.current.centerView(2.4, 600);
            }
          } catch (e2) {
            console.warn("fallback fallo", e2);
          }
        }
      }, 750);
      pendingFocus.current = null;
      return;
    }
    if (attempt < 20) {
      setTimeout(() => centerWithRetry(glpiId, epoch, attempt + 1), 300);
    } else {
      pendingFocus.current = null;
      if (!inFloor) setMsg(`El puesto ${nameOf(glpiId)} no está dibujado en ningún plano.`);
      else console.warn("No se pudo centrar el puesto", glpiId, { hasEl: !!el, hasTransform: !!transformRef.current, inFloor, imgReady, floorReady });
    }
  }

  function floorOf(glpiId: number): Floor | undefined {
    return floors.find((f) => f.puestos.some((p) => p.glpi_id === glpiId));
  }

  function openById(glpiId: number) {
    setFlashId(glpiId);
    const f = floors.find((x) => x.id === floor?.id && x.puestos.some((p) => p.glpi_id === glpiId)) || floorOf(glpiId);
    if (!f) { setMsg(`El puesto ${nameOf(glpiId)} no está dibujado en ningún plano.`); return; }
    if (f.id !== floor?.id) setFloorId(f.id);
    const p = f.puestos.find((x) => x.glpi_id === glpiId)!;
    openPuesto(p);
  }

  async function resolveUserNames(list: Asset[]) {
    const ids = [...new Set(list.map((a) => a._userId).filter((id) => id != null))] as number[];
    const map: Record<number, string> = {};
    if (!ids.length) return map;
    await Promise.all(ids.map(async (id) => {
      try {
        const r = await fetch(`/api/glpi/users?id=${id}`);
        const j = await r.json();
        if (j.user?.display) map[id] = j.user.display;
      } catch {}
    }));
    if (Object.keys(map).length) setUserNames((m) => ({ ...m, ...map }));
    return map;
  }

  const [puestoPanel, setPuestoPanel] = useState(false);
  function closePuestoPanel() {
    if (assetDirtyRef.current && !confirm("Hay cambios sin guardar. ¿Cerrar sin guardar?")) return;
    assetDirtyRef.current = false;
    setDetailAsset(null);
    setPuestoPanel(false);
  }

  function openAssetDetail(a: Asset) {
    assetDirtyRef.current = false;
    setDetailAsset(a);
  }
  function closeDetailAsset() {
    if (assetDirtyRef.current && !confirm("Hay cambios sin guardar. ¿Cerrar sin guardar?")) return;
    assetDirtyRef.current = false;
    setDetailAsset(null);
  }

  async function openPuesto(p: Puesto) {
    setSel(p); setMsg("Cargando equipos..."); setScanMode(null);
    setRoomOpen(false); setRoomMsg("");
    setPersonalByUser({});
    setDetailAsset(null); assetDirtyRef.current = false;
    setPuestoPanel(true);
    const r = await fetch(`/api/glpi?location_id=${p.glpi_id}`);
    const j = await r.json();
    if (!r.ok) { setMsg("Error: " + j.error); setItems([]); return; }
    const loaded: Asset[] = j.items || [];
    setItems(loaded);
    const resolved = await resolveUserNames(loaded);
    const fullName = (a: Asset) => resolved[a._userId] || userNames[a._userId] || a._userName || `Usuario ${a._userId}`;
    const names = [...new Map(loaded.filter((a) => a._userId != null).map((a) => [a._userId, fullName(a)] as const)).values()];
    setOccByLoc((m) => ({ ...m, [p.glpi_id]: names.join(", ") }));
    const nUsers = new Set(loaded.map((a) => a._userId).filter((v) => v != null)).size;
    setCountByLoc((m) => ({ ...m, [p.glpi_id]: { items: loaded.length, users: nUsers } }));
    setDashEstados((m) => ({ ...m, [p.glpi_id]: { items: loaded.length, users: nUsers, estado: clasificarPuesto(loaded.length, nUsers) } }));
    setMsg(loaded.length ? "" : "Puesto vacío");
    // Bienes personales de cada ocupante (asignados a ella, sin puesto). No bloquea.
    const userIds = [...new Set(loaded.map((a) => a._userId).filter((id) => id != null))] as number[];
    if (userIds.length) {
      const myToken = ++openToken.current;
      Promise.all(userIds.map(async (id): Promise<[number, Asset[]]> => {
        try {
          const ur = await fetch(`/api/glpi/user-assets?user_id=${id}`);
          const uj = await ur.json();
          if (!ur.ok) return [id, []];
          const all: Asset[] = [...(uj.groups || []).flatMap((g: any) => g.items || []), ...(uj.unlocated || [])];
          return [id, all.filter((a) => a._locationId == null)];
        } catch {
          return [id, []];
        }
      })).then((entries) => {
        if (myToken !== openToken.current) return;
        setPersonalByUser((m) => {
          const next = { ...m };
          for (const [id, list] of entries) next[id] = list;
          return next;
        });
      });
    }
  }

  async function assignInventory(inv: string, opts: { replace?: Asset } = {}) {
    if (!sel) return;
    const parsed = parseGlpiUrl(inv);
    let found: Asset | undefined;
    if (parsed) {
      setMsg(`Buscando ${parsed.type} #${parsed.id}...`);
      const r = await fetch(`/api/glpi?type=${encodeURIComponent(parsed.type)}&id=${parsed.id}`);
      const j = await r.json();
      found = r.ok ? j.item : undefined;
      if (!found) { setMsg("No existe ese bien en GLPI"); return; }
    } else {
      setMsg("Buscando inventario " + inv + "...");
      const s = await fetch(`/api/glpi?q=${encodeURIComponent(inv)}&type=all`).then((r) => r.json());
      const list: Asset[] = s.items || [];
      const variants = new Set(inventoryVariants(inv).map((v) => v.toUpperCase()));
      found = list.find((it) => variants.has(String(it.otherserial || "").trim().toUpperCase())) || list[0];
      if (!found) { setMsg("No existe ese inventario en GLPI"); return; }
    }
    if (found._userId != null && found._locationId !== sel.glpi_id) {
      const owner = found._userName && found._userName !== "—" ? found._userName : `usuario #${found._userId}`;
      const fromLoc = found._locationId != null ? nameOf(found._locationId) : "sin puesto";
      if (!confirm(`Este equipo es de ${owner} (${fromLoc}). ¿Moverlo al puesto ${nameOf(sel.glpi_id)}? Conservará su usuario.`)) return;
    }
    if (opts.replace) {
      await fetch("/api/glpi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: opts.replace._type, id: opts.replace.id, location_id: null }) });
    }
    const r = await fetch("/api/glpi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: found._type, id: found.id, location_id: sel.glpi_id }) });
    const j = await r.json();
    setMsg(r.ok ? `Asignado ${found._type} ${found.otherserial || found.name} → ${nameOf(sel.glpi_id)}` : "Error: " + j.error);
    setScanMode(null); setManualInv("");
    if (r.ok) flashHighlight(`${found._type}-${found.id}`);
    openPuesto(sel);
  }

  async function unassign(a: Asset) {
    if (!confirm(`Quitar ${a._type} ${a.otherserial || a.name} del puesto? Quedará sin ubicación.`)) return;
    const r = await fetch("/api/glpi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: a._type, id: a.id, location_id: null }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Quitado (sin ubicación)" : `Error: ${j.error || r.status}`);
    if (r.ok && sel) openPuesto(sel);
  }

  const occupants = useMemo(() => {
    const m = new Map<number, { id: number; name: string; count: number }>();
    for (const a of items) {
      if (a._userId == null) continue;
      const cur = m.get(a._userId) || { id: a._userId, name: userNames[a._userId] || a._userName || `Usuario ${a._userId}`, count: 0 };
      cur.count += 1;
      m.set(a._userId, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [items, userNames]);

  async function searchOccupants() {
    if (!occQuery.trim()) return;
    setMsg("Buscando personas...");
    const r = await fetch(`/api/glpi/users?q=${encodeURIComponent(occQuery.trim())}`);
    const j = await r.json();
    if (!r.ok) { setMsg("Error: " + j.error); setOccResults([]); return; }
    setOccResults(j.users || []);
    setMsg(j.users?.length ? "" : "Sin personas.");
  }

  async function assignOccupant(u: { id: number; display: string }) {
    if (!sel || !items.length) return;
    if (!confirm(`Asignar a ${u.display} como ocupante de ${nameOf(sel.glpi_id)}? Se actualizará el usuario en ${items.length} equipo(s) (conservan el puesto).`)) return;
    setMsg("Asignando ocupante...");
    for (const a of items) {
      const r = await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: a._type, id: a.id, user_id: u.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`Error: ${j.error || r.status}`); return; }
    }
    setOccOpen(false); setOccQuery(""); setOccResults([]);
    openPuesto(sel);
  }

  async function removeOccupant(id: number, name: string) {
    if (!sel) return;
    const mine = items.filter((a) => a._userId === id);
    if (!mine.length) return;
    if (!confirm(`Quitar a ${name} del puesto? Se quitará como usuario de ${mine.length} equipo(s) (conservan el puesto).`)) return;
    setMsg("Quitando ocupante...");
    for (const a of mine) {
      const r = await fetch("/api/glpi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: a._type, id: a.id, user_id: null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`Error: ${j.error || r.status}`); return; }
    }
    openPuesto(sel);
  }

  async function saveRoom() {
    if (!sel) return;
    const v = roomVal.trim().slice(0, 50);
    const cur = byId.get(sel.glpi_id)?.room || "";
    if (v && v === cur) { setRoomMsg("Sin cambios."); return; }
    if (!v && cur && !confirm(`Quitar el interno ${cur} del puesto ${nameOf(sel.glpi_id)}?`)) return;
    setRoomMsg("Guardando...");
    const r = await fetch("/api/glpi/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sel.glpi_id, room: v }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setRoomMsg("Error: " + (j.error || r.status)); return; }
    setRoomMsg("");
    setRoomOpen(false);
    refreshLoc();
  }

  async function clearRoom() {
    if (!sel) return;
    const cur = byId.get(sel.glpi_id)?.room || "";
    if (!cur) return;
    if (!confirm(`Quitar el interno ${cur} del puesto ${nameOf(sel.glpi_id)}?`)) return;
    setRoomMsg("Quitando interno...");
    const r = await fetch("/api/glpi/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sel.glpi_id, room: "" }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setRoomMsg("Error: " + (j.error || r.status)); return; }
    setRoomMsg("");
    refreshLoc();
  }

  // ---------- calibración: dibujar / mover / redimensionar ----------
  const toPct = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)),
    };
  };

  const onBoxDown = (e: React.PointerEvent) => {
    if (!calibrar || !floor || drag || tool !== "draw") return;
    if ((e.target as HTMLElement).closest("[data-puesto]")) return; // lo maneja el rect
    const p = toPct(e.clientX, e.clientY);
    setDrag({ mode: "draw", sx: p.x, sy: p.y, cx: p.x, cy: p.y });
  };
  const onBoxMove = (e: React.PointerEvent) => {
    if (!calibrar || !drag) return;
    const p = toPct(e.clientX, e.clientY);
    if (drag.mode === "draw") setDrag({ ...drag, cx: p.x, cy: p.y });
    else if (drag.mode === "move") {
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      setDraft((d) => d.map((x) => (x.glpi_id === drag.id ? { ...x, x: Math.min(95, Math.max(0, drag.ox + dx)), y: Math.min(95, Math.max(0, drag.oy + dy)) } : x)));
    } else {
      const dw = p.x - drag.sx, dh = p.y - drag.sy;
      setDraft((d) => d.map((x) => (x.glpi_id === drag.id ? { ...x, w: Math.min(100 - x.x, Math.max(2, drag.ow + dw)), h: Math.min(100 - x.y, Math.max(2, drag.oh + dh)) } : x)));
    }
  };
  const onBoxUp = () => {
    if (!drag) return;
    if (drag.mode === "draw") {
      const x = Math.min(drag.sx, drag.cx), y = Math.min(drag.sy, drag.cy);
      const w = Math.abs(drag.cx - drag.sx), h = Math.abs(drag.cy - drag.sy);
      if (w > 1 && h > 1) {
        const rect = { x, y, w, h };
        setPending(rect);
        const r = boxRef.current!.getBoundingClientRect();
        const cx = r.left + ((x + w / 2) / 100) * r.width;
        const cy = r.top + ((y + h / 2) / 100) * r.height;
        setCtxMenu({ x: cx, y: cy, kind: "new", rect });
      }
    }
    setDrag(null);
  };

  async function autoSave(next: Puesto[]) {
    if (!floor) return;
    const r = await fetch("/api/maps", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: floor.id, puestos: next }) });
    const j = await r.json();
    if (!r.ok) {
      if (r.status === 401) { setAdminAuthed(false); setAuthOpen(true); }
      setMsg(r.status === 401 ? "Inicia sesión admin para guardar." : "Error: " + j.error);
      return;
    }
    setFloors((fs) => fs.map((f) => (f.id === floor.id ? j.floor : f)));
    setMsg(`Guardado en servidor: ${next.length} puestos.`);
  }

  function assignNew(childId: number, rect: { x: number; y: number; w: number; h: number }) {
    if (placedIds.has(childId)) { setMsg("Ese puesto ya está dibujado en este piso."); return; }
    const next = [...draft, { glpi_id: childId, ...rect }];
    setDraft(next);
    setPending(null);
    setCtxMenu(null);
    autoSave(next);
  }

  function reassignPuesto(targetId: number, childId: number) {
    if (placedIds.has(childId)) { setMsg("Ese puesto ya está dibujado en este piso."); return; }
    const next = draft.map((p) => (p.glpi_id === targetId ? { ...p, glpi_id: childId } : p));
    setDraft(next);
    setCtxMenu(null);
    autoSave(next);
  }

  async function saveCalib() {
    if (!floor) return;
    await autoSave(draft);
  }

  const drawRect = drag?.mode === "draw" ? {
    x: Math.min(drag.sx, drag.cx), y: Math.min(drag.sy, drag.cy),
    w: Math.abs(drag.cx - drag.sx), h: Math.abs(drag.cy - drag.sy),
  } : null;

  const noParent = calibrar && floor && floor.glpiLocationId == null;

  // panning del zoom se desactiva solo mientras se dibuja/mueve un rect
  const panDisabled = calibrar && (tool === "draw" || !!drag);

  if (calibrar && !adminAuthed) {
    return (
      <div className="grid gap-4">
        <div className="page-header">
          <h1>Calibración</h1>
          <p>Se requiere acceso administrador para dibujar y modificar puestos.</p>
        </div>
        <div className="card p-6 grid gap-2 text-center">
          <p className="text-muted">Inicia sesión para calibrar.</p>
          <button className="btn btn-primary w-fit mx-auto" onClick={() => setAuthOpen(true)}>Iniciar sesión</button>
        </div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { fetch("/api/auth/me").then((r) => r.json()).then((j) => { if (j.authenticated) setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate }); }).catch(() => {}); fetch("/api/admin/check").then((r) => r.json()).then((j) => setAdminAuthed(!!j.admin)).catch(() => {}); }} />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="min-w-0 overflow-hidden lg:sticky lg:top-20">
        <div className="flex gap-2 items-center mb-1.5 flex-wrap">
          <h1 className="text-lg font-bold">Control {floor ? `· ${floor.name}` : ""} {calibrar && <span className="badge badge-warning ml-2">Calibración</span>}</h1>
          {dashLoading && !calibrar && <Spinner label="Estados…" />}
          {floors.length > 1 && floors.length <= MAX_FLOOR_BUTTONS && (
            <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Pisos">
              {floors.map((f) => {
                const active = f.id === floor?.id;
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setFloorId(f.id); setSel(null); setItems([]); setMapResults([]); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition min-h-[36px] ${active ? "text-white" : "bg-white text-muted border border-line hover:text-ink"}`}
                    style={active ? { background: "var(--accent)" } : undefined}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          )}
          {floors.length > MAX_FLOOR_BUTTONS && (
            <select aria-label="Piso" className="input w-auto text-sm py-1.5" value={floor?.id || ""} onChange={(e) => { setFloorId(e.target.value); setSel(null); setItems([]); setMapResults([]); }}>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          {!calibrar && floor && (
            <button className="btn btn-secondary text-xs md:hidden ml-auto tap-target" aria-expanded={toolsOpen} aria-controls="map-tools" onClick={() => setToolsOpen((v) => !v)}>
              {toolsOpen ? "Ocultar herramientas" : "Herramientas"}
            </button>
          )}
        </div>
        {!calibrar && floor && (
          <div className="card px-2.5 py-1.5 mb-1.5 flex gap-x-3 gap-y-1 items-center flex-wrap text-[11px]" aria-label="Leyenda de estados">
            {(["en-uso", "disponible", "incompleto", "inconsistente"] as EstadoPuesto[]).map((e) => (
              <span key={e} className="inline-flex items-center gap-1" title={e === "en-uso" ? "Puesto equipado con bienes y usuario" : e === "disponible" ? "Puesto equipado con bienes, sin usuario" : e === "incompleto" ? "Puesto sin bienes ni usuario" : "Puesto con usuario pero sin bienes"}>
                <span aria-hidden="true" className="inline-block w-3 h-3 rounded border-2" style={{ background: e === "en-uso" ? "var(--st-use-bg)" : e === "disponible" ? "var(--st-free-bg)" : e === "incompleto" ? "var(--st-inc-bg)" : "var(--st-warn-bg)", borderColor: ESTADO_META[e].color }} />
                <span className="text-muted">{ESTADO_META[e].label} <b className="text-ink tabular-nums">{countsFloor[e]}</b></span>
              </span>
            ))}
          </div>
        )}
        {!calibrar && floor && (
          <div id="map-tools" className={`card px-3 py-2 mb-1.5 ${toolsOpen ? "grid" : "hidden"} md:grid gap-2`}>
            <div className="flex gap-2 flex-wrap items-center">
              <label htmlFor="map-search" className="text-xs font-bold text-ink">Buscar en plano</label>
              <input id="map-search" className="input flex-1 min-w-[180px] !py-1.5 text-sm" placeholder="Nº puesto, usuario o inventario…" value={mapQuery} onChange={(e) => setMapQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscarEnPlano()} />
              <button className="btn btn-primary text-xs tap-target" onClick={buscarEnPlano}>Buscar</button>
              <span className="text-xs text-muted" role="status">{mapMsg}</span>
            </div>
            {!!mapResults.length && (
              <ul className="grid gap-1 max-h-36 overflow-auto" role="listbox" aria-label="Resultados en plano">
                {mapResults.map((r) => (
                  <li key={r.id}>
                    <button role="option" aria-selected="false" className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-canvas border border-transparent hover:border-line" onClick={() => { setMapResults([]); setMapQuery(""); focusPuesto(r.id); }}>
                      <b>{r.label}</b> <span className="text-muted text-xs">— {r.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-3 items-center flex-wrap text-xs text-muted">
              <span className="font-bold text-ink">Capas:</span>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={showPuestos} onChange={(e) => setShowPuestos(e.target.checked)} /> Puestos</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={showNumeros} onChange={(e) => setShowNumeros(e.target.checked)} /> Números</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={showEstados} onChange={(e) => setShowEstados(e.target.checked)} /> Estados</label>
              <label className="inline-flex items-center gap-1">Filtro:
                <select aria-label="Filtrar por estado" className="border rounded px-1 py-0.5 text-xs bg-white" value={filtro} onChange={(e) => setFiltro(e.target.value as any)}>
                  <option value="todos">Todos</option>
                  <option value="en-uso">Equipados en uso</option>
                  <option value="disponible">Equipados disponibles</option>
                  <option value="incompleto">Incompletos</option>
                  <option value="inconsistente">Inconsistentes</option>
                </select>
              </label>
            </div>
            <details>
              <summary className="text-xs font-bold cursor-pointer py-1.5 text-ink">Lugares (árbol GLPI)</summary>
              <div className="mt-1 max-h-[30vh] overflow-auto">
                <PlacesTree floors={floors} occByLoc={occByLoc} onPuesto={(id) => openById(id)} onPiso={(f) => { setFloorId(f.id); setSel(null); setItems([]); }} />
              </div>
            </details>
          </div>
        )}
        {!floor ? (
          <p className="text-sm text-slate-500 bg-white rounded p-4">Sin pisos configurados. Crea uno y sube su plano en <a className="underline" href="/config">/config</a>.</p>
        ) : !floor.image ? (
          <p className="text-sm text-slate-500 bg-white rounded p-4">El piso "{floor.name}" no tiene plano. <a className="underline" href="/config">Súbelo en /config</a>.</p>
        ) : noParent ? (
          <p className="text-sm text-amber-800 bg-amber-50 border rounded p-4">Este piso no tiene ubicación GLPI padre. <a className="underline" href="/config">Vincúlalo en /config</a> para dibujar puestos.</p>
        ) : (
            <div ref={mapWrapRef} className={`relative ${isFull ? "bg-white" : ""}`}>
            <TransformWrapper ref={transformRef} minScale={0.5} maxScale={8} panning={{ disabled: panDisabled }}>
              <div className="relative">
                <TransformComponent wrapperClass="!w-full !h-[58vh] lg:!h-[66vh] bg-white rounded-xl shadow overflow-hidden">
                  <div ref={boxRef} className="relative inline-block select-none"
                    onPointerDown={onBoxDown} onPointerMove={onBoxMove} onPointerUp={onBoxUp}
                    onContextMenu={(e) => {
                      if (!calibrar) return;
                      const target = (e.target as HTMLElement).closest("[data-puesto]");
                      e.preventDefault();
                      if (target) return;
                      if (pending) {
                        setCtxMenu({ x: e.clientX, y: e.clientY, kind: "new", rect: pending });
                      }
                    }}
                    style={{ touchAction: panDisabled ? "none" : undefined, cursor: calibrar && tool === "draw" ? "crosshair" : undefined }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/maps/${floor.id}/image`} alt={`Plano ${floor.name}`} className="max-w-none max-h-[58vh] lg:max-h-[66vh]" draggable={false} onLoad={() => { if (pendingFocus.current != null) centerWithRetry(pendingFocus.current, focusEpoch.current, 0); }} />
                {showPuestos && puestos.map((p) => {
                  const est = showEstados && !calibrar ? estadoOf(p.glpi_id) : null;
                  const dim = !calibrar && filtro !== "todos" && est !== filtro;
                  const nItems = dashEstados[p.glpi_id]?.items ?? countByLoc[p.glpi_id]?.items ?? (sel?.glpi_id === p.glpi_id ? items.length : 0);
                  const usersTxt = occByLoc[p.glpi_id] || "";
                  const nUsers = dashEstados[p.glpi_id]?.users ?? countByLoc[p.glpi_id]?.users ?? (usersTxt ? usersTxt.split(",").filter(Boolean).length : 0);
                  const label = `${nameOf(p.glpi_id)}, ${est ? ESTADO_META[est].label : "puesto"}, ${nItems} bienes, ${nUsers} usuarios${byId.get(p.glpi_id)?.room ? `, interno ${byId.get(p.glpi_id)?.room}` : ""}`;
                  return (
                  <div key={p.glpi_id} data-puesto ref={(el) => { if (el) puestoRefs.current.set(p.glpi_id, el); else puestoRefs.current.delete(p.glpi_id); }}
                    role={calibrar ? undefined : "button"}
                    tabIndex={calibrar ? undefined : 0}
                    aria-label={calibrar ? undefined : label}
                    aria-selected={calibrar ? undefined : sel?.glpi_id === p.glpi_id}
                    onClick={() => { if (!calibrar) { setFlashId(p.glpi_id); openPuesto(p); } }}
                    onKeyDown={(e) => { if (!calibrar && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setFlashId(p.glpi_id); openPuesto(p); } }}
                    onPointerDown={(e) => {
                      if (!calibrar) return;
                      e.stopPropagation();
                      const q = toPct(e.clientX, e.clientY);
                      setDrag({ mode: "move", id: p.glpi_id, sx: q.x, sy: q.y, ox: p.x, oy: p.y });
                    }}
                    onContextMenu={(e) => {
                      if (!calibrar) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setCtxMenu({ x: e.clientX, y: e.clientY, kind: "reassign", targetId: p.glpi_id });
                    }}
                    onMouseEnter={() => !calibrar && setHoverId(p.glpi_id)}
                    onMouseLeave={() => setHoverId((h) => (h === p.glpi_id ? null : h))}
                    onFocus={() => !calibrar && setHoverId(p.glpi_id)}
                    onBlur={() => setHoverId((h) => (h === p.glpi_id ? null : h))}
                    title={`${nameOf(p.glpi_id)}${byId.get(p.glpi_id)?.room ? ` · Int. ${byId.get(p.glpi_id)?.room}` : ""}${usersTxt ? ` · ${usersTxt}` : ""} (GLPI ${p.glpi_id})`}
                    data-state={est || undefined}
                    className={`puesto tip absolute border-2 rounded-lg text-[11px] font-bold overflow-visible shadow-sm flex items-center justify-center text-center ${calibrar ? "cursor-move border-brand-600 bg-blue-300/50" : ""} ${!calibrar && !est ? "border-brand-600 bg-blue-300/50" : ""} ${calibrar ? "" : "cursor-pointer"} ${flashId === p.glpi_id ? "flash-puesto" : ""} ${dim ? "puesto-dim" : ""}`}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%` }}>
                    {showNumeros && <span className="puesto-num px-1 leading-tight break-words">{shortNameOf(p.glpi_id)}</span>}
                    {!calibrar && hoverId === p.glpi_id && (
                      <span className="tip-bubble" role="tooltip" style={{ left: "50%", bottom: "calc(100% + 6px)", transform: "translateX(-50%)" }}>
                        <b>{nameOf(p.glpi_id)}</b><br />
                        {est ? ESTADO_META[est].label : ""} · {nItems} bienes · {nUsers} usuarios<br />
                        {usersTxt ? <span>{usersTxt.slice(0, 80)}</span> : <span>Sin usuario asociado</span>}
                        {byId.get(p.glpi_id)?.room ? <><br />Int. {byId.get(p.glpi_id)?.room}</> : null}
                      </span>
                    )}
                    {calibrar && (
                      <span
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const q = toPct(e.clientX, e.clientY);
                          setDrag({ mode: "resize", id: p.glpi_id, sx: q.x, sy: q.y, ow: p.w, oh: p.h });
                        }}
                        className="absolute right-0 bottom-0 w-4 h-4 bg-blue-800 cursor-nwse-resize rounded-tl"
                        title="Redimensionar"
                      />
                    )}
                  </div>
                  );
                })}
                {drawRect && drawRect.w > 0.5 && (
                  <div className="absolute border-2 border-dashed border-amber-600 bg-amber-200/40 pointer-events-none"
                    style={{ left: `${drawRect.x}%`, top: `${drawRect.y}%`, width: `${drawRect.w}%`, height: `${drawRect.h}%` }} />
                )}
              </div>
            </TransformComponent>
            <ZoomControls onFullscreen={toggleFullscreen} isFull={isFull} />
            </div>
          </TransformWrapper>
          </div>
        )}
        {calibrar && floor && floor.image && floor.glpiLocationId != null && (
          <div className="card p-4 mt-2 grid gap-2 text-sm bg-amber-50/60 border-amber-200">
            {pending ? (
              <div className="grid gap-2">
                <b>Rectángulo dibujado. Elige el puesto (click derecho sobre él también):</b>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const r = boxRef.current!.getBoundingClientRect();
                    const cx = r.left + ((pending.x + pending.w / 2) / 100) * r.width;
                    const cy = r.top + ((pending.y + pending.h / 2) / 100) * r.height;
                    setCtxMenu({ x: cx, y: cy, kind: "new", rect: pending });
                  }} className="btn btn-primary text-xs">Elegir puesto</button>
                  <button onClick={() => { setPending(null); setCtxMenu(null); }} className="btn btn-secondary text-xs">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="font-bold text-sm">Herramienta:</span>
                  <button onClick={() => setTool("pan")} className={`btn ${tool === "pan" ? "btn-primary" : "btn-secondary"} text-xs`}>🖐️ Navegar</button>
                  <button onClick={() => setTool("draw")} className={`btn ${tool === "draw" ? "btn-primary" : "btn-secondary"} text-xs`}>✏️ Dibujar</button>
                </div>
                <p>{tool === "draw"
                  ? "Arrastra sobre el plano para dibujar un puesto → elige su ubicación GLPI. Puedes hacer zoom con la rueda antes de dibujar para mayor precisión."
                  : "Muévete con arrastre y zoom (rueda/pinch o botones +/−). Para mover un puesto, arrástralo directamente; para dibujar, cambia a ✏️ Dibujar."}</p>
              </div>
            )}
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={saveCalib} className="btn btn-primary text-xs">Guardar en servidor ({draft.length})</button>
              <span className="text-xs text-muted">{draft.length}/{children.length} hijos dibujados</span>
            </div>
            {draft.length > 0 && (
              <div className="grid gap-1">
                {draft.map((p) => (
                  <div key={p.glpi_id} className="flex gap-2 items-center text-xs min-w-0">
                    <span className="font-mono break-all min-w-0">{nameOf(p.glpi_id)} (loc {p.glpi_id})</span>
                    <button className="underline text-red-700" onClick={() => {
                      setDraft((d) => d.filter((x) => x.glpi_id !== p.glpi_id));
                      if (sel?.glpi_id === p.glpi_id) { setSel(null); setItems([]); }
                    }}>borrar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!calibrar && (
          <p className="text-xs text-slate-500 mt-2">Zoom con rueda/pinch, click en puesto para ver equipos. <a className="underline" href={`/mapa?calibrar=1${floor ? `&floor=${floor.id}` : ""}`}>Calibrar puestos</a></p>
        )}
      </div>

      {sel && !calibrar && puestoPanel && (
        <SidePanel
          title={<span className="flex items-center gap-2 flex-wrap min-w-0"><span className="truncate">{decodeEntities(nameOf(sel.glpi_id))}</span>{(() => { const e = estadoOf(sel.glpi_id); return <span className="badge shrink-0" title={`Estado: ${ESTADO_META[e].label}`} style={{ background: e === "en-uso" ? "#ecfdf5" : e === "disponible" ? "#eef4ff" : e === "incompleto" ? "#fffbeb" : "#fef2f2", color: ESTADO_META[e].color, border: `1px solid ${ESTADO_META[e].color}55` }}>● {ESTADO_META[e].label}</span>; })()}</span>}
          onClose={closePuestoPanel}
          footer={<div className="flex gap-2 justify-end"><button className="btn btn-secondary text-sm tap-target" onClick={closePuestoPanel}>← Volver al plano</button></div>}
        >
          <div className="grid gap-3">
            <section aria-label="Información del puesto" className="grid gap-1.5">
              <h3 className="section-h">Información general</h3>
              <dl className="info-card">
                <div className="info-row"><dt>Piso</dt><dd>{floor?.name || "—"}</dd></div>
                <div className="info-row"><dt>Interno</dt><dd>{byId.get(sel.glpi_id)?.room || <span className="text-muted">Sin interno</span>}</dd></div>
                <div className="info-row"><dt>Estado</dt><dd>{ESTADO_META[estadoOf(sel.glpi_id)].label}</dd></div>
              </dl>
            </section>
            <section aria-label="Ocupante del puesto" className="grid gap-1.5">
              <h3 className="section-h">Ocupante</h3>
              <div className="info-card grid gap-1.5 py-2.5">
                {occupants.length ? (
                  <ul className="grid gap-2 text-sm min-w-0">
                    {occupants.map((o) => (
                      <li key={o.id} className="grid gap-1 min-w-0">
                        <b className="break-words text-ink" title={`${o.name} (#${o.id})`}>{decodeEntities(o.name)} <span className="text-xs text-muted font-normal tabular-nums">#{o.id} · {o.count} equipo(s)</span></b>
                        {(personalByUser[o.id] || []).map((pa) => (
                          <button key={`${pa._type}-${pa.id}`} type="button" className="rowlink text-xs text-muted break-anywhere text-left" title={`${pa._type} ${disp(pa.name)} — abrir ficha (bien personal)`} onClick={() => openAssetDetail(pa)}>
                            {pa._type}: <b className="text-ink">{disp(pa.name)}</b> · Inv <span className="tabular-nums">{disp(pa.otherserial)}</span> <span className="text-[11px]">(personal)</span>
                          </button>
                        ))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-muted">Puesto sin ocupante.</span>
                )}
              </div>
            </section>
            <section aria-label="Bienes del puesto" className="grid gap-1.5 min-w-0">
              <h3 className="section-h">Bienes ({items.length})</h3>
              {items.length === 0 && <p className="text-xs text-muted">Sin bienes asociados a este puesto.</p>}
              {items.length > 0 && (
              <ul className="card p-3 grid gap-0" aria-label={`Bienes en ${nameOf(sel.glpi_id)}`}>
              {items.map((a) => {
                const title = `${a._type} · ${disp(a.name)} · Inv. ${disp(a.otherserial)}`;
                return (
                <li key={`${a._type}-${a.id}`} className={`flex items-center gap-2.5 min-w-0 py-1.5 border-b border-line last:border-0 ${highlightKey === `${a._type}-${a.id}` ? "flash-highlight rounded-lg px-1" : ""}`}>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas border border-line" aria-hidden="true">
                    <TypeIcon type={a._type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <button type="button" className="rowlink truncate font-medium text-ink text-[0.85rem]" title={`${title} — abrir ficha`} onClick={() => openAssetDetail(a)}>{disp(a.name)}</button>
                    <span className="block text-xs text-muted truncate">{a._type} · Inv <span className="tabular-nums">{disp(a.otherserial)}</span>{a._model ? ` · Mod. ${disp(a._model)}` : ""}{a.serial ? <> · Serie <span className="tabular-nums">{disp(a.serial)}</span></> : null}</span>
                  </span>
                </li>
                );
              })}
              </ul>
              )}
            </section>
            {msg && <p className={`text-sm break-words ${msg.startsWith("Error") || msg.startsWith("No ") ? "text-danger" : "text-muted"}`} role="status">{msg}</p>}
            {authUser?.canOperate && (
            <AdminSection title="Administrar puesto y equipos" hint="Ocupante, interno y bienes">
              <div className="grid gap-1.5 border border-line rounded-xl bg-white p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold">Ocupante</span>
                  <button className="btn btn-secondary text-xs" onClick={() => setOccOpen(!occOpen)}>{occOpen ? "Cerrar" : occupants.length ? "Cambiar" : "Asignar"}</button>
                </div>
                {occupants.length > 0 && (
                  <div className="grid gap-1.5">
                    {occupants.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl px-3 py-2 min-h-[52px]">
                        <span className="truncate min-w-0" title={o.name}>{decodeEntities(o.name)} <span className="text-xs text-muted">#{o.id}</span></span>
                        <button className="btn btn-danger-outline text-xs shrink-0" onClick={() => requireEdit(() => removeOccupant(o.id, o.name))}>Quitar</button>
                      </div>
                    ))}
                  </div>
                )}
                {occOpen && (
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <input
                        className="input flex-1 text-sm min-w-0"
                        placeholder="Nombre, apellido o usuario GLPI…"
                        aria-label="Buscar ocupante en GLPI"
                        value={occQuery}
                        onChange={(e) => setOccQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchOccupants()}
                      />
                      <button className="btn btn-primary text-xs shrink-0 tap-target" onClick={searchOccupants}>Buscar</button>
                    </div>
                    {occResults.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 text-sm border border-line rounded-xl px-3 py-2 min-h-[52px]">
                        <span className="truncate min-w-0" title={`${u.display} #${u.id}`}>{u.display} <span className="text-xs text-muted">#{u.id}</span></span>
                        <button className="btn btn-secondary text-xs shrink-0" onClick={() => requireEdit(() => assignOccupant(u))}>Asignar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-1.5 border border-line rounded-xl bg-white p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold">Interno del puesto</span>
                  <span className="flex gap-2">
                    <button className="btn btn-secondary text-xs" onClick={() => { setRoomVal((sel && byId.get(sel.glpi_id)?.room) || ""); setRoomMsg(""); setRoomOpen(!roomOpen); }}>{byId.get(sel.glpi_id)?.room ? "Editar" : "Asignar"}</button>
                    {sel && byId.get(sel.glpi_id)?.room && (
                      <button className="btn btn-danger-outline text-xs" onClick={() => requireEdit(clearRoom)}>Quitar</button>
                    )}
                  </span>
                </div>
                {roomOpen && (
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <input
                        className="input flex-1 text-sm min-w-0"
                        placeholder="Nº de interno… (vacío para quitar)"
                        aria-label="Número de interno"
                        value={roomVal}
                        maxLength={50}
                        onChange={(e) => setRoomVal(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && requireEdit(saveRoom)}
                      />
                      <button className="btn btn-primary text-xs shrink-0 tap-target" onClick={() => requireEdit(saveRoom)}>Guardar</button>
                    </div>
                  </div>
                )}
                {roomMsg && <p className="text-xs text-muted" role="status">{roomMsg}</p>}
              </div>
              <div className="grid gap-1.5 border border-line rounded-xl bg-white p-3">
                <span className="text-sm font-semibold">Agregar bienes por inventario</span>
                <div className="flex gap-2">
                  <input aria-label="Número de inventario" className="input flex-1 text-sm min-w-0" placeholder="0000012865, 12865 o A 0001-0537" value={manualInv} onChange={(e) => setManualInv(e.target.value)} onKeyDown={(e) => e.key === "Enter" && manualInv && requireEdit(() => assignInventory(manualInv, replaceTarget && scanMode === "replace" ? { replace: replaceTarget } : {}))} />
                  <button onClick={() => manualInv && requireEdit(() => assignInventory(manualInv))} className="btn btn-primary text-xs shrink-0 tap-target">OK</button>
                  <button aria-label="Escanear código" onClick={() => scanMode ? setScanMode(null) : requireEdit(() => setScanMode("add"))} className="btn btn-secondary tap-target shrink-0">📷</button>
                </div>
                <p className="text-[11px] text-muted">Buscando → encontrado / no encontrado / error. La operación confirma antes de mover equipos con usuario.</p>
              </div>
              {items.length > 0 && (
              <div className="grid gap-1.5" role="group" aria-label="Editar o desvincular bienes">
                <span className="text-xs font-semibold text-ink">Editar o desvincular bienes</span>
                {items.map((a) => (
                  <div key={`${a._type}-${a.id}`} className="border border-line rounded-xl bg-white px-3 py-2 grid gap-1.5">
                    <span className="truncate text-sm min-w-0" title={`${a._type} ${disp(a.name)} · Inv ${disp(a.otherserial)}`}>{a._type} · <b>{disp(a.name)}</b> · Inv <span className="tabular-nums">{disp(a.otherserial)}</span></span>
                    <span className="flex gap-1.5 flex-wrap">
                      {glpiBase && (
                        <a
                          title="Editar en GLPI"
                          aria-label={`Editar ${a._type} ${disp(a.otherserial)} en GLPI`}
                          href={`${glpiBase}/front/${editFormOf(a._type)}?id=${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary text-xs"
                        >
                          Editar en GLPI
                        </a>
                      )}
                      <button
                        aria-label={`Reemplazar ${a._type} ${disp(a.otherserial)}`}
                        onClick={() => requireEdit(() => { setReplaceTarget(a); setScanMode("replace"); })}
                        className="btn btn-secondary text-xs"
                      >
                        Reemplazar
                      </button>
                      <button
                        aria-label={`Desvincular ${a._type} ${disp(a.otherserial)} del puesto (no elimina en GLPI)`}
                        onClick={() => requireEdit(() => unassign(a))}
                        className="btn btn-danger-outline text-xs"
                      >
                        Desvincular
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              )}
            </AdminSection>
            )}
            {scanMode && (
              <ScanModal
                title={scanMode === "replace" ? "Reemplazar equipo (escaneo)" : "Agregar equipo (escaneo)"}
                onClose={() => { setScanMode(null); setReplaceTarget(null); }}
                onResult={(v) => assignInventory(v, replaceTarget && scanMode === "replace" ? { replace: replaceTarget } : {})}
              />
            )}
            {detailAsset && (
              <SidePanel
                title={decodeEntities(disp(detailAsset.name))}
                subtitle={<span className="badge">{detailAsset._type}</span>}
                onClose={closeDetailAsset}
                footer={<div className="flex gap-2 justify-end"><button className="btn btn-secondary text-sm tap-target" onClick={closeDetailAsset}>← Volver al puesto</button></div>}
              >
                <AssetEditModal
                  key={`${detailAsset._type}-${detailAsset.id}`}
                  asset={detailAsset}
                  byId={byId}
                  childrenOf={childrenOf}
                  canEdit={!!authUser?.canOperate}
                  onSaved={() => { if (sel) openPuesto(sel); setDetailAsset(null); }}
                  onDirtyChange={(d) => { assetDirtyRef.current = d; }}
                />
              </SidePanel>
            )}
          </div>
        </SidePanel>
      )}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="fixed z-50 card p-2 min-w-[240px] max-w-[320px] max-h-[60vh] overflow-auto" style={{ left: Math.min(ctxMenu.x, window.innerWidth - 260), top: Math.min(ctxMenu.y, window.innerHeight - 220) }}>
            <div className="text-xs font-bold mb-1 px-1">Elegir puesto disponible</div>
            {children.filter((c) => !placedIds.has(c.id)).length === 0 ? (
              <div className="text-xs text-slate-500 px-2 py-1">No hay puestos disponibles.</div>
            ) : (
              <ul className="grid gap-1">
                {children.filter((c) => !placedIds.has(c.id)).map((c) => (
                  <li key={c.id}>
                    <button className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-canvas transition" onClick={() => {
                      if (ctxMenu.kind === "new") assignNew(c.id, ctxMenu.rect);
                      else reassignPuesto(ctxMenu.targetId, c.id);
                    }}>{c.name} <span className="text-[10px] text-slate-500">(id {c.id})</span></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mt-2 px-1">
              <button className="btn btn-secondary text-xs" onClick={() => { if (ctxMenu.kind === "new") setPending(null); setCtxMenu(null); }}>Cancelar</button>
            </div>
          </div>
        </>
      )}
      {authOpen && (
        <AuthModal
          open={authOpen}
          onClose={() => { setAuthOpen(false); pendingAction.current = null; }}
          onSuccess={() => {
            fetch("/api/auth/me").then((r) => r.json()).then((j) => { if (j.authenticated) setAuthUser({ login: j.user.login, name: j.user.name, profiles: j.user.profiles, canOperate: j.canOperate }); }).catch(() => {});
            fetch("/api/admin/check").then((r) => r.json()).then((j) => setAdminAuthed(!!j.admin)).catch(() => {});
            window.dispatchEvent(new Event("auth-changed"));
            const a = pendingAction.current; pendingAction.current = null;
            if (a) a();
          }}
        />
      )}
     </div>
   );
}

function ZoomControls({ onFullscreen, isFull }: { onFullscreen: () => void; isFull: boolean }) {
  const { zoomIn, zoomOut, resetTransform, centerView } = useControls();
  const btn = "bg-white/95 border border-line rounded-lg w-11 h-11 text-xl leading-none shadow flex items-center justify-center hover:bg-canvas";
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 z-10" role="toolbar" aria-label="Controles del plano">
      <button className={btn} onClick={() => zoomIn()} title="Acercar" aria-label="Acercar">+</button>
      <button className={btn} onClick={() => zoomOut()} title="Alejar" aria-label="Alejar">−</button>
      <button className={btn} onClick={() => resetTransform()} title="Restablecer zoom" aria-label="Restablecer zoom">⤾</button>
      <button className={btn} onClick={() => centerView(1, 400)} title="Ajustar plano a pantalla" aria-label="Ajustar plano a pantalla">⛶</button>
      <button className={btn} onClick={onFullscreen} title={isFull ? "Salir de pantalla completa" : "Pantalla completa"} aria-label={isFull ? "Salir de pantalla completa" : "Ver en pantalla completa"}>🖵</button>
    </div>
  );
}
