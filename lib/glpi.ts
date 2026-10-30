import { loadConfig, decryptSecret } from "./config";

// GLPI 10 API legacy (apirest.php): initSession con user_token + App-Token,
// luego Session-Token + App-Token en cada llamada. Sin OAuth.

let session: { token: string; at: number } | null = null;
const SESSION_TTL = 50 * 60 * 1000; // re-login preventivo cada 50 min

export function apiBase(glpiBaseUrl: string): string {
  return glpiBaseUrl.replace(/\/$/, "") + "/apirest.php";
}

async function initSession(): Promise<string> {
  const cfg = await loadConfig();
  const userToken = decryptSecret(cfg.userTokenEnc);
  if (!cfg.appToken) {
    throw new Error("Falta el App-Token (Setup > API clients). Cárgalo en /config.");
  }
  if (!userToken) {
    throw new Error("Falta el User token (clave de acceso remoto del usuario). Cárgalo en /config.");
  }
  const r = await fetch(`${apiBase(cfg.glpiBaseUrl)}/initSession`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `user_token ${userToken}`,
      "App-Token": cfg.appToken,
    },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.session_token) {
    throw new Error(`initSession ${r.status}: ${JSON.stringify(j)?.slice(0, 200)}`);
  }
  session = { token: j.session_token, at: Date.now() };
  return session.token;
}

async function getSession(): Promise<string> {
  if (!session || Date.now() - session.at > SESSION_TTL) {
    session = null;
    return initSession();
  }
  return session.token;
}

function isSessionError(j: any): boolean {
  return Array.isArray(j) && j.some((x) => String(x).includes("SESSION_TOKEN"));
}

export async function glpiFetch(p: string, init: RequestInit = {}, retry = true): Promise<any> {
  const cfg = await loadConfig();
  const token = await getSession();
  const r = await fetch(`${apiBase(cfg.glpiBaseUrl)}${p}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Session-Token": token,
      "App-Token": cfg.appToken,
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = null;
  }
  if (r.status === 401 || isSessionError(j)) {
    if (!retry) throw new Error("Sesión GLPI inválida y el re-login falló.");
    session = null;
    await initSession();
    return glpiFetch(p, init, false);
  }
  if (!r.ok) {
    const msg = Array.isArray(j) ? j.join("; ") : j?.message || text || `HTTP ${r.status}`;
    throw new Error(`GLPI ${r.status} ${p}: ${String(msg).slice(0, 300)}`);
  }
  return j;
}

// GLPI devuelve "&nbsp;" en dropdowns vacíos con expand_dropdowns=true.
// GLPI devuelve dropdowns con expand_dropdowns escapados en HTML ("&#62;", "&nbsp;"...).
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

export function clean(v: any): string | null {
  if (v == null) return null;
  const s = decodeEntities(String(v)).trim();
  if (!s || s === "0") return null;
  return s;
}

const MODEL_KEYS = [
  "computermodels_id",
  "monitorsmodels_id",
  "phonemodels_id",
  "peripheralmodels_id",
  "networkequipmentmodels_id",
  "printermodels_id",
  "models_id",
  "model",
];

export function modelOf(item: any): string | null {
  for (const k of MODEL_KEYS) {
    const c = clean(item?.[k]);
    if (c) return c;
  }
  return null;
}

// Enriquece un item con _type, _locationId/_userId (vía hateoas) y nombres display.
export function enrich(item: any, type: string) {
  const links: any[] = item?.links || [];
  const locHref = links.find((l) => l?.rel === "Location")?.href || "";
  const locMatch = String(locHref).match(/(\d+)\s*$/);
  const userHref = links.find((l) => l?.rel === "User")?.href || "";
  const userMatch = String(userHref).match(/(\d+)\s*$/);
  return {
    ...item,
    _type: type,
    _locationId: locMatch ? Number(locMatch[1]) : null,
    _locationName: clean(item?.locations_id),
    _userId: userMatch ? Number(userMatch[1]) : null,
    _userName: clean(item?.users_id),
    _manufacturer: clean(item?.manufacturers_id),
    _model: modelOf(item),
  };
}

export type GlpiLocation = {
  id: number;
  name: string;
  completename: string;
  parentId: number | null;
};

// Lista plana de ubicaciones (paginada). Sin expand_dropdowns para que
// locations_id venga numérico (id del padre; 0/null = raíz).
export async function fetchLocations(): Promise<GlpiLocation[]> {
  const out: GlpiLocation[] = [];
  const step = 200;
  let start = 0;
  for (;;) {
    const list = await glpiFetch(`/Location/?range=${start}-${start + step - 1}`);
    if (!Array.isArray(list) || !list.length) break;
    for (const l of list) {
      const pid = l.locations_id == null || Number(l.locations_id) === 0 ? null : Number(l.locations_id);
      out.push({
        id: Number(l.id),
        name: String(l.name || ""),
        completename: String(l.completename || l.name || ""),
        parentId: pid,
      });
    }
    if (list.length < step) break;
    start += step;
    if (start > 5000) break;
  }
  return out;
}

let locCache: { at: number; data: GlpiLocation[] } | null = null;
const LOC_TTL = 5 * 60 * 1000;

export async function getLocationsCached(): Promise<GlpiLocation[]> {
  if (locCache && Date.now() - locCache.at < LOC_TTL) return locCache.data;
  const data = await fetchLocations();
  locCache = { at: Date.now(), data };
  return data;
}
export const ASSET_TYPES = [
  "Computer",
  "Monitor",
  "Phone",
  "Printer",
  "Peripheral",
  "NetworkEquipment",
] as const;
