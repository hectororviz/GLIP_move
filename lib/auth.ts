import { apiBase } from "./glpi";
import { loadConfig } from "./config";
import crypto from "crypto";

export type AuthUser = { login: string; name: string; profiles: string[] };

export type AuthSession = {
  id: string;
  login: string;
  name: string;
  profiles: string[];
  glpiToken: string;
  expires: number;
};

const sessions = new Map<string, AuthSession>();
const TTL = 8 * 60 * 60 * 1000;

export function operatorProfiles(): string[] {
  return (process.env.GLPI_OPERATOR_PROFILES || "Super-Admin,Admin")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canOperate(s: AuthSession | null): boolean {
  if (!s) return false;
  return s.profiles.some((p) => operatorProfiles().includes(p));
}

// Perfiles con acceso de solo lectura al módulo Accesos (ven control/búsqueda/accesos,
// sin editar nada). Por defecto: Control Patrimonio.
export function viewerProfiles(): string[] {
  return (process.env.GLPI_VIEWER_PROFILES || "Control Patrimonio")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canViewAccess(s: AuthSession | null): boolean {
  if (!s) return false;
  if (s.profiles.some((p) => operatorProfiles().includes(p))) return true;
  return s.profiles.some((p) => viewerProfiles().includes(p));
}

export type AccessLevel = "full" | "read" | "none";

export function accessLevel(s: AuthSession | null): AccessLevel {
  if (canOperate(s)) return "full";
  if (canViewAccess(s)) return "read";
  return "none";
}

export function getSession(req: { cookies: { get: (n: string) => { value: string } | undefined } }): AuthSession | null {
  const id = req.cookies.get("gm_user")?.value;
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(id); return null; }
  s.expires = Date.now() + TTL;
  return s;
}

export async function createSession(login: string, password: string): Promise<AuthSession | null> {
  const cfg = await loadConfig();
  if (!cfg.appToken) return null;
  let token: string | null = null;
  try {
    const r = await fetch(`${apiBase(cfg.glpiBaseUrl)}/initSession`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "App-Token": cfg.appToken,
      },
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.session_token) return null;
    token = j.session_token;
  } catch {
    return null;
  }
  let profiles: string[] = [];
  try {
    const r = await fetch(`${apiBase(cfg.glpiBaseUrl)}/getMyProfiles`, {
      headers: { "Content-Type": "application/json", "Session-Token": token!, "App-Token": cfg.appToken },
    });
    const j = await r.json().catch(() => null);
    profiles = (j?.myprofiles || []).map((p: any) => String(p?.name || "")).filter(Boolean);
  } catch {}
  const id = crypto.randomBytes(24).toString("hex");
  const sess: AuthSession = { id, login, name: login, profiles, glpiToken: token!, expires: Date.now() + TTL };
  sessions.set(id, sess);
  return sess;
}

export async function killSession(sess: AuthSession): Promise<void> {
  const cfg = await loadConfig();
  try {
    await fetch(`${apiBase(cfg.glpiBaseUrl)}/killSession`, {
      headers: { "Content-Type": "application/json", "Session-Token": sess.glpiToken, "App-Token": cfg.appToken },
    });
  } catch {}
  sessions.delete(sess.id);
}

export function getAuth(req: any): { kind: "admin" | "user" | "none"; session: AuthSession | null } {
  const expected = process.env.ADMIN_PASSWORD || "plain:cambia-esto";
  const cookie = req.cookies.get("gm_admin")?.value;
  if (cookie && expected.startsWith("plain:") && cookie === expected.slice(6)) return { kind: "admin", session: null };
  const s = getSession(req);
  if (s) return { kind: "user", session: s };
  return { kind: "none", session: null };
}

export function isOperator(req: any): boolean {
  const a = getAuth(req);
  if (a.kind === "admin") return true;
  return canOperate(a.session);
}

// Lectura de accesos: operador, viewer o clave maestra. Escrituras siguen con isOperator.
export function canReadAccess(req: any): boolean {
  const a = getAuth(req);
  if (a.kind === "admin") return true;
  return canViewAccess(a.session);
}

export function adminProfiles(): string[] {
  return (process.env.GLPI_ADMIN_PROFILES || "Super-Admin,Admin")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdmin(req: any): boolean {
  const expected = process.env.ADMIN_PASSWORD || "plain:cambia-esto";
  const cookie = req.cookies.get("gm_admin")?.value;
  if (cookie && expected.startsWith("plain:") && cookie === expected.slice(6)) return true;
  const s = getSession(req);
  if (s && s.profiles.some((p) => adminProfiles().includes(p))) return true;
  return false;
}

export function authStatus(req: any): { authenticated: boolean; kind: "admin" | "user" | "none"; user: AuthUser | null; canOperate: boolean; access: AccessLevel } {
  const a = getAuth(req);
  if (a.kind === "admin") return { authenticated: true, kind: "admin", user: { login: "admin", name: "Administrador", profiles: ["admin"] }, canOperate: true, access: "full" };
  if (a.kind === "user" && a.session) {
    return { authenticated: true, kind: "user", user: { login: a.session.login, name: a.session.name, profiles: a.session.profiles }, canOperate: canOperate(a.session), access: accessLevel(a.session) };
  }
  return { authenticated: false, kind: "none", user: null, canOperate: false, access: "none" };
}